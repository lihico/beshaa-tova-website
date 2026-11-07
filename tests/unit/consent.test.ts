// Cookie consent (00_DESIGN 15, PLAN Stage 7): src/lib/consent.ts, the index.html defaults, and the order's
// consent_marketing. Browser globals are shimmed in memory; no network.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

class MemStorage {
  m = new Map<string, string>();
  throwing = false;
  getItem(k: string) { if (this.throwing) throw new Error("blocked"); return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string) { if (this.throwing) throw new Error("blocked"); this.m.set(k, String(v)); }
  clear() { this.m.clear(); this.throwing = false; }
}

const g = globalThis as unknown as Record<string, unknown>;
const store = new MemStorage();
const fbqCalls: unknown[][] = [];
const gtagCalls: unknown[][] = [];
g.localStorage = store;
g.fbq = (...a: unknown[]) => { fbqCalls.push(a); };
g.gtag = (...a: unknown[]) => { gtagCalls.push(a); };

const consent = await import("../../src/lib/consent.ts");
const { consentOf } = await import("../../api/_order_build.ts");

const indexHtml = readFileSync(fileURLToPath(new URL("../../index.html", import.meta.url)), "utf8");

beforeEach(() => {
  store.clear();
  fbqCalls.length = 0;
  gtagCalls.length = 0;
});

describe("consent.ts", () => {
  test("no choice: the bar shows and the order sends unknown", () => {
    assert.equal(consent.readConsent(), null);
    assert.equal(consent.needsConsentChoice(), true);
    assert.equal(consent.consentForOrder(), "unknown");
  });

  test("decline: remembered, Pixel revoke, gtag update denied on all four, order sends denied", () => {
    consent.setConsent("denied", 1700000000000);
    assert.deepEqual(JSON.parse(store.getItem(consent.CONSENT_KEY) as string), { v: "denied", t: 1700000000000 });
    assert.deepEqual(fbqCalls, [["consent", "revoke"]]);
    assert.deepEqual(gtagCalls, [["consent", "update", {
      ad_storage: "denied", analytics_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    }]]);
    assert.equal(consent.needsConsentChoice(), false);
    assert.equal(consent.consentForOrder(), "denied");
  });

  test("accept: Pixel grant, gtag update granted, order sends granted", () => {
    consent.setConsent("granted");
    assert.deepEqual(fbqCalls, [["consent", "grant"]]);
    assert.equal((gtagCalls[0][2] as Record<string, string>).ad_user_data, "granted");
    assert.equal(consent.consentForOrder(), "granted");
  });

  test("blocked storage: no throw, trackers still told, order sends unknown", () => {
    store.throwing = true;
    assert.doesNotThrow(() => consent.setConsent("denied"));
    assert.deepEqual(fbqCalls, [["consent", "revoke"]]);
    assert.equal(consent.readConsent(), null);
    assert.equal(consent.consentForOrder(), "unknown");
  });

  test("garbage in storage reads as no choice; a bare string value is accepted", () => {
    store.setItem(consent.CONSENT_KEY, "{not json");
    assert.equal(consent.readConsent(), null);
    store.setItem(consent.CONSENT_KEY, JSON.stringify({ v: "maybe" }));
    assert.equal(consent.readConsent(), null);
    store.setItem(consent.CONSENT_KEY, "granted");
    assert.equal(consent.readConsent(), "granted");
  });

  test("missing fbq/gtag (ad blocker) is fine", () => {
    const f = g.fbq, t = g.gtag;
    delete g.fbq; delete g.gtag;
    try { assert.doesNotThrow(() => consent.setConsent("granted")); }
    finally { g.fbq = f; g.gtag = t; }
  });
});

