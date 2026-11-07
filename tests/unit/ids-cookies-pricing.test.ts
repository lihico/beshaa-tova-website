import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  newVisitorId, adoptVisitorId, newOrderId, isOrderId, ORDER_ID_RE, yymmJerusalem, newTouchId, leadEventId, purchaseEventId,
} from "../../api/_ids.ts";
import {
  parseCookieHeader, readCookie, serializeCookie, appendSetCookie, visitorCookie, attCookie, fbcCookie,
  readAttCookie, readVisitorCookie, fbcForClick, cookieDomainFor, isLocalRequest,
} from "../../api/_cookies.ts";
import { PRICES_2026_10, PRICES_2026_11, priceOrder, resolvePromo, isPartnerActive, activePrices } from "../../api/_pricing.ts";
import { parseTouch, type Partner } from "../../api/_attribution_core.ts";

describe("ids", () => {
  test("visitor id: v_ + 22 base64url chars, unique", () => {
    const a = newVisitorId(), b = newVisitorId();
    assert.match(a, /^v_[A-Za-z0-9_-]{22}$/);
    assert.notEqual(a, b);
  });
  test("adoptVisitorId: cookie, then the localStorage UUID, then new", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    assert.deepEqual(adoptVisitorId("v_AAAAAAAAAAAAAAAAAAAAAA", uuid), { visitor_id: "v_AAAAAAAAAAAAAAAAAAAAAA", source: "cookie" });
    assert.deepEqual(adoptVisitorId(null, uuid), { visitor_id: uuid, source: "local_storage" });
    const n = adoptVisitorId("junk", "<script>");
    assert.equal(n.source, "new");
    assert.match(n.visitor_id, /^v_/);
  });
  test("touch id format", () => assert.match(newTouchId(), /^t_[0-9A-HJKMNP-TV-Z]{12}$/));
  test("order id: BT + yymm (Israel) + 6 Crockford chars, never a voucher code", async () => {
    const id = await newOrderId({ getOrder: async () => null }, { now: new Date("2026-11-05T12:00:00Z") });
    assert.match(id, ORDER_ID_RE);
    assert.ok(id.startsWith("BT2611"));
    assert.equal(isOrderId(id), true);
    assert.equal(isOrderId("BST-2005-0UGA"), false);
    assert.equal(isOrderId("BT-2611-7KQ3"), false);
    assert.equal(isOrderId("BT2611K7Q3XI"), false, "I is not Crockford");
  });
  test("the month flips at Israeli midnight", () => {
    assert.equal(yymmJerusalem(new Date("2026-10-31T22:30:00Z")), "2611");
    assert.equal(yymmJerusalem(new Date("2026-10-31T21:30:00Z")), "2610");
  });
  test("newOrderId retries on a clash and gives up after maxTries", async () => {
    const seen = new Set(["BT2611AAAAAA"]);
    const seq = ["AAAAAA", "BBBBBB"];
    const id = await newOrderId({ getOrder: async (x) => (seen.has(x) ? {} : null) },
      { now: new Date("2026-11-05T12:00:00Z"), random: () => seq.shift() as string });
    assert.equal(id, "BT2611BBBBBB");
    await assert.rejects(newOrderId({ getOrder: async () => ({}) }, { maxTries: 3 }), /3 clashes/);
  });
  test("event ids", () => {
    assert.equal(leadEventId("BT2611K7Q3XA"), "lead_BT2611K7Q3XA");
    assert.equal(purchaseEventId("BT2611K7Q3XA"), "purchase_BT2611K7Q3XA");
  });
});

class FakeRes {
  headers: Record<string, string | string[]> = {};
  getHeader(n: string) { return this.headers[n.toLowerCase()]; }
  setHeader(n: string, v: string | string[]) { this.headers[n.toLowerCase()] = v; }
}
const req = (host: string, cookie = "") => ({ headers: { host, cookie } });

