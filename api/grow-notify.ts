/**
 * POST /api/grow-notify/<k>  (vercel.json rewrite -> /api/grow-notify?k=<k>)
 * Grow's server-to-server callback. Grow signs nothing, so the secret path segment comes first.
 *
 * PAYMENT_PROVIDER=grow_make (default): Grow's notify for a per-order link, relayed by the Make
 * scenario with the x-grow-make-secret header (api/_payments_grow_make.ts; answers {approve}); a body
 * without our order id in cField1 is a fixed page's server update (the fallback), handled as below.
 *
 * PAYMENT_PROVIDER=grow_pages (Grow Light without the API or Make): the fixed page's server update
 * (Flow B, docs/attribution/GROW_LIGHT_SETUP.md); see api/_grow_pages_notify.ts for the matching rules.
 *
 * PAYMENT_PROVIDER=grow | mock (the API; docs/attribution/00_DESIGN.md 5.7; 02 sections 4 and 6):
 * never trust the body (re-query getPaymentProcessInfo with our stored token), amount and process
 * id must match our order, idempotent on transactionId.
 *
 * Always 200 {ok} except a bad secret (404) and a failed API verify call (503, so Grow retries).
 * The body is read raw (JSON, urlencoded or multipart): @vercel/node does not parse multipart.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { PaymentRecord } from "./_attribution_core.js";
import { afterResponse, withLock } from "./_bg.js";
import { alert, fulfilPaid } from "./_fulfil.js";
import { isOrderId } from "./_ids.js";
import { methodFromType, payments, type NotifyParsed } from "./_payments.js";
import { clientIp, getStore } from "./_store.js";
import { parsePageWebhook, parseWebhookBody, readRawBody } from "./_grow_webhook.js";
import { processPageWebhook } from "./_grow_pages_notify.js";
import { MAKE_SECRET_HEADER, growMakeConfigFromEnv, makeSecretOk } from "./_payments_grow_make.js";
import { isMakeNotify, processMakeNotify } from "./_grow_make_notify.js";
import { parseGrowNotify } from "./_payments_grow.js";

function secretOk(k: unknown): boolean {
  const secret = process.env.GROW_NOTIFY_SECRET || "";
  if (secret.length < 16 || typeof k !== "string" || !k) return false;
  const a = createHash("sha256").update(k).digest(), b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

function rawDigest(raw: Buffer, n: NotifyParsed): string {
  const src = raw.length ? raw : Buffer.from(JSON.stringify(Object.keys(n.raw).sort().map((k) => [k, n.raw[k]])));
  return createHash("sha256").update(src).digest("hex");
}

/** Test mode only: the parsed body goes to notify_raw.jsonl for debugging (prod logs key names only). */
function testRawLog(body: unknown, contentType: string): void {
  const dir = process.env.ATTR_DATA_DIR;
  if (process.env.ATTR_TEST !== "1" || !dir || !fs.existsSync(dir)) return;
  fs.appendFileSync(path.join(dir, "notify_raw.jsonl"), JSON.stringify({ at: new Date().toISOString(), content_type: contentType.split(";")[0], body }) + "\n");
}

let loggedPageKeys = false;

