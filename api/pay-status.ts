/**
 * GET /api/pay-status?o=<order_id>  (docs/attribution/00_DESIGN.md 5.1, 4.4)
 * The thank-you and pay pages poll this. Never returns a name, phone, email or any Grow token.
 * For a pending order with a fixed Grow page for its amount (PAYMENTS_ENABLED=1, provider grow_pages,
 * or grow_make whose fallback is the fixed page) it also returns
 * `pay_url`: the public page for the order's exact amount, so /order/pay/<id> survives a reload.
 *
 * GET|POST /api/pay-status?action=mark-paid&t=<token>: Lihi's signed "mark as paid" link
 * (api/_mark_paid.ts). It lives here because Vercel Hobby allows 12 functions and api/ has 12.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ga4BrowserShouldSend } from "./_ga4.js";
import { isOrderId, purchaseEventId } from "./_ids.js";
import { handleMarkPaid } from "./_mark_paid.js";
import { payments, paymentsEnabled } from "./_payments.js";
import { getStore } from "./_store.js";
import type { OrderRecord } from "./_attribution_core.js";

function fixedPageUrl(order: OrderRecord): string | null {
  if (!paymentsEnabled() || order.payment_status !== "pending" || order.amount_expected <= 0) return null;
  try {
    const a = payments();
    if (a.flow === "fixed_page") return a.paymentUrlFor(order.order_id, order.amount_expected);
    if (a.flow === "make") return a.pages.paymentUrlFor(order.order_id, order.amount_expected);   // the fallback page
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  if (action === "mark-paid") return handleMarkPaid(req, res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");
  const o = Array.isArray(req.query.o) ? req.query.o[0] : req.query.o;
  if (!isOrderId(o)) return res.status(400).json({ status: "unknown" });
  let order = null;
  try { order = await getStore().getOrder(o); } catch (e) { console.error("[pay-status] store read failed:", e instanceof Error ? e.message : e); return res.status(503).json({ status: "unknown" }); }
  if (!order) return res.status(404).json({ status: "unknown" });
  const paid = order.payment_status === "paid";
  const meetings = order.meetings ?? [];
  const pay_url = fixedPageUrl(order);
  return res.status(200).json({
    status: order.payment_status,
    amount: paid ? order.paid_amount ?? order.amount_expected : order.amount_expected,
    currency: "ILS",
    kind: order.order_kind,
    ...(paid ? { purchase_event_id: purchaseEventId(order.order_id) } : {}),
    ...(pay_url ? { pay_url, pay_mode: "fixed_page" } : {}),
    content_ids: meetings.length ? meetings : undefined,
    num_items: meetings.length || 1,
    // One GA4 purchase per order: the browser sends only when the server will not (none on denied consent).
    ga4_browser: ga4BrowserShouldSend(order),
  });
}
