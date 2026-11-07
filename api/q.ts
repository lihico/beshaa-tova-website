/**
 * QR / short links (docs/attribution/00_DESIGN.md sections 5.1, 5.9, 7).
 *   GET /q/<code>    (rewrite -> /api/q?code=<code>)  kind qr_scan, registry `קודי מעקב` (test: codes.json)
 *   GET /r/<handle>  (rewrite -> /api/q?r=<handle>)   kind ref_link, partner registry `שותפים`
 * Always 302 + Cache-Control: no-store (never 301: browsers cache it, which would defeat re-pointing a
 * printed code). Unknown or retired codes land on /?ref=q-unknown-<code>; never a 404.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isChannel, parseTouch, type Channel, type TrackingCode } from "./_attribution_core.js";
import { yymmJerusalem } from "./_ids.js";
import { isPartnerActive } from "./_pricing.js";
import { getStore } from "./_store.js";
import { applyTouch, ownHosts } from "./_touch.js";

const CODE_RE = /^[a-z0-9_-]{2,64}$/;

function one(v: unknown): string {
  return (Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "").trim().toLowerCase();
}

function safeCode(s: string): string {
  return s.replace(/[^a-z0-9_-]/g, "").slice(0, 48);
}

/** Path from the registry: must be a site path ("/x/y"), never a full URL or "//host". */
function safeLanding(landing: string | undefined): string {
  const p = (landing ?? "/").trim();
  return /^\/(?!\/)[A-Za-z0-9/_\-.]*$/.test(p) ? p : "/";
}

function redirect(res: VercelResponse, location: string) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", location);
  res.status(302).end();
}

function unknown(res: VercelResponse, raw: string, prefix = "") {
  const c = safeCode(raw);
  return redirect(res, `/?ref=${encodeURIComponent(`q-unknown-${prefix}${c}`.replace(/-+$/, ""))}`);
}

export function landingFor(code: TrackingCode): string {
  const params = new URLSearchParams();
  params.set("ref", code.code.toLowerCase());
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
    const v = code[k];
    if (typeof v === "string" && v.trim()) params.set(k, v.trim());
  }
  return `${safeLanding(code.landing)}?${params.toString()}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "Method not allowed" });
  const host = req.headers.host || "www.beshaa-tova.co.il";
  const referrer = typeof req.headers.referer === "string" ? req.headers.referer : "";
  const store = getStore();

  const handle = one(req.query.r);
  if (handle) {
    if (!CODE_RE.test(handle)) return unknown(res, handle, "r-");
    let partner = null;
    try { partner = await store.getPartnerById(handle); } catch (e) { console.error("[q] partner lookup failed:", e instanceof Error ? e.message : e); }
    if (!partner || !isPartnerActive(partner)) return unknown(res, handle, "r-");
    const id = partner.partner_id.toLowerCase();
    const params = new URLSearchParams({
      ref: `aff-${id}`, utm_source: (partner.platform || "affiliate").toLowerCase(), utm_medium: "affiliate",
      utm_campaign: `aff_${yymmJerusalem()}`, utm_content: id,
    });
    const location = `/?${params.toString()}`;
    const t = parseTouch(new URL(location, `https://${host}`), referrer, ownHosts(req), { kind: "ref_link", q_code: `aff-${id}`, channel: "affiliate" });
    await applyTouch(req, res, t);
    return redirect(res, location);
  }

  const code = one(req.query.code);
  if (!CODE_RE.test(code)) return unknown(res, code);
  let entry: TrackingCode | null = null;
  try { entry = await store.getCode(code); } catch (e) { console.error("[q] code lookup failed:", e instanceof Error ? e.message : e); }
  if (!entry || entry.status !== "active") return unknown(res, code);

  const location = landingFor(entry);
  const channel: Channel | undefined = isChannel(entry.channel) ? entry.channel : undefined;
  const t = parseTouch(new URL(location, `https://${host}`), referrer, ownHosts(req), { kind: "qr_scan", q_code: code, channel });
  await applyTouch(req, res, t);
  return redirect(res, location);
}
