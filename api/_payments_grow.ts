/**
 * GrowAdapter: the Grow API path (PAYMENT_PROVIDER=grow), kept for the day the API add-on is bought.
 * Not the default: Grow Light without the API uses api/_payments_grow_pages.ts (provider grow_pages).
 * (docs/attribution/00_DESIGN.md 5.5; field names from 02_grow_integration.md section 4,
 * CONFIRMED there against https://developers.grow.business/reference ). UNTESTED against Grow:
 * in this build it runs only against the local fake (scripts/mock-grow.ts) through MockGrowAdapter.
 *
 * Env (all required for the real adapter, read at construction): GROW_API_BASE (sandbox
 * https://sandbox.meshulam.co.il/api/light/server/1.0, production https://secure.meshulam.co.il/api/light/server/1.0),
 * GROW_USER_ID, GROW_PAGE_CODE, GROW_NOTIFY_SECRET; PUBLIC_BASE_URL (default the site),
 * NOTIFY_BASE_URL (default PUBLIC_BASE_URL). userId/pageCode act as the credential: server only.
 */
import type { OrderRecord } from "./_attribution_core.js";
import { normalizeIsraeliMobile } from "./_attribution_core.js";
import type {
  CreatePaymentInput, CreatePaymentResult, NotifyParsed, PaymentAdapter, VerifyResult,
} from "./_payments.js";

export interface GrowConfig {
  apiBase: string; userId: string; pageCode: string; notifySecret: string;
  publicBaseUrl: string; notifyBaseUrl: string;
}

const DEFAULT_PUBLIC_BASE = "https://www.beshaa-tova.co.il";

export function growConfigFromEnv(): GrowConfig {
  const e = process.env;
  const missing = ["GROW_API_BASE", "GROW_USER_ID", "GROW_PAGE_CODE", "GROW_NOTIFY_SECRET"].filter((k) => !(e[k] ?? "").trim());
  if (missing.length) throw new Error(`Grow is not configured: ${missing.join(", ")} missing`);
  const publicBaseUrl = (e.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE).replace(/\/+$/, "");
  return {
    apiBase: String(e.GROW_API_BASE).replace(/\/+$/, ""), userId: String(e.GROW_USER_ID), pageCode: String(e.GROW_PAGE_CODE),
    notifySecret: String(e.GROW_NOTIFY_SECRET), publicBaseUrl,
    notifyBaseUrl: (e.NOTIFY_BASE_URL || publicBaseUrl).replace(/\/+$/, ""),
  };
}

/** Fields echoed to approveTransaction (02 section 4). */
const APPROVE_FIELDS = [
  "transactionId", "transactionToken", "transactionTypeId", "paymentType", "sum", "firstPaymentSum",
  "periodicalPaymentSum", "paymentsNum", "allPaymentsNum", "paymentDate", "asmachta", "description", "fullName",
  "payerPhone", "payerEmail", "cardSuffix", "cardType", "cardTypeCode", "cardBrand", "cardBrandCode", "cardExp",
  "processId", "processToken",
] as const;

interface GrowResponse { status?: number | string; err?: unknown; data?: unknown }

export class GrowError extends Error {
  constructor(public method: string, public growErrId: string | null, message: string) { super(message); }
}

let loggedNotifyKeys = false;

// ---------------------------------------------------------------------------------------------
// Notify body -> flat bracketed map ("data[customFields][cField1]" -> value)
// ---------------------------------------------------------------------------------------------

function flattenInto(v: unknown, prefix: string, out: Record<string, unknown>): void {
  if (v && typeof v === "object" && !Array.isArray(v) && !Buffer.isBuffer(v)) {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) flattenInto(x, prefix ? `${prefix}[${k}]` : k, out);
  } else if (Array.isArray(v) && prefix && v.every((x) => x && typeof x === "object")) {
    v.forEach((x, i) => flattenInto(x, `${prefix}[${i}]`, out));
  } else if (prefix) {
    out[prefix] = Array.isArray(v) ? v[v.length - 1] : v;      // a repeated form key: last one wins
  }
}

