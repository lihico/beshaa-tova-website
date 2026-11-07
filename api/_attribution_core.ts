/**
 * Attribution core (docs/attribution/00_DESIGN.md sections 2, 3, 9).
 *
 * PURE: no imports, no Node or DOM APIs beyond globals that exist in both (URL, TextEncoder,
 * btoa/atob, crypto.getRandomValues). Imported by the server (api/*) AND by the browser
 * (src/lib/attribution.ts), so keep it free of secrets and side effects.
 */

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type Channel =
  | "paid_meta" | "paid_tiktok" | "paid_google" | "affiliate" | "referral" | "gift_voucher"
  | "offline_print" | "cafe_partner" | "partner" | "community_group" | "messaging"
  | "organic_social" | "email" | "organic_search" | "referral_site" | "direct";

export const CHANNELS: readonly Channel[] = [
  "paid_meta", "paid_tiktok", "paid_google", "affiliate", "referral", "gift_voucher",
  "offline_print", "cafe_partner", "partner", "community_group", "messaging",
  "organic_social", "email", "organic_search", "referral_site", "direct",
];

export type TouchKind = "landing" | "qr_scan" | "ref_link" | "internal_param";
const TOUCH_KINDS: readonly TouchKind[] = ["landing", "qr_scan", "ref_link", "internal_param"];

export interface Touch {
  touch_id: string;          // t_XXXXXXXXXXXX
  ts: string;                // ISO 8601 UTC
  kind: TouchKind;
  landing_path: string;      // "/cafe/tre" (no query)
  referrer_host: string | null;
  ref: string | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  utm_content: string | null; utm_term: string | null; utm_id: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  placement: string | null;
  fbclid: string | null; gclid: string | null; gbraid: string | null; wbraid: string | null; ttclid: string | null;
  promo: string | null;
  q_code: string | null;
  channel: Channel;
}

/** Same fields as Touch, `touch_id` renamed to `id`, null fields dropped when serialised. */
export type CompactTouch = Partial<Omit<Touch, "touch_id">> & { id: string };

export interface AttributionState {
  visitor_id: string;
  first: Touch | null;
  last: Touch | null;
  touches: Touch[];          // newest last, max MAX_TOUCHES
}

export interface ResolvedPromo {
  code: string;
  discount_pct: number;
  partner_id: string | null;
  referral: string | null;   // "frd-<couple>" for a "<couple>-gift" friend code
  source: "builtin" | "friend" | "partner";
}

export type CreditRule = "code" | "last_touch" | "first_touch" | "self_report" | "none";

export interface Credit {
  credit_rule: CreditRule;
  credited_channel: Channel;
  credited_detail: string | null;
}

export type OrderKind = "order" | "gift" | "redeem";
export type PaymentStatus = "pending" | "paid" | "cancelled" | "refunded" | "free";

export interface OrderRecord {
  order_id: string; order_kind: OrderKind; created_at: string;
  payment_status: PaymentStatus;
  amount_expected: number; currency: "ILS"; price_rule: string;
  client_displayed_amount: number | null;
  promo_code: string | null; partner_id: string | null;
  credit_rule: CreditRule;
  credited_channel: Channel; credited_detail: string | null;
  first: Touch | null; last: Touch | null; touches: Touch[];
  self_reported_source: string | null; not_engaged: boolean;
  visitor_id: string; session_id: string | null;
  fbc: string | null; fbp: string | null; ga_client_id: string | null;
  client_ip: string | null; user_agent: string | null; event_source_url: string | null;
  consent_marketing: "granted" | "denied" | "unknown";
  buyer: { name: string; phone: string; email: string | null };
  couple: { name1: string; name2: string };
  lead_event_id: string;
  grow_process_ids: string[]; grow_process_token: string | null;
  payment_fallback_reason: string | null;
  paid_at: string | null; paid_amount: number | null; grow_transaction_id: string | null; asmachta: string | null;
  payment_method: string | null; payer_name: string | null; payer_phone: string | null; payer_email: string | null;
  /** order_id: Grow API cField1; order_code: the code typed on a fixed Grow page; phone_sum: payer phone + exact
   *  sum among pending orders (no code); manual: Lihi's signed "mark paid" link. */
  match_method: "order_id" | "order_code" | "phone_sum" | "manual" | null;
  capi_purchase_event_id: string | null; capi_purchase_sent_at: string | null; capi_purchase_result: string | null;
  commission_ils: number | null; commission_status: "pending" | "approved" | "paid" | "void" | null;
  invoice_number: string | null; invoice_url: string | null;
  /** CAPI Lead result (ok:<n> | logged | off | skipped_consent | error:<status>), when it went out, and the
   *  last Graph error code of any CAPI send ("<code>" or "<code>:<subcode>", "fetch" = network). PLAN.md Stage 2. */
  capi_lead_result?: string | null; capi_lead_sent_at?: string | null; capi_last_error_code?: string | null;
  /** GA4 session id from the _ga_W3Z965PSD0 cookie at submit (digits, PLAN.md Stage 6); the server-side
   *  GA4 purchase carries it as session_id so the sale joins the visit's session and traffic source. */
  ga_session_id?: string | null;
  /** Money truth (PLAN.md Stage 3), written only by scripts/reconcile-payments.ts --apply: when Grow says it was
   *  paid, ex-VAT revenue after refunds minus the Grow fee, the Grow fee, the refunded total (ILS, gross), when the
   *  last refund happened, the Grow credit document number, and the reconciliation verdict, where it came from
   *  and when it ran. */
  grow_paid_at?: string | null; revenue_net_ils?: number | null; fee_ils?: number | null;
  refund_amount?: number | null; refunded_at?: string | null; credit_doc_number?: string | null;
  recon_status?: string | null; recon_source?: string | null; recon_at?: string | null;
  // Optional extras (slice 3-5): what fulfilPaid() needs that the 3.2 shape does not carry.
  meetings?: string[] | null;            // content_ids / num_items for the Purchase event
  all_meetings?: boolean;                // Grow catalogNumber kit | kit_all
  voucher_code?: string | null;          // gift: the BST- code released on payment; redeem: the code used
  gift_release_extras?: { delivery?: "self" | "direct"; couplePhone?: string | null; contactName?: string | null } | null;
  /** ISO time per idempotent fulfil step done (ga4, commission, affiliate, gift_release, paid_email); FileStore only. */
  fulfil_log?: Record<string, string> | null;
  /** How "paid" was established: process_info (Grow API re-query), unsigned_webhook (fixed-page server update,
   *  no signature and no API to check it), manual_token (Lihi's signed link). Not a sheet column. */
  verify_mode?: "process_info" | "unsigned_webhook" | "manual_token" | null;
  /** Express shipping surcharge included in amount_expected (0 or null = regular shipping). Not a sheet column. */
  express_ils?: number | null;
}

