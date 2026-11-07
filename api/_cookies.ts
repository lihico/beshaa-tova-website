/**
 * First-party cookies set by the server (docs/attribution/00_DESIGN.md section 2): bsh_vid,
 * bsh_att (HttpOnly, 400 days) and _fbc (readable by the Pixel, 90 days). Server-set cookies are
 * not capped by Safari ITP the way JS-written ones are. Secure unless the request is to localhost;
 * Domain=COOKIE_DOMAIN only when the request host is inside that domain (preview URLs get none).
 */
import {
  type AttributionState, encodeAttCookie, decodeAttCookie, buildFbc, fbcClickId, isVisitorId, GA_SESSION_COOKIE,
} from "./_attribution_core.js";

export const COOKIE_VID = "bsh_vid";
export const COOKIE_ATT = "bsh_att";
export const COOKIE_FBC = "_fbc";
export const COOKIE_FBP = "_fbp";
export const COOKIE_GA = "_ga";
export const MAX_AGE_400_DAYS = 34560000;
export const MAX_AGE_90_DAYS = 7776000;

type HeaderValue = string | string[] | number | undefined;
export interface ReqLike {
  headers: Record<string, HeaderValue>;
  cookies?: Record<string, string | undefined>;
}
export interface ResLike {
  getHeader(name: string): HeaderValue;
  setHeader(name: string, value: string | string[]): unknown;
}

function header(req: ReqLike, name: string): string {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? String(v[0] ?? "") : v === undefined ? "" : String(v);
}

export function parseCookieHeader(h: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;                 // first occurrence wins (most specific path)
    let v = part.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

export function readCookie(req: ReqLike, name: string): string | null {
  const fromParsed = req.cookies?.[name];
  if (typeof fromParsed === "string" && fromParsed) return fromParsed;
  return parseCookieHeader(header(req, "cookie"))[name] || null;
}

/** Host of the request as the browser saw it (Vite's proxy keeps Host; Vercel sets x-forwarded-host). */
export function requestHost(req: ReqLike): string {
  return (header(req, "x-forwarded-host") || header(req, "host")).split(",")[0].trim().toLowerCase();
}

export function isLocalRequest(req: ReqLike): boolean {
  const name = requestHost(req).replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name.endsWith(".localhost");
}

/** COOKIE_DOMAIN (read at call time) when the request host is inside it, else null. */
export function cookieDomainFor(req: ReqLike): string | null {
  const configured = (process.env.COOKIE_DOMAIN || "").trim().toLowerCase();
  if (!configured || isLocalRequest(req)) return null;
  const bare = configured.replace(/^\./, "");
  const host = requestHost(req).replace(/:\d+$/, "");
  return host === bare || host.endsWith("." + bare) ? configured : null;
}

export interface CookieOptions {
  maxAge: number; httpOnly: boolean; secure: boolean; sameSite: "Lax" | "Strict" | "None";
  domain?: string | null; path?: string;
}

export function serializeCookie(name: string, value: string, o: CookieOptions): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error("bad cookie name");
  if (!/^[A-Za-z0-9_.\-~!*'()]*$/.test(value)) throw new Error(`cookie ${name}: value must be URL-safe`);
  const parts = [`${name}=${value}`, `Path=${o.path ?? "/"}`, `Max-Age=${Math.floor(o.maxAge)}`, `SameSite=${o.sameSite}`];
  if (o.domain) parts.push(`Domain=${o.domain}`);
  if (o.httpOnly) parts.push("HttpOnly");
  if (o.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Adds one Set-Cookie line without dropping the ones already on the response. */
export function appendSetCookie(res: ResLike, cookie: string): void {
  const prev = res.getHeader("Set-Cookie");
  const list = prev === undefined ? [] : Array.isArray(prev) ? prev.map(String) : [String(prev)];
  res.setHeader("Set-Cookie", [...list, cookie]);
}

function baseOptions(req: ReqLike, maxAge: number, httpOnly: boolean): CookieOptions {
  return { maxAge, httpOnly, secure: !isLocalRequest(req), sameSite: "Lax", domain: cookieDomainFor(req) };
}

export function visitorCookie(req: ReqLike, visitor_id: string): string {
  return serializeCookie(COOKIE_VID, visitor_id, baseOptions(req, MAX_AGE_400_DAYS, true));
}

/** null when the state is empty or cannot fit in 3,000 bytes. */
export function attCookie(req: ReqLike, state: Pick<AttributionState, "first" | "last">): string | null {
  const value = encodeAttCookie(state);
  return value ? serializeCookie(COOKIE_ATT, value, baseOptions(req, MAX_AGE_400_DAYS, true)) : null;
}

export function fbcCookie(req: ReqLike, fbc: string): string {
  return serializeCookie(COOKIE_FBC, fbc, baseOptions(req, MAX_AGE_90_DAYS, false));
}

export function readVisitorCookie(req: ReqLike): string | null {
  const v = readCookie(req, COOKIE_VID);
  return isVisitorId(v) ? v : null;
}

export function readAttCookie(req: ReqLike): Pick<AttributionState, "first" | "last"> | null {
  return decodeAttCookie(readCookie(req, COOKIE_ATT));
}

export function readFbc(req: ReqLike): string | null {
  const v = readCookie(req, COOKIE_FBC);
  return v && fbcClickId(v) ? v : null;
}

/**
 * The _fbc for a landing that carried `fbclid`. An existing _fbc with the identical fbclid is
 * kept (original creation time), so `set` is false and no Set-Cookie is needed.
 */
export function fbcForClick(req: ReqLike, fbclid: string, nowMs: number = Date.now()): { value: string; set: boolean } {
  const existing = readFbc(req);
  if (existing && fbcClickId(existing) === fbclid) return { value: existing, set: false };
  return { value: buildFbc(fbclid, nowMs), set: true };
}

export function readGaClientCookie(req: ReqLike): string | null {
  return readCookie(req, COOKIE_GA);
}

/** The raw `_ga_W3Z965PSD0` value (GS1 or GS2 form; parse with parseGaSessionId). */
export function readGaSessionCookie(req: ReqLike): string | null {
  return readCookie(req, GA_SESSION_COOKIE);
}
