/**
 * The Make relay of Grow's notify for a per-order payment link (provider grow_make), called by
 * api/grow-notify.ts after the x-grow-make-secret header check. Matches by cField1 = order_id, requires
 * paid + the exact sum, idempotent on transactionId. The answer's `approve` tells the Make scenario
 * whether to run Grow's "Approve Transaction" (Grow re-sends an unapproved notify up to 5 more times).
 * No API on Light means no re-query: the order is marked verify_mode "unsigned_webhook".
 */
import type { OrderRecord, PaymentRecord } from "./_attribution_core.js";
import { withLock } from "./_bg.js";
import { alert } from "./_fulfil.js";
import { isOrderId } from "./_ids.js";
import { methodFromType, type NotifyParsed } from "./_payments.js";
import type { Store } from "./_store.js";

const PAID_WORDS = new Set(["שולם", "paid", "approved", "אושר", "success"]);

export interface MakeNotifyOutcome {
  status: number;
  /** `approve` tells the Make scenario whether to run Grow's "Approve Transaction". */
  body: { ok: boolean; approve: boolean; [k: string]: unknown };
  paidOrder?: string;
}

/** A relayed notify is "paid" when statusCode is 2 or a status text says so. */
export function makeNotifyPaid(n: NotifyParsed): boolean {
  if (n.statusCode === "2") return true;
  const texts = [n.raw["data[status]"], n.raw["status"], n.raw["data[statusText]"], n.raw["statusText"]]
    .filter((v) => typeof v === "string") as string[];
  return texts.some((t) => PAID_WORDS.has(t.trim().toLowerCase()));
}

/** True when the body looks like a Grow notify for one of our orders (cField1 = an order id). */
export function isMakeNotify(n: NotifyParsed): boolean {
  return isOrderId(n.customFields.cField1);
}

export async function processMakeNotify(store: Store, n: NotifyParsed, rawDigest: string): Promise<MakeNotifyOutcome> {
  const order_id = n.customFields.cField1;
  return withLock(`make_notify:${order_id}`, async () => {
    const ids = { order_id, transactionId: n.transactionId, sum: n.sum === null ? null : String(n.sum) };
    if (n.transactionId && (await store.getPayment(n.transactionId))) return { status: 200, body: { ok: true, approve: true, duplicate: true } };
    const order: OrderRecord | null = await store.getOrder(order_id, { fresh: true });
    if (!order) {
      await alert("make_notify_unknown_order", ids);
      return { status: 200, body: { ok: true, approve: false, matched: false } };
    }
    if (!makeNotifyPaid(n)) {
      await alert("make_notify_not_paid", { ...ids, statusCode: n.statusCode });
      return { status: 200, body: { ok: true, approve: false, ignored: "not_paid" } };
    }
    if (order.payment_status === "paid") {
      if (n.transactionId && order.grow_transaction_id === n.transactionId) return { status: 200, body: { ok: true, approve: true, duplicate: true } };
      if (order.match_method === "manual" && !order.grow_transaction_id && n.sum === order.amount_expected) {
        await store.updateOrder(order.order_id, { grow_transaction_id: n.transactionId, asmachta: n.asmachta, payer_name: n.fullName, payer_phone: n.payerPhone, payer_email: n.payerEmail });
        return { status: 200, body: { ok: true, approve: true, already_marked: true } };
      }
      await alert("second_payment_for_paid_order", ids);
      return { status: 200, body: { ok: true, approve: true } };     // a real payment: acknowledge it, Lihi refunds
    }
    if (order.payment_status !== "pending") {
      await alert("make_notify_order_not_pending", { ...ids, payment_status: order.payment_status });
      return { status: 200, body: { ok: true, approve: false } };
    }
    if (n.sum === null || n.sum !== order.amount_expected) {
      await alert("make_notify_sum_mismatch", { ...ids, expected: String(order.amount_expected) });
      await store.updateOrder(order.order_id, { payment_fallback_reason: `make_notify_sum_mismatch:${n.sum ?? "none"}` });
      return { status: 200, body: { ok: true, approve: false, accepted: false } };
    }
    const paid_at = new Date().toISOString();
    const method = methodFromType(n.transactionTypeId);
    const payment: PaymentRecord = {
      payment_id: n.transactionId ?? `make_${rawDigest.slice(0, 24)}`, order_id: order.order_id, provider: "grow_make",
      amount: n.sum, currency: "ILS", paid_at, asmachta: n.asmachta, method, card_suffix: n.cardSuffix,
      installments: n.paymentsNum, verified: false, verification: "unsigned_webhook", raw_notify_digest: rawDigest,
    };
    if ((await store.appendPayment(payment)) === "duplicate") return { status: 200, body: { ok: true, approve: true, duplicate: true } };
    await store.updateOrder(order.order_id, {
      payment_status: "paid", paid_at, paid_amount: n.sum, grow_transaction_id: payment.payment_id,
      asmachta: n.asmachta, payment_method: method,
      payer_name: n.fullName, payer_phone: n.payerPhone, payer_email: n.payerEmail,
      match_method: "order_id", verify_mode: "unsigned_webhook", payment_fallback_reason: null,
    });
    return { status: 200, body: { ok: true, approve: true }, paidOrder: order.order_id };
  });
}
