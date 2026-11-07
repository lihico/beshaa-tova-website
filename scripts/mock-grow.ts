/**
 * Fake Grow server (docs/attribution/00_DESIGN.md 5.6), mounted by dev-api under /_mock/grow.
 * Speaks Grow's wire format (multipart in, {status, err, data} out; form-encoded notify with
 * bracketed keys) so the real GrowAdapter code runs against it. Test mode only.
 *
 * State: <dataDir>/mock_grow.json  { processes: {<processId>: Process}, approvals: [], notifies: [],
 *        make: {mode, links}, page_tx: [], page_webhooks: [] }
 * Pay page options (query): ?noredirect=1  ?notify=none|twice  ?tamper_sum=1
 *
 * Also (Grow Light, docs/attribution/GROW_LIGHT_SETUP.md):
 *   /page/<amount>     a fixed Grow sales page with the required custom field "קוד הזמנה"; on payment it
 *                      posts the payment-link webhook to NOTIFY_BASE_URL/api/grow-notify/<secret> (what Lihi
 *                      puts in the page's server-update field) as JSON, urlencoded or multipart
 *                      (?encoding=json|urlencoded|multipart), then redirects to PUBLIC_BASE_URL/order/thanks.
 *                      Extra options: ?code=<prefill> (only when GROW_PAGE_ORDER_PARAM is set, as its name).
 *   /make/create       the Make "create link" scenario (custom webhook + webhook response). Mode in state:
 *                      ok | timeout (answers after GROW_MAKE_TIMEOUT_MS + 2.5 s) | down (500) | nourl.
 *   /link/<id>         the per-order Grow payment link; on payment the "notify" scenario forwards Grow's
 *                      notify to our notify_url with the secret header, and runs Approve only on {approve:true}.
 */
import { randomBytes, randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const API_PREFIX = "/api/light/server/1.0/";
const TEST_CARDS = new Set(["4580458045804580", "4580000000000000", "4580111111111121"]);   // 02 section 5
const DECLINE_CARD = "4000000000000002";

interface Process {
  processId: string; processToken: string; sum: number; description: string;
  successUrl: string; cancelUrl: string; notifyUrl: string;
  cFields: Record<string, string>; fullName: string; phone: string; email: string;
  status: "created" | "paid" | "cancelled"; created_at: string;
  /** Test knob (?info_fail=1): the next getPaymentProcessInfo for this process answers HTTP 502 once. */
  infoFailOnce?: boolean;
  transaction?: { transactionId: string; transactionToken: string; asmachta: string; paid_at: string };
}
interface MakeLink {
  linkId: string; order_id: string; amount: number; successUrl: string; notifyUrl: string;
  fullName: string; phone: string; email: string; cField2: string; status: "created" | "paid";
  transaction?: { transactionId: string; asmachta: string; paid_at: string };
}
interface PageTx { transactionId: string; amount: number; typed_code: string; fullName: string; phone: string; email: string; at: string }
interface MockState {
  processes: Record<string, Process>;
  make: { mode: "ok" | "timeout" | "down" | "nourl"; links: Record<string, MakeLink>; creates: number };
  page_tx: PageTx[];
  page_webhooks: Array<{ transactionId: string; content_type: string; body: string; status: number | null; reply: unknown; kind: "pay" | "replay" }>;
  make_notifies: Array<{ order_id: string; transactionId: string; body: string; status: number | null; reply: unknown; kind: "pay" | "replay" }>;
  make_approvals: Array<{ transactionId: string; order_id: string; at: string }>;
  approvals: Array<{ transactionId: string | null; processId: string | null; at: string; fields: string[] }>;
  notifies: Array<{ order_id: string | null; processId: string; body: string; at: string; status: number | null; kind: "pay" | "replay" }>;
}

function stateFile(dataDir: string): string {
  return path.join(dataDir, "mock_grow.json");
}
function load(dataDir: string): MockState {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(dataDir), "utf8")) as Partial<MockState>;
    return {
      processes: s.processes ?? {}, approvals: s.approvals ?? [], notifies: s.notifies ?? [],
      make: { mode: s.make?.mode ?? "ok", links: s.make?.links ?? {}, creates: s.make?.creates ?? 0 },
      page_tx: s.page_tx ?? [], page_webhooks: s.page_webhooks ?? [], make_notifies: s.make_notifies ?? [], make_approvals: s.make_approvals ?? [],
    };
  } catch {
    return { processes: {}, approvals: [], notifies: [], make: { mode: "ok", links: {}, creates: 0 }, page_tx: [], page_webhooks: [], make_notifies: [], make_approvals: [] };
  }
}
function save(dataDir: string, s: MockState): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(stateFile(dataDir), JSON.stringify(s, null, 2));
}