describe("cookies", () => {
  test("parse and read", () => {
    assert.deepEqual(parseCookieHeader("a=1; b=x%20y; a=2; junk"), { a: "1", b: "x y" });
    assert.equal(readCookie(req("localhost:5173", "_fbc=fb.1.1.X; bsh_vid=v_1"), "_fbc"), "fb.1.1.X");
    assert.equal(readCookie({ headers: {}, cookies: { x: "1" } }, "x"), "1");
    assert.equal(readCookie(req("localhost"), "nope"), null);
  });
  test("localhost: no Secure, no Domain; HttpOnly for bsh_vid, not for _fbc", () => {
    const r = req("localhost:5173");
    assert.equal(isLocalRequest(r), true);
    const v = visitorCookie(r, "v_AAAAAAAAAAAAAAAAAAAAAA");
    assert.equal(v, "bsh_vid=v_AAAAAAAAAAAAAAAAAAAAAA; Path=/; Max-Age=34560000; SameSite=Lax; HttpOnly");
    const f = fbcCookie(r, "fb.1.1730000000000.IwAR_X");
    assert.ok(f.includes("Max-Age=7776000") && !f.includes("HttpOnly") && !f.includes("Secure"));
  });
  test("production: Secure always; Domain only when the host is inside COOKIE_DOMAIN", () => {
    const prev = process.env.COOKIE_DOMAIN;
    process.env.COOKIE_DOMAIN = ".beshaa-tova.co.il";
    try {
      const prod = req("www.beshaa-tova.co.il");
      assert.equal(cookieDomainFor(prod), ".beshaa-tova.co.il");
      assert.ok(visitorCookie(prod, "v_AAAAAAAAAAAAAAAAAAAAAA").endsWith("Domain=.beshaa-tova.co.il; HttpOnly; Secure"));
      const preview = req("bshaah-tovah-git-x.vercel.app");
      assert.equal(cookieDomainFor(preview), null);
      assert.ok(visitorCookie(preview, "v_AAAAAAAAAAAAAAAAAAAAAA").endsWith("HttpOnly; Secure"));
      assert.equal(cookieDomainFor(req("localhost:5173")), null);
    } finally {
      if (prev === undefined) delete process.env.COOKIE_DOMAIN; else process.env.COOKIE_DOMAIN = prev;
    }
  });
  test("serializeCookie refuses unsafe values", () => {
    assert.throws(() => serializeCookie("a", "x;y", { maxAge: 1, httpOnly: true, secure: false, sameSite: "Lax" }));
  });
  test("appendSetCookie keeps earlier Set-Cookie lines", () => {
    const res = new FakeRes();
    appendSetCookie(res, "a=1");
    appendSetCookie(res, "b=2");
    assert.deepEqual(res.getHeader("Set-Cookie"), ["a=1", "b=2"]);
  });
  test("bsh_att round trip through Set-Cookie -> Cookie", () => {
    const t = parseTouch("http://localhost:5173/?ref=grp-p4-g07", null, "localhost:5173");
    const sc = attCookie(req("localhost:5173"), { first: t, last: t }) as string;
    const value = sc.split(";")[0];
    const back = readAttCookie(req("localhost:5173", value));
    assert.equal(back?.last?.ref, "grp-p4-g07");
    assert.equal(attCookie(req("localhost"), { first: null, last: null }), null);
    assert.equal(readVisitorCookie(req("localhost", "bsh_vid=junk")), null);
  });
  test("fbcForClick keeps an existing _fbc with the same fbclid", () => {
    const keep = fbcForClick(req("localhost", "_fbc=fb.1.1700000000000.IwAR_X"), "IwAR_X", 1800000000000);
    assert.deepEqual(keep, { value: "fb.1.1700000000000.IwAR_X", set: false });
    const fresh = fbcForClick(req("localhost", "_fbc=fb.1.1700000000000.IwAR_OLD"), "IwAR_X", 1800000000000);
    assert.deepEqual(fresh, { value: "fb.1.1800000000000.IwAR_X", set: true });
  });
});

const partner: Partner = {
  partner_id: "testcreator", code: "TESTCREATOR10", name: "Test Creator", platform: "instagram", handle: "@testcreator",
  commission_type: "percent", commission_value: 15, buyer_discount_pct: 10, active: true, fp_ref_id: null,
};
const lookup = (p: Partner | null) => ({ getPartnerByCode: async (c: string) => (p && p.code === c ? p : null) });

