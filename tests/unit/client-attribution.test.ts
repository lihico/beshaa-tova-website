// Client attribution + payment helpers (slice 6). Browser globals are shimmed in memory; no network.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const g = globalThis as unknown as Record<string, unknown>;
const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
let serverAnswer: unknown = null;

function shim(href: string, referrer = "") {
  const u = new URL(href);
  g.window = globalThis;
  Object.defineProperty(globalThis, "location", { value: { href: u.href, host: u.host, search: u.search, origin: u.origin, hostname: u.hostname }, configurable: true, writable: true });
  Object.defineProperty(globalThis, "document", { value: { referrer, cookie: "_ga=GA1.1.111.222; other=x" }, configurable: true, writable: true });
}

g.localStorage = new MemStorage();
g.sessionStorage = new MemStorage();
g.fetch = async (url: string, init: { body: string }) => {
  calls.push({ url, body: JSON.parse(init.body) });
  return { ok: true, json: async () => serverAnswer } as unknown as Response;
};
shim("https://beshaa-tova.co.il/");

const attr = await import("../../src/lib/attribution.ts");
const pay = await import("../../src/lib/payment.ts");
const ids = await import("../../api/_ids.ts");

const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  (g.localStorage as MemStorage).clear();
  (g.sessionStorage as MemStorage).clear();
  calls.length = 0;
  serverAnswer = null;
});

describe("captureTouch", () => {
  test("a tracked landing is stored as first and last, and posted to /api/touch", async () => {
    shim("https://beshaa-tova.co.il/?utm_source=fb&utm_medium=paid_social&aid=1202&fbclid=abc", "https://l.facebook.com/");
    attr.captureTouch();
    const s = attr.getAttributionState();
    assert.equal(s.first?.meta_ad_id, "1202");
    assert.equal(s.last?.channel, "paid_meta");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/touch");
    assert.equal(calls[0].body.internal, false);
    assert.deepEqual(attr.getAttribution(), { utm_source: "fb", utm_medium: "paid_social" });
  });

  test("a direct load changes nothing and pings once per session", async () => {
    shim("https://beshaa-tova.co.il/about");
    attr.captureTouch();
    shim("https://beshaa-tova.co.il/faq");
    attr.captureTouch();
    assert.equal(attr.getAttributionState().first, null);
    assert.equal(calls.length, 1);
  });

  test("the same href is captured once (StrictMode, re-renders)", async () => {
    shim("https://beshaa-tova.co.il/?ref=grp-x1");
    attr.captureTouch();
    attr.captureTouch();
    assert.equal(calls.length, 1);
    assert.equal(attr.getAttributionState().touches.length, 1);
  });

  test("an internal SPA link merges into last and keeps first (cafe overwrite fix)", async () => {
    shim("https://beshaa-tova.co.il/cafe/tre?utm_source=cafe&utm_campaign=tre_table");
    attr.captureTouch();
    shim("https://beshaa-tova.co.il/order?ref=tre");
    attr.captureTouch({ url: location.href, referrer: location.origin + "/", internal: true });
    const s = attr.getAttributionState();
    assert.equal(s.first?.utm_campaign, "tre_table");
    assert.equal(s.first?.ref, null);
    assert.equal(s.last?.utm_campaign, "tre_table");
    assert.equal(s.last?.ref, "tre");
    assert.equal(s.last?.channel, "cafe_partner");
  });

  test("the server's visitor id is copied to localStorage", async () => {
    serverAnswer = { visitor_id: "v_AAAAAAAAAAAAAAAAAAAAAA", first: null, last: null, touches: [] };
    shim("https://beshaa-tova.co.il/?ref=pst-a1");
    attr.captureTouch();
    await tick();
    assert.equal((g.localStorage as MemStorage).getItem("bsh_visitor_id"), "v_AAAAAAAAAAAAAAAAAAAAAA");
    assert.equal(attr.getAttributionState().visitor_id, "v_AAAAAAAAAAAAAAAAAAAAAA");
    assert.equal(attr.getAttributionState().first?.ref, "pst-a1");
  });

  test("storage that throws never breaks capture", async () => {
    const ls = g.localStorage;
    g.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    shim("https://beshaa-tova.co.il/?ref=org-z");
    assert.doesNotThrow(() => attr.captureTouch());
    assert.equal(attr.getAttributionState().first, null);
    g.localStorage = ls;
  });

  test("hasTrackedParams and getGaClientId", () => {
    assert.equal(attr.hasTrackedParams("?ref=x"), true);
    assert.equal(attr.hasTrackedParams("?adset=1"), true);
    assert.equal(attr.hasTrackedParams("?preview=conversion&flow=gift"), false);
    assert.equal(attr.getGaClientId(), "111.222");
  });

  test("getGaSessionId reads _ga_W3Z965PSD0 in GS1 and GS2 form (PLAN Stage 6)", () => {
    const doc = globalThis.document as unknown as { cookie: string };
    const before = doc.cookie;
    doc.cookie = "_ga=GA1.1.111.222; _ga_W3Z965PSD0=GS2.1.s1762500000$o3$g1$t1762500100$j0$l0$h0";
    assert.equal(attr.getGaSessionId(), "1762500000");
    doc.cookie = "_ga_W3Z965PSD0=GS1.1.1730000000.5.1.1730000100.0.0.0; x=1";
    assert.equal(attr.getGaSessionId(), "1730000000");
    doc.cookie = "_ga_OTHER=GS1.1.1730000000.5.1; _ga_W3Z965PSD0=junk";
    assert.equal(attr.getGaSessionId(), null);
    doc.cookie = "_ga=GA1.1.111.222";
    assert.equal(attr.getGaSessionId(), null);
    doc.cookie = before;
  });
});