/** Serialise state changes (two notifies or a pay + an info call may interleave). */
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

function field(body: unknown, k: string): string {
  const v = body && typeof body === "object" ? (body as Record<string, unknown>)[k] : undefined;
  return (Array.isArray(v) ? String(v[v.length - 1] ?? "") : v === undefined || v === null ? "" : String(v)).trim();
}

function growOk(res: VercelResponse, data: unknown) {
  res.status(200).json({ status: 1, err: "", data });
}
function growErr(res: VercelResponse, id: number, message: string) {
  res.status(200).json({ status: 0, err: { id, message }, data: null });
}

function isMultipart(req: VercelRequest): boolean {
  return String(req.headers["content-type"] ?? "").toLowerCase().includes("multipart/form-data");
}

/** The fake's own origin (127.0.0.1:3001: a different origin from the site, like the real Grow host). */
function mockOrigin(): string {
  try { return new URL(process.env.MOCK_GROW_BASE || "http://127.0.0.1:3001/_mock/grow").origin; } catch { return "http://127.0.0.1:3001"; }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function ddmmyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

// ---------------------------------------------------------------------------------------------
// Server API (what GrowAdapter calls)
// ---------------------------------------------------------------------------------------------

const REQUIRED = ["pageCode", "userId", "sum", "successUrl", "cancelUrl", "description", "pageField[fullName]", "pageField[phone]"];

async function createPaymentProcess(req: VercelRequest, res: VercelResponse, dataDir: string) {
  if (!isMultipart(req)) return growErr(res, 1, "not form data");
  const b = req.body;
  const missing = REQUIRED.filter((k) => !field(b, k));
  if (missing.length) return growErr(res, 54, `חסרים שדות חובה: ${missing[0]}`);
  if (field(b, "pageField[fullName]").split(/\s+/).filter(Boolean).length < 2) return growErr(res, 54, "fullName needs two words");
  if (!/^05\d{8}$/.test(field(b, "pageField[phone]"))) return growErr(res, 54, "phone is not a valid Israeli mobile");
  const sum = Number(field(b, "sum"));
  if (!Number.isFinite(sum) || sum <= 0) return growErr(res, 54, "bad sum");
  const p = await locked(() => {
    const s = load(dataDir);
    let processId = "";
    do processId = String(randomInt(100000000, 999999999)); while (s.processes[processId]);
    const proc: Process = {
      processId, processToken: randomBytes(16).toString("hex"), sum, description: field(b, "description"),
      successUrl: field(b, "successUrl"), cancelUrl: field(b, "cancelUrl"), notifyUrl: field(b, "notifyUrl"),
      cFields: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`cField${i + 1}`, field(b, `cField${i + 1}`)]).filter(([, v]) => v)),
      fullName: field(b, "pageField[fullName]"), phone: field(b, "pageField[phone]"), email: field(b, "pageField[email]"),
      status: "created", created_at: new Date().toISOString(),
    };
    s.processes[processId] = proc;
    save(dataDir, s);
    return proc;
  });
  growOk(res, { processId: p.processId, processToken: p.processToken, url: `${mockOrigin()}/_mock/grow/pay/${p.processId}` });
}

async function getPaymentProcessInfo(req: VercelRequest, res: VercelResponse, dataDir: string) {
  if (!isMultipart(req)) return growErr(res, 1, "not form data");
  const b = req.body;
  if (field(b, "pageCode") !== "mock-page") return growErr(res, 2, "bad pageCode");
  const pid = field(b, "processId");
  const p = load(dataDir).processes[pid];
  if (!p || p.processToken !== field(b, "processToken")) return growErr(res, 3, "process not found");
  if (p.infoFailOnce) {
    await locked(() => { const s = load(dataDir); if (s.processes[pid]) s.processes[pid].infoFailOnce = false; save(dataDir, s); });
    res.status(502).json({ error: "mock transient failure" });
    return;
  }
  growOk(res, {
    statusCode: p.status === "paid" ? "2" : "1", status: p.status === "paid" ? "שולם" : "ממתין",
    sum: String(p.sum), transactionId: p.transaction?.transactionId ?? "", asmachta: p.transaction?.asmachta ?? "",
    fullName: p.fullName, payerPhone: p.phone, payerEmail: p.email, customField: [],
  });
}

