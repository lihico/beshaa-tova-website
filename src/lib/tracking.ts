/**
 * Client-side tracking helpers for the בשעה טובה funnel.
 *
 * Persists visitor_id and session_id, exposes trackFunnel() which fires Pixel + CAPI deduped
 * via event_id. The _fbc cookie is now set by the server (/api/touch, Set-Cookie), not here,
 * because Safari caps cookies written by JS (docs/attribution/00_DESIGN.md 2, 4.1).
 */

import { trackEvent, trackCustomEvent } from "./meta-pixel";
import { readConsent } from "./consent";

const LS_VISITOR = "bsh_visitor_id";
const LS_FIRST_SEEN = "bsh_first_seen";
const SS_SESSION = "bsh_session_id";
const SS_INITIATE_CHECKOUT_FIRED = "bsh_ic_fired";
const COOKIE_FBC = "_fbc";
const COOKIE_FBP = "_fbp";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  // Fallback (older browsers)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

/**
 * visitor_id: the server-issued id (v_...) that captureTouch() copies into localStorage from
 * /api/touch; until that answer arrives (or if it never does) a local UUID as before. The UUID is
 * sent to /api/touch as vid_ls, so the server adopts it when there is no bsh_vid cookie yet.
 */
export function getVisitorId(): string {
  try {
    if (typeof localStorage === "undefined") return "anon";
    let id = localStorage.getItem(LS_VISITOR);
    if (!id) {
      id = uuid();
      localStorage.setItem(LS_VISITOR, id);
      localStorage.setItem(LS_FIRST_SEEN, String(Date.now()));
    }
    return id;
  } catch {
    return "anon";
  }
}

/** Read or generate per-session session_id (sessionStorage). */
export function getSessionId(): string {
  try {
    if (typeof sessionStorage === "undefined") return "anon";
    let id = sessionStorage.getItem(SS_SESSION);
    if (!id) {
      id = uuid();
      sessionStorage.setItem(SS_SESSION, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function getFbc(): string | null {
  return readCookie(COOKIE_FBC);
}

export function getFbp(): string | null {
  return readCookie(COOKIE_FBP);
}

/** Hashed/raw user data the server CAPI helper expects. Send raw, server hashes. */
export interface UserDataIn {
  em?: string | null;
  ph?: string | null;
  fn?: string | null;
  ln?: string | null;
}

export interface TrackArgs {
  /** Standard Meta event name (PageView/ViewContent/InitiateCheckout/etc) or custom string */
  event: string;
  /** Whether to send as a Meta "standard" event via fbq("track", ...) vs "trackCustom" */
  standard?: boolean;
  value?: number;
  currency?: string;
  contentName?: string;
  contentCategory?: string;
  extra?: Record<string, unknown>;
  /** Raw PII - server will SHA-256 hash before sending to CAPI */
  userData?: UserDataIn;
  /** Use this event id instead of a random one (Lead / Purchase ids come from the server). */
  eventId?: string;
  /** Mirror to /api/track (default true). Lead and Purchase pass false: the server sends their CAPI copy. */
  mirror?: boolean;
}

/**
 * Fire a funnel event:
 *   1. Pixel event with explicit eventID (browser-side)
 *   2. POST to /api/track so server fires CAPI with the same eventID (deduped)
 *
 * Pixel + CAPI for every step gives adblocker-resistant funnel data.
 */
export function trackFunnel(args: TrackArgs): string {
  const eventId = args.eventId || uuid();
  const fbc = getFbc();
  const fbp = getFbp();
  const visitorId = getVisitorId();
  const sessionId = getSessionId();

  const pixelParams: Record<string, unknown> = {
    ...(args.value !== undefined ? { value: args.value } : {}),
    ...(args.currency ? { currency: args.currency } : {}),
    ...(args.contentName ? { content_name: args.contentName } : {}),
    ...(args.contentCategory ? { content_category: args.contentCategory } : {}),
    ...(args.extra || {}),
  };

  // 1. Browser-side Pixel event
  if (args.standard ?? true) {
    trackEvent(args.event as Parameters<typeof trackEvent>[0], pixelParams, eventId);
  } else {
    trackCustomEvent(args.event, pixelParams, eventId);
  }

  // 2. Server-side CAPI mirror (fire and forget)
  // A visitor who chose "לא, תודה" gets no server CAPI copy either (00_DESIGN 15); the Pixel is revoked in the browser.
  if (args.mirror === false || readConsent() === "denied") return eventId;
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      event_name: args.event,
      event_id: eventId,
      event_source_url: typeof location !== "undefined" ? location.href : undefined,
      fbc, fbp,
      visitor_id: visitorId,
      session_id: sessionId,
      user_data: args.userData,
      custom_data: pixelParams,
    }),
  }).catch(() => {});

  return eventId;
}

/** Fire InitiateCheckout once per session (e.g., on first form field focus). */
export function trackInitiateCheckoutOnce(args: Omit<TrackArgs, "event"> = {}) {
  if (typeof sessionStorage === "undefined") return;
  if (sessionStorage.getItem(SS_INITIATE_CHECKOUT_FIRED)) return;
  sessionStorage.setItem(SS_INITIATE_CHECKOUT_FIRED, "1");
  trackFunnel({ event: "InitiateCheckout", ...args });
}

/**
 * One PageView per route (Pixel + CAPI mirror, same event id). The inline PageView in index.html
 * is gone and the Pixel's own history listener is off (fbq.disablePushState), so this is the only
 * sender. Guard against React StrictMode's double effects in dev: the same path within 1 s is skipped.
 */
let lastPv: { path: string; ms: number } | null = null;
export function trackPageView(path: string) {
  const now = Date.now();
  if (lastPv && lastPv.path === path && now - lastPv.ms < 1000) return;
  lastPv = { path, ms: now };
  trackFunnel({ event: "PageView", contentName: path });
}

/**
 * GA4 user property bsh_vid = our visitor id, so GA4 users join orders and touches (PLAN.md Stage 6,
 * decision 19). Skipped on "לא, תודה"; sent again only when the id changes (the server's v_ id
 * replaces the first-visit local one once /api/touch answers).
 */
let gaVidSent: string | null = null;
export function setGaVisitorProperty(): void {
  try {
    const w = globalThis as unknown as { gtag?: (...args: unknown[]) => void };
    if (typeof w.gtag !== "function" || readConsent() === "denied") return;
    const vid = getVisitorId();
    if (!vid || vid === "anon" || vid === gaVidSent) return;
    w.gtag("set", "user_properties", { bsh_vid: vid });
    gaVidSent = vid;
  } catch {
    // best effort
  }
}

/** Run once at app boot. Idempotent. */
export function initTracking() {
  if (typeof window === "undefined") return;
  getVisitorId();  // ensures one is generated on first visit
  getSessionId();
  setGaVisitorProperty();
}
