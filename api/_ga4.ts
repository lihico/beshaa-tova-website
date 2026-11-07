/**
 * GA4 Measurement Protocol purchase (docs/attribution/00_DESIGN.md 5.7 step 3; PLAN.md Stage 6).
 *
 * OFF unless both GA4_API_SECRET and GA4_MEASUREMENT_ID are set (set in Production on 8.11.2026, secret "vercel-server").
 * Sent only when the order has a ga_client_id and consent_marketing is not "denied" (test orders are
 * stored as denied, so they never reach GA4). When the server will send, /api/pay-status tells the
 * browser not to send its own copy (ga4_browser=false), so one purchase is counted, not two.
 *
 * The event carries session_id (from the _ga_W3Z965PSD0 cookie at submit) and engagement_time_msec,
 * which GA4 needs to attach the purchase to the visit's session and its traffic source.
 *
 * Debug mode (GA4_DEBUG=1, or opts.debug): posts to /debug/mp/collect, which validates the payload and
 * records nothing; the result detail lists GA4's validation messages ("valid" when there are none).
 * In test mode (ATTR_TEST=1) the request is written to `${ATTR_DATA_DIR}/ga4.jsonl` and never sent.
 */
import fs from "node:fs";
import path from "node:path";
import { isGaSessionId, type OrderRecord } from "./_attribution_core.js";

export const GA4_HOST = "https://www.google-analytics.com";

export function ga4ServerConfigured(ga_client_id: string | null | undefined): boolean {
  return !!(process.env.GA4_API_SECRET && process.env.GA4_MEASUREMENT_ID && ga_client_id);
}

/** Whether fulfilPaid() sends the GA4 purchase for this order (and so the browser must not). */
export function ga4ServerWillSend(o: Pick<OrderRecord, "ga_client_id" | "consent_marketing">): boolean {
  return ga4ServerConfigured(o.ga_client_id) && o.consent_marketing !== "denied";
}

/**
 * Whether the thank-you page sends the GA4 purchase: only when the server will not, and never for
 * consent_marketing "denied" (the visitor said no, or a system-test order), so GA4 gets at most one.
 */
export function ga4BrowserShouldSend(o: Pick<OrderRecord, "ga_client_id" | "consent_marketing">): boolean {
  return o.consent_marketing !== "denied" && !ga4ServerWillSend(o);
}

export interface Ga4Purchase {
  client_id: string; order_id: string; value: number; currency: "ILS";
  items: Array<{ item_id: string; item_name: string; price: number; quantity: number }>;
  session_id?: string | null;
  consent_marketing?: OrderRecord["consent_marketing"];
  timestamp_micros?: number;
}

/** The purchase for a paid order; `plan` is the item id / name (fulfil's plan()). */
export function ga4PurchaseFromOrder(o: OrderRecord, plan: string): Ga4Purchase {
  const value = o.paid_amount ?? o.amount_expected;
  return {
    client_id: o.ga_client_id as string, order_id: o.order_id, value, currency: "ILS",
    items: [{ item_id: plan, item_name: plan, price: value, quantity: 1 }],
    session_id: isGaSessionId(o.ga_session_id) ? o.ga_session_id : null,
    consent_marketing: o.consent_marketing,
    timestamp_micros: o.paid_at && Number.isFinite(Date.parse(o.paid_at)) ? Date.parse(o.paid_at) * 1000 : undefined,
  };
}

/** The Measurement Protocol body (no secret in it). */
export function ga4PurchaseBody(p: Ga4Purchase): Record<string, unknown> {
  const params: Record<string, unknown> = {
    transaction_id: p.order_id, value: p.value, currency: p.currency, items: p.items,
    engagement_time_msec: 1,
  };
  if (isGaSessionId(p.session_id)) params.session_id = p.session_id;
  return {
    client_id: p.client_id,
    ...(p.timestamp_micros ? { timestamp_micros: p.timestamp_micros } : {}),
    events: [{ name: "purchase", params }],
  };
}

/** The collect URL. It carries the API secret: never log it. */
export function ga4CollectUrl(debug: boolean): string {
  const id = encodeURIComponent(process.env.GA4_MEASUREMENT_ID || "");
  const secret = encodeURIComponent(process.env.GA4_API_SECRET || "");
  return `${GA4_HOST}/${debug ? "debug/mp" : "mp"}/collect?measurement_id=${id}&api_secret=${secret}`;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface Ga4SendOpts { debug?: boolean; fetch?: FetchLike }

/** Validation messages from /debug/mp/collect, as short "field: description" strings. */
function validationMessages(j: unknown): string[] {
  const list = (j as { validationMessages?: unknown } | null)?.validationMessages;
  if (!Array.isArray(list)) return [];
  return list.map((m) => {
    const v = m as { fieldPath?: unknown; description?: unknown; validationCode?: unknown };
    return `${String(v.fieldPath ?? "-")}: ${String(v.validationCode ?? "")} ${String(v.description ?? "")}`.trim().slice(0, 200);
  });
}

export async function sendGa4Purchase(p: Ga4Purchase, opts: Ga4SendOpts = {}): Promise<{ ok: boolean; detail: string }> {
  if (p.consent_marketing === "denied") return { ok: true, detail: "skipped_consent" };
  if (!process.env.GA4_API_SECRET || !process.env.GA4_MEASUREMENT_ID) return { ok: true, detail: "off" };
  const body = ga4PurchaseBody(p);
  const debug = opts.debug ?? process.env.GA4_DEBUG === "1";
  if (process.env.ATTR_TEST === "1") {
    const dir = process.env.ATTR_DATA_DIR;
    if (dir && fs.existsSync(dir)) fs.appendFileSync(path.join(dir, "ga4.jsonl"), JSON.stringify({ body, debug, would_send: false, at: new Date().toISOString() }) + "\n");
    return { ok: true, detail: "logged" };
  }
  const doFetch = opts.fetch ?? (fetch as unknown as FetchLike);
  try {
    const r = await doFetch(ga4CollectUrl(debug), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!debug) return { ok: r.ok, detail: `http ${r.status}` };
    let j: unknown = null;
    try { j = await r.json(); } catch { /* not JSON */ }
    const msgs = validationMessages(j);
    return { ok: r.ok && msgs.length === 0, detail: msgs.length ? `debug invalid: ${msgs.join("; ")}` : `debug valid (http ${r.status})` };
  } catch (e) {
    // Never echo the URL (it has the secret); fetch errors carry only a message.
    return { ok: false, detail: e instanceof Error ? e.message.replace(/api_secret=[^&\s]+/g, "api_secret=<secret>") : "fetch failed" };
  }
}