export interface PaymentRecord {
  payment_id: string;
  order_id: string; provider: "grow" | "grow_mock" | "grow_pages" | "grow_make" | "manual";
  amount: number; currency: "ILS"; paid_at: string; asmachta: string | null;
  method: "card" | "bit" | "apple_pay" | "google_pay" | "paybox" | "bank" | "other";
  card_suffix: string | null; installments: number | null;
  /** false for unsigned_webhook: Grow signs nothing and there is no API to re-query on Light. */
  verified: boolean; verification: "process_info" | "transaction_info" | "manual_token" | "unsigned_webhook";
  raw_notify_digest: string;
}

export interface TrackingCode {
  code: string; channel?: Channel | string; landing: string;
  utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string;
  location?: string; printed_at?: string; quantity?: number; cost_ils?: number;
  status: "active" | "retired"; notes?: string;
}

export interface Partner {
  partner_id: string; code: string; name: string; platform: string; handle: string;
  commission_type: "percent" | "fixed"; commission_value: number; buyer_discount_pct: number;
  active: boolean; start?: string | null; end?: string | null; fp_ref_id: string | null;
  phone?: string | null; email?: string | null;   // optional, only for the self-referral guard
}

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/** Every URL key parseTouch() reads (plus legacy `adset`). */
export const TRACKED_KEYS = [
  "ref", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "cid", "asid", "aid", "plc", "fbclid", "gclid", "gbraid", "wbraid", "ttclid", "promo",
] as const;
const LEGACY_KEYS = ["adset"] as const;

export const META_SOURCES = ["fb", "ig", "msg", "an", "th", "meta", "facebook", "instagram"];
/** Mirrors the slugs in src/data/cafes.ts (kept here so the core stays import-free). */
export const CAFE_SLUGS = ["barcafe", "cafefiori", "tre"];
/** A return from the payment page is never a new touch. */
export const PAYMENT_REFERRER_HOSTS = ["meshulam.co.il", "grow.link", "grow.business"];
const SEARCH_HOST_RE = /(^|\.)(google|bing|duckduckgo|yahoo)\./;
const SOCIAL_HOSTS = ["facebook.com", "instagram.com", "t.co", "tiktok.com", "linkedin.com"];

export const MAX_TOUCHES = 10;
export const DEDUP_WINDOW_MS = 30 * 60 * 1000;
export const ATT_COOKIE_MAX_BYTES = 3000;

/** Touch fields an internal_param touch may merge into `last` (and that make up the dedup key). */
const KEY_FIELDS = [
  "ref", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "meta_campaign_id", "meta_adset_id", "meta_ad_id", "placement",
  "fbclid", "gclid", "gbraid", "wbraid", "ttclid", "promo",
] as const satisfies readonly (keyof Touch)[];
type KeyField = (typeof KEY_FIELDS)[number];

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// ---------------------------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------------------------

/** Existing site rule (src/lib/attribution.ts, api/_sheets.ts): letters, digits, _ . -, max 64. */
export function sanitizeValue(v: unknown, max = 64): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[^\p{L}\p{N}_.\-]/gu, "").slice(0, max);
  return s || null;
}

/** Click ids keep their full length (Meta matches on the exact fbclid; 64 would truncate it). */
export function sanitizeClickId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[^A-Za-z0-9_.\-]/g, "").slice(0, 500);
  return s || null;
}