describe("index.html consent defaults", () => {
  const inline = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const consentScript = inline.find((s) => s.includes("'consent', 'default'")) as string;

  test("key and unknown policy match consent.ts", () => {
    assert.ok(consentScript, "consent default script present");
    assert.match(consentScript, new RegExp(`CONSENT_KEY = '${consent.CONSENT_KEY}'`));
    assert.match(consentScript, new RegExp(`UNKNOWN_POLICY = '${consent.UNKNOWN_POLICY}'`));
  });

  test("order: consent default, then Pixel revoke check, then fbq init, then gtag config", () => {
    const iDefault = indexHtml.indexOf("'consent', 'default'");
    const iRevoke = indexHtml.indexOf("fbq('consent', 'revoke')");
    const iInit = indexHtml.indexOf("fbq('init'");
    const iConfig = indexHtml.indexOf("gtag('config'");
    assert.ok(iDefault > 0 && iDefault < iRevoke && iRevoke < iInit && iInit < iConfig);
  });

  function runDefaults(stored: string | null) {
    const dataLayer: unknown[] = [];
    const w: Record<string, unknown> = {
      dataLayer,
      localStorage: { getItem: (k: string) => (k === consent.CONSENT_KEY ? stored : null) },
    };
    runInNewContext(consentScript, { window: w, JSON });
    const args = Array.from(dataLayer[0] as ArrayLike<unknown>);
    return { state: w.__bshConsent, args };
  }

  test("unknown visitor: policy default with wait_for_update", () => {
    const { state, args } = runDefaults(null);
    assert.equal(state, consent.UNKNOWN_POLICY);
    assert.equal(args[0], "consent");
    assert.equal(args[1], "default");
    const d = args[2] as Record<string, unknown>;
    for (const k of ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]) assert.equal(d[k], consent.UNKNOWN_POLICY);
    assert.equal(d.wait_for_update, 500);
  });

  test("returning decliner: denied default before any tag, and the Pixel revoke flag is set", () => {
    const { state, args } = runDefaults(JSON.stringify({ v: "denied", t: 1 }));
    assert.equal(state, "denied");
    const d = args[2] as Record<string, unknown>;
    assert.equal(d.ad_storage, "denied");
    assert.equal(d.ad_user_data, "denied");
    assert.equal(d.wait_for_update, undefined);
  });

  test("storage that throws falls back to the policy", () => {
    const dataLayer: unknown[] = [];
    const w: Record<string, unknown> = { dataLayer, localStorage: { getItem: () => { throw new Error("blocked"); } } };
    runInNewContext(consentScript, { window: w, JSON });
    assert.equal(w.__bshConsent, consent.UNKNOWN_POLICY);
  });
});

describe("order record consent_marketing", () => {
  test("granted and denied pass through; anything else is unknown", () => {
    assert.equal(consentOf("granted"), "granted");
    assert.equal(consentOf("denied"), "denied");
    assert.equal(consentOf("unknown"), "unknown");
    assert.equal(consentOf(undefined), "unknown");
    assert.equal(consentOf("GRANTED"), "unknown");
    assert.equal(consentOf({ v: "granted" }), "unknown");
  });
});

describe("tracking after a decline (reviewer, 7.11)", () => {
  test("trackFunnel sends no /api/track CAPI mirror once the visitor declined; it does when granted", async () => {
    const posted: string[] = [];
    const prevFetch = g.fetch;
    g.fetch = (async (u: string) => { posted.push(String(u)); return { ok: true }; }) as unknown;
    try {
      // A computed specifier keeps the DOM-typed tracking.ts out of the harness typecheck (no DOM lib there).
      const trackingPath = "../../src/lib/tracking.ts";
      const { trackFunnel } = (await import(trackingPath)) as { trackFunnel: (a: { event: string }) => string };
      store.clear();
      consent.setConsent("denied", 1);
      trackFunnel({ event: "ViewContent" });
      assert.deepEqual(posted, []);
      consent.setConsent("granted", 2);
      trackFunnel({ event: "ViewContent" });
      assert.deepEqual(posted, ["/api/track"]);
    } finally {
      g.fetch = prevFetch;
    }
  });
});

import { isSystemTestBody } from "../../api/_order_build.ts";
test("debug / system-test orders are recognised (Lihi 7.11.2026)", () => {
  assert.equal(isSystemTestBody({ test: true }), true);
  assert.equal(isSystemTestBody({ freeText: "בדיקת מערכת (debug)" }), true);
  assert.equal(isSystemTestBody({ notes: "משהו | בדיקת מערכת" }), true);
  assert.equal(isSystemTestBody({ test: "true", freeText: "רגיל" }), false);
  assert.equal(isSystemTestBody({}), false);
});
