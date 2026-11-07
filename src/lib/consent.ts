/**
 * Cookie consent (docs/attribution/00_DESIGN.md 15; PLAN Stage 7).
 *
 * One remembered choice in localStorage: "granted" or "denied". No choice yet = "unknown".
 * index.html reads the same key before the Pixel and gtag start, so a returning visitor's choice
 * is applied before the first event; this module applies a choice made on the page (ConsentBar)
 * and tells the order form what to send as consent_marketing (the server skips CAPI on "denied").
 *
 * Written against globalThis (not window/localStorage types) so it type-checks without the DOM lib,
 * and every storage access is in try/catch (private mode, blocked site data).
 */

export type ConsentChoice = "granted" | "denied";
export type ConsentMarketing = ConsentChoice | "unknown";

/** Must equal CONSENT_KEY in index.html (tests/unit/consent.test.ts checks). */
export const CONSENT_KEY = "bsh_consent_v1";

/**
 * What the trackers do before the visitor chooses. Must equal UNKNOWN_POLICY in index.html.
 * "granted": measure until "לא, תודה" (the server already treats unknown as allowed, PLAN Stage 7).
 * "denied": nothing ad-related until "אישור". One-line switch here and in index.html.
 */
export const UNKNOWN_POLICY: ConsentChoice = "granted";

interface StoredConsent { v: ConsentChoice; t: number }

interface ConsentGlobals {
  localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem?(k: string): void };
  dispatchEvent?: (e: unknown) => boolean;
  Event?: new (type: string) => unknown;
  fbq?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
}

const g = globalThis as unknown as ConsentGlobals;

function isChoice(v: unknown): v is ConsentChoice {
  return v === "granted" || v === "denied";
}

/** The remembered choice, or null when there is none (or storage is unavailable). */
export function readConsent(): ConsentChoice | null {
  try {
    const raw = g.localStorage?.getItem(CONSENT_KEY);
    if (!raw) return null;
    if (isChoice(raw)) return raw;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    return isChoice(parsed?.v) ? parsed.v : null;
  } catch {
    return null;
  }
}

/** The value the order form sends as consent_marketing. */
export function consentForOrder(): ConsentMarketing {
  return readConsent() ?? "unknown";
}

/** Whether the bar should show: only while no choice is remembered. */
export function needsConsentChoice(): boolean {
  return readConsent() === null;
}

/** Google Consent Mode v2 fields for a choice. */
export function consentModeFields(choice: ConsentChoice): Record<string, ConsentChoice> {
  return { ad_storage: choice, analytics_storage: choice, ad_user_data: choice, ad_personalization: choice };
}

/**
 * Apply a choice made on the page: remember it (best effort), then Meta Pixel grant/revoke and a
 * gtag consent update. Missing fbq/gtag (blocked by an ad blocker) is fine.
 */
export function setConsent(choice: ConsentChoice, now: number = Date.now()): void {
  try {
    g.localStorage?.setItem(CONSENT_KEY, JSON.stringify({ v: choice, t: now } satisfies StoredConsent));
  } catch {
    // not remembered: the bar shows again next visit, which is acceptable
  }
  try {
    g.fbq?.("consent", choice === "granted" ? "grant" : "revoke");
  } catch { /* ignore */ }
  try {
    g.gtag?.("consent", "update", consentModeFields(choice));
  } catch { /* ignore */ }
}

/** Window event the footer's "cookie settings" link fires; ConsentBar listens and reopens. */
export const CONSENT_REOPEN_EVENT = "bsh:consent-reopen";

/**
 * The footer's "cookie settings" link (00_DESIGN 15: a footer link to change the choice).
 * Forgets the remembered choice (best effort), then asks ConsentBar to show again.
 * The trackers keep the current state until the visitor picks again; nothing is granted or revoked here.
 */
export function reopenConsent(): void {
  // The saved choice is kept (Claude for Lihi, 7.11.2026): a visitor who said no stays "denied" until
  // they pick again in the reopened bar, so reopening alone never turns measurement back on.
  try {
    if (g.dispatchEvent && g.Event) g.dispatchEvent(new g.Event(CONSENT_REOPEN_EVENT));
  } catch { /* ignore */ }
}
