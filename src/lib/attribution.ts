/**
 * Ad / QR / partner attribution, client side (docs/attribution/00_DESIGN.md 4.1).
 *
 * captureTouch() runs on every page load (src/main.tsx, before the first render, so /gift's
 * redirect cannot drop the query) and on SPA navigations whose URL carries tracked params
 * (src/App.tsx). It keeps the first touch, the last non-direct touch and the last 10 touches in
 * localStorage ("bsh_attr_v2"), and posts the touch to /api/touch, which sets the server cookies
 * (bsh_vid, bsh_att, _fbc) that survive Safari's limits and returns its own view; the two views
 * are merged. Every order / gift / redeem sends getAttributionState(); the server merges it with
 * the cookie and freezes it on the order. A direct load never overwrites anything.
 *
 * Every storage access is wrapped: storage can throw (private mode, blocked site data).
 */

import {
  TRACKED_KEYS,
  emptyState,
  isVisitorId,
  mergeState,
  mergeTouch,
  GA_SESSION_COOKIE,
  parseGaClientId,
  parseGaSessionId,
  parseTouch,
  sanitizeState,
  type AttributionState,
} from "../../api/_attribution_core";
import { getSessionId, setGaVisitorProperty } from "./tracking";

const LS_STATE = "bsh_attr_v2";
const LS_VISITOR = "bsh_visitor_id";
const SS_PINGED = "bsh_touch_pinged";

/** Legacy shape, still sent as `ref` / `utm` so an old server keeps working. */
const LEGACY_KEYS = ["ref", "utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
export type Attribution = Partial<Record<(typeof LEGACY_KEYS)[number], string>>;

let lastCapturedHref: string | null = null;

function readLocal(): AttributionState | null {
  try {
    const raw = localStorage.getItem(LS_STATE);
    return raw ? sanitizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(s: AttributionState) {
  try {
    localStorage.setItem(LS_STATE, JSON.stringify(s));
    if (isVisitorId(s.visitor_id)) localStorage.setItem(LS_VISITOR, s.visitor_id);
  } catch {
    // best effort
  }
}

function localVisitorId(): string {
  try {
    const v = localStorage.getItem(LS_VISITOR);
    return isVisitorId(v) ? v : "";
  } catch {
    return "";
  }
}

function sessionFlag(key: string, set = false): boolean {
  try {
    if (set) sessionStorage.setItem(key, "1");
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** True when a query string holds any key parseTouch() reads. */
export function hasTrackedParams(search: string): boolean {
  try {
    const p = new URLSearchParams(search);
    return [...TRACKED_KEYS, "adset"].some((k) => p.get(k));
  } catch {
    return false;
  }
}

/**
 * Record one touch (page load or SPA navigation with params). Never throws, never blocks.
 * The same href is captured once (StrictMode double effects, re-renders).
 */
export function captureTouch(opts: { url?: string; referrer?: string; internal?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  try {
    const url = opts.url ?? location.href;
    if (url === lastCapturedHref) return;
    lastCapturedHref = url;
    const referrer = opts.referrer ?? document.referrer ?? "";
    const t = parseTouch(url, referrer, location.host, { internal: !!opts.internal });

    const before = readLocal();
    const local = before ? mergeTouch(before, t) : t ? mergeTouch(emptyState(localVisitorId()), t) : null;
    if (local && t) writeLocal(local);

    // A direct load posts once per session, only so the server can set / renew bsh_vid.
    if (!t) {
      if (sessionFlag(SS_PINGED)) return;
      sessionFlag(SS_PINGED, true);
    }

    let vidLs: string | null = null;
    try { vidLs = localStorage.getItem(LS_VISITOR); } catch { vidLs = null; }
    let sessionId: string | null = null;
    try { sessionId = getSessionId(); } catch { sessionId = null; }

    fetch("/api/touch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      credentials: "same-origin",
      body: JSON.stringify({ url, referrer, internal: !!opts.internal, vid_ls: vidLs, session_id: sessionId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const server = sanitizeState(j);
        if (!server) return;
        // Server state is `b`: it wins ties on first.ts and supplies the visitor id.
        writeLocal(mergeState(readLocal() ?? local, server));
        // The server visitor id is known now: give GA4 the same bsh_vid (no-op when unchanged).
        setGaVisitorProperty();
      })
      .catch(() => {});
  } catch {
    // attribution is best effort
  }
}

/** What the order / gift / redeem request sends as `attribution`. */
export function getAttributionState(): AttributionState {
  return readLocal() ?? emptyState(localVisitorId());
}

/** GA4 client id from the _ga cookie ("GA1.1.<a>.<b>" -> "<a>.<b>"), or null. */
export function getGaClientId(): string | null {
  try {
    const m = document.cookie.match(/(?:^|; )_ga=([^;]+)/);
    return m ? parseGaClientId(decodeURIComponent(m[1])) : null;
  } catch {
    return null;
  }
}

/**
 * GA4 session id from the _ga_W3Z965PSD0 cookie, in its GS1 or GS2 form, or null (PLAN.md Stage 6).
 * Sent with the order so the server-side purchase joins the visit's GA4 session.
 */
export function getGaSessionId(): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${GA_SESSION_COOKIE}=([^;]+)`));
    return m ? parseGaSessionId(decodeURIComponent(m[1])) : null;
  } catch {
    return null;
  }
}

/**
 * Kept for existing call sites (src/pages/Order.tsx). Capture now happens in main.tsx and in the
 * App navigation effect, so this is a no-op.
 */
export function captureAttribution(_search?: string): void {
  // no-op: see captureTouch()
}

/** Legacy ref/utm view of the last non-direct touch (old `ref` / `utm` body fields). */
export function getAttribution(): Attribution {
  const last = getAttributionState().last;
  const out: Attribution = {};
  if (!last) return out;
  for (const k of LEGACY_KEYS) {
    const v = last[k];
    if (v) out[k] = v;
  }
  return out;
}