export function flattenNotifyBody(body: unknown, contentType = ""): Record<string, unknown> {
  let b: unknown = body;
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string") {
    const s = b.trim();
    if (s.startsWith("{") || contentType.toLowerCase().includes("json")) {
      try { b = JSON.parse(s); } catch { b = {}; }
    } else {
      const o: Record<string, string> = {};
      for (const [k, v] of new URLSearchParams(s)) o[k] = v;
      b = o;
    }
  }
  const out: Record<string, unknown> = {};
  flattenInto(b, "", out);
  // A JSON body whose `data` arrived as a string ("data": "{...}")
  if (typeof out.data === "string" && out.data.trim().startsWith("{")) {
    try { flattenInto(JSON.parse(out.data), "data", out); delete out.data; } catch { /* keep as is */ }
  }
  return out;
}

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t ? t : null;
}
function n(v: unknown): number | null {
  const t = s(v);
  if (t === null) return null;
  const x = Number(t.replace(/,/g, ""));
  return Number.isFinite(x) ? x : null;
}

/** Grow's notify (API or a per-order payment link relayed by Make): bracketed, flat, nested or JSON. */
export function parseGrowNotify(body: unknown, contentType = ""): NotifyParsed {
  const flat = flattenNotifyBody(body, contentType);
  if (!loggedNotifyKeys) {
    loggedNotifyKeys = true;
    console.log("[grow-notify] body key names (values never logged):", Object.keys(flat).sort().join(","));
  }
  const get = (f: string) => s(flat[`data[${f}]`] ?? flat[f]);
  const customFields: Record<string, string> = {};
  for (let i = 1; i <= 9; i++) {
    const k = `cField${i}`;
    const v = s(flat[`data[customFields][${k}]`] ?? flat[`customFields[${k}]`] ?? flat[`data[${k}]`] ?? flat[k]);
    if (v) customFields[k] = v;
  }
  return {
    processId: get("processId"), processToken: get("processToken"),
    transactionId: get("transactionId"), transactionToken: get("transactionToken"),
    transactionTypeId: get("transactionTypeId"), sum: n(get("sum")), statusCode: get("statusCode"),
    asmachta: get("asmachta"), cardSuffix: get("cardSuffix"), paymentsNum: n(get("paymentsNum")),
    fullName: get("fullName"), payerPhone: get("payerPhone"), payerEmail: get("payerEmail"),
    customFields, raw: flat,
  };
}

// ---------------------------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------------------------

export class GrowAdapter implements PaymentAdapter {
  readonly provider: "grow" | "grow_mock" = "grow";
  readonly flow = "hosted" as const;
  constructor(protected cfg: GrowConfig) {}

