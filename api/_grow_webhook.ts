/**
 * Reading and parsing the body Grow posts to /api/grow-notify/<secret>.
 *
 * Raw body: @vercel/node parses JSON, urlencoded and text bodies into req.body but leaves
 * multipart/form-data undefined, so the handler reads the raw bytes itself. @vercel/node has already
 * buffered the body and replays it to "data"/"end" listeners (dev-server.mjs restoreBody), and
 * scripts/dev-api-lib/shim.ts does the same for api routes, so readRawBody() works in both.
 *
 * Fixed-page webhook (Flow B, "קישור לעדכון מערכות מידע (שרת)"): the payment-link format, per
 * https://developers.grow.business/docs/webhooks : status "שולם", sum, fullName, payerPhone,
 * payerEmail, transactionId, productData, shipping, dynamicFields. The exact key names and the
 * encoding on a Light account are UNVERIFIED, so the parser accepts JSON, urlencoded (flat or
 * bracketed keys) and multipart, an optional "data" wrapper, and a few synonyms per field.
 */
import type { VercelRequest } from "@vercel/node";
import { flattenNotifyBody } from "./_payments_grow.js";
import { normalizeOrderCode } from "./_ids.js";

export const MAX_WEBHOOK_BYTES = 1_000_000;

/** The raw request body (empty Buffer when there is none). Never throws. */
export function readRawBody(req: VercelRequest, limit = MAX_WEBHOOK_BYTES): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    };
    // Safety net: a stream that was consumed and not replayed never ends.
    const timer = setTimeout(finish, 3000);
    req.on("data", (c: Buffer | string) => {
      const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
      size += b.length;
      if (size <= limit) chunks.push(b);
    });
    req.on("end", finish);
    req.on("error", finish);
  });
}

function addValue(out: Record<string, unknown>, k: string, v: unknown): void {
  if (!(k in out)) out[k] = v;
  else if (Array.isArray(out[k])) (out[k] as unknown[]).push(v);
  else out[k] = [out[k], v];
}

/** multipart/form-data fields (files are reduced to their name). Values decoded as UTF-8. */
export function parseMultipart(raw: Buffer, contentType: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!m) return out;
  const boundary = "--" + (m[1] ?? m[2]);
  const text = raw.toString("latin1");                 // byte-preserving; each piece is re-decoded below
  const utf8 = (s: string) => Buffer.from(s, "latin1").toString("utf8");
  for (const part of text.split(boundary).slice(1)) {
    if (part.startsWith("--")) break;                  // the closing boundary
    const p = part.replace(/^\r?\n/, "");
    const sep = p.indexOf("\r\n\r\n");
    if (sep < 0) continue;
    const head = utf8(p.slice(0, sep));
    const value = p.slice(sep + 4).replace(/\r?\n$/, "");
    const name = /name="([^"]*)"/i.exec(head)?.[1];
    if (!name) continue;
    const file = /filename="([^"]*)"/i.exec(head);
    addValue(out, name, file ? { filename: file[1] } : utf8(value));
  }
  return out;
}

/** The body as an object, by content type (JSON, urlencoded, multipart; else a best guess). */
export function parseWebhookBody(raw: Buffer, contentType: string): Record<string, unknown> {
  const ct = contentType.toLowerCase();
  const text = () => raw.toString("utf8").trim();
  const json = (): Record<string, unknown> => {
    try {
      const v = JSON.parse(text());
      return v && typeof v === "object" ? (Array.isArray(v) ? { items: v } : (v as Record<string, unknown>)) : {};
    } catch { return {}; }
  };
  const form = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(text())) addValue(out, k, v);
    return out;
  };
  if (!raw.length) return {};
  if (ct.includes("multipart/form-data")) return parseMultipart(raw, contentType);
  if (ct.includes("json")) return json();
  if (ct.includes("application/x-www-form-urlencoded")) return form();
  const t = text();
  if (t.startsWith("{") || t.startsWith("[")) return json();
  return t.includes("=") ? form() : {};
}

export interface PageWebhook {
  statusText: string | null;
  statusCode: string | null;
  /** Grow says the payment went through ("שולם", or statusCode 2). */
  paid: boolean;
  sum: number | null;
  transactionId: string | null;
  asmachta: string | null;
  fullName: string | null;
  payerPhone: string | null;
  payerEmail: string | null;
  paymentType: string | null;
  dynamicFields: Array<{ name: string; value: string }>;
  /** The order id from the typed "קוד הזמנה" (normalised), or null. */
  orderCode: string | null;
  /** What was typed in the order-code field (trimmed, max 40 chars), for alerts. */
  orderCodeTyped: string | null;
  /** Key names only (never values), for the first-payment check. */
  keys: string[];
}

