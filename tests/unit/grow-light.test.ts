/**
 * Grow Light without the API (docs/attribution/GROW_LIGHT_SETUP.md): price table amounts, order-code
 * normalisation, webhook bodies (JSON / urlencoded / multipart), fixed-page matching, the Make relay,
 * the mark-paid token and the Make -> fixed page -> WhatsApp fallback chain.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PRICES_2026_10, PRICES_2026_11, chargeableAmounts, quote } from "../../api/_price_table.ts";
import { normalizeOrderCode } from "../../api/_ids.ts";
import { parseMultipart, parsePageWebhook, parseWebhookBody } from "../../api/_grow_webhook.ts";
import { GrowPagesAdapter, parseGrowPageUrls } from "../../api/_payments_grow_pages.ts";
import { GrowMakeAdapter, makeSecretOk, type GrowMakeConfig } from "../../api/_payments_grow_make.ts";
import { methodFromText } from "../../api/_payments.ts";
import { parseGrowNotify } from "../../api/_payments_grow.ts";
import { FileStore } from "../../api/_store_file.ts";
import type { OrderRecord } from "../../api/_attribution_core.ts";

const ORDER = "BT2611K7Q3XA";
/** The 2026-11 table with express switched back on (it is off for now, Lihi 4.11.2026): the express logic stays tested. */
const WITH_EXPRESS = { ...PRICES_2026_11, express: 50 };

describe("price table", () => {
  test("2026-11 table, express off (4.11.2026): no express amounts; lite 199 / 189 / 179 (14.11.2026)", () => {
    assert.deepEqual(chargeableAmounts(PRICES_2026_11).map((a) => a.amount), [179, 189, 199, 314, 332, 349, 369, 390, 410]);
  });
  test("every chargeable amount of the 2026-11 table with express on (one fixed Grow page each)", () => {
    assert.deepEqual(chargeableAmounts(WITH_EXPRESS).map((a) => a.amount), [179, 189, 199, 229, 239, 249, 314, 332, 349, 364, 369, 382, 390, 399, 410, 419, 440, 460]);
    const by = Object.fromEntries(chargeableAmounts(WITH_EXPRESS).map((a) => [a.amount, a.label]));
    assert.match(by[349], /8 meetings/); assert.match(by[349], /gift voucher, 8 meetings/);
    assert.match(by[410], /gift voucher, full kit/);
    assert.match(by[440], /full kit, promo 5%, express \+50/);
  });
  test("2026-10 table: 288 / 320 / 333 / 370, no express", () => {
    assert.deepEqual(chargeableAmounts(PRICES_2026_10).map((a) => a.amount), [288, 320, 333, 370]);
  });
  test("quote: express never on a gift or a free voucher; discount not on the shipping", () => {
    assert.equal(quote(WITH_EXPRESS, { kind: "order", allMeetings: true, express: true, discountPct: 10 }).amount, 419);
    assert.equal(quote(WITH_EXPRESS, { kind: "order", allMeetings: false, express: true, discountPct: 10 }).amount, 364);
    assert.equal(quote(WITH_EXPRESS, { kind: "gift", allMeetings: false, express: true }).amount, 349);
  });
});

describe("order code typed on Grow", () => {
  for (const [typed, want] of [
    [ORDER, ORDER], ["bt2611k7q3xa", ORDER], [" BT 2611 K7Q3XA ", ORDER], ["bt-2611-k7q3xa", ORDER],
    ["2611K7Q3XA", ORDER], ["2611 k7q3xa", ORDER], ["הזמנה BT2611K7Q3XA תודה", ORDER], ["BT2611K7Q3XA.", ORDER],
    ["BT2611K7Q3XA־", ORDER], ["bt2611k7q3xo", "BT2611K7Q3X0"], ["BT2611K7Q3XL", "BT2611K7Q3X1"],
  ] as const) test(`${JSON.stringify(typed)} -> ${want}`, () => assert.equal(normalizeOrderCode(typed), want));
  for (const bad of ["", "BT2611", "hello", "0501234567", "BST-2005-0UGA", null, 12]) {
    test(`not a code: ${JSON.stringify(bad)}`, () => assert.equal(normalizeOrderCode(bad), null));
  }
});

