/**
 * buildReport() (docs/attribution/00_DESIGN.md section 10): pure, from ReportData to one object that
 * the CLI prints as text or JSON. No buyer data except in `orders` (the per-order list, printed only
 * behind --orders and in .test-data/report.txt). Partners and affiliates carry ids and sums only.
 */
import { selfReportChannel, type Channel, type OrderRecord, type Touch } from "../../api/_attribution_core.ts";
import type { ReportData } from "./load.ts";
import { joinSpend, type MetaCac } from "./join.ts";

export type Model = "credited" | "first" | "last";

export interface ReportOptions {
  from?: string | null;      // YYYY-MM-DD (Israel date of created_at), inclusive
  to?: string | null;
  model: Model;
  paidOnly: boolean;
  now: Date;
}

export interface Counts { orders: number; paid: number; revenue: number }
export interface ChannelRow extends Counts { channel: string; commission: number }

const H48 = 48 * 3600 * 1000;

export function israelDate(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(ms));
}

export const isPaid = (o: OrderRecord): boolean => o.payment_status === "paid";
export const revenueOf = (o: OrderRecord): number => (isPaid(o) ? Number(o.paid_amount ?? o.amount_expected) || 0 : 0);
const commissionOf = (o: OrderRecord): number =>
  o.commission_status && o.commission_status !== "void" ? Number(o.commission_ils) || 0 : 0;

function add(c: Counts, o: OrderRecord): void {
  c.orders += 1;
  if (isPaid(o)) { c.paid += 1; c.revenue += revenueOf(o); }
}

const zero = (): Counts => ({ orders: 0, paid: 0, revenue: 0 });
const byRevenue = <T extends Counts>(a: T, b: T) => b.revenue - a.revenue || b.paid - a.paid || b.orders - a.orders;

/** The touch an order is attributed to under a model (null when the credit is a code, self-report or none). */
export function modelTouch(o: OrderRecord, model: Model): Touch | null {
  if (model === "first") return o.first ?? null;
  if (model === "last") return o.last ?? null;
  if (o.credit_rule === "last_touch") return o.last ?? null;
  if (o.credit_rule === "first_touch") return o.first ?? null;
  return null;
}

export function modelChannel(o: OrderRecord, model: Model): string {
  if (model === "credited") return o.credited_channel || "direct";
  return modelTouch(o, model)?.channel ?? "direct";
}

function channelTable(orders: OrderRecord[], model: Model): ChannelRow[] {
  const m = new Map<string, ChannelRow>();
  for (const o of orders) {
    const ch = modelChannel(o, model);
    const row = m.get(ch) ?? { channel: ch, ...zero(), commission: 0 };
    add(row, o);
    row.commission += commissionOf(o);
    m.set(ch, row);
  }
  return [...m.values()].sort(byRevenue);
}

export interface Summary {
  orders_submitted: number; payable_orders: number; paid: number; paid_rate: number | null; revenue: number;
  free_redemptions: number; cancelled: number; refunded: number; pending: number; pending_over_48h: string[];
  commission_total: number;
  by_kind: Record<string, Counts>;
}

function summary(orders: OrderRecord[], now: Date): Summary {
  const payable = orders.filter((o) => o.payment_status !== "free");
  const paid = orders.filter(isPaid);
  const by_kind: Record<string, Counts> = {};
  for (const o of orders) add((by_kind[o.order_kind] ??= zero()), o);
  return {
    orders_submitted: orders.length,
    payable_orders: payable.length,
    paid: paid.length,
    paid_rate: payable.length ? paid.length / payable.length : null,
    revenue: paid.reduce((s, o) => s + revenueOf(o), 0),
    free_redemptions: orders.filter((o) => o.payment_status === "free").length,
    cancelled: orders.filter((o) => o.payment_status === "cancelled").length,
    refunded: orders.filter((o) => o.payment_status === "refunded").length,
    pending: orders.filter((o) => o.payment_status === "pending").length,
    pending_over_48h: orders
      .filter((o) => o.payment_status === "pending" && now.getTime() - Date.parse(o.created_at) > H48)
      .map((o) => o.order_id),
    commission_total: orders.reduce((s, o) => s + commissionOf(o), 0),
    by_kind,
  };
}

