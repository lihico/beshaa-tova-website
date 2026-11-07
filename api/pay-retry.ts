/**
 * POST /api/pay-retry {order_id}  (docs/attribution/00_DESIGN.md 5.1, 4.4)
 * A new Grow process for the same order (the hosted URL is valid 10 minutes); its process id is
 * appended to grow_process_ids. 409 when the order is not pending or payments are off.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { startPayment } from "./_checkout.js";
import { isOrderId } from "./_ids.js";
import { paymentsEnabled } from "./_payments.js";
import { getStore } from "./_store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as { order_id?: unknown };
  if (!isOrderId(body.order_id)) return res.status(400).json({ error: "order_id required" });
  if (!paymentsEnabled()) return res.status(409).json({ error: "payments_disabled" });
  const store = getStore();
  const order = await store.getOrder(body.order_id);
  if (!order) return res.status(404).json({ error: "unknown order" });
  if (order.payment_status !== "pending") return res.status(409).json({ error: "not pending", status: order.payment_status });
  const r = await startPayment(store, order);
  // manual: Lihi sends the link herself, there is nothing to retry (409, not a server error).
  if (!r.payment_url) return res.status(r.reason === "too_many_processes" ? 429 : r.mode === "manual" ? 409 : 502).json({ error: r.reason ?? "no payment url" });
  return res.status(200).json({ payment_url: r.payment_url });
}