describe("webhook bodies", () => {
  const fields: Array<[string, string]> = [
    ["status", "שולם"], ["sum", "349"], ["fullName", "יעל כהן"], ["payerPhone", "050-1234567"], ["payerEmail", "y@example.test"],
    ["transactionId", "77001"], ["transactionType", "ביט"], ["dynamicFields[0][name]", "קוד הזמנה"], ["dynamicFields[0][value]", "bt 2611 k7q3xa"],
  ];
  const check = (w: ReturnType<typeof parsePageWebhook>) => {
    assert.equal(w.paid, true); assert.equal(w.sum, 349); assert.equal(w.transactionId, "77001");
    assert.equal(w.payerPhone, "050-1234567"); assert.equal(w.orderCode, ORDER); assert.equal(w.orderCodeTyped, "bt 2611 k7q3xa");
    assert.equal(methodFromText(w.paymentType), "bit");
  };
  test("JSON (array of dynamic fields)", () => {
    const raw = Buffer.from(JSON.stringify({ status: "שולם", sum: 349, fullName: "יעל כהן", payerPhone: "050-1234567", payerEmail: "y@example.test",
      transactionId: "77001", transactionType: "ביט", productData: [{ name: "x", price: 349 }], shipping: [], dynamicFields: [{ name: "קוד הזמנה", value: "bt 2611 k7q3xa" }] }));
    check(parsePageWebhook(parseWebhookBody(raw, "application/json")));
  });
  test("JSON wrapped in data, dynamic fields as a map and as a JSON string", () => {
    const a = { data: { status: "שולם", sum: "349", transactionId: "77001", payerPhone: "050-1234567", fullName: "יעל כהן", transactionType: "ביט", dynamicFields: { "קוד הזמנה": "bt 2611 k7q3xa" } } };
    check(parsePageWebhook(parseWebhookBody(Buffer.from(JSON.stringify(a)), "application/json; charset=utf-8")));
    const b = { status: "שולם", sum: "349", transactionId: "77001", payerPhone: "050-1234567", transactionType: "ביט", dynamicFields: JSON.stringify([{ label: "קוד הזמנה", value: "bt 2611 k7q3xa" }]) };
    check(parsePageWebhook(parseWebhookBody(Buffer.from(JSON.stringify(b)), "application/json")));
  });
  test("urlencoded with bracketed keys", () => {
    check(parsePageWebhook(parseWebhookBody(Buffer.from(new URLSearchParams(fields).toString()), "application/x-www-form-urlencoded")));
  });
  test("multipart/form-data (what @vercel/node leaves unparsed)", async () => {
    const f = new FormData();
    for (const [k, v] of fields) f.append(k, v);
    const r = new Request("http://x.local/", { method: "POST", body: f });
    const raw = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get("content-type") ?? "";
    assert.match(ct, /^multipart\/form-data; boundary=/);
    assert.equal(parseMultipart(raw, ct)["dynamicFields[0][name]"], "קוד הזמנה");
    check(parsePageWebhook(parseWebhookBody(raw, ct)));
  });
  test("no code field, not paid, an unknown body", () => {
    const w = parsePageWebhook({ status: "נכשל", sum: "349", transactionId: "1" });
    assert.equal(w.paid, false); assert.equal(w.orderCode, null);
    assert.equal(parsePageWebhook({ statusCode: "2", sum: "1" }).paid, true);
    assert.deepEqual(parseWebhookBody(Buffer.from("garbage"), ""), {});
  });
  test("a typed code in an unlabeled field is still found", () => {
    assert.equal(parsePageWebhook({ status: "שולם", dynamicFields: [{ name: "הערות", value: "2611k7q3xa" }] }).orderCode, ORDER);
  });
});

describe("GrowPagesAdapter", () => {
  test("GROW_PAGE_URLS: https only, whole amounts; bad entries reported by key", () => {
    const { pages, errors } = parseGrowPageUrls(JSON.stringify({ "349": "https://pay.grow.link/a", "399": "http://evil.example/x", "3.5": "https://x", "410": 7 }));
    assert.deepEqual([...pages.keys()], [349]);
    assert.equal(errors.length, 3);
    assert.deepEqual(parseGrowPageUrls("not json").errors, ["GROW_PAGE_URLS is not valid JSON"]);
  });
  test("exact amount only; optional order param", () => {
    const a = new GrowPagesAdapter({ pages: new Map([[349, "https://pay.grow.link/a?x=1"]]), orderParam: null });
    assert.equal(a.paymentUrlFor(ORDER, 349), "https://pay.grow.link/a?x=1");
    assert.equal(a.paymentUrlFor(ORDER, 350), null, "never a page for another amount");
    const b = new GrowPagesAdapter({ pages: new Map([[349, "https://pay.grow.link/a"]]), orderParam: "orderCode" });
    assert.equal(b.paymentUrlFor(ORDER, 349), `https://pay.grow.link/a?orderCode=${ORDER}`);
  });
});