/** Orders inside the date window (and paid only when asked). */
export function filterOrders(orders: OrderRecord[], opt: Pick<ReportOptions, "from" | "to" | "paidOnly">): OrderRecord[] {
  return orders.filter((o) => {
    const d = israelDate(o.created_at);
    if (opt.from && d < opt.from) return false;
    if (opt.to && d > opt.to) return false;
    if (opt.paidOnly && !isPaid(o)) return false;
    return true;
  });
}

export function inWindow(iso: string | null | undefined, opt: Pick<ReportOptions, "from" | "to">): boolean {
  const d = israelDate(iso);
  if (opt.from && d && d < opt.from) return false;
  if (opt.to && d && d > opt.to) return false;
  return true;
}


// ---------------------------------------------------------------------------------------------
// 3. Meta drill-down: campaign -> ad set -> ad, plus placement
// ---------------------------------------------------------------------------------------------

/**
 * Spend columns (PLAN 1.6), null until a Meta spend cache is loaded. `cac` and `cac_label` come from
 * report-lib/join.ts (last touch credited, paid_at in the window), not from this row's model counts.
 */
export interface SpendCols { spend: number | null; cac: number | null; cac_label: string | null; meta_claimed: number | null }
const noSpend = (): SpendCols => ({ spend: null, cac: null, cac_label: null, meta_claimed: null });

export interface MetaAdRow extends Counts, SpendCols { ad_id: string; ad_name: string | null; touches: number }
export interface MetaAdsetRow extends Counts, SpendCols { adset_id: string; adset_name: string | null; touches: number; ads: MetaAdRow[] }
export interface MetaCampaignRow extends Counts, SpendCols { campaign_id: string; campaign_name: string | null; touches: number; adsets: MetaAdsetRow[] }
export interface PlacementRow extends Counts { placement: string; touches: number }

const NO_ID = "(no id)";

type MetaKey = { c: string; cn: string | null; s: string; sn: string | null; a: string; an: string | null; plc: string };
function metaKey(t: Pick<Touch, "meta_campaign_id" | "meta_adset_id" | "meta_ad_id" | "utm_campaign" | "utm_term" | "utm_content" | "placement">): MetaKey {
  return {
    c: t.meta_campaign_id || NO_ID, cn: t.utm_campaign ?? null,
    s: t.meta_adset_id || NO_ID, sn: t.utm_term ?? null,
    a: t.meta_ad_id || NO_ID, an: t.utm_content ?? null,
    plc: t.placement || "(unknown)",
  };
}

function metaDrill(orders: OrderRecord[], touches: Touch[], model: Model): { campaigns: MetaCampaignRow[]; placements: PlacementRow[] } {
  const camps = new Map<string, MetaCampaignRow>();
  const plcs = new Map<string, PlacementRow>();
  const node = (k: MetaKey) => {
    let c = camps.get(k.c);
    if (!c) camps.set(k.c, (c = { campaign_id: k.c, campaign_name: null, touches: 0, ...zero(), ...noSpend(), adsets: [] }));
    if (k.cn) c.campaign_name = k.cn;                     // names freeze at publish; the latest seen wins
    let s = c.adsets.find((x) => x.adset_id === k.s);
    if (!s) c.adsets.push((s = { adset_id: k.s, adset_name: null, touches: 0, ...zero(), ...noSpend(), ads: [] }));
    if (k.sn) s.adset_name = k.sn;
    let a = s.ads.find((x) => x.ad_id === k.a);
    if (!a) s.ads.push((a = { ad_id: k.a, ad_name: null, touches: 0, ...zero(), ...noSpend() }));
    if (k.an) a.ad_name = k.an;
    let p = plcs.get(k.plc);
    if (!p) plcs.set(k.plc, (p = { placement: k.plc, touches: 0, ...zero() }));
    return [c, s, a, p] as const;
  };
  for (const t of touches) {
    if (t.channel !== "paid_meta") continue;
    for (const n of node(metaKey(t))) n.touches += 1;
  }
  for (const o of orders) {
    const t = modelTouch(o, model);
    if (!t || t.channel !== "paid_meta") continue;
    for (const n of node(metaKey(t))) add(n, o);
  }
  const campaigns = [...camps.values()].sort(byRevenue);
  for (const c of campaigns) {
    c.adsets.sort(byRevenue);
    for (const s of c.adsets) s.ads.sort(byRevenue);
  }
  return { campaigns, placements: [...plcs.values()].sort(byRevenue) };
}