/** Path only (no query/hash), max 200. Always starts with "/". */
export function sanitizePath(p: unknown): string {
  if (typeof p !== "string" || !p) return "/";
  const noQuery = p.split(/[?#]/)[0];
  const s = noQuery.replace(/[^\p{L}\p{N}/_.\-~%]/gu, "").slice(0, 200);
  return s.startsWith("/") ? s : "/" + s;
}

/** Lowercased host (with port when present), or null. Accepts a full URL or a bare host. */
export function sanitizeHost(h: unknown): string | null {
  if (typeof h !== "string" || !h) return null;
  let host = h.trim().toLowerCase();
  if (host.includes("/")) {
    try { host = new URL(host).host; } catch { return null; }
  }
  host = host.replace(/[^a-z0-9.:\-\[\]]/g, "").slice(0, 100);
  return host || null;
}

function bareHost(h: string): string {
  return h.toLowerCase().replace(/^www\./, "");
}

function hostMatches(host: string, list: readonly string[]): boolean {
  const name = bareHost(host).split(":")[0];
  return list.some((d) => name === d || name.endsWith("." + d));
}

function lc(v: string | null | undefined): string {
  return (v ?? "").toLowerCase();
}

function randomCrockford(n: number): string {
  const c = (globalThis as unknown as { crypto?: { getRandomValues<T extends Uint8Array>(a: T): T } }).crypto;
  const bytes = new Uint8Array(n);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (let i = 0; i < n; i++) out += CROCKFORD[bytes[i] & 31];   // 256 % 32 == 0: unbiased
  return out;
}

/** n Crockford base32 characters (0-9, A-Z without I L O U). */
export function crockford(n: number): string {
  return randomCrockford(n);
}

export const TOUCH_ID_RE = /^t_[0-9A-HJKMNP-TV-Z]{12}$/;
export function newTouchId(): string {
  return "t_" + randomCrockford(12);
}

function isIsoTs(v: unknown): v is string {
  return typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
}

function tsMs(t: { ts: string } | null | undefined): number {
  if (!t) return Number.NaN;
  return Date.parse(t.ts);
}

// ---------------------------------------------------------------------------------------------
// parseTouch (section 3.1)
// ---------------------------------------------------------------------------------------------

export interface ParseTouchOptions {
  kind?: TouchKind;          // default "landing", or "internal_param" when internal = true
  internal?: boolean;
  ts?: string;
  touch_id?: string;
  q_code?: string | null;
  channel?: Channel;         // registry override for /q and /r touches (section 9.2, last paragraph)
}

/**
 * One touch from a URL and its referrer, or null for a direct load (no tracked key and no
 * external referrer). A return from the payment page (Grow host as referrer, or /order/thanks
 * with no tracked key) is never a touch, so it cannot overwrite the real last touch.
 */
export function parseTouch(
  url: string | URL,
  referrer: string | null | undefined,
  ownHost: string | readonly string[],
  opts: ParseTouchOptions = {},
): Touch | null {
  let u: URL;
  try { u = typeof url === "string" ? new URL(url) : url; } catch { return null; }
  const p = u.searchParams;
  const get = (k: string) => sanitizeValue(p.get(k));
  const click = (k: string) => sanitizeClickId(p.get(k));

  const own = (Array.isArray(ownHost) ? ownHost : [ownHost as string]).map((h) => bareHost(h));
  own.push(bareHost(u.host));
  let referrer_host = sanitizeHost(referrer ?? "");
  if (referrer_host && (own.includes(bareHost(referrer_host)) || hostMatches(referrer_host, PAYMENT_REFERRER_HOSTS))) {
    referrer_host = null;
  }

  const kind: TouchKind = opts.kind ?? (opts.internal ? "internal_param" : "landing");
  if (kind === "internal_param") referrer_host = null;

  const values = {
    ref: get("ref"),
    utm_source: get("utm_source"), utm_medium: get("utm_medium"), utm_campaign: get("utm_campaign"),
    utm_content: get("utm_content"), utm_term: get("utm_term"), utm_id: get("utm_id"),
    cid: get("cid"), asid: get("asid") ?? get(LEGACY_KEYS[0]), aid: get("aid"), plc: get("plc"),
    fbclid: click("fbclid"), gclid: click("gclid"), gbraid: click("gbraid"), wbraid: click("wbraid"),
    ttclid: click("ttclid"), promo: get("promo"),
  };
  const hasKeys = Object.values(values).some((v) => v !== null);
  const landing_path = sanitizePath(u.pathname);
  const q_code = sanitizeValue(opts.q_code ?? null);
  const serverBuilt = kind === "qr_scan" || kind === "ref_link";

  if (!serverBuilt) {
    if (!hasKeys && !referrer_host) return null;
    if (!hasKeys && landing_path.startsWith("/order/thanks")) return null;
    if (kind === "internal_param" && !hasKeys) return null;
  }

  const metaRef = /^meta-(\d{5,25})$/i.exec(values.ref ?? "");
  const t: Omit<Touch, "channel"> = {
    touch_id: opts.touch_id && TOUCH_ID_RE.test(opts.touch_id) ? opts.touch_id : newTouchId(),
    ts: isIsoTs(opts.ts) ? new Date(opts.ts).toISOString() : new Date().toISOString(),
    kind,
    landing_path,
    referrer_host,
    ref: values.ref,
    utm_source: values.utm_source, utm_medium: values.utm_medium, utm_campaign: values.utm_campaign,
    utm_content: values.utm_content, utm_term: values.utm_term, utm_id: values.utm_id,
    meta_campaign_id: values.cid ?? (values.utm_id && META_SOURCES.includes(lc(values.utm_source)) ? values.utm_id : null),
    meta_adset_id: values.asid,
    meta_ad_id: values.aid ?? (metaRef ? metaRef[1] : null),
    placement: values.plc,
    fbclid: values.fbclid, gclid: values.gclid, gbraid: values.gbraid, wbraid: values.wbraid, ttclid: values.ttclid,
    promo: values.promo,
    q_code,
  };
  const channel = serverBuilt && opts.channel && CHANNELS.includes(opts.channel) ? opts.channel : classifyTouch(t);
  return { ...t, channel };
}

// ---------------------------------------------------------------------------------------------
// classifyTouch (section 9.2; first matching rule wins)
// ---------------------------------------------------------------------------------------------

export type TouchLike = Partial<Omit<Touch, "channel">>;

export function classifyTouch(t: TouchLike): Channel {
  const ref = lc(t.ref), src = lc(t.utm_source), med = lc(t.utm_medium);
  const starts = (...prefixes: string[]) => prefixes.some((x) => ref.startsWith(x));
  const paidMed = med.startsWith("paid");

  // A affiliate
  if (starts("aff-") || t.kind === "ref_link" || med === "affiliate") return "affiliate";
  // B referral
  if (starts("frd-", "kit-") || (med === "referral" && src !== "gift_voucher")) return "referral";
  // C gift voucher
  if (src === "gift_voucher") return "gift_voucher";
  // D paid Meta (fbclid alone never makes a touch paid)
  if (t.meta_ad_id || t.meta_campaign_id || starts("meta-") || (paidMed && META_SOURCES.includes(src))) return "paid_meta";
  // E paid TikTok
  if (t.ttclid || (paidMed && src === "tiktok")) return "paid_tiktok";
  // F paid Google
  if (t.gclid || t.gbraid || t.wbraid || med === "cpc" || med === "ppc") return "paid_google";
  // G cafe partner
  if (starts("cafe-") || CAFE_SLUGS.includes(ref) || src === "cafe" || (t.landing_path ?? "").startsWith("/cafe/")) return "cafe_partner";
  // H offline print
  if (t.q_code || starts("pst-", "fly-") || med === "print") return "offline_print";
  // I partner
  if (med === "partner" || starts("hr-", "ins-", "plat-")) return "partner";
  // J community group
  if (starts("grp-", "fbgroup-") || med === "community") return "community_group";
  // K messaging
  if (starts("wa-") || med === "messaging") return "messaging";
  // L legacy vocabulary (04 sections 2 and 6)
  const legacy = classifyLegacy(ref, src, med);
  if (legacy) return legacy;
  // M organic social
  if (med === "organic_social" || starts("org-", "li-")) return "organic_social";
  // N email
  if (med === "email" || starts("nl-")) return "email";
  // O-Q by referrer
  const host = t.referrer_host ? bareHost(t.referrer_host).split(":")[0] : "";
  if (host && SEARCH_HOST_RE.test(host)) return "organic_search";
  if (host && hostMatches(host, SOCIAL_HOSTS)) return "organic_social";
  if (host) return "referral_site";
  // R
  return "direct";
}

/**
 * Rule L. Order inside the rule: print vocabulary, organic vocabulary, group refs, poster refs,
 * then Meta refs. Group refs are checked before the Meta ref generations because
 * `202611-v3-grp-*` refs were group-post variants of the v3 ads (04 section 2.2).
 */
function classifyLegacy(ref: string, src: string, med: string): Channel | null {
  if (["poster", "qr", "collab", "pdf"].includes(med) || ["flyer", "poster", "print", "cafe_flyer"].includes(src)) return "offline_print";
  if (med === "organic" || med === "company_page") return "organic_social";
  if (ref.includes("_grp_") || ref.includes("group") || /(^|-)grp-/.test(ref)) return "community_group";
  if (ref.startsWith("202610-poster")) return "offline_print";
  if ((ref.startsWith("202610-") || ref.startsWith("202611-meta-") || ref.startsWith("202611-v3-")) && (src === "meta" || src === "fb")) return "paid_meta";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Merge rules (section 3.1)
// ---------------------------------------------------------------------------------------------

export function emptyState(visitor_id = ""): AttributionState {
  return { visitor_id, first: null, last: null, touches: [] };
}

/** Dedup key: landing path + every tracked value (kind, q_code, referrer and ids are ignored). */
export function touchKey(t: Touch): string {
  return [t.landing_path, ...KEY_FIELDS.map((k) => t[k] ?? "")].join("|");
}

function isDuplicateOf(a: Touch, b: Touch): boolean {
  if (a.touch_id === b.touch_id) return true;
  const dt = Math.abs(tsMs(a) - tsMs(b));
  return touchKey(a) === touchKey(b) && Number.isFinite(dt) && dt < DEDUP_WINDOW_MS;
}

function seenRecently(s: AttributionState, t: Touch): boolean {
  return [...s.touches, s.last, s.first].some((x) => x != null && isDuplicateOf(x, t));
}

/**
 * Apply one touch to a state (pure).
 * 1. `first` is set once. 2. internal_param merges key by key into `last` (keeps last.ts and
 * last.kind; channel recomputed unless last came from /q or /r, whose channel may be a registry
 * override). 3. Any other touch replaces `last`. 4. Append to touches (cap 10). The same
 * (landing_path, keys) within 30 minutes is ignored entirely.
 */
export function mergeTouch(state: AttributionState, t: Touch | null): AttributionState {
  const s: AttributionState = { ...state, touches: [...state.touches] };
  if (!t) return s;
  if (seenRecently(s, t)) return s;
  if (!s.first) s.first = t;
  if (t.kind === "internal_param" && s.last) {
    const merged: Touch = { ...s.last };
    for (const k of KEY_FIELDS) {
      const v = t[k as KeyField];
      if (v != null) merged[k as KeyField] = v;
    }
    const keepChannel = merged.kind === "qr_scan" || merged.kind === "ref_link";
    merged.channel = keepChannel ? s.last.channel : classifyTouch(merged);
    s.last = merged;   // a copy: `first` (possibly the same touch) stays frozen
  } else {
    s.last = t;
  }
  s.touches = [...s.touches, t].slice(-MAX_TOUCHES);
  return s;
}

function earlier(a: Touch | null, b: Touch | null): Touch | null {
  if (!a) return b;
  if (!b) return a;
  return tsMs(a) < tsMs(b) ? a : b;       // tie -> b
}

function later(a: Touch | null, b: Touch | null): Touch | null {
  if (!a) return b;
  if (!b) return a;
  return tsMs(a) > tsMs(b) ? a : b;       // tie -> b
}

/**
 * Combine two views of one visitor (e.g. localStorage `a` and the server cookie `b`).
 * Earliest first and latest last win; on a tie `b` wins (pass the server state as `b`).
 * Touches are unioned (same touch_id, or same key within 30 minutes, counts once), sorted, capped.
 */
export function mergeState(a: AttributionState | null, b: AttributionState | null): AttributionState {
  if (!a && !b) return emptyState();
  if (!a) return { ...(b as AttributionState), touches: [...(b as AttributionState).touches] };
  if (!b) return { ...a, touches: [...a.touches] };
  // first/last join the pool (a cookie state carries no touch list), and the earliest copy of a
  // duplicate is the one kept: the /q qr_scan, not the SPA landing 300 ms later (E2E J2).
  const all = [...b.touches, ...a.touches, b.first, b.last, a.first, a.last]
    .filter((t): t is Touch => !!t)
    .sort((x, y) => tsMs(x) - tsMs(y));
  const touches: Touch[] = [];
  for (const t of all) if (!touches.some((x) => isDuplicateOf(x, t))) touches.push(t);
  // first/last point at the kept copy of a deduplicated touch (else `last` could be the server's copy
  // of the same landing, absent from `touches`, with another id and ts: E2E J1).
  const kept = (t: Touch | null): Touch | null => (t ? touches.find((x) => isDuplicateOf(x, t)) ?? t : null);
  return {
    visitor_id: b.visitor_id || a.visitor_id,
    first: kept(earlier(a.first, b.first)),
    last: kept(later(a.last, b.last)),
    touches: touches.slice(-MAX_TOUCHES),
  };
}

// ---------------------------------------------------------------------------------------------
// Untrusted input (request bodies, cookies, localStorage) -> clean Touch / state
// ---------------------------------------------------------------------------------------------

export function isChannel(v: unknown): v is Channel {
  return typeof v === "string" && (CHANNELS as readonly string[]).includes(v);
}

/** Re-sanitise every field; channel is recomputed except for /q and /r touches. */
export function sanitizeTouch(raw: unknown): Touch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isIsoTs(r.ts)) return null;
  const kind: TouchKind = TOUCH_KINDS.includes(r.kind as TouchKind) ? (r.kind as TouchKind) : "landing";
  const id = typeof r.touch_id === "string" ? r.touch_id : typeof r.id === "string" ? r.id : "";
  const v = (k: string) => sanitizeValue(r[k]);
  const c = (k: string) => sanitizeClickId(r[k]);
  const t: Omit<Touch, "channel"> = {
    touch_id: TOUCH_ID_RE.test(id) ? id : newTouchId(),
    // Client clocks are untrusted: a future-dated touch would pin `last`, so clamp to now + 5 min.
    ts: new Date(Math.min(Date.parse(r.ts), Date.now() + 5 * 60_000)).toISOString(),
    kind,
    landing_path: sanitizePath(r.landing_path),
    referrer_host: sanitizeHost(r.referrer_host),
    ref: v("ref"),
    utm_source: v("utm_source"), utm_medium: v("utm_medium"), utm_campaign: v("utm_campaign"),
    utm_content: v("utm_content"), utm_term: v("utm_term"), utm_id: v("utm_id"),
    meta_campaign_id: v("meta_campaign_id"), meta_adset_id: v("meta_adset_id"), meta_ad_id: v("meta_ad_id"),
    placement: v("placement"),
    fbclid: c("fbclid"), gclid: c("gclid"), gbraid: c("gbraid"), wbraid: c("wbraid"), ttclid: c("ttclid"),
    promo: v("promo"),
    q_code: v("q_code"),
  };
  const serverBuilt = kind === "qr_scan" || kind === "ref_link";
  return { ...t, channel: serverBuilt && isChannel(r.channel) ? r.channel : classifyTouch(t) };
}

export const VISITOR_ID_RE = /^v_[A-Za-z0-9_-]{22}$/;
export const LEGACY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isVisitorId(v: unknown): v is string {
  return typeof v === "string" && (VISITOR_ID_RE.test(v) || LEGACY_UUID_RE.test(v));
}

export function sanitizeState(raw: unknown): AttributionState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const touches = Array.isArray(r.touches)
    ? (r.touches.slice(-MAX_TOUCHES * 2).map(sanitizeTouch).filter(Boolean) as Touch[])
    : [];
  return {
    visitor_id: isVisitorId(r.visitor_id) ? r.visitor_id : "",
    first: sanitizeTouch(r.first),
    last: sanitizeTouch(r.last),
    touches: touches.sort((a, b) => tsMs(a) - tsMs(b)).slice(-MAX_TOUCHES),
  };
}

