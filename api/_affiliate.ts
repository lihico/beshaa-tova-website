/**
 * Affiliates (docs/attribution/00_DESIGN.md section 8): commission on a paid order and the
 * platform postback. AFFILIATE_PROVIDER = stub (default; test: affiliate.jsonl, prod: console)
 * | firstpromoter (later; needs FIRSTPROMOTER_API_KEY + FIRSTPROMOTER_ACCOUNT_ID).
 * No buyer name, phone, email or address is ever sent to the platform (05 section 8).
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeIsraeliMobile, refPartnerId, type OrderRecord, type Partner } from "./_attribution_core.js";
import { isPartnerActive } from "./_pricing.js";

export interface CommissionResult { commission_ils: number | null; commission_status: "pending" | "void" | null; reason: string }

/** Commission on the paid amount (net of the buyer discount, no shipping). Self-referral -> none. */
export function computeCommission(
  partner: Partner | null, paid_amount: number,
  buyer: { phone?: string | null; email?: string | null }, now: Date = new Date(),
): CommissionResult {
  if (!partner) return { commission_ils: null, commission_status: null, reason: "no_partner" };
  if (!isPartnerActive(partner, now)) return { commission_ils: null, commission_status: null, reason: "partner_inactive" };
  const bp = normalizeIsraeliMobile(buyer.phone ?? ""), pp = normalizeIsraeliMobile(partner.phone ?? "");
  const be = (buyer.email ?? "").trim().toLowerCase(), pe = (partner.email ?? "").trim().toLowerCase();
  if ((bp && pp && bp === pp) || (be && pe && be === pe)) return { commission_ils: 0, commission_status: "void", reason: "self_referral" };
  const v = Number(partner.commission_value) || 0;
  const amount = partner.commission_type === "fixed" ? Math.round(v) : Math.round((paid_amount * v) / 100);
  return { commission_ils: amount, commission_status: "pending", reason: "ok" };
}

export interface SalePostback {
  order_id: string; partner_id: string; fp_ref_id: string | null; code: string | null;
  amount_ils: number; plan: "kit" | "kit_all_meetings" | "gift";
}

export async function postbackSale(s: SalePostback): Promise<{ ok: boolean; detail: string }> {
  const provider = (process.env.AFFILIATE_PROVIDER || "stub").toLowerCase();
  if (provider === "firstpromoter") {
    const key = process.env.FIRSTPROMOTER_API_KEY, account = process.env.FIRSTPROMOTER_ACCOUNT_ID;
    if (!key || !account) return { ok: false, detail: "firstpromoter not configured" };
    try {
      const r = await fetch("https://api.firstpromoter.com/api/v2/track/sale", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Account-ID": account, "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: s.order_id, uid: s.order_id, ref_id: s.fp_ref_id, promo_code: s.code,
          amount: Math.round(s.amount_ils * 100), currency: "ILS", plan: s.plan }),
      });
      return { ok: r.ok, detail: `http ${r.status}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : "fetch failed" };
    }
  }
  const line = { provider: "stub", ...s, at: new Date().toISOString() };
  const dir = process.env.ATTR_DATA_DIR;
  if (process.env.ATTR_TEST === "1" && dir && fs.existsSync(dir)) fs.appendFileSync(path.join(dir, "affiliate.jsonl"), JSON.stringify(line) + "\n");
  else console.log("[affiliate] stub postback", JSON.stringify({ order_id: s.order_id, partner_id: s.partner_id, amount_ils: s.amount_ils, plan: s.plan }));
  return { ok: true, detail: "stub" };
}

/**
 * Section 8 credit, step 2 (at submit): no partner code typed, but the last or first touch carries
 * an `aff-<id>` ref -> set partner_id when that partner is in the registry and active. A typed code
 * (already in record.partner_id) always wins. Mutates and returns the record; never throws.
 */
export async function attachRefPartner(
  record: OrderRecord, store: { getPartnerById(id: string): Promise<Partner | null> }, now: Date = new Date(),
): Promise<OrderRecord> {
  // Section 8: only when no code was typed. A typed non-partner code (a friend's gift code,
  // STUDENT2026) wins, so no creator commission rides on an order credited to that code.
  if (record.partner_id || record.promo_code) return record;
  const id = refPartnerId(record);
  if (!id) return record;
  try {
    const p = await store.getPartnerById(id);
    if (p && isPartnerActive(p, now)) record.partner_id = p.partner_id;
  } catch (e) {
    console.error("[affiliate] ref partner lookup failed:", e instanceof Error ? e.message : e);
  }
  return record;
}

export const DEFAULT_COMMISSION_HOLD_DAYS = 14;   // decision D5 (section 16), awaiting Lihi

export interface CommissionChange {
  order_id: string; partner_id: string | null; commission_ils: number | null;
  from: "pending"; to: "approved" | "void"; reason: "hold_passed" | "order_refunded" | "order_cancelled";
}

/**
 * Monthly close (section 8, report flag --commissions). Pure: returns the changes, the caller writes
 * them. pending + paid + paid_at older than the hold -> approved; pending on a refunded or
 * cancelled order -> void. approved -> paid stays manual (Lihi pays against the creator's invoice).
 */
export function closeCommissions(
  orders: OrderRecord[], now: Date = new Date(), holdDays: number = DEFAULT_COMMISSION_HOLD_DAYS,
): CommissionChange[] {
  const holdMs = Math.max(0, holdDays) * 24 * 3600 * 1000;
  const out: CommissionChange[] = [];
  for (const o of orders) {
    if (o.commission_status !== "pending") continue;
    const base = { order_id: o.order_id, partner_id: o.partner_id, commission_ils: o.commission_ils, from: "pending" as const };
    if (o.payment_status === "refunded") { out.push({ ...base, to: "void", reason: "order_refunded" }); continue; }
    if (o.payment_status === "cancelled") { out.push({ ...base, to: "void", reason: "order_cancelled" }); continue; }
    if (o.payment_status !== "paid" || !o.paid_at) continue;
    const paidMs = Date.parse(o.paid_at);
    if (Number.isFinite(paidMs) && now.getTime() - paidMs >= holdMs) out.push({ ...base, to: "approved", reason: "hold_passed" });
  }
  return out;
}