// ---------------------------------------------------------------------------------------------
// Matching against a file store (alerts go to <dir>/alerts.jsonl under ATTR_TEST=1, never Resend)
// ---------------------------------------------------------------------------------------------

function mkOrder(id: string, p: Partial<OrderRecord> = {}): OrderRecord {
  return {
    order_id: id, order_kind: "order", created_at: new Date().toISOString(), payment_status: "pending",
    amount_expected: 349, currency: "ILS", price_rule: "base_349", client_displayed_amount: 349, promo_code: null, partner_id: null,
    credit_rule: "none", credited_channel: "direct", credited_detail: null, first: null, last: null, touches: [],
    self_reported_source: null, not_engaged: false, visitor_id: `v_${"x".repeat(22)}`, session_id: null,
    fbc: null, fbp: null, ga_client_id: null, client_ip: null, user_agent: null, event_source_url: null, consent_marketing: "unknown",
    buyer: { name: "יעל כהן", phone: "0501234567", email: null }, couple: { name1: "יעל", name2: "תומר" },
    lead_event_id: `lead_${id}`, grow_process_ids: [], grow_process_token: null, payment_fallback_reason: null,
    paid_at: null, paid_amount: null, grow_transaction_id: null, asmachta: null, payment_method: null, payer_name: null,
    payer_phone: null, payer_email: null, match_method: null, capi_purchase_event_id: null, capi_purchase_sent_at: null,
    capi_purchase_result: null, commission_ils: null, commission_status: null, invoice_number: null, invoice_url: null,
    meetings: ["02", "13"], fulfil_log: {}, ...p,
  } as OrderRecord;
}

const envSaved: Record<string, string | undefined> = {};
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (!(k in envSaved)) envSaved[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}
function restoreEnv() {
  for (const [k, v] of Object.entries(envSaved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
}

function alertsIn(dir: string): string[] {
  const f = path.join(dir, "alerts.jsonl");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).kind) : [];
}

describe("fixed-page webhook matching (processPageWebhook)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "growlight-"));
  const store = new FileStore(dir);
  let processPageWebhook: typeof import("../../api/_grow_pages_notify.ts").processPageWebhook;
  before(async () => {
    setEnv({ ATTR_TEST: "1", ATTR_DATA_DIR: dir });
    ({ processPageWebhook } = await import("../../api/_grow_pages_notify.ts"));
    await store.appendOrder(mkOrder("BT2611AAAAA1"), async () => undefined);
    await store.appendOrder(mkOrder("BT2611AAAAA2", { buyer: { name: "דנה לוי", phone: "052-7654321", email: null }, amount_expected: 399 }), async () => undefined);
    await store.appendOrder(mkOrder("BT2611AAAAA3", { buyer: { name: "רוני", phone: "0549998877", email: null } }), async () => undefined);
    await store.appendOrder(mkOrder("BT2611AAAAA4", { buyer: { name: "רוני שוב", phone: "0549998877", email: null } }), async () => undefined);
  });
  after(restoreEnv);
  const hook = (p: Record<string, unknown>) => parsePageWebhook({ status: "שולם", ...p });

  test("typed code in an odd format: paid, match order_code, unsigned_webhook, not verified", async () => {
    const out = await processPageWebhook(store, hook({ sum: "349", transactionId: "t1", dynamicFields: [{ name: "קוד הזמנה", value: "2611 aaaaa1" }] }), "d".repeat(64));
    assert.equal(out.paidOrder, "BT2611AAAAA1");
    const o = await store.getOrder("BT2611AAAAA1");
    assert.equal(o?.payment_status, "paid"); assert.equal(o?.match_method, "order_code"); assert.equal(o?.verify_mode, "unsigned_webhook");
    const p = await store.getPayment("t1");
    assert.equal(p?.verification, "unsigned_webhook"); assert.equal(p?.verified, false); assert.equal(p?.provider, "grow_pages");
  });
  test("the same transaction again: duplicate, nothing new", async () => {
    const out = await processPageWebhook(store, hook({ sum: "349", transactionId: "t1", dynamicFields: [{ name: "קוד הזמנה", value: "BT2611AAAAA1" }] }), "d".repeat(64));
    assert.equal(out.paidOrder, undefined); assert.equal(out.body.duplicate, true);
  });
  test("no code: matched by payer phone + exact sum, no alert (a line in the paid email instead, A3)", async () => {
    const out = await processPageWebhook(store, hook({ sum: "399", transactionId: "t2", payerPhone: "+972527654321" }), "e".repeat(64));
    assert.equal(out.paidOrder, "BT2611AAAAA2");
    assert.equal((await store.getOrder("BT2611AAAAA2"))?.match_method, "phone_sum");
    assert.ok(!alertsIn(dir).includes("matched_by_phone_sum"));
  });
  test("phone matches two pending orders: nothing changes, alert", async () => {
    const out = await processPageWebhook(store, hook({ sum: "349", transactionId: "t3", payerPhone: "0549998877" }), "f".repeat(64));
    assert.equal(out.paidOrder, undefined);
    assert.equal((await store.getOrder("BT2611AAAAA3"))?.payment_status, "pending");
    assert.ok(alertsIn(dir).includes("webhook_ambiguous_phone_sum"));
  });
  test("wrong sum: stays pending, reason recorded, alert", async () => {
    const out = await processPageWebhook(store, hook({ sum: "350", transactionId: "t4", dynamicFields: [{ name: "קוד הזמנה", value: "BT2611AAAAA3" }] }), "a".repeat(64));
    assert.equal(out.paidOrder, undefined);
    const o = await store.getOrder("BT2611AAAAA3");
    assert.equal(o?.payment_status, "pending"); assert.equal(o?.payment_fallback_reason, "webhook_sum_mismatch:350");
    assert.ok(alertsIn(dir).includes("webhook_sum_mismatch"));
  });
  test("not paid / unknown code with no phone match: nothing, alerts", async () => {
    await processPageWebhook(store, parsePageWebhook({ status: "נכשל", sum: "349", transactionId: "t5" }), "b".repeat(64));
    await processPageWebhook(store, hook({ sum: "349", transactionId: "t6", dynamicFields: [{ name: "קוד הזמנה", value: "BT2611ZZZZZZ" }] }), "c".repeat(64));
    const a = alertsIn(dir);
    assert.ok(a.includes("webhook_not_paid")); assert.ok(a.includes("order_code_not_found")); assert.ok(a.includes("webhook_unmatched"));
    assert.equal(await store.getPayment("t5"), null); assert.equal(await store.getPayment("t6"), null);
  });
});