async function approveTransaction(req: VercelRequest, res: VercelResponse, dataDir: string) {
  if (!isMultipart(req)) return growErr(res, 1, "not form data");
  const b = req.body as Record<string, unknown>;
  if (field(b, "pageCode") !== "mock-page") return growErr(res, 2, "bad pageCode");
  await locked(() => {
    const s = load(dataDir);
    s.approvals.push({ transactionId: field(b, "transactionId") || null, processId: field(b, "processId") || null, at: new Date().toISOString(), fields: Object.keys(b ?? {}).sort() });
    save(dataDir, s);
  });
  growOk(res, {});
}

// ---------------------------------------------------------------------------------------------
// Hosted pay page (the buyer's browser)
// ---------------------------------------------------------------------------------------------

function page(res: VercelResponse, title: string, inner: string, status = 200) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.status(status).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;background:#f6f7f9;color:#222}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.1)}label{display:block;margin:10px 0 4px}
input{width:100%;padding:8px;box-sizing:border-box}button{margin-top:14px;padding:10px 16px}.err{color:#b00020}.muted{color:#666;font-size:13px}</style></head>
<body><div class="card"><p class="muted">FAKE GROW (test mode, 127.0.0.1). No real payment.</p>${inner}</div></body></html>`);
}

function payForm(p: Process, search: string, error = ""): string {
  return `<h1 id="title">Pay ${p.sum} ILS</h1><p id="description">${esc(p.description)}</p>
${error ? `<p class="err" id="error">${esc(error)}</p>` : ""}
<form method="post" action="/_mock/grow/pay/${p.processId}${esc(search)}">
<label for="card">Card number</label><input id="card" name="card" inputmode="numeric" autocomplete="off">
<label for="exp">Expiry (MM/YY)</label><input id="exp" name="exp" autocomplete="off">
<label for="cvv">CVV</label><input id="cvv" name="cvv" inputmode="numeric" autocomplete="off">
<button id="pay" type="submit">Pay</button></form>
<form method="post" action="/_mock/grow/pay/${p.processId}/cancel${esc(search)}"><button id="cancel" type="submit">Cancel</button></form>`;
}

function expiryOk(exp: string, now = new Date()): boolean {
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(exp);
  if (!m) return false;
  const month = Number(m[1]), year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  return new Date(year, month, 1).getTime() > now.getTime();       // valid through the end of that month
}

function notifyBody(p: Process, opts: { tamperSum: boolean }): string {
  const t = p.transaction!;
  const f = new URLSearchParams();
  const d = (k: string, v: string | number) => f.append(`data[${k}]`, String(v));
  f.append("err", ""); f.append("status", "1");
  d("asmachta", t.asmachta); d("cardSuffix", "4580"); d("cardType", "Local"); d("cardBrand", "Visa");
  d("status", "שולם"); d("statusCode", "2"); d("transactionTypeId", "1"); d("paymentType", "2");
  d("sum", opts.tamperSum ? p.sum + 1 : p.sum); d("paymentsNum", "1"); d("allPaymentsNum", "1");
  d("paymentDate", ddmmyy(new Date(t.paid_at))); d("description", p.description);
  d("fullName", p.fullName); d("payerPhone", p.phone); d("payerEmail", p.email);
  d("transactionId", t.transactionId); d("transactionToken", t.transactionToken);
  d("processId", p.processId); d("processToken", p.processToken);
  for (const [k, v] of Object.entries(p.cFields)) f.append(`data[customFields][${k}]`, v);
  return f.toString();
}

async function postNotify(dataDir: string, p: Process, body: string, kind: "pay" | "replay"): Promise<number | null> {
  let status: number | null = null;
  if (p.notifyUrl) {
    try {
      const r = await fetch(p.notifyUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      status = r.status;
      await r.text().catch(() => "");
    } catch (e) {
      console.error("[mock-grow] notify failed:", e instanceof Error ? e.message : e);
    }
  }
  await locked(() => {
    const s = load(dataDir);
    s.notifies.push({ order_id: p.cFields.cField1 ?? null, processId: p.processId, body, at: new Date().toISOString(), status, kind });
    save(dataDir, s);
  });
  return status;
}

function searchOf(req: VercelRequest): string {
  try { return new URL(req.url ?? "/", "http://mock.local").search; } catch { return ""; }
}

async function payPage(req: VercelRequest, res: VercelResponse, dataDir: string, processId: string) {
  const p = load(dataDir).processes[processId];
  if (!p) return page(res, "Not found", "<p class=\"err\">Unknown payment process.</p>", 404);
  if (p.status === "paid") return page(res, "Paid", "<p id=\"paid\">This payment is already complete.</p>");
  if (p.status === "cancelled") return page(res, "Cancelled", "<p id=\"cancelled\">This payment was cancelled.</p>");
  return page(res, "Fake Grow payment", payForm(p, searchOf(req)));
}

async function payPost(req: VercelRequest, res: VercelResponse, dataDir: string, processId: string) {
  const search = searchOf(req);
  const q = new URLSearchParams(search);
  const card = field(req.body, "card").replace(/\s+/g, ""), exp = field(req.body, "exp"), cvv = field(req.body, "cvv");
  const cur = load(dataDir).processes[processId];
  if (!cur) return page(res, "Not found", "<p class=\"err\">Unknown payment process.</p>", 404);
  if (cur.status !== "created") return payPage(req, res, dataDir, processId);
  // A decline keeps the buyer on the page and does nothing else (02 section 4).
  if (card === DECLINE_CARD) return page(res, "Declined", payForm(cur, search, "The card was declined."));
  if (!TEST_CARDS.has(card) || !expiryOk(exp) || !/^\d{3}$/.test(cvv)) return page(res, "Invalid", payForm(cur, search, "Invalid card details."));

  const p = await locked(() => {
    const s = load(dataDir);
    const x = s.processes[processId];
    if (!x || x.status !== "created") return null;
    x.status = "paid";
    if (q.get("info_fail") === "1") x.infoFailOnce = true;
    x.transaction = {
      transactionId: String(randomInt(10000000, 99999999)), transactionToken: randomBytes(16).toString("hex"),
      asmachta: String(randomInt(1000000, 9999999)), paid_at: new Date().toISOString(),
    };
    save(dataDir, s);
    return x;
  });
  if (!p) return payPage(req, res, dataDir, processId);

  // First the server-to-server notify (awaited), then the browser redirect.
  const mode = q.get("notify");
  if (mode !== "none") {
    const body = notifyBody(p, { tamperSum: q.get("tamper_sum") === "1" });
    const first = await postNotify(dataDir, p, body, "pay");
    // Like Grow: a non-2xx answer is retried (once here, right away).
    if (first !== null && (first < 200 || first > 299)) await postNotify(dataDir, p, body, "pay");
    if (mode === "twice") await postNotify(dataDir, p, body, "pay");
  }
  if (q.get("noredirect") === "1") return page(res, "Paid", "<p id=\"paid\">Payment complete. You can close this tab.</p>");
  const sep = p.successUrl.includes("?") ? "&" : "?";
  res.setHeader("Location", `${p.successUrl}${sep}response=success&cField1=${encodeURIComponent(p.cFields.cField1 ?? "")}`);
  res.setHeader("cache-control", "no-store");
  res.status(302).end();
}

async function cancelPost(_req: VercelRequest, res: VercelResponse, dataDir: string, processId: string) {
  const p = await locked(() => {
    const s = load(dataDir);
    const x = s.processes[processId];
    if (x && x.status === "created") { x.status = "cancelled"; save(dataDir, s); }
    return x ?? null;
  });
  if (!p) return page(res, "Not found", "<p class=\"err\">Unknown payment process.</p>", 404);
  res.setHeader("Location", p.cancelUrl);
  res.setHeader("cache-control", "no-store");
  res.status(302).end();
}

// ---------------------------------------------------------------------------------------------
// Entry points used by scripts/dev-api-lib/server.ts and test-routes.ts
// ---------------------------------------------------------------------------------------------

export async function handleMockGrow(req: VercelRequest, res: VercelResponse, ctx: { subpath: string; dataDir: string }): Promise<void> {
  if (process.env.ATTR_TEST !== "1") { res.status(404).json({ error: "mock grow is test-only" }); return; }
  const { subpath, dataDir } = ctx;
  const method = req.method ?? "GET";
  if (await handleGrowLight(req, res, ctx)) return;
  if (subpath.startsWith(API_PREFIX) && method === "POST") {
    const name = subpath.slice(API_PREFIX.length);
    if (name === "createPaymentProcess") return createPaymentProcess(req, res, dataDir);
    if (name === "getPaymentProcessInfo") return getPaymentProcessInfo(req, res, dataDir);
    if (name === "approveTransaction") return approveTransaction(req, res, dataDir);
    return growErr(res, 404, `mock grow: ${name} is not implemented`);
  }
  let m: RegExpExecArray | null;
  if ((m = /^\/pay\/(\d+)\/cancel\/?$/.exec(subpath)) && method === "POST") return cancelPost(req, res, dataDir, m[1]);
  if ((m = /^\/pay\/(\d+)\/?$/.exec(subpath))) {
    if (method === "GET") return payPage(req, res, dataDir, m[1]);
    if (method === "POST") return payPost(req, res, dataDir, m[1]);
  }
  res.status(404).json({ error: "mock grow: no route", subpath });
}

/** Re-sends the last notify of an order (POST /__test/replay-notify?o=<order_id>). */
export async function replayNotify(orderId: string, ctx: { dataDir: string }): Promise<{ ok: boolean; status: number | null; error?: string }> {
  const s = load(ctx.dataDir);
  const last = [...s.notifies].reverse().find((n) => n.order_id === orderId);
  if (!last) return { ok: false, status: null, error: "no notify for that order" };
  const p = s.processes[last.processId];
  if (!p) return { ok: false, status: null, error: "process gone" };
  const status = await postNotify(ctx.dataDir, p, last.body, "replay");
  return { ok: status === 200, status };
}

// ---------------------------------------------------------------------------------------------
// Grow Light: fixed sales pages (Flow A/B) and the Make scenarios (per-order links)
// ---------------------------------------------------------------------------------------------

const ourNotifyUrl = () => `${(process.env.NOTIFY_BASE_URL || "http://localhost:3001").replace(/\/+$/, "")}/api/grow-notify/${process.env.GROW_NOTIFY_SECRET ?? ""}`;
const ourThanksUrl = () => `${(process.env.PUBLIC_BASE_URL || "http://localhost:5173").replace(/\/+$/, "")}/order/thanks`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cardFields(): string {
  return `<label for="card">Card number</label><input id="card" name="card" inputmode="numeric" autocomplete="off">
<label for="exp">Expiry (MM/YY)</label><input id="exp" name="exp" autocomplete="off">
<label for="cvv">CVV</label><input id="cvv" name="cvv" inputmode="numeric" autocomplete="off">`;
}

function cardCheck(body: unknown): "ok" | "declined" | "invalid" {
  const card = field(body, "card").replace(/\s+/g, ""), exp = field(body, "exp"), cvv = field(body, "cvv");
  if (card === DECLINE_CARD) return "declined";
  return TEST_CARDS.has(card) && expiryOk(exp) && /^\d{3}$/.test(cvv) ? "ok" : "invalid";
}

/** The payment-link webhook (fields per https://developers.grow.business/docs/webhooks ) in one encoding. */
export function pageWebhookBody(tx: PageTx, opts: { tamperSum?: boolean; encoding?: string }): { body: string | FormData; contentType: string | null } {
  const sum = opts.tamperSum ? tx.amount + 1 : tx.amount;
  const flat: Array<[string, string]> = [
    ["status", "שולם"], ["sum", String(sum)], ["fullName", tx.fullName], ["payerPhone", tx.phone], ["payerEmail", tx.email],
    ["transactionId", tx.transactionId], ["asmachta", tx.transactionId.slice(-7)], ["transactionType", "אשראי"],
    ["paymentDate", ddmmyy(new Date(tx.at))],
    ["productData[0][name]", `ערכת בשעה טובה ${tx.amount}`], ["productData[0][price]", String(tx.amount)], ["productData[0][quantity]", "1"],
    ["dynamicFields[0][name]", "קוד הזמנה"], ["dynamicFields[0][value]", tx.typed_code],
  ];
  if (opts.encoding === "urlencoded") return { body: new URLSearchParams(flat).toString(), contentType: "application/x-www-form-urlencoded" };
  if (opts.encoding === "multipart") {
    const f = new FormData();
    for (const [k, v] of flat) f.append(k, v);
    return { body: f, contentType: null };                 // fetch sets multipart/form-data; boundary=...
  }
  return {
    body: JSON.stringify({
      status: "שולם", sum, fullName: tx.fullName, payerPhone: tx.phone, payerEmail: tx.email,
      transactionId: tx.transactionId, asmachta: tx.transactionId.slice(-7), transactionType: "אשראי", paymentDate: ddmmyy(new Date(tx.at)),
      productData: [{ name: `ערכת בשעה טובה ${tx.amount}`, price: tx.amount, quantity: 1 }], shipping: [],
      dynamicFields: [{ name: "קוד הזמנה", value: tx.typed_code }],
    }),
    contentType: "application/json",
  };
}

async function postPageWebhook(dataDir: string, tx: PageTx, opts: { tamperSum?: boolean; encoding?: string }, kind: "pay" | "replay"): Promise<number | null> {
  const { body, contentType } = pageWebhookBody(tx, opts);
  let status: number | null = null;
  let reply: unknown = null;
  try {
    const r = await fetch(ourNotifyUrl(), { method: "POST", headers: contentType ? { "Content-Type": contentType } : {}, body });
    status = r.status;
    reply = await r.json().catch(() => null);
  } catch (e) {
    console.error("[mock-grow] page webhook failed:", e instanceof Error ? e.message : e);
  }
  await locked(() => {
    const s = load(dataDir);
    s.page_webhooks.push({ transactionId: tx.transactionId, content_type: opts.encoding ?? "json", body: typeof body === "string" ? body : "(multipart)", status, reply, kind });
    save(dataDir, s);
  });
  return status;
}

function fixedPageForm(amount: number, search: string, prefill: string, error = ""): string {
  return `<h1 id="title">Pay ${amount} ILS</h1><p id="description">בשעה טובה (fixed page ${amount})</p>
${error ? `<p class="err" id="error">${esc(error)}</p>` : ""}
<form method="post" action="/_mock/grow/page/${amount}${esc(search)}">
<label for="fullName">שם מלא</label><input id="fullName" name="fullName">
<label for="phone">טלפון</label><input id="phone" name="phone" inputmode="tel">
<label for="email">מייל</label><input id="email" name="email">
<label for="orderCode">קוד הזמנה (חובה)</label><input id="orderCode" name="orderCode" value="${esc(prefill)}">
${cardFields()}
<button id="pay" type="submit">Pay</button></form>`;
}

async function fixedPage(req: VercelRequest, res: VercelResponse, dataDir: string, amount: number) {
  const search = searchOf(req);
  const q = new URLSearchParams(search);
  const param = (process.env.GROW_PAGE_ORDER_PARAM ?? "").trim();
  const prefill = param ? q.get(param) ?? "" : "";
  if (req.method === "GET") return page(res, "Fake Grow fixed page", fixedPageForm(amount, search, prefill));
  const b = req.body;
  const typed = field(b, "orderCode"), fullName = field(b, "fullName"), phone = field(b, "phone"), email = field(b, "email");
  if (!typed || !fullName || !phone) return page(res, "Missing", fixedPageForm(amount, search, typed, "Required: name, phone and order code."));
  const c = cardCheck(b);
  if (c !== "ok") return page(res, c === "declined" ? "Declined" : "Invalid", fixedPageForm(amount, search, typed, c === "declined" ? "The card was declined." : "Invalid card details."));
  const tx = await locked(() => {
    const s = load(dataDir);
    const t: PageTx = { transactionId: String(randomInt(10000000, 99999999)), amount, typed_code: typed, fullName, phone, email, at: new Date().toISOString() };
    s.page_tx.push(t);
    save(dataDir, s);
    return t;
  });
  const mode = q.get("notify");
  const opts = { tamperSum: q.get("tamper_sum") === "1", encoding: q.get("encoding") ?? "json" };
  if (mode !== "none") {
    await postPageWebhook(dataDir, tx, opts, "pay");
    if (mode === "twice") await postPageWebhook(dataDir, tx, opts, "pay");
  }
  if (q.get("noredirect") === "1") return page(res, "Paid", "<p id=\"paid\">Payment complete. You can close this tab.</p>");
  res.setHeader("Location", ourThanksUrl());
  res.setHeader("cache-control", "no-store");
  res.status(302).end();
}

async function makeCreate(req: VercelRequest, res: VercelResponse, dataDir: string) {
  if (String(req.headers["x-grow-make-secret"] ?? "") !== (process.env.GROW_MAKE_SECRET ?? "")) {
    res.status(401).json({ error: "bad secret" });
    return;
  }
  const mode = load(dataDir).make.mode;
  await locked(() => { const s = load(dataDir); s.make.creates++; save(dataDir, s); });
  if (mode === "down") { res.status(500).json({ error: "scenario failed" }); return; }
  if (mode === "timeout") await sleep(Number(process.env.GROW_MAKE_TIMEOUT_MS || 10_000) + 2500);
  if (mode === "nourl") { res.status(200).json({ accepted: true }); return; }
  const b = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const payer = (b.payer && typeof b.payer === "object" ? b.payer : {}) as Record<string, unknown>;
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0 || typeof b.cField1 !== "string") { res.status(400).json({ error: "bad order" }); return; }
  const link = await locked(() => {
    const s = load(dataDir);
    let linkId = "";
    do linkId = String(randomInt(100000000, 999999999)); while (s.make.links[linkId]);
    const l: MakeLink = {
      linkId, order_id: String(b.cField1), amount, successUrl: String(b.success_url ?? ""), notifyUrl: String(b.notify_url ?? ""),
      fullName: String(payer.full_name ?? ""), phone: String(payer.phone ?? ""), email: String(payer.email ?? ""),
      cField2: String(b.cField2 ?? ""), status: "created",
    };
    s.make.links[linkId] = l;
    save(dataDir, s);
    return l;
  });
  res.status(200).json({ payment_url: `${mockOrigin()}/_mock/grow/link/${link.linkId}`, link_id: link.linkId, amount: link.amount });
}

/** What the "notify" scenario forwards: Grow's notify fields, nested under data, as JSON. */
function makeNotifyBody(l: MakeLink, opts: { tamperSum?: boolean }): string {
  const t = l.transaction!;
  return JSON.stringify({ data: {
    statusCode: "2", status: "שולם", sum: String(opts.tamperSum ? l.amount + 1 : l.amount), transactionId: t.transactionId,
    asmachta: t.asmachta, transactionTypeId: "1", paymentsNum: "1", cardSuffix: "4580", fullName: l.fullName,
    payerPhone: l.phone, payerEmail: l.email, processId: l.linkId, paymentDate: ddmmyy(new Date(t.paid_at)),
    customFields: { cField1: l.order_id, cField2: l.cField2 },
  } });
}

async function forwardMakeNotify(dataDir: string, l: MakeLink, body: string, kind: "pay" | "replay"): Promise<number | null> {
  let status: number | null = null;
  let reply: { approve?: boolean } | null = null;
  try {
    const r = await fetch(l.notifyUrl || ourNotifyUrl(), {
      method: "POST", headers: { "Content-Type": "application/json", "x-grow-make-secret": process.env.GROW_MAKE_SECRET ?? "" }, body,
    });
    status = r.status;
    reply = (await r.json().catch(() => null)) as { approve?: boolean } | null;
  } catch (e) {
    console.error("[mock-grow] Make notify forward failed:", e instanceof Error ? e.message : e);
  }
  await locked(() => {
    const s = load(dataDir);
    s.make_notifies.push({ order_id: l.order_id, transactionId: l.transaction?.transactionId ?? "", body, status, reply, kind });
    // The scenario's router: run Grow's Approve Transaction only when our endpoint said approve: true.
    if (reply?.approve === true && l.transaction) s.make_approvals.push({ transactionId: l.transaction.transactionId, order_id: l.order_id, at: new Date().toISOString() });
    save(dataDir, s);
  });
  return status;
}

async function linkPage(req: VercelRequest, res: VercelResponse, dataDir: string, linkId: string) {
  const search = searchOf(req);
  const q = new URLSearchParams(search);
  const cur = load(dataDir).make.links[linkId];
  if (!cur) return page(res, "Not found", "<p class=\"err\">Unknown payment link.</p>", 404);
  const form = (error = "") => `<h1 id="title">Pay ${cur.amount} ILS</h1><p id="description">בשעה טובה (payment link)</p>
${error ? `<p class="err" id="error">${esc(error)}</p>` : ""}<form method="post" action="/_mock/grow/link/${linkId}${esc(search)}">${cardFields()}<button id="pay" type="submit">Pay</button></form>`;
  if (cur.status === "paid") return page(res, "Paid", "<p id=\"paid\">This payment is already complete.</p>");
  if (req.method === "GET") return page(res, "Fake Grow payment link", form());
  const c = cardCheck(req.body);
  if (c !== "ok") return page(res, "Declined", form(c === "declined" ? "The card was declined." : "Invalid card details."));
  const l = await locked(() => {
    const s = load(dataDir);
    const x = s.make.links[linkId];
    if (!x || x.status !== "created") return null;
    x.status = "paid";
    x.transaction = { transactionId: String(randomInt(10000000, 99999999)), asmachta: String(randomInt(1000000, 9999999)), paid_at: new Date().toISOString() };
    save(dataDir, s);
    return x;
  });
  if (!l) return page(res, "Paid", "<p id=\"paid\">This payment is already complete.</p>");
  if (q.get("notify") !== "none") {
    const body = makeNotifyBody(l, { tamperSum: q.get("tamper_sum") === "1" });
    await forwardMakeNotify(dataDir, l, body, "pay");
    if (q.get("notify") === "twice") await forwardMakeNotify(dataDir, l, body, "pay");
  }
  if (q.get("noredirect") === "1") return page(res, "Paid", "<p id=\"paid\">Payment complete. You can close this tab.</p>");
  res.setHeader("Location", l.successUrl || ourThanksUrl());
  res.setHeader("cache-control", "no-store");
  res.status(302).end();
}

/** Grow Light routes; returns false when the subpath is not one of them. */
export async function handleGrowLight(req: VercelRequest, res: VercelResponse, ctx: { subpath: string; dataDir: string }): Promise<boolean> {
  const { subpath, dataDir } = ctx;
  const method = req.method ?? "GET";
  let m: RegExpExecArray | null;
  if (subpath === "/make/create" && method === "POST") { await makeCreate(req, res, dataDir); return true; }
  if ((m = /^\/link\/(\d+)\/?$/.exec(subpath)) && (method === "GET" || method === "POST")) { await linkPage(req, res, dataDir, m[1]); return true; }
  if ((m = /^\/page\/(\d+)\/?$/.exec(subpath)) && (method === "GET" || method === "POST")) { await fixedPage(req, res, dataDir, Number(m[1])); return true; }
  return false;
}

/** POST /__test/make-mode?mode=ok|timeout|down|nourl */
export async function setMakeMode(mode: string, ctx: { dataDir: string }): Promise<{ ok: boolean; mode?: string }> {
  if (!["ok", "timeout", "down", "nourl"].includes(mode)) return { ok: false };
  await locked(() => { const s = load(ctx.dataDir); s.make.mode = mode as MockState["make"]["mode"]; save(ctx.dataDir, s); });
  return { ok: true, mode };
}

/** POST /__test/replay-page-webhook?tx=<transactionId>[&encoding=...]: Grow re-sends a fixed-page webhook. */
export async function replayPageWebhook(tx: string, encoding: string | null, ctx: { dataDir: string }): Promise<{ ok: boolean; status: number | null }> {
  const t = load(ctx.dataDir).page_tx.find((x) => x.transactionId === tx);
  if (!t) return { ok: false, status: null };
  const status = await postPageWebhook(ctx.dataDir, t, { encoding: encoding ?? "json" }, "replay");
  return { ok: status === 200, status };
}

/** POST /__test/replay-make-notify?o=<order_id>: Grow re-sends (via Make) the notify of a paid link. */
export async function replayMakeNotify(orderId: string, ctx: { dataDir: string }): Promise<{ ok: boolean; status: number | null }> {
  const s = load(ctx.dataDir);
  const last = [...s.make_notifies].reverse().find((n) => n.order_id === orderId);
  const l = Object.values(s.make.links).find((x) => x.order_id === orderId && x.status === "paid");
  if (!last || !l) return { ok: false, status: null };
  const status = await forwardMakeNotify(ctx.dataDir, l, last.body, "replay");
  return { ok: status === 200, status };
}