/** Soft IP check (warn only): GROW_NOTIFY_IPS = comma list of Grow's published IPs (02 section 6). */
function softIpCheck(req: VercelRequest): void {
  if (process.env.ATTR_TEST === "1") return;
  const list = (process.env.GROW_NOTIFY_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return;
  const ip = (typeof req.headers["x-real-ip"] === "string" ? req.headers["x-real-ip"] : null) || clientIp(req);
  if (!ip || !list.includes(ip)) console.warn("[grow-notify] caller IP is not on Grow's list (warn only)");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. secret in the path
  if (!secretOk(req.query.k)) {
    console.warn("[grow-notify] bad secret");
    return res.status(404).json({ error: "Not found" });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // 2. read the raw body ourselves (multipart is not parsed by @vercel/node) and parse it
  const contentType = String(req.headers["content-type"] ?? "");
  const raw = await readRawBody(req);
  const parsed = parseWebhookBody(raw, contentType);
  testRawLog(parsed, contentType);
  softIpCheck(req);
  const adapter = payments();

  if (adapter.flow === "make") {
    const n = parseGrowNotify(parsed, contentType);
    if (isMakeNotify(n)) {
      if (!makeSecretOk(req.headers[MAKE_SECRET_HEADER], growMakeConfigFromEnv().secret)) {
        console.warn("[grow-notify] Make relay without a valid secret header");
        return res.status(403).json({ ok: false, approve: false });
      }
      const out = await processMakeNotify(getStore(), n, createHash("sha256").update(raw).digest("hex"));
      if (out.paidOrder) {
        const order_id = out.paidOrder;
        const job = afterResponse(() => fulfilPaid(order_id, { provider: "grow_make" }));
        if (!job.deferred) await job.done;
      }
      return res.status(out.status).json(out.body);
    }
  }

  if (adapter.flow === "fixed_page" || adapter.flow === "make") {
    const w = parsePageWebhook(parsed);
    if (!loggedPageKeys) {
      loggedPageKeys = true;
      console.log(`[grow-notify] fixed-page webhook (${contentType.split(";")[0] || "no content type"}) key names (values never logged):`, w.keys.join(","));
    }
    const digest = createHash("sha256").update(raw).digest("hex");
    const out = await processPageWebhook(getStore(), w, digest);
    if (out.paidOrder) {
      const order_id = out.paidOrder;
      const job = afterResponse(() => fulfilPaid(order_id, { provider: "grow_pages" }));
      if (!job.deferred) await job.done;
    }
    return res.status(out.status).json(out.body);
  }

  const n = adapter.parseNotify(parsed, contentType);

  const lockKey = `notify:${n.customFields.cField1 || n.processId || "none"}`;
  const outcome = await withLock(lockKey, async () => {
    const store = getStore();
    // 4. our order: by cField1, else by stored process id
    const byField = isOrderId(n.customFields.cField1) ? await store.getOrder(n.customFields.cField1, { fresh: true }) : null;
    const order = byField ?? (n.processId ? await store.findOrderByProcessId(n.processId) : null);
    if (!order) {
      await alert("unknown_order", { cField1: n.customFields.cField1, processId: n.processId, transactionId: n.transactionId });
      return { body: { ok: true } };
    }
    // 5. idempotency
    if (n.transactionId && (await store.getPayment(n.transactionId))) return { body: { ok: true, duplicate: true } };
    if (order.payment_status === "paid") {
      await alert("second_payment_for_paid_order", { order_id: order.order_id, transactionId: n.transactionId });
      return { body: { ok: true } };
    }
    // A refunded order (PLAN.md Stage 3, scripts/reconcile-payments.ts) is never re-marked paid by a late or
    // repeated notify; the other Grow paths already refuse anything that is not pending.
    if (order.payment_status === "refunded") {
      await alert("webhook_for_order_not_pending", { order_id: order.order_id, payment_status: order.payment_status, transactionId: n.transactionId });
      return { body: { ok: true } };
    }
    // 6. verify with Grow (statusCode 2, sum, process id belongs to the order)
    const v = await adapter.verify(n, order);
    if (!v.ok) {
      // A failed getPaymentProcessInfo call (network or Grow error) is transient: answer 503 so Grow
      // retries, and leave the order untouched. A retry is safe (transaction-id idempotency, step 5).
      if (v.reason.startsWith("process_info_error")) {
        await alert("verify_unavailable_retry", { order_id: order.order_id, reason: v.reason, transactionId: n.transactionId });
        return { body: { ok: false }, status: 503 };
      }
      await alert("verify_failed", { order_id: order.order_id, reason: v.reason, transactionId: n.transactionId });
      await store.updateOrder(order.order_id, { payment_fallback_reason: `verify_failed:${v.reason}` });
      return { body: { ok: true } };
    }
    // 7. payment record (a lost race on the same transaction id stops here)
    const paid_at = new Date().toISOString();
    const payment: PaymentRecord = {
      payment_id: v.transactionId, order_id: order.order_id, provider: adapter.provider,
      amount: v.sum, currency: "ILS", paid_at, asmachta: n.asmachta,
      method: methodFromType(n.transactionTypeId), card_suffix: n.cardSuffix, installments: n.paymentsNum,
      verified: true, verification: v.via, raw_notify_digest: rawDigest(raw, n),
    };
    if ((await store.appendPayment(payment)) === "duplicate") return { body: { ok: true, duplicate: true } };
    // 8. mark paid
    await store.updateOrder(order.order_id, {
      payment_status: "paid", paid_at, paid_amount: v.sum, grow_transaction_id: v.transactionId,
      asmachta: n.asmachta, payment_method: payment.method,
      payer_name: n.fullName, payer_phone: n.payerPhone, payer_email: n.payerEmail,
      match_method: "order_id", verify_mode: "process_info", payment_fallback_reason: null,
    });
    return { body: { ok: true }, paidOrder: order.order_id };
  });

  // 9-10. answer fast; approve + fulfil after the response
  if (outcome.paidOrder) {
    const order_id = outcome.paidOrder;
    const job = afterResponse(async () => {
      const a = await adapter.approve(n);
      if (!a.ok) console.error(`[grow-notify] approveTransaction failed for ${order_id}: ${a.detail}`);
      await fulfilPaid(order_id, { provider: adapter.provider });
    });
    if (!job.deferred) await job.done;
  }
  return res.status((outcome as { status?: number }).status ?? 200).json(outcome.body);
}