describe("mark-paid token", () => {
  before(() => setEnv({ MARK_PAID_SECRET: "unit-test-mark-paid-secret" }));
  after(restoreEnv);
  test("round trip; tampered amount, id or signature fail; no secret = no link", async () => {
    const { createMarkPaidToken, verifyMarkPaidToken, markPaidUrl } = await import("../../api/_mark_paid.ts");
    const t = createMarkPaidToken(ORDER, 349)!;
    assert.match(t, /^BT2611K7Q3XA\.349\.[A-Za-z0-9_-]{32}$/);
    assert.deepEqual(verifyMarkPaidToken(t), { order_id: ORDER, amount: 349 });
    assert.equal(verifyMarkPaidToken(t.replace(".349.", ".1.")), null);
    assert.equal(verifyMarkPaidToken(t.replace(ORDER, "BT2611K7Q3XB")), null);
    assert.equal(verifyMarkPaidToken(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A")), null);
    assert.equal(markPaidUrl("https://www.beshaa-tova.co.il/", { order_id: ORDER, amount_expected: 349 }),
      `https://www.beshaa-tova.co.il/api/pay-status?action=mark-paid&t=${encodeURIComponent(t)}`);
    process.env.MARK_PAID_SECRET = "short";
    assert.equal(createMarkPaidToken(ORDER, 349), null);
    assert.equal(verifyMarkPaidToken(t), null);
  });
});

describe("Make: create link, relay notify, fallback chain", () => {
  let server: http.Server;
  let base = "";
  let mode: "ok" | "slow" | "down" | "nourl" | "wrongsum" = "ok";
  const got: Array<{ secret: string | undefined; body: Record<string, unknown> }> = [];
  before(async () => {
    server = http.createServer((req, res) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        got.push({ secret: req.headers["x-grow-make-secret"] as string | undefined, body: JSON.parse(b || "{}") });
        const send = (status: number, j: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
        if (mode === "down") return send(500, { error: "x" });
        if (mode === "nourl") return send(200, { accepted: true });
        if (mode === "wrongsum") return send(200, { payment_url: "http://127.0.0.1:9/link/1", amount: 1 });
        if (mode === "slow") return setTimeout(() => send(200, { payment_url: "http://127.0.0.1:9/link/1" }), 1500);
        send(200, { payment_url: "http://127.0.0.1:9/link/77", link_id: "77" });
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    setEnv({ ATTR_TEST: "1" });
  });
  after(async () => { restoreEnv(); await new Promise((r) => server.close(r)); });

  const cfg = (): GrowMakeConfig => ({ createUrl: `${base}/make`, secret: "unit-make-secret-0123", timeoutMs: 600,
    publicBaseUrl: "http://localhost:5173", notifyBaseUrl: "http://localhost:3001", notifySecret: "n".repeat(32) });
  const input = { order_id: ORDER, amount: 349, description: "d", kind: "order" as const, buyer: { name: "יעל כהן", phone: "050-1234567", email: "y@x.test" },
    cFields: { cField1: ORDER, cField2: "ab", cField3: "", cField4: "direct" } };

  test("ok: the scenario gets the order (secret header, exact amount, payer, urls) and returns the link", async () => {
    mode = "ok";
    const r = await new GrowMakeAdapter(cfg(), new GrowPagesAdapter({ pages: new Map(), orderParam: null })).createLink(input);
    assert.deepEqual(r, { ok: true, payment_url: "http://127.0.0.1:9/link/77", link_id: "77" });
    const last = got[got.length - 1];
    assert.equal(last.secret, "unit-make-secret-0123");
    assert.equal(last.body.make_secret, "unit-make-secret-0123");   // Scenario A's filter reads it from the body
    assert.equal(last.body.amount, 349); assert.equal(last.body.cField1, ORDER);
    assert.deepEqual(last.body.payer, { full_name: "יעל כהן", phone: "0501234567", email: "y@x.test" });
    assert.equal(last.body.success_url, `http://localhost:5173/order/thanks/${ORDER}`);
    assert.equal(last.body.notify_url, `http://localhost:3001/api/grow-notify/${"n".repeat(32)}`);
  });
  for (const [m, reason] of [["slow", "make_timeout"], ["down", "make_http_500"], ["nourl", "make_no_url"], ["wrongsum", "make_amount_mismatch"]] as const) {
    test(`${m}: no link (${reason})`, async () => {
      mode = m;
      assert.deepEqual(await new GrowMakeAdapter(cfg(), new GrowPagesAdapter({ pages: new Map(), orderParam: null })).createLink(input), { ok: false, reason });
    });
  }
  test("not configured", async () => {
    const r = await new GrowMakeAdapter({ ...cfg(), createUrl: null }, new GrowPagesAdapter({ pages: new Map(), orderParam: null })).createLink(input);
    assert.deepEqual(r, { ok: false, reason: "make_not_configured" });
  });
  test("secret header check is exact", () => {
    assert.equal(makeSecretOk("unit-make-secret-0123", "unit-make-secret-0123"), true);
    assert.equal(makeSecretOk("unit-make-secret-012", "unit-make-secret-0123"), false);
    assert.equal(makeSecretOk(undefined, "unit-make-secret-0123"), false);
    assert.equal(makeSecretOk("x", null), false);
  });

  test("startPayment: Make link, else the fixed page for the amount, else WhatsApp (never another amount)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "growmake-"));
    setEnv({
      ATTR_DATA_DIR: dir, PAYMENTS_ENABLED: "1", PAYMENT_PROVIDER: "grow_make", GROW_MAKE_CREATE_URL: `${base}/make`,
      GROW_MAKE_SECRET: "unit-make-secret-0123", GROW_MAKE_TIMEOUT_MS: "600", GROW_PAGE_URLS: JSON.stringify({ 349: "http://127.0.0.1:9/page/349" }),
    });
    const { startPayment } = await import("../../api/_checkout.ts");
    const store = new FileStore(dir);
    const a = mkOrder("BT2611BBBBB1"), b = mkOrder("BT2611BBBBB2"), c = mkOrder("BT2611BBBBB3", { amount_expected: 314 });
    for (const o of [a, b, c]) await store.appendOrder(o, async () => undefined);
    mode = "ok";
    assert.deepEqual(await startPayment(store, a), { payment_url: "http://127.0.0.1:9/link/77", reason: null, mode: "hosted" });
    assert.deepEqual((await store.getOrder(a.order_id))?.grow_process_ids, ["77"]);
    mode = "slow";
    assert.deepEqual(await startPayment(store, b), { payment_url: "http://127.0.0.1:9/page/349", reason: null, mode: "fixed_page" });
    assert.equal((await store.getOrder(b.order_id))?.payment_fallback_reason, "make_timeout");
    mode = "down";
    assert.deepEqual(await startPayment(store, c), { payment_url: null, reason: "make_http_500|no_grow_page_for_amount", mode: null });
  });

  test("relayed notify: cField1 match, sum check, idempotent, approve flag", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "makenotify-"));
    setEnv({ ATTR_DATA_DIR: dir });
    const { processMakeNotify } = await import("../../api/_grow_make_notify.ts");
    const store = new FileStore(dir);
    await store.appendOrder(mkOrder("BT2611CCCCC1"), async () => undefined);
    const n = (p: Record<string, unknown>) => parseGrowNotify({ data: { statusCode: "2", status: "שולם", sum: "349", transactionId: "m1",
      transactionTypeId: "6", customFields: { cField1: "BT2611CCCCC1" }, ...p } }, "application/json");
    const wrong = await processMakeNotify(store, n({ sum: "348", transactionId: "m0" }), "0".repeat(64));
    assert.equal(wrong.body.approve, false); assert.equal(wrong.paidOrder, undefined);
    const ok = await processMakeNotify(store, n({}), "1".repeat(64));
    assert.equal(ok.body.approve, true); assert.equal(ok.paidOrder, "BT2611CCCCC1");
    const o = await store.getOrder("BT2611CCCCC1");
    assert.equal(o?.match_method, "order_id"); assert.equal(o?.verify_mode, "unsigned_webhook"); assert.equal(o?.payment_method, "bit");
    assert.equal((await store.getPayment("m1"))?.provider, "grow_make");
    const again = await processMakeNotify(store, n({}), "1".repeat(64));
    assert.equal(again.body.approve, true); assert.equal(again.body.duplicate, true); assert.equal(again.paidOrder, undefined);
    const unknown = await processMakeNotify(store, n({ customFields: { cField1: "BT2611ZZZZZZ" }, transactionId: "m9" }), "2".repeat(64));
    assert.equal(unknown.body.approve, false);
  });
});