  /** POST <apiBase>/<method> as multipart/form-data (never JSON); returns `data` or throws GrowError. */
  protected async call(method: string, fields: Record<string, string | number | null | undefined>): Promise<Record<string, unknown>> {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined && v !== "") form.append(k, String(v));
    let res: Response;
    try {
      res = await fetch(`${this.cfg.apiBase}/${method}`, { method: "POST", body: form });
    } catch (e) {
      throw new GrowError(method, null, `network: ${e instanceof Error ? e.message : "fetch failed"}`);
    }
    const j = (await res.json().catch(() => ({}))) as GrowResponse;
    if (String(j.status) !== "1") {
      const err = (j.err && typeof j.err === "object" ? j.err : {}) as { id?: unknown; message?: unknown };
      throw new GrowError(method, s(err.id), `${method} failed: status ${s(j.status) ?? "?"} http ${res.status} err ${s(err.id) ?? "-"} ${s(err.message) ?? ""}`.trim());
    }
    const data = Array.isArray(j.data) ? j.data[0] : j.data;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  }

  notifyUrl(): string {
    return `${this.cfg.notifyBaseUrl}/api/grow-notify/${this.cfg.notifySecret}`;
  }

  async createPayment(i: CreatePaymentInput): Promise<CreatePaymentResult> {
    const phone = normalizeIsraeliMobile(i.buyer.phone);
    if (!phone) throw new GrowError("createPaymentProcess", null, "phone is not an Israeli mobile");
    const name = i.buyer.name.replace(/\s+/g, " ").trim();
    if (name.split(" ").length < 2) throw new GrowError("createPaymentProcess", null, "fullName needs two words");
    const catalog = i.catalogNumber ?? (i.kind === "gift" ? "gift" : "kit");
    const thanks = `${this.cfg.publicBaseUrl}/order/thanks/${i.order_id}`;
    const data = await this.call("createPaymentProcess", {
      pageCode: this.cfg.pageCode, userId: this.cfg.userId,
      sum: i.amount, chargeType: 1, maxPaymentNum: 1,                 // installments off (decision D6)
      successUrl: thanks, cancelUrl: `${thanks}/cancelled`,
      description: i.description,
      "pageField[fullName]": name, "pageField[phone]": phone, "pageField[email]": i.buyer.email,
      cField1: i.cFields.cField1, cField2: i.cFields.cField2, cField3: i.cFields.cField3, cField4: i.cFields.cField4,
      notifyUrl: this.notifyUrl(),
      "productData[0][catalogNumber]": catalog, "productData[0][quantity]": 1,
      "productData[0][price]": i.amount, "productData[0][itemDescription]": i.description,
    });
    const url = s(data.url), processId = s(data.processId), processToken = s(data.processToken);
    if (!url || !processId || !processToken) throw new GrowError("createPaymentProcess", null, "response lacks url/processId/processToken");
    return { payment_url: url, process_id: processId, process_token: processToken };
  }

  parseNotify(body: unknown, contentType: string): NotifyParsed {
    return parseGrowNotify(body, contentType);
  }

  async verify(nf: NotifyParsed, order: OrderRecord): Promise<VerifyResult> {
    const ids = order.grow_process_ids ?? [];
    if (!nf.processId) return { ok: false, reason: "no_process_id" };
    if (!ids.includes(nf.processId)) return { ok: false, reason: "process_not_for_order" };
    if (nf.customFields.cField1 && nf.customFields.cField1 !== order.order_id) return { ok: false, reason: "cfield1_mismatch" };
    if (nf.sum !== null && nf.sum !== order.amount_expected) return { ok: false, reason: "notify_sum_mismatch" };
    // The stored token belongs to the latest process; an older process (before /api/pay-retry) is
    // checked with the token from the body: Grow itself authenticates the (processId, token) pair.
    const latest = ids[ids.length - 1];
    const token = nf.processId === latest && order.grow_process_token ? order.grow_process_token : nf.processToken;
    if (!token) return { ok: false, reason: "no_process_token" };
    let info: Record<string, unknown>;
    try {
      info = await this.call("getPaymentProcessInfo", { pageCode: this.cfg.pageCode, processId: nf.processId, processToken: token });
    } catch (e) {
      return { ok: false, reason: `process_info_error${e instanceof GrowError && e.growErrId ? ":" + e.growErrId : ""}` };
    }
    const code = s(info.statusCode ?? info.status_code);
    if (code !== "2") return { ok: false, reason: `not_paid:${code ?? "none"}` };
    const sum = n(info.sum);
    if (sum === null || sum !== order.amount_expected) return { ok: false, reason: "sum_mismatch" };
    const infoTx = s(info.transactionId);
    if (nf.transactionId && infoTx && infoTx !== nf.transactionId) return { ok: false, reason: "transaction_mismatch" };
    const transactionId = nf.transactionId ?? infoTx;
    if (!transactionId) return { ok: false, reason: "no_transaction_id" };
    return { ok: true, sum, statusCode: "2", transactionId, via: "process_info" };
  }

  async approve(nf: NotifyParsed): Promise<{ ok: boolean; detail: string }> {
    const fields: Record<string, string | null> = { pageCode: this.cfg.pageCode };
    for (const f of APPROVE_FIELDS) fields[f] = s(nf.raw[`data[${f}]`] ?? nf.raw[f]);
    try {
      await this.call("approveTransaction", fields);
      return { ok: true, detail: "approved" };
    } catch (e) {
      // "The transaction will be processed even if the ApproveTransaction request ... fails" (02 section 3)
      return { ok: false, detail: e instanceof Error ? e.message : "approve failed" };
    }
  }
}