describe("pricing", () => {
  const OLD = PRICES_2026_10, NEW = PRICES_2026_11;
  const order = (allMeetings: boolean, pct: number | null, express = false) =>
    ({ kind: "order" as const, allMeetings, promo: pct === null ? null : { discount_pct: pct }, freeVoucher: false, express });
  test("2026-10 table (live until NEW_PRICES=1): unchanged amounts and rules", () => {
    assert.deepEqual(priceOrder(order(false, null), OLD), { amount: 320, rule: "base_320", express: 0 });
    assert.deepEqual(priceOrder(order(true, null), OLD), { amount: 370, rule: "all_370", express: 0 });
    assert.deepEqual(priceOrder(order(false, 10), OLD), { amount: 288, rule: "promo10_288", express: 0 });
    assert.deepEqual(priceOrder(order(true, 10), OLD), { amount: 333, rule: "promo10_333", express: 0 });
    assert.deepEqual(priceOrder(order(false, 15), OLD), { amount: 272, rule: "promo15_272", express: 0 });
    assert.deepEqual(priceOrder(order(false, null, true), OLD), { amount: 320, rule: "base_320", express: 0 }, "no express in the old table");
    assert.deepEqual(priceOrder({ kind: "order", allMeetings: true, promo: null, freeVoucher: true }, OLD), { amount: 0, rule: "voucher_free", express: 0 });
    assert.deepEqual(priceOrder({ kind: "gift", allMeetings: true, promo: { discount_pct: 10 }, freeVoucher: false }, OLD), { amount: 320, rule: "gift_320", express: 0 });
  });
  test("2026-11 table (Lihi 2.11.2026): 349 / 410, codes 5%, gift = kit price; express +50 when switched on", () => {
    assert.deepEqual(priceOrder(order(false, null), NEW), { amount: 349, rule: "base_349", express: 0 });
    assert.deepEqual(priceOrder(order(true, null), NEW), { amount: 410, rule: "all_410", express: 0 });
    // Express is off for now (Lihi, 4.11.2026): asking for it changes nothing.
    assert.deepEqual(priceOrder(order(false, null, true), NEW), { amount: 349, rule: "base_349", express: 0 });
    const EXP = { ...NEW, express: 50 };
    assert.deepEqual(priceOrder(order(false, null, true), EXP), { amount: 399, rule: "base_349+express_50", express: 50 });
    assert.deepEqual(priceOrder(order(true, null, true), EXP), { amount: 460, rule: "all_410+express_50", express: 50 });
    assert.deepEqual(priceOrder(order(false, 5), NEW), { amount: 332, rule: "promo5_332", express: 0 });
    assert.deepEqual(priceOrder(order(true, 5), NEW), { amount: 390, rule: "promo5_390", express: 0 });
    assert.deepEqual(priceOrder(order(false, 5, true), EXP), { amount: 382, rule: "promo5_332+express_50", express: 50 });
    assert.deepEqual(priceOrder(order(true, 5, true), EXP), { amount: 440, rule: "promo5_390+express_50", express: 50 });
    assert.deepEqual(priceOrder({ kind: "gift", allMeetings: false, promo: null, freeVoucher: false }, NEW), { amount: 349, rule: "gift_349", express: 0 });
    assert.deepEqual(priceOrder({ kind: "gift", allMeetings: true, promo: null, freeVoucher: false, express: true }, NEW), { amount: 410, rule: "gift_all_410", express: 0 });
    assert.deepEqual(priceOrder({ kind: "order", allMeetings: false, promo: null, freeVoucher: true, express: true }, NEW), { amount: 0, rule: "voucher_free", express: 0 });
  });
  test("NEW_PRICES picks the table at call time", () => {
    const saved = process.env.NEW_PRICES;
    try {
      delete process.env.NEW_PRICES;
      assert.equal(activePrices().id, "2026-10");
      process.env.NEW_PRICES = "1";
      assert.equal(activePrices().id, "2026-11");
      assert.equal(priceOrder(order(false, null)).amount, 349);
    } finally {
      if (saved === undefined) delete process.env.NEW_PRICES; else process.env.NEW_PRICES = saved;
    }
  });
  test("resolvePromo, 2026-10: built-in, friend, partner (registry %), unknown", async () => {
    const t = { table: OLD };
    assert.deepEqual(await resolvePromo(" student2026 ", t), { code: "STUDENT2026", discount_pct: 10, partner_id: null, referral: null, source: "builtin" });
    assert.deepEqual(await resolvePromo("Tamar-Roi-gift", t), { code: "tamar-roi-gift", discount_pct: 10, partner_id: null, referral: "frd-tamar-roi", source: "friend" });
    assert.deepEqual(await resolvePromo("testcreator10", { ...lookup(partner), ...t }),
      { code: "TESTCREATOR10", discount_pct: 10, partner_id: "testcreator", referral: null, source: "partner" });
    assert.equal(await resolvePromo("TESTCREATOR10", t), null, "no store wired: partner codes do not resolve");
    assert.equal(await resolvePromo("TESTCREATOR10", { ...lookup({ ...partner, active: false }), ...t }), null);
    assert.equal(await resolvePromo("NOPE123", { ...lookup(partner), ...t }), null);
    assert.equal(await resolvePromo("BST-2005-0UGA", { ...lookup(partner), ...t }), null);
    assert.equal(await resolvePromo("", { ...lookup(partner), ...t }), null);
    assert.equal(await resolvePromo(null, t), null);
  });
  test("resolvePromo, 2026-11: STUDENT2026 and partner codes 5% (registry % ignored), friend codes stay 10%", async () => {
    const t = { table: NEW };
    assert.equal((await resolvePromo("STUDENT2026", t))?.discount_pct, 5);
    assert.equal((await resolvePromo("TESTCREATOR10", { ...lookup(partner), ...t }))?.discount_pct, 5);
    assert.equal((await resolvePromo("tamar-roi-gift", t))?.discount_pct, 10);
  });
  test("partner date window (Israel date, inclusive)", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    assert.equal(isPartnerActive({ active: true, start: "2026-11-01", end: "2026-11-30" }, now), true);
    assert.equal(isPartnerActive({ active: true, start: "2026-11-02" }, now), false);
    assert.equal(isPartnerActive({ active: true, end: "2026-10-31" }, now), false);
    assert.equal(isPartnerActive({ active: true, end: "2026-10-31" }, new Date("2026-10-31T22:30:00Z")), false, "already 1.11 in Israel");
  });
});
