/**
 * POST /api/touch {url, referrer, internal, vid_ls, session_id}  (docs/attribution/00_DESIGN.md 5.1)
 * -> AttributionState (no IP) + Set-Cookie bsh_vid, bsh_att, _fbc.
 * The response holds the cookie's first/last merged with this touch; the page merges it with its
 * localStorage copy. A direct load (no tracked key, no external referrer) changes nothing.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseTouch } from "./_attribution_core.js";
import { applyTouch, ownHosts } from "./_touch.js";

const MAX_URL = 4000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");

  let body: Record<string, unknown> = {};
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) body = req.body as Record<string, unknown>;
  else if (typeof req.body === "string") { try { body = JSON.parse(req.body) as Record<string, unknown>; } catch { body = {}; } }

  const url = typeof body.url === "string" ? body.url.slice(0, MAX_URL) : "";
  const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 1000) : "";
  if (!url) return res.status(400).json({ error: "url required" });

  let touch = null;
  try {
    // Only http(s) URLs on any host; the path and query are what count.
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") {
      touch = parseTouch(u, referrer, ownHosts(req), { internal: body.internal === true });
    }
  } catch {
    touch = null;
  }

  const r = await applyTouch(req, res, touch, body.vid_ls);
  return res.status(200).json({ visitor_id: r.visitor_id, first: r.state.first, last: r.state.last, touches: r.state.touches, added: r.added });
}