/**
 * The attribution frozen on an order: the body's state (client) merged with the bsh_att cookie
 * (server, wins ties). The visitor id prefers the bsh_vid cookie.
 */
export function mergeServerAttribution(
  bodyAttribution: unknown,
  cookieState: Pick<AttributionState, "first" | "last"> | null,
  cookieVisitorId: string | null,
): AttributionState {
  const body = sanitizeState(bodyAttribution);
  const cookie: AttributionState | null = cookieState
    ? { visitor_id: "", first: cookieState.first, last: cookieState.last, touches: [] }
    : null;
  const merged = mergeState(body, cookie);
  // cookie first/last are not in the body's touch list when localStorage was purged: add them back
  for (const t of [cookie?.first, cookie?.last]) {
    if (t && !merged.touches.some((x) => isDuplicateOf(x, t))) merged.touches.push(t);
  }
  merged.touches = merged.touches.sort((a, b) => tsMs(a) - tsMs(b)).slice(-MAX_TOUCHES);
  merged.visitor_id = (isVisitorId(cookieVisitorId) ? cookieVisitorId : "") || body?.visitor_id || "";
  return merged;
}

/** Old cached bundles send only `ref` + `utm` ({utm_source,...}); build one touch from them. */
export function legacyState(ref: unknown, utm: unknown, opts: { ts?: string; landing_path?: string } = {}): AttributionState | null {
  const u = utm && typeof utm === "object" ? (utm as Record<string, unknown>) : {};
  const params = new URLSearchParams();
  if (typeof ref === "string") params.set("ref", ref);
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id"]) {
    if (typeof u[k] === "string") params.set(k, u[k] as string);
  }
  const path = sanitizePath(opts.landing_path ?? "/");
  const t = parseTouch(`https://legacy.invalid${path}?${params.toString()}`, null, "legacy.invalid", { ts: opts.ts });
  return t ? { visitor_id: "", first: t, last: t, touches: [t] } : null;
}

