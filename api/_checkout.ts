/**
 * Order-side payment helpers (docs/attribution/00_DESIGN.md 5.4 step 8, 5.1 /api/pay-retry).
 * Shared by api/order.ts, api/gift.ts and api/pay-retry.ts.
 */
import { LEGACY_UUID_RE, isIsraeliMobile, type OrderRecord } from "./_attribution_core.js";
import { payments, paymentProviderSetting, paymentsEnabled, type CreatePaymentInput } from "./_payments.js";
import { GrowPagesAdapter, growPagesConfigFromEnv } from "./_payments_grow_pages.js";
import { growMakeConfigFromEnv } from "./_payments_grow_make.js";
import type { Store } from "./_store.js";

export const MAX_PROCESSES_PER_ORDER = 10;

/**
 * hosted = a per-order Grow page (API or Make); fixed_page = a fixed Grow sales page per amount (Light);
 * manual = no link on the site, Lihi sends a one-time Grow link by WhatsApp (PAYMENT_PROVIDER=manual).
 */
export type PayMode = "hosted" | "fixed_page" | "manual";

/** payment_fallback_reason of every order under PAYMENT_PROVIDER=manual (not a failure). */
export const MANUAL_LINK_REASON = "manual_link";

/** Why no automatic payment link can be made for this order, or null when one can be tried. */
export function preflightReason(o: Pick<OrderRecord, "amount_expected" | "buyer">): string | null {
  if (o.amount_expected <= 0) return null;                         // free: no payment at all
  if (!paymentsEnabled()) return "payments_disabled";
  let provider: string;
  try { provider = paymentProviderSetting(); } catch { return "provider_misconfigured"; }
  if (provider === "manual") return MANUAL_LINK_REASON;
  // Fixed pages: the buyer types name and phone on Grow, so only the amount matters.
  const hasPage = () => !!new GrowPagesAdapter(growPagesConfigFromEnv()).pageUrlFor(o.amount_expected);
  if (provider === "grow_pages") return hasPage() ? null : "no_grow_page_for_amount";
  // Make: try the per-order link (Grow checks the payer details); the fixed page is the fallback.
  if (provider === "grow_make") {
    const m = growMakeConfigFromEnv();
    return (m.createUrl && m.secret) || hasPage() ? null : "no_grow_page_for_amount";
  }
  if (!isIsraeliMobile(o.buyer.phone)) return "phone_not_il_mobile";
  if (o.buyer.name.replace(/\s+/g, " ").trim().split(" ").length < 2) return "name_one_word";   // Grow needs two words
  return null;
}

/** cField2: the visitor id as 32 hex chars (Grow dislikes special characters in fields). */
export function visitorHex(visitor_id: string): string {
  if (LEGACY_UUID_RE.test(visitor_id)) return visitor_id.replace(/-/g, "").toLowerCase();
  if (visitor_id.startsWith("v_")) {
    try { return Buffer.from(visitor_id.slice(2), "base64url").toString("hex").slice(0, 32); } catch { /* fall through */ }
  }
  return "";
}

const fieldSafe = (v: string | null | undefined) => (v ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);

export function paymentInputFor(o: OrderRecord): CreatePaymentInput {
  const kind = o.order_kind === "gift" ? "gift" : "order";
  return {
    order_id: o.order_id, amount: o.amount_expected,
    description: kind === "gift" ? `Beshaa Tova gift ${o.order_id}` : `Beshaa Tova kit ${o.order_id}`,
    buyer: { name: o.buyer.name.replace(/\s+/g, " ").trim(), phone: o.buyer.phone, email: o.buyer.email },
    kind,
    catalogNumber: kind === "gift" ? "gift" : o.all_meetings ? "kit_all" : "kit",
    cFields: {
      cField1: o.order_id,
      cField2: visitorHex(o.visitor_id),
      cField3: fieldSafe(o.partner_id ?? o.last?.ref ?? o.first?.ref ?? ""),
      cField4: fieldSafe(o.last?.channel ?? o.first?.channel ?? "direct"),
    },
  };
}

export interface StartPaymentResult { payment_url: string | null; reason: string | null; mode: PayMode | null }

/**
 * Hosted (API): create a Grow process for a stored order and record its ids. Fixed page (Light):
 * the configured page for the order's exact amount, never another amount. Never throws: on failure
 * the order gets payment_fallback_reason and the caller falls back to today's WhatsApp flow.
 */
export async function startPayment(store: Store, o: OrderRecord): Promise<StartPaymentResult> {
  const pre = preflightReason(o);
  if (pre) return { payment_url: null, reason: pre, mode: pre === MANUAL_LINK_REASON ? "manual" : null };
  if (o.amount_expected <= 0) return { payment_url: null, reason: null, mode: null };
  let adapter;
  try { adapter = payments(); } catch (e) {
    console.error("[checkout] payment adapter:", e instanceof Error ? e.message : e);
    await store.updateOrder(o.order_id, { payment_fallback_reason: "grow_error" }).catch(() => undefined);
    return { payment_url: null, reason: "grow_error", mode: null };
  }
  // The fixed page for the exact amount (grow_pages, and the fallback of grow_make).
  const fixedPage = async (pages: GrowPagesAdapter, before: string | null): Promise<StartPaymentResult> => {
    const url = pages.paymentUrlFor(o.order_id, o.amount_expected);
    const reason = url ? before : [before, "no_grow_page_for_amount"].filter(Boolean).join("|");
    if (reason !== (o.payment_fallback_reason ?? null)) await store.updateOrder(o.order_id, { payment_fallback_reason: reason }).catch(() => undefined);
    return url ? { payment_url: url, reason: null, mode: "fixed_page" } : { payment_url: null, reason, mode: null };
  };
  if (adapter.flow === "fixed_page") return fixedPage(adapter, null);
  if (adapter.flow === "make") {
    const made = await adapter.createLink(paymentInputFor(o));
    if (made.ok) {
      const ids = o.grow_process_ids ?? [];
      const patch = { grow_process_ids: made.link_id ? [...ids, made.link_id] : ids, payment_fallback_reason: null };
      await store.updateOrder(o.order_id, patch).catch(() => undefined);
      return { payment_url: made.payment_url, reason: null, mode: "hosted" };
    }
    console.error(`[checkout] Make link failed for ${o.order_id}: ${made.reason}; trying the fixed page`);
    return fixedPage(adapter.pages, made.reason);
  }
  const ids = o.grow_process_ids ?? [];
  if (ids.length >= MAX_PROCESSES_PER_ORDER) return { payment_url: null, reason: "too_many_processes", mode: null };
  try {
    const p = await adapter.createPayment(paymentInputFor(o));
    await store.updateOrder(o.order_id, { grow_process_ids: [...ids, p.process_id], grow_process_token: p.process_token, payment_fallback_reason: null });
    return { payment_url: p.payment_url, reason: null, mode: "hosted" };
  } catch (e) {
    console.error("[checkout] createPayment failed:", e instanceof Error ? e.message : e);
    await store.updateOrder(o.order_id, { payment_fallback_reason: "grow_error" }).catch(() => undefined);
    return { payment_url: null, reason: "grow_error", mode: null };
  }
}
