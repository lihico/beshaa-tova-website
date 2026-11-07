/**
 * Flow B: a fixed Grow page's server update ("קישור לעדכון מערכות מידע (שרת)") -> our order.
 * Called by api/grow-notify.ts when PAYMENT_PROVIDER is grow_pages. docs/attribution/GROW_LIGHT_SETUP.md.
 *
 * Grow signs nothing and Light has no API to re-query, so a payment is accepted only when:
 *   - Grow says it was paid (status "שולם" or statusCode 2),
 *   - it matches exactly one waiting order: by the typed order code (tolerant: case, spaces, dashes,
 *     missing "BT"); with no usable code, by the payer phone + the exact sum among pending orders,
 *   - the sum equals the order's amount_expected.
 * Anything else changes nothing and alerts Lihi. Idempotent on transactionId. The order is marked
 * verify_mode "unsigned_webhook"; the caller then runs the same fulfilPaid() as every other path,
 * so there is one Purchase per order whichever path (webhook or Lihi's link) comes first.
 */
import { normalizeIsraeliMobile, type OrderRecord, type PaymentRecord } from "./_attribution_core.js";
import { withLock } from "./_bg.js";
import { alert } from "./_fulfil.js";
import { methodFromText } from "./_payments.js";
import type { PageWebhook } from "./_grow_webhook.js";
import type { Store } from "./_store.js";

/** Phone + sum matching looks only at orders this recent (when the store knows created_at). */
export const PHONE_MATCH_MAX_AGE_DAYS = 45;

export interface PageWebhookOutcome {
  status: number;
  body: Record<string, unknown>;
  /** Set when this webhook marked the order paid (the caller runs fulfilPaid after answering). */
  paidOrder?: string;
}

const maskPhone = (p: string | null) => (p ? `***${p.replace(/\D/g, "").slice(-3)}` : null);

function recent(o: OrderRecord, now: number): boolean {
  if (!o.created_at) return true;                         // SheetStore has no created_at column
  const t = Date.parse(o.created_at);
  return !Number.isFinite(t) || now - t <= PHONE_MATCH_MAX_AGE_DAYS * 24 * 3600 * 1000;
}

async function matchByPhoneAndSum(store: Store, w: PageWebhook): Promise<{ order: OrderRecord | null; count: number }> {
  const phone = normalizeIsraeliMobile(w.payerPhone);
  if (!phone || w.sum === null) return { order: null, count: 0 };
  const now = Date.now();
  const hits = (await store.listOrders()).filter((o) =>
    o.payment_status === "pending" && (o.order_kind === "order" || o.order_kind === "gift")
    && o.amount_expected === w.sum && normalizeIsraeliMobile(o.buyer.phone) === phone && recent(o, now));
  return { order: hits.length === 1 ? hits[0] : null, count: hits.length };
}

export async function processPageWebhook(store: Store, w: PageWebhook, rawDigest: string): Promise<PageWebhookOutcome> {
  return withLock("grow_pages_webhook", async () => {
    const ids = { transactionId: w.transactionId, sum: w.sum === null ? null : String(w.sum), typed_code: w.orderCodeTyped };
    if (!w.paid) {
      await alert("webhook_not_paid", { ...ids, status: w.statusText ?? w.statusCode, order_code: w.orderCode });
      return { status: 200, body: { ok: true, ignored: "not_paid" } };
    }
    if (w.transactionId && (await store.getPayment(w.transactionId))) return { status: 200, body: { ok: true, duplicate: true } };

    // Which order: the typed code first, else payer phone + exact sum.
    let order: OrderRecord | null = null;
    let match: "order_code" | "phone_sum" = "order_code";
    if (w.orderCode) {
      order = await store.getOrder(w.orderCode, { fresh: true });
      if (!order) await alert("order_code_not_found", { ...ids, order_code: w.orderCode });
    }
    if (!order) {
      const m = await matchByPhoneAndSum(store, w);
      if (!m.order) {
        await alert(m.count > 1 ? "webhook_ambiguous_phone_sum" : "webhook_unmatched", {
          ...ids, order_code: w.orderCode, payer_phone: maskPhone(w.payerPhone), candidates: String(m.count),
        });
        return { status: 200, body: { ok: true, matched: false } };
      }
      order = m.order;
      match = "phone_sum";
    }

    if (order.payment_status === "paid") {
      if (w.transactionId && order.grow_transaction_id === w.transactionId) return { status: 200, body: { ok: true, duplicate: true } };
      // Lihi already marked it paid with her link: this is the same payment arriving later. Keep Grow's
      // ids on the order, no second Purchase, no alert (unless the sum differs).
      if (order.match_method === "manual" && !order.grow_transaction_id && w.sum === order.amount_expected) {
        await store.updateOrder(order.order_id, { grow_transaction_id: w.transactionId, asmachta: w.asmachta, payer_name: w.fullName, payer_phone: w.payerPhone, payer_email: w.payerEmail });
        return { status: 200, body: { ok: true, already_marked: true } };
      }
      await alert("second_payment_for_paid_order", { ...ids, order_id: order.order_id });
      return { status: 200, body: { ok: true } };
    }
    if (order.payment_status !== "pending") {
      await alert("webhook_for_order_not_pending", { ...ids, order_id: order.order_id, payment_status: order.payment_status });
      return { status: 200, body: { ok: true } };
    }
    if (w.sum === null || w.sum !== order.amount_expected) {
      await alert("webhook_sum_mismatch", { ...ids, order_id: order.order_id, expected: String(order.amount_expected), match });
      await store.updateOrder(order.order_id, { payment_fallback_reason: `webhook_sum_mismatch:${w.sum ?? "none"}` });
      return { status: 200, body: { ok: true, matched: true, accepted: false } };
    }

    const paid_at = new Date().toISOString();
    const method = methodFromText(w.paymentType);
    const payment: PaymentRecord = {
      payment_id: w.transactionId ?? `hook_${rawDigest.slice(0, 24)}`, order_id: order.order_id, provider: "grow_pages",
      amount: w.sum, currency: "ILS", paid_at, asmachta: w.asmachta, method, card_suffix: null, installments: null,
      verified: false, verification: "unsigned_webhook", raw_notify_digest: rawDigest,
    };
    if ((await store.appendPayment(payment)) === "duplicate") return { status: 200, body: { ok: true, duplicate: true } };
    await store.updateOrder(order.order_id, {
      payment_status: "paid", paid_at, paid_amount: w.sum, grow_transaction_id: payment.payment_id,
      asmachta: w.asmachta, payment_method: method,
      payer_name: w.fullName, payer_phone: w.payerPhone, payer_email: w.payerEmail,
      match_method: match, verify_mode: "unsigned_webhook", payment_fallback_reason: null,
    });
    // A phone + sum match is not an alert: Lihi's normal "paid" email carries a line asking her to glance at Grow (A3).
    return { status: 200, body: { ok: true }, paidOrder: order.order_id };
  });
}