// ---------------------------------------------------------------------------------------------
// creditOrder (section 9.3)
// ---------------------------------------------------------------------------------------------

/** The most specific identifier of a touch (an organic search/social touch falls back to its host). */
export function touchDetail(t: Touch): string | null {
  return t.meta_ad_id ?? t.q_code ?? t.ref ?? t.utm_campaign ?? t.referrer_host ?? null;
}

const SELF_REPORT_MAP: Record<string, Channel> = {
  facebook: "organic_social", instagram: "organic_social", friend: "referral", whatsapp: "messaging",
  cafe: "cafe_partner", print: "offline_print", event: "partner", newsletter: "email",
};

/** Maps the form's "how did you hear about us" value (Order.tsx options) to a channel, or null. */
export function selfReportChannel(selfReported: string | null | undefined): Channel | null {
  const s = (selfReported ?? "").trim().toLowerCase();
  if (!s) return null;
  if (SELF_REPORT_MAP[s]) return SELF_REPORT_MAP[s];
  if (s.startsWith("בית קפה")) return "cafe_partner";   // Order.tsx sends "בית קפה - <name>"
  return null;
}

export function creditOrder(
  attr: Pick<AttributionState, "first" | "last">,
  promo: Pick<ResolvedPromo, "partner_id" | "referral"> | null,
  selfReported: string | null | undefined,
): Credit {
  if (promo?.partner_id) return { credit_rule: "code", credited_channel: "affiliate", credited_detail: promo.partner_id };
  if (promo?.referral) return { credit_rule: "code", credited_channel: "referral", credited_detail: promo.referral };
  if (attr.last && attr.last.channel !== "direct") {
    return { credit_rule: "last_touch", credited_channel: attr.last.channel, credited_detail: touchDetail(attr.last) };
  }
  if (attr.first && attr.first.channel !== "direct") {
    return { credit_rule: "first_touch", credited_channel: attr.first.channel, credited_detail: touchDetail(attr.first) };
  }
  const self = selfReportChannel(selfReported);
  if (self) return { credit_rule: "self_report", credited_channel: self, credited_detail: sanitizeValue(selfReported) };
  return { credit_rule: "none", credited_channel: "direct", credited_detail: null };
}

