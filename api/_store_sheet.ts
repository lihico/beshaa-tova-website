/**
 * SheetStore (docs/attribution/00_DESIGN.md section 5.2): the production store, a thin wrapper over the
 * existing sheet helpers. NOT exercised in this build (no production access): type-checked and
 * reviewed only. Rules it keeps: new tabs are looked up by title and never created here (tab 0
 * stays the order tab the voucher code reads); `addRow` drops keys without a header, so the
 * 71 attribution headers (section 3.6) must exist before this runs; `מקור` / `סטטוס` are never
 * rewritten (payment state lives in `payment_status`).
 */
import type { GoogleSpreadsheetRow, GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import {
  sanitizeTouch, sheetSafe, toSheetColumns, type OrderRecord, type PaymentRecord, type Partner, type Touch, type TrackingCode,
} from "./_attribution_core.js";
import { getOrderDoc } from "./_sheets.js";
import type { Store, StoredTouch } from "./_store.js";

export const ORDERS_TAB = "מעקב הזמנות";
export const PAYMENTS_TAB = "תשלומים";
export const TOUCHES_TAB = "touches";
export const CODES_TAB = "קודי מעקב";
export const PARTNERS_TAB = "שותפים";
const EM_DASH = String.fromCharCode(0x2014);   // the live gift headers ("נותנ/ת <dash> שם") use an em dash
const GIVER = (suffix: string) => `נותנ/ת ${EM_DASH} ${suffix}`;

const ROWS_TTL_MS = 30_000;
const REGISTRY_TTL_MS = 5 * 60_000;

type Row = GoogleSpreadsheetRow<Record<string, string>>;

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}
function orNull(v: unknown): string | null {
  const s = str(v).trim();
  return s ? s : null;
}
function num(v: unknown): number | null {
  const s = str(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** OrderRecord field -> sheet column, where the name differs (everything else is 1:1 or not stored). */
const FIELD_TO_COLUMN: Partial<Record<keyof OrderRecord, string>> = { lead_event_id: "event_id" };
const STORED_FIELDS = new Set<string>(Object.keys(toSheetColumns({ touches: [], grow_process_ids: [] } as unknown as OrderRecord)));

export class SheetStore implements Store {
  readonly mode = "sheet" as const;
  private rowsCache: { at: number; rows: Row[] } | null = null;
  private registry: { at: number; codes: TrackingCode[]; partners: Partner[] } | null = null;

  private async tab(title: string, fallbackIndex0 = false): Promise<GoogleSpreadsheetWorksheet | null> {
    const doc = await getOrderDoc();
    if (!doc) return null;
    return doc.sheetsByTitle[title] || (fallbackIndex0 ? doc.sheetsByIndex[0] : null) || null;
  }

  private async orderRows(fresh = false): Promise<Row[]> {
    if (!fresh && this.rowsCache && Date.now() - this.rowsCache.at < ROWS_TTL_MS) return this.rowsCache.rows;
    const sheet = await this.tab(ORDERS_TAB, true);
    if (!sheet) return [];
    const rows = (await sheet.getRows<Record<string, string>>()) as Row[];
    this.rowsCache = { at: Date.now(), rows };
    return rows;
  }

  private async findRow(order_id: string, fresh = false): Promise<Row | null> {
    const rows = await this.orderRows(fresh);
    return rows.find((r) => str(r.get("order_id")).trim() === order_id) ?? null;
  }

  async appendTouch(t: StoredTouch): Promise<void> {
    const sheet = await this.tab(TOUCHES_TAB);
    if (!sheet) return;                                      // tab not added yet (decision D8)
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(t)) row[k] = sheetSafe(str(v));
    await sheet.addRow(row);
  }

  async appendOrder(_o: OrderRecord, legacyRow: () => Promise<void>): Promise<void> {
    // The caller's legacyRow already carries `attr: toSheetColumns(o)`; one addRow, one row.
    await legacyRow();
    this.rowsCache = null;
  }

  async getOrder(order_id: string, opts?: { fresh?: boolean }): Promise<OrderRecord | null> {
    const row = await this.findRow(order_id, !!opts?.fresh);
    return row ? rowToOrder(row) : null;
  }

  async findOrderByProcessId(process_id: string): Promise<OrderRecord | null> {
    if (!process_id) return null;
    const rows = await this.orderRows(true);
    const row = rows.find((r) => str(r.get("grow_process_ids")).split(",").map((s) => s.trim()).includes(process_id));
    return row ? rowToOrder(row) : null;
  }

  async updateOrder(order_id: string, patch: Partial<OrderRecord>): Promise<void> {
    const row = await this.findRow(order_id, true);
    if (!row) throw new Error(`SheetStore: no order ${order_id}`);
    const merged = { ...rowToOrder(row), ...patch } as OrderRecord;
    const cols = toSheetColumns(merged) as Record<string, string>;
    const headers = new Set(row._worksheet.headerValues);
    let touched = 0;
    for (const field of Object.keys(patch) as Array<keyof OrderRecord>) {
      const col = FIELD_TO_COLUMN[field] ?? (field as string);
      if (!STORED_FIELDS.has(col) || !headers.has(col)) continue;
      row.set(col, cols[col]);
      touched++;
    }
    if (touched) await row.save();
  }

  async appendPayment(p: PaymentRecord): Promise<"inserted" | "duplicate"> {
    if (await this.getPayment(p.payment_id)) return "duplicate";
    const sheet = await this.tab(PAYMENTS_TAB);
    if (!sheet) {
      console.error("[store] tab תשלומים is missing: payment kept on the order row only");
      return "inserted";
    }
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(p)) row[k] = sheetSafe(str(v));
    await sheet.addRow(row);
    return "inserted";
  }

  async getPayment(payment_id: string): Promise<PaymentRecord | null> {
    const sheet = await this.tab(PAYMENTS_TAB);
    if (sheet) {
      const rows = (await sheet.getRows<Record<string, string>>()) as Row[];
      const r = rows.find((x) => str(x.get("payment_id")) === payment_id);
      if (r) return r.toObject() as unknown as PaymentRecord;
      return null;
    }
    // No payments tab: the order row's transaction id is the idempotency key.
    const rows = await this.orderRows(true);
    const o = rows.find((x) => str(x.get("grow_transaction_id")) === payment_id);
    return o ? ({ payment_id, order_id: str(o.get("order_id")) } as PaymentRecord) : null;
  }

  private async loadRegistry(): Promise<{ codes: TrackingCode[]; partners: Partner[] }> {
    if (this.registry && Date.now() - this.registry.at < REGISTRY_TTL_MS) return this.registry;
    const [codesTab, partnersTab] = await Promise.all([this.tab(CODES_TAB), this.tab(PARTNERS_TAB)]);
    const codes = codesTab ? ((await codesTab.getRows<Record<string, string>>()) as Row[]).map(rowToCode) : [];
    const partners = partnersTab ? ((await partnersTab.getRows<Record<string, string>>()) as Row[]).map(rowToPartner) : [];
    this.registry = { at: Date.now(), codes, partners };
    return this.registry;
  }

  async getCode(code: string): Promise<TrackingCode | null> {
    const c = code.toLowerCase();
    return (await this.loadRegistry()).codes.find((x) => x.code.toLowerCase() === c) ?? null;
  }

  async getPartnerByCode(code: string): Promise<Partner | null> {
    const u = code.toUpperCase();
    return (await this.loadRegistry()).partners.find((p) => p.code.toUpperCase() === u) ?? null;
  }

  async getPartnerById(id: string): Promise<Partner | null> {
    const l = id.toLowerCase();
    return (await this.loadRegistry()).partners.find((p) => p.partner_id.toLowerCase() === l) ?? null;
  }

  async listOrders(): Promise<OrderRecord[]> {
    const rows = await this.orderRows(true);
    return rows.filter((r) => str(r.get("order_id")).trim()).map(rowToOrder);
  }
}

