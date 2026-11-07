import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendMetaEvent, type CustomData, type UserData } from "./_meta-capi.js";

interface TrackBody {
  event_name: string;
  event_id: string;
  event_source_url?: string;
  fbc?: string | null;
  fbp?: string | null;
  visitor_id?: string | null;
  session_id?: string | null;
  user_data?: { em?: string | null; ph?: string | null; fn?: string | null; ln?: string | null };
  custom_data?: CustomData;
  test_event_code?: string;
}

// docs/attribution 4.2: the browser may mirror only these. Purchase is sent by the server alone
// (api/_fulfil.ts after a verified payment), so nobody can inject a purchase through this endpoint.
const ALLOWED_EVENTS = new Set(["PageView", "ViewContent", "InitiateCheckout", "AddPaymentInfo", "Lead", "Contact"]);

function getClientIp(req: VercelRequest): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return fwd[0];
  return (req.socket?.remoteAddress as string | undefined) ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body: TrackBody = req.body || {};
  if (!body.event_name || !body.event_id) {
    return res.status(400).json({ error: "event_name and event_id required" });
  }
  if (!ALLOWED_EVENTS.has(String(body.event_name))) {
    return res.status(400).json({ error: "event not allowed" });
  }
  const eventId = String(body.event_id).slice(0, 100);

  const ua = (req.headers["user-agent"] as string | undefined) ?? null;
  const ip = getClientIp(req);

  const user_data: UserData = {
    em: body.user_data?.em ?? null,
    ph: body.user_data?.ph ?? null,
    fn: body.user_data?.fn ?? null,
    ln: body.user_data?.ln ?? null,
    fbc: body.fbc ?? null,
    fbp: body.fbp ?? null,
    client_ip: ip,
    client_user_agent: ua,
    external_id: body.visitor_id ?? null,
  };

  // A test_event_code from the request (body or ?test_event_code=) counts only in test mode
  // (ATTR_TEST=1, docs/attribution 4.2 / 03 gap 16); otherwise only the env var.
  const requestCode = process.env.ATTR_TEST === "1"
    ? (body.test_event_code || (req.query.test_event_code as string | undefined) || undefined)
    : undefined;
  const testCode = requestCode || process.env.META_TEST_EVENT_CODE || undefined;

  const result = await sendMetaEvent({
    event_name: body.event_name,
    event_id: eventId,
    event_source_url: body.event_source_url,
    user_data,
    custom_data: body.custom_data,
    action_source: "website",
    test_event_code: testCode,
  });

  // Always 200 — client should fire-and-forget. Surface result for debugging.
  return res.status(200).json({ ok: result.ok, capi: result });
}