const AFF_REF = /^aff-([a-z0-9_-]{1,60})$/i;

/**
 * Section 8 credit, second step: the partner id of an `aff-<id>` ref (or the `/r/<handle>` q_code,
 * which is also `aff-<id>`) in the LAST touch, else the FIRST touch; null when neither has one.
 * Paid-ad and QR refs never match, so they never pay a creator. The caller checks the registry.
 */
export function refPartnerId(attr: Pick<AttributionState, "first" | "last">): string | null {
  for (const t of [attr.last, attr.first]) {
    if (!t) continue;
    for (const v of [t.ref, t.q_code]) {
      const m = typeof v === "string" ? AFF_REF.exec(v) : null;
      if (m) return m[1].toLowerCase();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// bsh_att cookie value: base64url(JSON {v:1, f, l}), at most 3,000 bytes
// ---------------------------------------------------------------------------------------------

export function toCompact(t: Touch): CompactTouch {
  const out: Record<string, unknown> = { id: t.touch_id };
  for (const [k, v] of Object.entries(t)) if (k !== "touch_id" && v !== null && v !== undefined) out[k] = v;
  return out as CompactTouch;
}

export function fromCompact(c: unknown): Touch | null {
  return sanitizeTouch(c);
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Encode first + last for the cookie. Over the limit, drop (in order) l.referrer, f.referrer,
 * l/f utm_content + utm_term, then `f` itself; null when even `l` alone does not fit.
 */
export function encodeAttCookie(state: Pick<AttributionState, "first" | "last">, maxBytes = ATT_COOKIE_MAX_BYTES): string | null {
  if (!state.first && !state.last) return null;
  const f: Record<string, unknown> | null = state.first ? { ...toCompact(state.first) } : null;
  const l: Record<string, unknown> | null = state.last ? { ...toCompact(state.last) } : null;
  const steps: Array<() => void> = [
    () => { if (l) delete l.referrer_host; },
    () => { if (f) delete f.referrer_host; },
    () => { if (l) { delete l.utm_content; delete l.utm_term; } },
    () => { if (f) { delete f.utm_content; delete f.utm_term; } },
  ];
  let fOut = f;
  const enc = () => b64urlEncode(JSON.stringify({ v: 1, f: fOut ?? undefined, l: l ?? undefined }));
  let value = enc();
  for (const step of steps) {
    if (value.length <= maxBytes) return value;
    step();
    value = enc();
  }
  if (value.length <= maxBytes) return value;
  if (l) { fOut = null; value = enc(); if (value.length <= maxBytes) return value; }
  return null;
}

export function decodeAttCookie(value: string | null | undefined): Pick<AttributionState, "first" | "last"> | null {
  if (!value || value.length > 8000 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const o = JSON.parse(b64urlDecode(value)) as { v?: number; f?: unknown; l?: unknown };
    if (!o || o.v !== 1) return null;
    const first = fromCompact(o.f), last = fromCompact(o.l);
    return first || last ? { first, last } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Sheet columns (section 3.6): the 71 new headers plus 3 CAPI Lead columns (Stage 2), ga_session_id (Stage 6) and 9 reconciliation columns (Stage 3), in order, plus the 5 existing tracking columns
// ---------------------------------------------------------------------------------------------

export const SHEET_ATTRIBUTION_HEADERS = [
  "order_id", "order_kind", "payment_status", "amount_expected", "price_rule", "promo_code", "partner_id", "credit_rule",
  "credited_channel", "credited_detail", "self_reported_source", "not_engaged",
  "ft_ts", "ft_channel", "ft_ref", "ft_utm_source", "ft_utm_medium", "ft_utm_campaign", "ft_utm_content", "ft_utm_term",
  "ft_meta_campaign_id", "ft_meta_adset_id", "ft_meta_ad_id", "ft_q_code", "ft_landing", "ft_referrer",
  "lt_ts", "lt_channel", "lt_ref", "lt_utm_source", "lt_utm_medium", "lt_utm_campaign", "lt_utm_content", "lt_utm_term", "lt_utm_id",
  "lt_meta_campaign_id", "lt_meta_adset_id", "lt_meta_ad_id", "lt_placement", "lt_q_code", "lt_landing", "lt_referrer",
  "click_fbclid", "click_gclid", "click_ttclid", "ga_client_id", "touches_count", "touches_json",
  "client_ip", "user_agent", "event_source_url", "consent_marketing",
  "grow_process_ids", "grow_process_token", "payment_fallback_reason",
  "paid_at", "paid_amount", "payment_method", "grow_transaction_id", "asmachta", "payer_name", "payer_phone", "payer_email",
  "match_method", "invoice_number", "invoice_url",
  "capi_purchase_event_id", "capi_purchase_sent_at", "capi_purchase_result", "commission_ils", "commission_status",
  // Appended 2026-11 (PLAN.md Stage 2), at the end so the earlier column order is unchanged.
  "capi_lead_result", "capi_lead_sent_at", "capi_last_error_code",
  // Appended 2026-11 (PLAN.md Stage 6, GA4), at the end.
  "ga_session_id",
  // Appended 2026-11 (PLAN.md Stage 3, reconciliation and refunds), at the end.
  "grow_paid_at", "revenue_net_ils", "fee_ils", "refund_amount", "refunded_at", "credit_doc_number",
  "recon_status", "recon_source", "recon_at",
] as const;

/** Existing live columns (57-61) that the code writes for gift rows too from now on. */
export const SHEET_EXISTING_TRACKING_HEADERS = ["fbc", "fbp", "event_id", "visitor_id", "session_id"] as const;

export type SheetColumn = (typeof SHEET_ATTRIBUTION_HEADERS)[number] | (typeof SHEET_EXISTING_TRACKING_HEADERS)[number];

/**
 * Sheets formula-injection guard: addRow/save use USER_ENTERED, so a request-controlled string
 * starting with = + - @ (or a tab/CR) would become a live formula in the PII sheet. A leading
 * apostrophe makes Sheets store it as plain text (the apostrophe itself is not kept). Numbers are
 * left alone so negative amounts stay numbers.
 */
export function sheetSafe(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return sheetSafe(v);
}

/** Header-keyed values for addRow (every value a string; "" for null). */
export function toSheetColumns(o: OrderRecord): Record<SheetColumn, string> {
  const f = o.first, l = o.last;
  const clickFrom = (k: "fbclid" | "gclid" | "ttclid") => l?.[k] ?? f?.[k] ?? o.touches.slice().reverse().find((t) => t[k])?.[k] ?? null;
  const cols: Record<SheetColumn, unknown> = {
    order_id: o.order_id, order_kind: o.order_kind, payment_status: o.payment_status,
    amount_expected: o.amount_expected, price_rule: o.price_rule, promo_code: o.promo_code, partner_id: o.partner_id,
    credit_rule: o.credit_rule, credited_channel: o.credited_channel, credited_detail: o.credited_detail,
    self_reported_source: o.self_reported_source, not_engaged: o.not_engaged,
    ft_ts: f?.ts, ft_channel: f?.channel, ft_ref: f?.ref, ft_utm_source: f?.utm_source, ft_utm_medium: f?.utm_medium,
    ft_utm_campaign: f?.utm_campaign, ft_utm_content: f?.utm_content, ft_utm_term: f?.utm_term,
    ft_meta_campaign_id: f?.meta_campaign_id, ft_meta_adset_id: f?.meta_adset_id, ft_meta_ad_id: f?.meta_ad_id,
    ft_q_code: f?.q_code, ft_landing: f?.landing_path, ft_referrer: f?.referrer_host,
    lt_ts: l?.ts, lt_channel: l?.channel, lt_ref: l?.ref, lt_utm_source: l?.utm_source, lt_utm_medium: l?.utm_medium,
    lt_utm_campaign: l?.utm_campaign, lt_utm_content: l?.utm_content, lt_utm_term: l?.utm_term, lt_utm_id: l?.utm_id,
    lt_meta_campaign_id: l?.meta_campaign_id, lt_meta_adset_id: l?.meta_adset_id, lt_meta_ad_id: l?.meta_ad_id,
    lt_placement: l?.placement, lt_q_code: l?.q_code, lt_landing: l?.landing_path, lt_referrer: l?.referrer_host,
    click_fbclid: clickFrom("fbclid"), click_gclid: clickFrom("gclid"), click_ttclid: clickFrom("ttclid"),
    ga_client_id: o.ga_client_id, touches_count: o.touches.length,
    touches_json: o.touches.length ? JSON.stringify(o.touches.map(toCompact)) : "",
    client_ip: o.client_ip, user_agent: o.user_agent, event_source_url: o.event_source_url,
    consent_marketing: o.consent_marketing,
    grow_process_ids: o.grow_process_ids.join(","), grow_process_token: o.grow_process_token,
    payment_fallback_reason: o.payment_fallback_reason,
    paid_at: o.paid_at, paid_amount: o.paid_amount, payment_method: o.payment_method,
    grow_transaction_id: o.grow_transaction_id, asmachta: o.asmachta,
    payer_name: o.payer_name, payer_phone: o.payer_phone, payer_email: o.payer_email,
    match_method: o.match_method, invoice_number: o.invoice_number, invoice_url: o.invoice_url,
    capi_purchase_event_id: o.capi_purchase_event_id, capi_purchase_sent_at: o.capi_purchase_sent_at,
    capi_purchase_result: o.capi_purchase_result, commission_ils: o.commission_ils, commission_status: o.commission_status,
    capi_lead_result: o.capi_lead_result, capi_lead_sent_at: o.capi_lead_sent_at, capi_last_error_code: o.capi_last_error_code,
    ga_session_id: o.ga_session_id,
    grow_paid_at: o.grow_paid_at, revenue_net_ils: o.revenue_net_ils, fee_ils: o.fee_ils,
    refund_amount: o.refund_amount, refunded_at: o.refunded_at, credit_doc_number: o.credit_doc_number,
    recon_status: o.recon_status, recon_source: o.recon_source, recon_at: o.recon_at,
    fbc: o.fbc, fbp: o.fbp, event_id: o.lead_event_id, visitor_id: o.visitor_id, session_id: o.session_id,
  };
  const out = {} as Record<SheetColumn, string>;
  for (const [k, v] of Object.entries(cols)) out[k as SheetColumn] = cell(v);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Phones, GA client id, fbc
// ---------------------------------------------------------------------------------------------

/** "05XXXXXXXX" for an Israeli mobile in any common spelling (+972-50..., 972 050..., 050-...), else null. */
export function normalizeIsraeliMobile(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("9720")) d = d.slice(4);
  else if (d.startsWith("972")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^5\d{8}$/.test(d) ? "0" + d : null;
}

/** Grow accepts only Israeli mobiles (02 section 4). */
export function isIsraeliMobile(phone: unknown): boolean {
  return normalizeIsraeliMobile(phone) !== null;
}

/** "9725XXXXXXXX" (the form Meta hashes), or null. */
export function israeliMobileE164Digits(phone: unknown): string | null {
  const n = normalizeIsraeliMobile(phone);
  return n ? "972" + n.slice(1) : null;
}

/** `_ga` cookie "GA1.1.123.456" -> "123.456". */
export function parseGaClientId(cookieValue: unknown): string | null {
  if (typeof cookieValue !== "string") return null;
  const m = /^GA\d\.\d+\.(\d+\.\d+)$/.exec(cookieValue.trim());
  return m ? m[1] : null;
}

/** The GA4 stream cookie that carries the session id (measurement id G-W3Z965PSD0). */
export const GA_SESSION_COOKIE = "_ga_W3Z965PSD0";

/** A GA4 session id: the session start in Unix seconds, digits only (PLAN.md Stage 6). */
export function isGaSessionId(v: unknown): v is string {
  return typeof v === "string" && /^\d{6,12}$/.test(v);
}

/**
 * Session id from the `_ga_<stream>` cookie, in either form:
 *   GS1: "GS1.1.1730000000.5.1.1730000100.0.0.0"  (the third field)
 *   GS2: "GS2.1.s1730000000$o5$g1$t1730000100$j0$l0$h0"  (the `s` field)
 * Anything else, or a value that is not 6-12 digits, is null.
 */
export function parseGaSessionId(cookieValue: unknown): string | null {
  if (typeof cookieValue !== "string") return null;
  const v = cookieValue.trim();
  let id: string | undefined;
  const gs1 = /^GS1\.\d+\.(\d+)(?:\.|$)/.exec(v);
  if (gs1) id = gs1[1];
  else {
    const gs2 = /^GS2\.\d+\.(.+)$/.exec(v);
    if (gs2) id = gs2[1].split("$").find((p) => /^s\d+$/.test(p))?.slice(1);
  }
  return isGaSessionId(id) ? id : null;
}

/** Meta fbc format: fb.1.<creation ms>.<fbclid>. */
export function buildFbc(fbclid: string, creationMs: number): string {
  return `fb.1.${Math.floor(creationMs)}.${fbclid}`;
}

/** The fbclid part of an fbc value, or null when it is not one. */
export function fbcClickId(fbc: unknown): string | null {
  if (typeof fbc !== "string") return null;
  const parts = fbc.split(".");
  if (parts.length < 4 || parts[0] !== "fb" || !/^\d+$/.test(parts[2])) return null;
  return parts.slice(3).join(".") || null;
}
