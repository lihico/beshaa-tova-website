/**
 * GA4 Measurement Protocol purchase (docs/attribution/00_DESIGN.md 5.7 step 3; P1).
 * Sent only when GA4_API_SECRET and the order's ga_client_id exist; /api/pay-status then tells the
 * browser not to send its own copy (ga4_browser=false). In test mode (ATTR_TEST=1) the request is
 * written to `${ATTR_DATA_DIR}/ga4.jsonl` and never sent.
 */
import fs from "node:fs";
import path from "node:path";

export function ga4ServerConfigured(ga_client_id: string | null | undefined): boolean {
  return !!(process.env.GA4_API_SECRET && process.env.GA4_MEASUREMENT_ID && ga_client_id);
}

export interface Ga4Purchase {
  client_id: string; order_id: string; value: number; currency: "ILS";
  items: Array<{ item_id: string; item_name: string; price: number; quantity: number }>;
  timestamp_micros?: number;
}

export async function sendGa4Purchase(p: Ga4Purchase): Promise<{ ok: boolean; detail: string }> {
  const body = {
    client_id: p.client_id,
    ...(p.timestamp_micros ? { timestamp_micros: p.timestamp_micros } : {}),
    events: [{ name: "purchase", params: { transaction_id: p.order_id, value: p.value, currency: p.currency, items: p.items } }],
  };
  if (process.env.ATTR_TEST === "1") {
    const dir = process.env.ATTR_DATA_DIR;
    if (dir && fs.existsSync(dir)) fs.appendFileSync(path.join(dir, "ga4.jsonl"), JSON.stringify({ body, would_send: false, at: new Date().toISOString() }) + "\n");
    return { ok: true, detail: "logged" };
  }
  const id = encodeURIComponent(process.env.GA4_MEASUREMENT_ID || "");
  const secret = encodeURIComponent(process.env.GA4_API_SECRET || "");
  try {
    // The URL carries the API secret: never log it.
    const r = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${id}&api_secret=${secret}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { ok: r.ok, detail: `http ${r.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "fetch failed" };
  }
}