/** Copies spend, CAC and Meta-claimed purchases from the join onto the drill rows with the same ids. */
function annotateDrill(campaigns: MetaCampaignRow[], cac: MetaCac): void {
  const put = (row: SpendCols, n: { spend: number; cac: number | null; cac_label: string | null; meta_claimed: number } | undefined) => {
    if (!n) return;
    row.spend = n.spend; row.cac = n.cac; row.cac_label = n.cac_label; row.meta_claimed = n.meta_claimed;
  };
  for (const c of campaigns) {
    const jc = cac.campaigns.find((x) => x.id === c.campaign_id);
    put(c, jc);
    for (const s of c.adsets) {
      const js = jc?.adsets.find((x) => x.id === s.adset_id);
      put(s, js);
      for (const a of s.ads) put(a, js?.ads.find((x) => x.id === a.ad_id));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 4. QR and ref codes (Meta and affiliate refs have their own sections)
// ---------------------------------------------------------------------------------------------

export interface CodeRow extends Counts {
  code: string; channel: string | null; location: string | null; status: string | null; in_registry: boolean;
  scans: number; touches: number; credited_paid: number; credited_revenue: number;
  cost_ils: number | null; cost_per_paid: number | null;
}

/** The code a touch belongs to: its /q code, else its ref; null for Meta and affiliate refs. */
export function touchCode(t: Pick<Touch, "q_code" | "ref">): string | null {
  const v = (t.q_code || t.ref || "").toLowerCase();
  if (!v || v.startsWith("meta-") || v.startsWith("aff-")) return null;
  return v;
}

function orderTouchList(o: OrderRecord): Touch[] {
  const list = [...(o.touches ?? [])];
  for (const t of [o.first, o.last]) if (t && !list.some((x) => x.touch_id === t.touch_id)) list.push(t);
  return list;
}

function codeTable(orders: OrderRecord[], touches: Touch[], data: ReportData): CodeRow[] {
  const m = new Map<string, CodeRow>();
  const row = (code: string): CodeRow => {
    let r = m.get(code);
    if (!r) {
      const reg = data.codes.find((c) => String(c.code).toLowerCase() === code) ?? null;
      r = {
        code, channel: reg?.channel ? String(reg.channel) : null, location: reg?.location ?? null, status: reg?.status ?? null,
        in_registry: !!reg, scans: 0, touches: 0, ...zero(), credited_paid: 0, credited_revenue: 0,
        cost_ils: typeof reg?.cost_ils === "number" ? reg.cost_ils : null, cost_per_paid: null,
      };
      m.set(code, r);
    }
    return r;
  };
  for (const c of data.codes) if (c && c.code) row(String(c.code).toLowerCase());
  for (const t of touches) {
    const code = touchCode(t);
    if (!code) continue;
    const r = row(code);
    r.touches += 1;
    if (t.kind === "qr_scan") r.scans += 1;
    if (!r.channel) r.channel = t.channel;
  }
  for (const o of orders) {
    const codes = new Set(orderTouchList(o).map(touchCode).filter((c): c is string => !!c));
    for (const code of codes) add(row(code), o);
    const det = (o.credited_detail ?? "").toLowerCase();
    if (det && isPaid(o) && m.has(det)) { const r = m.get(det) as CodeRow; r.credited_paid += 1; r.credited_revenue += revenueOf(o); }
  }
  for (const r of m.values()) r.cost_per_paid = r.cost_ils !== null && r.paid > 0 ? Math.round((r.cost_ils / r.paid) * 100) / 100 : null;
  return [...m.values()].sort((a, b) => byRevenue(a, b) || b.touches - a.touches || a.code.localeCompare(b.code));
}

// ---------------------------------------------------------------------------------------------
// 5. Affiliates (ids, counts and sums only; never buyer data)
// ---------------------------------------------------------------------------------------------

export interface AffiliateRow extends Counts {
  partner_id: string; name: string | null; code: string | null; active: boolean | null; in_registry: boolean;
  code_uses: number; ref_touches: number; self_referral_void: number;
  commission: { pending: number; approved: number; paid: number; void: number };
}

function affiliateTable(orders: OrderRecord[], touches: Touch[], data: ReportData): AffiliateRow[] {
  const m = new Map<string, AffiliateRow>();
  const row = (id: string): AffiliateRow => {
    const key = id.toLowerCase();
    let r = m.get(key);
    if (!r) {
      const p = data.partners.find((x) => x.partner_id.toLowerCase() === key) ?? null;
      r = {
        partner_id: p?.partner_id ?? key, name: p?.name ?? null, code: p?.code ?? null, active: p ? !!p.active : null,
        in_registry: !!p, code_uses: 0, ref_touches: 0, self_referral_void: 0, ...zero(),
        commission: { pending: 0, approved: 0, paid: 0, void: 0 },
      };
      m.set(key, r);
    }
    return r;
  };
  for (const p of data.partners) row(p.partner_id);
  for (const t of touches) {
    for (const v of [t.q_code, t.ref]) {
      const mm = typeof v === "string" ? /^aff-(.+)$/i.exec(v) : null;
      if (mm) { row(mm[1]).ref_touches += 1; break; }
    }
  }
  for (const o of orders) {
    const code = (o.promo_code ?? "").toUpperCase();
    if (code) for (const r of m.values()) if (r.code && r.code.toUpperCase() === code) r.code_uses += 1;
    if (!o.partner_id) continue;
    const r = row(o.partner_id);
    add(r, o);
    if (o.commission_status) r.commission[o.commission_status] += Number(o.commission_ils) || 0;
    if (o.commission_status === "void" && !o.commission_ils) r.self_referral_void += 1;
  }
  return [...m.values()].sort((a, b) => byRevenue(a, b) || a.partner_id.localeCompare(b.partner_id));
}

// ---------------------------------------------------------------------------------------------
// 6. First vs last (paid counts) and 7. self-report vs tracked
// ---------------------------------------------------------------------------------------------

export interface Matrix { rows: string[]; cols: string[]; cells: Record<string, Record<string, number>>; basis: "paid" | "all" }

function firstLastMatrix(orders: OrderRecord[]): Matrix {
  const paid = orders.filter(isPaid);
  const cells: Record<string, Record<string, number>> = {};
  const rows = new Set<string>(), cols = new Set<string>();
  for (const o of paid) {
    const f = modelChannel(o, "first"), l = modelChannel(o, "last");
    rows.add(f); cols.add(l);
    (cells[f] ??= {})[l] = ((cells[f] ?? {})[l] ?? 0) + 1;
  }
  return { rows: [...rows].sort(), cols: [...cols].sort(), cells, basis: "paid" };
}

/** Channels a self-reported answer is consistent with (an ad seen on Instagram is "instagram" to the buyer). */
const COMPATIBLE: Partial<Record<Channel, Channel[]>> = {
  organic_social: ["organic_social", "paid_meta", "paid_tiktok", "community_group", "affiliate"],
  referral: ["referral", "gift_voucher", "messaging"],
  messaging: ["messaging", "community_group", "referral"],
  cafe_partner: ["cafe_partner", "offline_print"],
  offline_print: ["offline_print", "cafe_partner"],
  partner: ["partner", "offline_print"],
  email: ["email"],
};

export interface SelfReportRow { order_id: string; self_reported: string; self_channel: string | null; tracked_channel: string; credit_rule: string }
export interface SelfReport {
  with_answer: number; compared: number; agree_strict: number; agree_compatible: number;
  pct_strict: number | null; pct_compatible: number | null;
  unmapped: number; no_tracked: number; disagreements: SelfReportRow[];
}

/** Tracked = the credited channel when it came from a code or a touch; self-report and none are not tracked. */
export function trackedChannel(o: OrderRecord): string | null {
  return o.credit_rule === "code" || o.credit_rule === "last_touch" || o.credit_rule === "first_touch" ? o.credited_channel : null;
}

function selfReport(orders: OrderRecord[]): SelfReport {
  const r: SelfReport = { with_answer: 0, compared: 0, agree_strict: 0, agree_compatible: 0, pct_strict: null, pct_compatible: null, unmapped: 0, no_tracked: 0, disagreements: [] };
  for (const o of orders) {
    const ans = (o.self_reported_source ?? "").trim();
    if (!ans) continue;
    r.with_answer += 1;
    const self = selfReportChannel(ans);
    const tracked = trackedChannel(o);
    if (!self) { r.unmapped += 1; continue; }
    if (!tracked) { r.no_tracked += 1; continue; }
    r.compared += 1;
    if (self === tracked) r.agree_strict += 1;
    if ((COMPATIBLE[self] ?? [self]).includes(tracked as Channel)) r.agree_compatible += 1;
    else r.disagreements.push({ order_id: o.order_id, self_reported: ans.slice(0, 40), self_channel: self, tracked_channel: tracked, credit_rule: o.credit_rule });
  }
  if (r.compared) { r.pct_strict = r.agree_strict / r.compared; r.pct_compatible = r.agree_compatible / r.compared; }
  return r;
}

// ---------------------------------------------------------------------------------------------
// 8. Health checks
// ---------------------------------------------------------------------------------------------

export interface Health {
  paid_orders: number;
  paid_no_touch: string[];
  paid_missing_capi_event_id: string[];
  capi_purchase_logged: number;            // Purchase events in capi.jsonl for these orders (all lines)
  capi_purchase_unique: number;            // distinct event ids among them
  capi_purchase_marked: number;            // paid orders whose row says the Purchase went out (capi_purchase_sent_at)
  paid_without_logged_purchase: string[];  // only meaningful when CAPI ran in log mode (test); see capi_log_present
  capi_log_present: boolean;
  purchase_for_unpaid: string[];           // a Purchase event for an order that is not paid (must be empty)
  duplicate_purchase_events: string[];
  lead_missing: string[];                  // orders with no Lead event in the log (log mode only)
  paid_without_payment_record: string[];
  payments_without_order: string[];
  fallback: Array<{ order_id: string; reason: string }>;
  price_mismatch: Array<{ order_id: string; shown: number; expected: number; rule: string }>;
  pending_over_48h: string[];
  blocked_egress: number | null;
  ok: boolean;
}

const PURCHASE_ID = /^purchase_(BT\d{4}[0-9A-HJKMNP-TV-Z]{6})$/;
const LEAD_ID = /^lead_(BT\d{4}[0-9A-HJKMNP-TV-Z]{6})$/;

function health(orders: OrderRecord[], allOrders: OrderRecord[], data: ReportData, pendingOld: string[]): Health {
  const ids = new Set(orders.map((o) => o.order_id));
  const allById = new Map(allOrders.map((o) => [o.order_id, o]));
  const paid = orders.filter(isPaid);
  const purchaseCount = new Map<string, number>();
  const leadIds = new Set<string>();
  for (const e of data.capi) {
    const p = PURCHASE_ID.exec(e.event_id);
    if (e.event_name === "Purchase" && p) {
      // in the window, or for an order that does not exist at all (always worth flagging)
      if (ids.has(p[1]) || !allById.has(p[1])) purchaseCount.set(p[1], (purchaseCount.get(p[1]) ?? 0) + 1);
    }
    const l = LEAD_ID.exec(e.event_id);
    if (e.event_name === "Lead" && l) leadIds.add(l[1]);
  }
  const capi_log_present = data.capi.length > 0;
  const paidIds = new Set(data.payments.map((p) => p.order_id));
  const h: Health = {
    paid_orders: paid.length,
    paid_no_touch: paid.filter((o) => !o.first && !o.last && !(o.touches ?? []).length).map((o) => o.order_id),
    paid_missing_capi_event_id: paid.filter((o) => !o.capi_purchase_event_id).map((o) => o.order_id),
    capi_purchase_logged: [...purchaseCount.values()].reduce((s, n) => s + n, 0),
    capi_purchase_unique: purchaseCount.size,
    capi_purchase_marked: paid.filter((o) => !!o.capi_purchase_sent_at).length,
    paid_without_logged_purchase: capi_log_present ? paid.filter((o) => !purchaseCount.has(o.order_id)).map((o) => o.order_id) : [],
    capi_log_present,
    purchase_for_unpaid: [...purchaseCount.keys()].filter((id) => { const o = allById.get(id); return !o || !isPaid(o); }),
    duplicate_purchase_events: [...purchaseCount.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    lead_missing: capi_log_present ? orders.filter((o) => !leadIds.has(o.order_id)).map((o) => o.order_id) : [],
    paid_without_payment_record: paid.filter((o) => !paidIds.has(o.order_id)).map((o) => o.order_id),
    payments_without_order: [...new Set(data.payments.map((p) => p.order_id))].filter((id) => !allById.has(id)),
    fallback: orders.filter((o) => o.payment_fallback_reason).map((o) => ({ order_id: o.order_id, reason: String(o.payment_fallback_reason) })),
    price_mismatch: orders
      .filter((o) => o.client_displayed_amount !== null && o.client_displayed_amount !== undefined && o.client_displayed_amount !== o.amount_expected)
      .map((o) => ({ order_id: o.order_id, shown: Number(o.client_displayed_amount), expected: o.amount_expected, rule: o.price_rule })),
    pending_over_48h: pendingOld,
    blocked_egress: data.blocked_egress ? data.blocked_egress.length : null,
    ok: false,
  };
  // A paid order credited by a typed code (influencer on another phone, E2E J4) legitimately has no
  // touch: it is listed above but does not make the health check fail.
  const codeCredited = new Set(paid.filter((o) => o.credit_rule === "code").map((o) => o.order_id));
  h.ok = !h.paid_no_touch.some((id) => !codeCredited.has(id)) && !h.paid_missing_capi_event_id.length && !h.paid_without_logged_purchase.length &&
    !h.purchase_for_unpaid.length && !h.duplicate_purchase_events.length && !h.paid_without_payment_record.length &&
    !h.payments_without_order.length && !h.price_mismatch.length && !h.pending_over_48h.length && !h.blocked_egress;
  return h;
}

// ---------------------------------------------------------------------------------------------
// Per-order list (the only place with buyer data) and the whole report
// ---------------------------------------------------------------------------------------------

export interface OrderLine {
  order_id: string; kind: string; created: string; status: string; amount: number; paid_amount: number | null;
  buyer: string; buyer_phone: string;      // name as typed; phone masked to the last 3 digits
  credited: string; credit_rule: string; detail: string | null;
  first: string; last: string; self_reported: string | null; partner_id: string | null; commission: string | null;
  payment_method: string | null; fallback: string | null;
  /** Source detail (no buyer data): the typed code, the Meta ids, QR code and the first/last touch refs. */
  promo_code: string | null; meta: string | null; q_code: string | null;
  first_touch: string | null; last_touch: string | null;
}

function touchLabel(t: OrderRecord["first"]): string | null {
  if (!t) return null;
  return [t.channel, t.ref ?? t.utm_source ?? t.referrer_host ?? null].filter(Boolean).join(" ");
}

export function maskPhone(p: string | null | undefined): string {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length >= 3 ? `***${d.slice(-3)}` : "";
}

function orderLines(orders: OrderRecord[]): OrderLine[] {
  return [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((o) => ({
    order_id: o.order_id, kind: o.order_kind, created: o.created_at, status: o.payment_status,
    amount: o.amount_expected, paid_amount: o.paid_amount ?? null,
    buyer: o.buyer?.name ?? "", buyer_phone: maskPhone(o.buyer?.phone),
    credited: o.credited_channel, credit_rule: o.credit_rule, detail: o.credited_detail,
    first: modelChannel(o, "first"), last: modelChannel(o, "last"),
    self_reported: o.self_reported_source ? o.self_reported_source.slice(0, 40) : null,
    partner_id: o.partner_id, commission: o.commission_status ? `${o.commission_ils ?? 0} ${o.commission_status}` : null,
    payment_method: o.payment_method ?? null, fallback: o.payment_fallback_reason ?? null,
    promo_code: o.promo_code ?? null,
    meta: (() => {
      const t = [o.last, ...[...(o.touches ?? [])].reverse(), o.first].find((x) => x && (x.meta_campaign_id || x.meta_ad_id));
      return t ? `c ${t.meta_campaign_id ?? "-"} / as ${t.meta_adset_id ?? "-"} / ad ${t.meta_ad_id ?? "-"}` : null;
    })(),
    q_code: [o.last, ...[...(o.touches ?? [])].reverse(), o.first].find((x) => x?.q_code)?.q_code ?? null,
    first_touch: touchLabel(o.first), last_touch: touchLabel(o.last),
  }));
}

export interface Report {
  generated_at: string; source: string; window: { from: string | null; to: string | null };
  model: Model; paid_only: boolean;
  summary: Summary;
  by_channel: { credited: ChannelRow[]; first: ChannelRow[]; last: ChannelRow[] };
  /** `cac` is null when no Meta spend was loaded (--spend). */
  meta: { campaigns: MetaCampaignRow[]; placements: PlacementRow[]; cac: MetaCac | null };
  excluded_tests: Array<{ order_id: string; reason: string }>;
  codes: CodeRow[];
  affiliates: AffiliateRow[];
  first_vs_last: Matrix;
  self_report: SelfReport;
  health: Health;
  orders: OrderLine[];
}

export function buildReport(data: ReportData, opt: ReportOptions): Report {
  const orders = filterOrders(data.orders, opt);
  const touches = data.touches.filter((t) => inWindow(t.ts, opt));
  const sum = summary(orders, opt.now);
  const drill = metaDrill(orders, touches, opt.model);
  // CAC uses its own window rule (paid_at in the dates), so it joins over every order, not `orders`.
  const cac = data.meta_spend ? joinSpend(data.orders, data.meta_spend, { from: opt.from ?? null, to: opt.to ?? null }) : null;
  if (cac) annotateDrill(drill.campaigns, cac);
  return {
    generated_at: opt.now.toISOString(), source: `${data.source}:${data.dir}`,
    window: { from: opt.from ?? null, to: opt.to ?? null }, model: opt.model, paid_only: opt.paidOnly,
    summary: sum,
    by_channel: { credited: channelTable(orders, "credited"), first: channelTable(orders, "first"), last: channelTable(orders, "last") },
    meta: { ...drill, cac },
    excluded_tests: data.excluded_tests ?? [],
    codes: codeTable(orders, touches, data),
    affiliates: affiliateTable(orders, touches, data),
    first_vs_last: firstLastMatrix(orders),
    self_report: selfReport(orders),
    health: health(orders, data.orders, data, sum.pending_over_48h),
    orders: orderLines(orders),
  };
}

/** --json view: everything except buyer data (the per-order list keeps ids, channels and amounts). */
export function jsonView(r: Report, withOrders: boolean): unknown {
  const orders = r.orders.map(({ buyer, buyer_phone, ...rest }) => (withOrders ? { buyer, buyer_phone, ...rest } : rest));
  return { ...r, orders };
}