describe("dev shim behaves like @vercel/node for api routes", () => {
  test("multipart: req.body undefined, the raw body still readable; JSON parsed", async () => {
    const { toVercelRequest } = await import("../../scripts/dev-api-lib/shim.ts");
    const { readRawBody } = await import("../../api/_grow_webhook.ts");
    const seen: Array<{ body: unknown; raw: string }> = [];
    const server = http.createServer(async (req, res) => {
      const v = await toVercelRequest(req, new URL(req.url ?? "/", "http://x.local"), {}, "vercel");
      seen.push({ body: v.body, raw: (await readRawBody(v)).toString("utf8") });
      res.end("ok");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    try {
      const f = new FormData(); f.append("sum", "349"); f.append("dynamicFields[0][value]", "BT2611K7Q3XA");
      await fetch(url, { method: "POST", body: f });
      await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: 1 }) });
      assert.equal(seen[0].body, undefined, "multipart is not parsed (as on Vercel)");
      assert.match(seen[0].raw, /name="sum"\r\n\r\n349/);
      assert.deepEqual(seen[1].body, { a: 1 });
      assert.equal(seen[1].raw, JSON.stringify({ a: 1 }));
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

test("friend codes: 5% for kits from 3.11.2026, 10% for cards printed before (Lihi, 2.11)", async () => {
  const { resolvePromo } = await import("../../api/_pricing.js");
  const { PRICES_2026_11 } = await import("../../api/_price_table.js");
  const legacy = await resolvePromo("tamar-roi-gift", { table: PRICES_2026_11 });
  assert.equal(legacy?.discount_pct, 10);
  const fresh = await resolvePromo("some-new-couple-gift", { table: PRICES_2026_11 });
  assert.equal(fresh?.discount_pct, 5);
  assert.equal(fresh?.source, "friend");
});

// ---------------------------------------------------------------------------------------------
// Stage 1 fixes (docs/attribution/strategy_2026-11/CONCLUSIONS.md section 6, A1-A3)
// ---------------------------------------------------------------------------------------------

describe("A1 manual provider: Lihi sends a one-time Grow link", () => {
  before(() => setEnv({ PAYMENTS_ENABLED: "1", PAYMENT_PROVIDER: "manual" }));
  after(restoreEnv);
  test("preflight says manual_link; startPayment returns mode manual and never asks for an adapter", async () => {
    const { preflightReason, startPayment, MANUAL_LINK_REASON } = await import("../../api/_checkout.ts");
    const o = mkOrder("BT2611DDDDD1");
    assert.equal(MANUAL_LINK_REASON, "manual_link");
    assert.equal(preflightReason(o), "manual_link");
    assert.equal(preflightReason({ ...o, amount_expected: 0 }), null);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "manual-"));
    const store = new FileStore(dir);
    await store.appendOrder(o, async () => undefined);
    assert.deepEqual(await startPayment(store, o), { payment_url: null, reason: "manual_link", mode: "manual" });
  });
  test("Lihi's email: a neutral box (amount, code, phone, wa.me with a ready message), not the red line", async () => {
    const { noPaymentLinkBlock, manualPayMessage } = await import("../../api/_order_build.ts");
    const o = mkOrder("BT2611DDDDD2", { payment_fallback_reason: "manual_link", buyer: { name: "יעל  כהן", phone: "050-1234567", email: null } });
    const html = noPaymentLinkBlock(o, null);
    assert.match(html, /לשלוח בקשת תשלום ב-Grow/);
    assert.doesNotMatch(html, /לא נוצר קישור תשלום אוטומטי/);
    assert.match(html, />349</); assert.match(html, />BT2611DDDDD2</); assert.match(html, />050-1234567</);
    const msg = manualPayMessage(o);
    assert.match(msg, /^היי יעל, /); assert.match(msg, /349 ₪, הזמנה BT2611DDDDD2/);
    assert.ok(html.includes(`https://wa.me/972501234567?text=${encodeURIComponent(msg)}`));
    assert.ok(!html.includes("\u2014"), "no em dash");
    const foreign = noPaymentLinkBlock({ ...o, buyer: { ...o.buyer, phone: "+44 7700 900123" } }, null);
    assert.doesNotMatch(foreign, /wa\.me/); assert.match(foreign, /לא נראה כמו נייד ישראלי/);
    // Another reason keeps the red line; payments off or a link made: nothing.
    assert.match(noPaymentLinkBlock({ ...o, payment_fallback_reason: "grow_error" }, null), /לא נוצר קישור תשלום אוטומטי/);
    assert.equal(noPaymentLinkBlock(o, "https://pay.grow.link/x"), "");
  });
});

/** A minimal VercelRequest / VercelResponse pair for handleMarkPaid. */
function fakeReqRes(method: "GET" | "POST", q: Record<string, string>, body: Record<string, unknown> = {}) {
  const req = { method, query: q, body, headers: {} } as unknown as import("@vercel/node").VercelRequest;
  const out = { status: 0, html: "" };
  const res = {
    setHeader() { return res; },
    status(n: number) { out.status = n; return res; },
    send(h: string) { out.html = h; return res; },
    json(j: unknown) { out.html = JSON.stringify(j); return res; },
  } as unknown as import("@vercel/node").VercelResponse;
  return { req, res, out };
}

describe("A2 mark-paid: the amount actually charged", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markpaid-"));
  before(() => setEnv({ ATTR_TEST: "1", ATTR_DATA_DIR: dir, STORE_MODE: "file", MARK_PAID_SECRET: "unit-test-mark-paid-secret",
    PAYMENTS_ENABLED: "1", CAPI_MODE: "log", META_ACCESS_TOKEN: undefined, META_TEST_EVENT_CODE: undefined, RESEND_API_KEY: undefined }));
  after(restoreEnv);

  test("parsePaidAmount: positive, up to 2 decimals, at most 5000; junk is null", async () => {
    const { parsePaidAmount } = await import("../../api/_mark_paid.ts");
    assert.equal(parsePaidAmount("399"), 399); assert.equal(parsePaidAmount(" 349.5 ₪"), 349.5); assert.equal(parsePaidAmount("1,000"), 1000);
    for (const bad of ["", "0", "-5", "abc", "12.345", "5001", "1e3", null, undefined]) assert.equal(parsePaidAmount(bad), null, String(bad));
  });

  test("GET shows the amount field; POST with a different amount stores it as paid_amount and the Purchase value", async () => {
    const { handleMarkPaid, createMarkPaidToken } = await import("../../api/_mark_paid.ts");
    const { getStore } = await import("../../api/_store.ts");
    const store = getStore();
    await store.appendOrder(mkOrder("BT2611EEEEE1"), async () => undefined);
    const t = createMarkPaidToken("BT2611EEEEE1", 349)!;
    const g = fakeReqRes("GET", { action: "mark-paid", t });
    await handleMarkPaid(g.req, g.res);
    assert.equal(g.out.status, 200);
    assert.match(g.out.html, /name="paid_amount" value="349"/);
    assert.match(g.out.html, /כמה נגבה בפועל/);

    const bad = fakeReqRes("POST", { action: "mark-paid" }, { t, method: "bit", paid_amount: "abc" });
    await handleMarkPaid(bad.req, bad.res);
    assert.equal(bad.out.status, 400);
    assert.equal((await store.getOrder("BT2611EEEEE1", { fresh: true }))?.payment_status, "pending");

    const p = fakeReqRes("POST", { action: "mark-paid" }, { t, method: "bit", paid_amount: "399" });
    await handleMarkPaid(p.req, p.res);
    assert.equal(p.out.status, 200);
    assert.match(p.out.html, /399 ₪ \(בהזמנה 349 ₪/);
    const o = await store.getOrder("BT2611EEEEE1", { fresh: true });
    assert.equal(o?.payment_status, "paid"); assert.equal(o?.paid_amount, 399); assert.equal(o?.amount_expected, 349);
    assert.equal((await store.getPayment("manual_BT2611EEEEE1"))?.amount, 399);
    const capi = fs.readFileSync(path.join(dir, "capi.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const purchase = capi.filter((c) => c.payload.data[0].event_name === "Purchase" && c.payload.data[0].custom_data.order_id === "BT2611EEEEE1");
    assert.equal(purchase.length, 1); assert.equal(purchase[0].payload.data[0].custom_data.value, 399);

    const again = fakeReqRes("POST", { action: "mark-paid" }, { t, method: "bit", paid_amount: "399" });
    await handleMarkPaid(again.req, again.res);
    assert.match(again.out.html, /כבר מסומנת כשולמה/);
  });

  test("the order's amount changed after the email: a warning, not a block; no field (old page) = the order's amount", async () => {
    const { handleMarkPaid, createMarkPaidToken } = await import("../../api/_mark_paid.ts");
    const { getStore } = await import("../../api/_store.ts");
    const store = getStore();
    await store.appendOrder(mkOrder("BT2611EEEEE2", { amount_expected: 399 }), async () => undefined);
    const t = createMarkPaidToken("BT2611EEEEE2", 349)!;           // the email was sent at 349
    const g = fakeReqRes("GET", { action: "mark-paid", t });
    await handleMarkPaid(g.req, g.res);
    assert.equal(g.out.status, 200); assert.match(g.out.html, /הסכום בהזמנה השתנה מאז המייל/);
    const p = fakeReqRes("POST", { action: "mark-paid" }, { t, method: "card" });
    await handleMarkPaid(p.req, p.res);
    assert.equal(p.out.status, 200);
    assert.equal((await store.getOrder("BT2611EEEEE2", { fresh: true }))?.paid_amount, 399);
  });
});

describe("A3 alerts: plain Hebrew, one action, deduped per payment", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alerts-"));
  before(() => setEnv({ ATTR_TEST: "1", ATTR_DATA_DIR: dir }));
  after(restoreEnv);
  test("Grow resending the same notify alerts once; another transaction alerts again", async () => {
    const { alert } = await import("../../api/_fulfil.ts");
    await alert("webhook_sum_mismatch", { transactionId: "x1", order_id: "BT2611FFFFF1" });
    await alert("webhook_sum_mismatch", { transactionId: "x1", order_id: "BT2611FFFFF1" });
    await alert("webhook_sum_mismatch", { transactionId: "x2", order_id: "BT2611FFFFF1" });
    await alert("webhook_unmatched", { transactionId: "x1" });
    assert.deepEqual(alertsIn(dir), ["webhook_sum_mismatch", "webhook_sum_mismatch", "webhook_unmatched"]);
  });
  test("every alert kind raised in api/ has a plain-Hebrew text with one action", async () => {
    const { ALERT_TEXT } = await import("../../api/_fulfil.ts");
    const kinds = new Set<string>();
    for (const f of fs.readdirSync(path.join(import.meta.dirname, "../../api"))) {
      if (!f.endsWith(".ts")) continue;
      const src = fs.readFileSync(path.join(import.meta.dirname, "../../api", f), "utf8");
      for (const m of src.matchAll(/alert\(\s*(?:m\.count > 1 \? )?"([a-z_]+)"(?:\s*:\s*"([a-z_]+)")?/g)) { kinds.add(m[1]); if (m[2]) kinds.add(m[2]); }
    }
    assert.ok(kinds.size >= 10, `found ${kinds.size} kinds`);
    for (const k of kinds) {
      assert.ok(ALERT_TEXT[k], `no text for ${k}`);
      assert.ok(ALERT_TEXT[k].what && ALERT_TEXT[k].todo, k);
      assert.ok(!/\u2014/.test(ALERT_TEXT[k].what + ALERT_TEXT[k].todo), `em dash in ${k}`);
    }
    assert.ok(!kinds.has("matched_by_phone_sum"));
  });
});