describe("GA4 user property bsh_vid (PLAN Stage 6)", () => {
  test("initTracking sets user_properties.bsh_vid once per id, and not on denied consent", async () => {
    const tracking = await import("../../src/lib/tracking.ts");
    const consent = await import("../../src/lib/consent.ts");
    const gtagCalls: unknown[][] = [];
    g.gtag = (...a: unknown[]) => { gtagCalls.push(a); };
    try {
      (g.localStorage as MemStorage).setItem(consent.CONSENT_KEY, JSON.stringify({ v: "denied", t: 1 }));
      (g.localStorage as MemStorage).setItem("bsh_visitor_id", "v_AAAAAAAAAAAAAAAAAAAAAA");
      tracking.initTracking();
      assert.equal(gtagCalls.filter((c) => c[0] === "set").length, 0, "nothing on denied");
      (g.localStorage as MemStorage).removeItem(consent.CONSENT_KEY);
      tracking.initTracking();
      tracking.setGaVisitorProperty();
      const sets = gtagCalls.filter((c) => c[0] === "set");
      assert.deepEqual(sets, [["set", "user_properties", { bsh_vid: "v_AAAAAAAAAAAAAAAAAAAAAA" }]]);
      (g.localStorage as MemStorage).setItem("bsh_visitor_id", "v_BBBBBBBBBBBBBBBBBBBBBB");
      tracking.setGaVisitorProperty();
      assert.equal(gtagCalls.filter((c) => c[0] === "set").length, 2, "a new id is sent again");
    } finally {
      delete g.gtag;
    }
  });
});

describe("payment helpers", () => {
  test("isPaymentUrl accepts https and the local fake Grow only", () => {
    assert.equal(pay.isPaymentUrl("https://pay.grow.link/abc"), true);
    assert.equal(pay.isPaymentUrl("http://127.0.0.1:3001/_mock/grow/pay/1"), true);
    assert.equal(pay.isPaymentUrl("http://evil.example/pay"), false);
    assert.equal(pay.isPaymentUrl("javascript:alert(1)"), false);
    assert.equal(pay.isPaymentUrl(null), false);
  });

  test("ORDER_ID_RE matches the server's order ids", async () => {
    const store = { getOrder: async () => null } as unknown as Parameters<typeof ids.newOrderId>[0];
    const id = await ids.newOrderId(store);
    assert.match(id, pay.ORDER_ID_RE);
    assert.equal(pay.ORDER_ID_RE.test("BST-2005-0UGA"), false);
  });

  test("claimPurchaseOnce fires once per order", () => {
    assert.equal(pay.claimPurchaseOnce("BT2611K7Q3XA"), true);
    assert.equal(pay.claimPurchaseOnce("BT2611K7Q3XA"), false);
    assert.equal(pay.claimPurchaseOnce("BT2611K7Q3XB"), true);
  });

  test("rememberOrder / readLastOrder only for the same order id", () => {
    pay.rememberOrder({ order_id: "BT2611K7Q3XC", kind: "order", names: ["a", "b"] });
    assert.deepEqual(pay.readLastOrder("BT2611K7Q3XC")?.names, ["a", "b"]);
    assert.equal(pay.readLastOrder("BT2611K7Q3XD"), null);
  });
});