// ---------------------------------------------------------------------------------------------
// Row -> record mappers (lossy by design: the sheet holds the flat ft_*/lt_* columns plus
// touches_json; first/last are rebuilt from touches_json when present)
// ---------------------------------------------------------------------------------------------

function parseTouches(json: string): Touch[] {
  if (!json.trim()) return [];
  try {
    const arr = JSON.parse(json) as unknown[];
    return Array.isArray(arr) ? (arr.map(sanitizeTouch).filter(Boolean) as Touch[]) : [];
  } catch {
    return [];
  }
}

function pickTouch(touches: Touch[], ts: string | null): Touch | null {
  if (!ts) return null;
  return touches.find((t) => t.ts === ts) ?? null;
}

export function rowToOrder(r: Row): OrderRecord {
  const g = (k: string) => str(r.get(k));
  const kind = (g("order_kind") || "order") as OrderRecord["order_kind"];
  const isGift = kind === "gift";
  const touches = parseTouches(g("touches_json"));
  const meetings = g("מפגשים").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    order_id: g("order_id"), order_kind: kind, created_at: "",   // not a sheet column (only the he-IL "תאריך הזמנה"); fulfilPaid treats "" as recent
    payment_status: (g("payment_status") || "pending") as OrderRecord["payment_status"],
    amount_expected: num(g("amount_expected")) ?? 0, currency: "ILS", price_rule: g("price_rule"),
    client_displayed_amount: null,
    promo_code: orNull(g("promo_code")), partner_id: orNull(g("partner_id")),
    credit_rule: (g("credit_rule") || "none") as OrderRecord["credit_rule"],
    credited_channel: (g("credited_channel") || "direct") as OrderRecord["credited_channel"],
    credited_detail: orNull(g("credited_detail")),
    first: pickTouch(touches, orNull(g("ft_ts"))), last: pickTouch(touches, orNull(g("lt_ts"))), touches,
    self_reported_source: orNull(g("self_reported_source")), not_engaged: g("not_engaged") === "true",
    visitor_id: g("visitor_id"), session_id: orNull(g("session_id")),
    fbc: orNull(g("fbc")), fbp: orNull(g("fbp")), ga_client_id: orNull(g("ga_client_id")),
    client_ip: orNull(g("client_ip")), user_agent: orNull(g("user_agent")), event_source_url: orNull(g("event_source_url")),
    consent_marketing: (g("consent_marketing") || "unknown") as OrderRecord["consent_marketing"],
    buyer: isGift
      ? { name: g(GIVER("שם")), phone: g(GIVER("טלפון")), email: orNull(g(GIVER("מייל"))) }
      : { name: g("שם 1 (ממלא/ת)"), phone: g("טלפון"), email: orNull(g("מייל")) },
    couple: { name1: g("שם 1 (ממלא/ת)"), name2: g("שם 2") },
    lead_event_id: g("event_id"),
    grow_process_ids: g("grow_process_ids").split(",").map((s) => s.trim()).filter(Boolean),
    grow_process_token: orNull(g("grow_process_token")),
    payment_fallback_reason: orNull(g("payment_fallback_reason")),
    paid_at: orNull(g("paid_at")), paid_amount: num(g("paid_amount")), grow_transaction_id: orNull(g("grow_transaction_id")),
    asmachta: orNull(g("asmachta")), payment_method: orNull(g("payment_method")),
    payer_name: orNull(g("payer_name")), payer_phone: orNull(g("payer_phone")), payer_email: orNull(g("payer_email")),
    match_method: (orNull(g("match_method")) as OrderRecord["match_method"]) ?? null,
    capi_purchase_event_id: orNull(g("capi_purchase_event_id")), capi_purchase_sent_at: orNull(g("capi_purchase_sent_at")),
    capi_purchase_result: orNull(g("capi_purchase_result")),
    capi_lead_result: orNull(g("capi_lead_result")), capi_lead_sent_at: orNull(g("capi_lead_sent_at")),
    capi_last_error_code: orNull(g("capi_last_error_code")),
    ga_session_id: orNull(g("ga_session_id")),
    grow_paid_at: orNull(g("grow_paid_at")), revenue_net_ils: num(g("revenue_net_ils")), fee_ils: num(g("fee_ils")),
    refund_amount: num(g("refund_amount")), refunded_at: orNull(g("refunded_at")), credit_doc_number: orNull(g("credit_doc_number")),
    recon_status: orNull(g("recon_status")), recon_source: orNull(g("recon_source")), recon_at: orNull(g("recon_at")),
    commission_ils: num(g("commission_ils")),
    commission_status: (orNull(g("commission_status")) as OrderRecord["commission_status"]) ?? null,
    invoice_number: orNull(g("invoice_number")), invoice_url: orNull(g("invoice_url")),
    meetings: meetings.length ? meetings : null,
    voucher_code: orNull(g("קוד שובר")),
    fulfil_log: null,
  };
}

function rowToCode(r: Row): TrackingCode {
  const g = (k: string) => str(r.get(k)).trim();
  return {
    code: g("code").toLowerCase(), channel: g("channel") || undefined, landing: g("landing") || "/",
    utm_source: g("utm_source") || undefined, utm_medium: g("utm_medium") || undefined,
    utm_campaign: g("utm_campaign") || undefined, utm_content: g("utm_content") || undefined,
    utm_term: g("utm_term") || undefined, location: g("location") || undefined,
    status: g("status") === "retired" ? "retired" : "active",
  };
}

function rowToPartner(r: Row): Partner {
  const g = (k: string) => str(r.get(k)).trim();
  return {
    partner_id: g("partner_id").toLowerCase(), code: g("code").toUpperCase(), name: g("name"), platform: g("platform"),
    handle: g("handle"), commission_type: g("commission_type") === "fixed" ? "fixed" : "percent",
    commission_value: num(g("commission_value")) ?? 0, buyer_discount_pct: num(g("buyer_discount_pct")) ?? 0,
    active: /^(true|1|כן|yes)$/i.test(g("active")), start: g("start") || null, end: g("end") || null,
    fp_ref_id: g("fp_ref_id") || null, phone: g("phone") || null, email: g("email") || null,
  };
}