const PAID_WORDS = new Set(["שולם", "paid", "approved", "אושר", "הצליח", "success", "succeeded"]);
const SYN = {
  status: ["status", "statustext", "paymentstatus", "transactionstatus"],
  statusCode: ["statuscode", "status_code"],
  sum: ["sum", "paymentsum", "amount", "total", "transactionsum"],
  transactionId: ["transactionid", "transactioncode", "transaction_id", "transactionnumber"],
  asmachta: ["asmachta", "approvalnumber"],
  fullName: ["fullname", "payername", "customername", "name"],
  payerPhone: ["payerphone", "phone", "customerphone", "mobile"],
  payerEmail: ["payeremail", "email", "customeremail"],
  paymentType: ["transactiontypeid", "transactiontype", "paymentmethod", "paymenttype"],
};
const FIELD_GROUPS = new Set(["dynamicfields", "customfields", "fields", "pagefields", "additionalfields"]);
const FIELD_NAME_KEYS = ["name", "label", "title", "key", "fieldname", "field"];
const FIELD_VALUE_KEYS = ["value", "answer", "val", "text"];
const ORDER_FIELD_RE = /קוד\s*(ה)?הזמנה|מספר\s*(ה)?הזמנה|order/i;

function str(v: unknown): string | null {
  if (v === null || v === undefined || typeof v === "object") return null;
  const t = String(v).trim();
  return t ? t : null;
}
function num(v: string | null): number | null {
  if (v === null) return null;
  const x = Number(v.replace(/[,\s₪]/g, ""));
  return Number.isFinite(x) ? x : null;
}

/** "data[dynamicFields][0][value]" -> ["dynamicFields", "0", "value"] (a leading "data" is dropped). */
function segments(key: string): string[] {
  const segs = key.replace(/\]/g, "").split("[").filter((x) => x !== "");
  return segs.length > 1 && segs[0].toLowerCase() === "data" ? segs.slice(1) : segs;
}

/** Parse a fixed-page (payment-link) webhook body, already turned into an object. */
export function parsePageWebhook(body: unknown): PageWebhook {
  let flat = flattenNotifyBody(body);
  // A field group sent as a JSON string ("dynamicFields": "[{...}]"): expand it in place.
  for (const [k, v] of Object.entries(flat)) {
    const segs = segments(k);
    if (!segs.length) continue;
    if (segs.length === 1 && FIELD_GROUPS.has(segs[0].toLowerCase()) && typeof v === "string" && /^\s*[[{]/.test(v)) {
      try {
        const expanded = flattenNotifyBody({ [segs[0]]: JSON.parse(v) });
        flat = { ...flat, ...expanded };
        delete flat[k];
      } catch { /* keep as is */ }
    }
  }

  // Top-level values by lowercased name (data[x] and x both count; the data[...] one wins).
  const top = new Map<string, string[]>();
  const groups = new Map<string, Record<string, string>>();
  for (const [k, v] of Object.entries(flat)) {
    const segs = segments(k);
    const value = str(v);
    if (value === null || !segs.length) continue;
    const head = segs[0].toLowerCase();
    if (segs.length === 1) {
      const list = top.get(head) ?? [];
      if (k.toLowerCase().startsWith("data[")) list.unshift(value); else list.push(value);
      top.set(head, list);
    } else if (FIELD_GROUPS.has(head)) {
      if (segs.length === 2) {
        groups.set(`${head}:${segs[1]}`, { name: segs[1], value });          // {"קוד הזמנה": "..."}
      } else {
        const g = groups.get(`${head}:${segs[1]}`) ?? {};
        g[segs[2].toLowerCase()] = value;                                     // [0][name], [0][value]
        groups.set(`${head}:${segs[1]}`, g);
      }
    }
  }
  const first = (names: string[]) => {
    for (const n of names) { const v = top.get(n)?.[0]; if (v) return v; }
    return null;
  };
  const all = (names: string[]) => names.flatMap((n) => top.get(n) ?? []);

  const dynamicFields: Array<{ name: string; value: string }> = [];
  for (const g of groups.values()) {
    const name = FIELD_NAME_KEYS.map((k) => g[k]).find(Boolean) ?? "";
    const value = FIELD_VALUE_KEYS.map((k) => g[k]).find((x) => x !== undefined) ?? "";
    if (name || value) dynamicFields.push({ name, value });
  }
  for (let i = 1; i <= 9; i++) {                      // cField1..9 (a prefilled page might use them)
    const v = first([`cfield${i}`]);
    if (v) dynamicFields.push({ name: `cField${i}`, value: v });
  }

  const labelled = dynamicFields.find((f) => ORDER_FIELD_RE.test(f.name));
  let orderCode = labelled ? normalizeOrderCode(labelled.value) : null;
  if (!orderCode) {
    for (const f of dynamicFields) { orderCode = normalizeOrderCode(f.value); if (orderCode) break; }
  }

  const statusValues = all(SYN.status);
  const statusCode = first(SYN.statusCode);
  const paid = statusCode === "2" || statusValues.some((s) => PAID_WORDS.has(s.trim().toLowerCase()));
  return {
    statusText: statusValues.find((s) => !/^\d+$/.test(s)) ?? statusValues[0] ?? null,
    statusCode,
    paid,
    sum: num(first(SYN.sum)),
    transactionId: first(SYN.transactionId),
    asmachta: first(SYN.asmachta),
    fullName: first(SYN.fullName),
    payerPhone: first(SYN.payerPhone),
    payerEmail: first(SYN.payerEmail),
    paymentType: first(SYN.paymentType),
    dynamicFields,
    orderCode,
    orderCodeTyped: labelled ? labelled.value.trim().slice(0, 40) : null,
    keys: Object.keys(flat).sort(),
  };
}
