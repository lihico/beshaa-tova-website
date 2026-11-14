/**
 * The lite kit (4 meetings, 199) and two kits with the second 25% off (SITE_CHANGES_2026-11-14 P2/P3, O1/O2).
 * Pure: the price table, the cost table and the COGS meeting count.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PRICES_2026_10, PRICES_2026_11, TIER_MEETINGS, isKitTier, kitPrice, pairAmounts, pairOptions, pairQuote, quote, tierFor, tierOfRule,
} from "../../api/_price_table.ts";
import { priceOrder } from "../../api/_pricing.ts";
import { breakEvenCac, costFor, weightedBreakEvenCac } from "../../api/_cost_table.ts";
import { meetingsOf } from "../../scripts/cogs-sync.ts";

const T = PRICES_2026_11;

describe("lite kit (4 meetings)", () => {
  test("199, 189 with a 5% code, rules say lite", () => {
    assert.deepEqual(quote(T, { kind: "order", allMeetings: false, tier: "lite" }), { amount: 199, rule: "lite_199", full: 199, kit: 199, express: 0, pct: 0 });
    const q = quote(T, { kind: "order", allMeetings: false, tier: "lite", discountPct: 5 });
    assert.equal(q.amount, 189);
    assert.equal(q.rule, "lite_promo5_189");
  });
  test("lite gift voucher 199 (gift_lite_199); 8 and 11 vouchers unchanged", () => {
    assert.equal(quote(T, { kind: "gift", allMeetings: false, tier: "lite" }).rule, "gift_lite_199");
    assert.equal(quote(T, { kind: "gift", allMeetings: false, tier: "base" }).rule, "gift_349");
    assert.equal(quote(T, { kind: "gift", allMeetings: true }).rule, "gift_all_410");
  });
  test("a free voucher stays free whatever the tier", () => {
    assert.equal(quote(T, { kind: "order", allMeetings: false, tier: "lite", freeVoucher: true }).amount, 0);
  });
  test("the old table has no lite: a lite request prices as base", () => {
    assert.equal(tierFor(PRICES_2026_10, { kind: "order", allMeetings: false, tier: "lite" }), "base");
    assert.equal(quote(PRICES_2026_10, { kind: "order", allMeetings: false, tier: "lite" }).amount, 320);
  });
  test("tier wins over allMeetings; old callers without tier keep working", () => {
    assert.equal(quote(T, { kind: "order", allMeetings: true, tier: "lite" }).amount, 199);
    assert.equal(quote(T, { kind: "order", allMeetings: true }).amount, 410);
    assert.equal(priceOrder({ kind: "order", allMeetings: false, tier: "lite", promo: null, freeVoucher: false }, T).amount, 199);
  });
  test("tierOfRule / isKitTier / TIER_MEETINGS", () => {
    assert.equal(tierOfRule("lite_199"), "lite");
    assert.equal(tierOfRule("lite_promo5_189"), "lite");
    assert.equal(tierOfRule("gift_lite_199"), "lite");
    assert.equal(tierOfRule("all_410"), "all");
    assert.equal(tierOfRule("gift_all_410"), "all");
    assert.equal(tierOfRule("base_349"), "base");
    assert.equal(tierOfRule("promo5_332"), null);
    assert.equal(isKitTier("lite"), true);
    assert.equal(isKitTier("x"), false);
    assert.deepEqual(TIER_MEETINGS, { lite: 4, base: 8, all: 11 });
    assert.equal(kitPrice(T, "lite"), 199);
  });
});

describe("two kits, the cheaper one 25% off", () => {
  test("611 / 672 / 718, two lites 348 (Lihi's figures)", () => {
    assert.deepEqual(pairOptions(T).map(({ a, b, q }) => [a, b, q.full, q.amount]), [
      ["all", "all", 820, 718], ["all", "base", 759, 672], ["base", "base", 698, 611], ["lite", "lite", 398, 348],
    ]);
  });
  test("order of the two kits does not matter; the dearer one is full price", () => {
    assert.deepEqual(pairQuote(T, "base", "all"), pairQuote(T, "all", "base"));
    assert.equal(pairQuote(T, "base", "all")!.second, 262);
    assert.equal(pairQuote(T, "lite", "all")!.amount, 410 + 149);
  });
  test("no pair offer under the old table", () => {
    assert.equal(pairQuote(PRICES_2026_10, "base", "base"), null);
    assert.deepEqual(pairAmounts(PRICES_2026_10), []);
  });
  test("pairAmounts labels the saving", () => {
    assert.match(pairAmounts(T).find((p) => p.amount === 611)!.label, /8\+8 \(698 - 87\)/);
  });
});

describe("lite in the cost table and reports", () => {
  test("rate card has a 4-meeting print estimate and list price 199", () => {
    const c = costFor({ kind: "kit", meetings: 4 });
    assert.equal(c.gross_ils, 199);
    assert.equal(c.lines.find((l) => l.key === "print")!.ils, 83.8);
    assert.ok(c.contribution_ils > 0, "a shipped lite kit still covers its COGS");
    assert.ok(breakEvenCac(4) < breakEvenCac(8));
  });
  test("weighted break-even counts lite kits", () => {
    assert.equal(weightedBreakEvenCac(0, 0, "conservative", 10), breakEvenCac(4));
    assert.equal(weightedBreakEvenCac(5, 5), weightedBreakEvenCac(5, 5, "conservative", 0));
  });
  test("meetingsOf: lite rules and small redemptions are 4", () => {
    const o = (p: Record<string, unknown>) => ({ order_id: "BT2611AAAA01", order_kind: "order", payment_status: "paid", amount_expected: 199,
      price_rule: "lite_199", paid_amount: 199, paid_at: null, created_at: "2026-11-15T08:00:00Z", ...p }) as Parameters<typeof meetingsOf>[0];
    assert.equal(meetingsOf(o({})), 4);
    assert.equal(meetingsOf(o({ price_rule: "lite_promo5_189" })), 4);
    assert.equal(meetingsOf(o({ order_kind: "redeem", price_rule: "voucher_free", meetings: ["02", "03", "05", "13"] })), 4);
    assert.equal(meetingsOf(o({ order_kind: "redeem", price_rule: "voucher_free", meetings: ["02", "03", "05", "06", "07", "08", "09", "13"] })), 8);
    assert.equal(meetingsOf(o({ price_rule: "base_349" })), 8);
    assert.equal(meetingsOf(o({ price_rule: "all_410" })), 11);
  });
});
