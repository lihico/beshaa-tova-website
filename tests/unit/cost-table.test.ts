/**
 * Cost table (api/_cost_table.ts) and cogs-sync (scripts/cogs-sync.ts).
 * Pins every per-variant figure of PLAN.md section 4.2, the break-even CAC of 4.3, the fixed monthly
 * costs, and the 7-kit invoice fit from bookkeeping/cogs_ledger.json (964.32 invoiced vs 947 modelled).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CYBERCAMP_2026_11, FIXED_MONTHLY_ILS, RATE_CARDS, VAT_RATE, VERCEL_PRO_MONTHLY_ILS, WORKING_TARGET_CAC_ILS, WORKING_TARGET_FACTOR,
  breakEvenCac, costFor, fixedPerOrder, growFee, growMonthlyOverage, printFromPages, rateCardFor, revenueExVat, round1,
  weightedBreakEvenCac, type Basis, type Meetings,
} from "../../api/_cost_table.ts";
import {
  COST_HEADERS, COST_TAB, ArgError, WriteRefused, buildCostRows, costRow, loadFixture, loadPages, meetingsOf, parseArgs,
  parseEnvFile, run, writeCostRows, type CostRow, type CostTabWriter,
} from "../../scripts/cogs-sync.ts";

const WEBSITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEDGER = path.resolve(WEBSITE, "..", "bookkeeping", "cogs_ledger.json");
const NOW = new Date("2026-11-20T10:00:00Z");

/** Within one agora of rounding: an increment of two values each rounded to the agora. */
const near = (actual: number, expected: number, msg?: string) => assert.ok(Math.abs(actual - expected) <= 0.011, msg ?? `${actual} vs ${expected}`);

const kit = (meetings: Meetings, basis: Basis = "conservative", extra: Parameters<typeof costFor>[1] = {}) =>
  costFor({ kind: "kit", meetings }, { basis, ...extra });

describe("VAT and revenue ex-VAT", () => {
  test("VAT is 18%", () => assert.equal(VAT_RATE, 0.18));
  test("revenueExVat pins PLAN 4.2", () => {
    assert.equal(revenueExVat(349), 295.76);
    assert.equal(revenueExVat(332), 281.36);
    assert.equal(revenueExVat(410), 347.46);
    assert.equal(revenueExVat(390), 330.51);
    assert.equal(revenueExVat(50), 42.37);
    assert.equal(revenueExVat(0), 0);
    assert.equal(revenueExVat(-5), 0);
    assert.equal(revenueExVat(Number.NaN), 0);
  });
});

describe("rate card cybercamp-2026-11 (PLAN 4.1)", () => {
  const c = CYBERCAMP_2026_11;
  test("lines", () => {
    assert.equal(c.id, "cybercamp-2026-11");
    assert.equal(c.effective_from, "2026-11-02");
    assert.equal(c.bw_sheet, 0.5);
    assert.equal(c.colour_sheet, 1.5);
    assert.equal(c.cover, 12);
    assert.equal(c.covers_per_kit, 3);
    assert.equal(c.single_set_surcharge, 0.25);
    assert.equal(c.blessing_and_friend_card, 4.0);
    assert.deepEqual(c.packaging, { conservative: 5.1, lean: 3.0 });
    assert.deepEqual(c.pens_and_bag, { conservative: 14.8, lean: 0 });
    assert.equal(c.registered_post, 24.5);
    assert.equal(c.express_voucher, 50);
    assert.equal(c.express_no_voucher, 68.25);
    assert.equal(c.ran_handling, 12);
    assert.equal(c.grow.pct, 0.01);
    assert.equal(c.grow.min_fee, 0.5);
    assert.equal(c.grow.refund, 6.9);
    assert.equal(c.grow.chargeback, 55);
    assert.equal(c.make_per_order, 0);
    assert.deepEqual(c.list_price, { 8: 349, 11: 410 });
  });
  test("default print figures follow from the mean page counts", () => {
    assert.equal(printFromPages(c.default_pages[8], c, true), 120.0);
    assert.equal(round1(printFromPages(c.default_pages[11], c, true)), 147.2);   // 147.15
    assert.equal(c.default_print[8], 120.0);
    assert.equal(c.default_print[11], 147.2);
  });
  test("whole sheets for real booklets", () => {
    assert.equal(printFromPages({ couple: 72, personal: 60 }), 120);
    assert.equal(printFromPages({ couple: 73, personal: 61 }), 37 * 1.5 + 2 * 31 * 0.5 + 36);
  });
  test("rateCardFor by date", () => {
    assert.equal(RATE_CARDS.length >= 1, true);
    assert.deepEqual(rateCardFor("2026-11-07"), { card: c, before_first: false });
    assert.deepEqual(rateCardFor("2026-11-02T00:00:00Z"), { card: c, before_first: false });
    assert.deepEqual(rateCardFor("2026-07-01"), { card: c, before_first: true });
    assert.deepEqual(rateCardFor(null), { card: c, before_first: false });
    assert.equal(costFor({ kind: "kit", meetings: 8 }, { date: "2026-07-01" }).card_before_first, true);
  });
});

describe("Grow fees", () => {
  test("1% with a 0.50 floor, nothing on 0", () => {
    assert.equal(growFee(349), 3.49);
    assert.equal(growFee(410), 4.1);
    assert.equal(growFee(20), 0.5);
    assert.equal(growFee(0), 0);
  });
  test("overage above 20 transactions and 20 documents", () => {
    assert.equal(growMonthlyOverage(20, 20), 0);
    assert.equal(growMonthlyOverage(23, 21), 4);
  });
});

describe("PLAN 4.2 per-variant COGS and contribution", () => {
  const pin = (b: ReturnType<typeof costFor>, cogs: number, contribution: number) => {
    assert.equal(round1(b.cogs_ils), cogs, `cogs ${b.cogs_ils}`);
    assert.equal(round1(b.contribution_ils), contribution, `contribution ${b.contribution_ils}`);
  };
  test("8 meetings, shipped: 171.9 / 155.0, contribution 123.9 / 140.8", () => {
    const c = kit(8);
    assert.equal(c.gross_ils, 349);
    assert.equal(c.revenue_ex_vat, 295.76);
    assert.equal(c.fee_ils, 3.49);
    assert.deepEqual(c.lines.map((l) => [l.key, l.ils]), [
      ["print", 120], ["blessing_card", 4], ["packaging", 5.1], ["pens_bag", 14.8], ["shipping", 24.5], ["grow_fee", 3.49],
    ]);
    pin(c, 171.9, 123.9);
    pin(kit(8, "lean"), 155.0, 140.8);
  });
  test("8 meetings, 5% code (332): 171.7 / 154.8, contribution 109.6 / 126.5", () => {
    const c = kit(8, "conservative", { discountPct: 5 });
    assert.equal(c.gross_ils, 332);
    assert.equal(c.revenue_ex_vat, 281.36);
    pin(c, 171.7, 109.6);
    pin(kit(8, "lean", { discountPct: 5 }), 154.8, 126.5);
    pin(kit(8, "conservative", { gross: 332 }), 171.7, 109.6);
  });
  test("11 meetings, shipped: 199.7 / 182.8, contribution 147.8 / 164.7", () => {
    const c = kit(11);
    assert.equal(c.gross_ils, 410);
    assert.equal(c.revenue_ex_vat, 347.46);
    assert.equal(c.fee_ils, 4.1);
    pin(c, 199.7, 147.8);
    pin(kit(11, "lean"), 182.8, 164.7);
  });
  test("11 meetings, 5% code (390): 199.5 / 182.6, contribution 131.0 / 147.9", () => {
    const c = kit(11, "conservative", { discountPct: 5 });
    assert.equal(c.gross_ils, 390);
    assert.equal(c.revenue_ex_vat, 330.51);
    pin(c, 199.5, 131.0);
    pin(kit(11, "lean", { discountPct: 5 }), 182.6, 147.9);
  });
  test("single kit (not batched): +30.0 (8m) / +36.8 (11m); contribution 93.9 (8m) / 111.0 (11m)", () => {
    for (const basis of ["conservative", "lean"] as const) {
      assert.equal(round1(kit(8, basis, { batched: false }).cogs_ils - kit(8, basis).cogs_ils), 30.0);
      assert.equal(round1(kit(11, basis, { batched: false }).cogs_ils - kit(11, basis).cogs_ils), 36.8);
    }
    assert.equal(round1(kit(8, "conservative", { batched: false }).contribution_ils), 93.9);
    assert.equal(round1(kit(11, "conservative", { batched: false }).contribution_ils), 111.0);
  });
  test("cafe pickup: -24.5 COGS, +24.5 contribution", () => {
    for (const m of [8, 11] as const) for (const basis of ["conservative", "lean"] as const) {
      assert.equal(round1(kit(m, basis).cogs_ils - kit(m, basis, { shipping: "pickup" }).cogs_ils), 24.5);
      assert.equal(round1(kit(m, basis, { shipping: "pickup" }).contribution_ils - kit(m, basis).contribution_ils), 24.5);
    }
  });
  test("express add-on: +50 gross, +42.37 ex-VAT, +25.50 voucher +0.50 fee, +16.37 with voucher, -1.88 without", () => {
    const base = kit(8);
    const ev = kit(8, "conservative", { shipping: "express_voucher" });
    const en = kit(8, "conservative", { shipping: "express_no_voucher" });
    assert.equal(ev.gross_ils - base.gross_ils, 50);
    assert.equal(round1(ev.revenue_ex_vat - base.revenue_ex_vat), 42.4);
    near(ev.revenue_ex_vat - base.revenue_ex_vat, 42.37);   // 338.14 - 295.76 = 42.38; 50 / 1.18 = 42.37
    const ship = (b: typeof ev) => b.lines.find((l) => l.key === "shipping")!.ils;
    assert.equal(ship(ev) - ship(base), 25.5);
    assert.equal(Math.round((ev.fee_ils - base.fee_ils) * 100) / 100, 0.5);
    near(ev.contribution_ils - base.contribution_ils, 16.37);
    near(en.contribution_ils - base.contribution_ils, -1.88);
    // 11 meetings: the same increments (fee 1% of 50 either way).
    near(kit(11, "conservative", { shipping: "express_voucher" }).contribution_ils - kit(11).contribution_ils, 16.37);
  });
  test("gift voucher sale: Grow fee only, 3.49 / 4.10", () => {
    const g8 = costFor({ kind: "gift_sale", meetings: 8 });
    const g11 = costFor({ kind: "gift_sale", meetings: 11 });
    assert.equal(g8.gross_ils, 349);
    assert.equal(g8.revenue_ex_vat, 295.76);
    assert.equal(g8.cogs_ils, 3.49);
    assert.equal(g8.kit_cogs_ils, 0);
    assert.equal(g8.shipping, null);
    assert.deepEqual(g8.lines.map((l) => l.key), ["grow_fee"]);
    assert.equal(g11.revenue_ex_vat, 347.46);
    assert.equal(g11.cogs_ils, 4.1);
  });
  test("gift redemption (amount 0): 168.4 / 195.6 conservative, 151.5 / 178.7 lean, no fee", () => {
    const r = (m: Meetings, basis: Basis) => costFor({ kind: "gift_redeem", meetings: m }, { basis, gross: 999 });
    assert.equal(r(8, "conservative").gross_ils, 0);
    assert.equal(r(8, "conservative").fee_ils, 0);
    assert.equal(r(8, "conservative").revenue_ex_vat, 0);
    assert.equal(round1(r(8, "conservative").cogs_ils), 168.4);
    assert.equal(round1(r(11, "conservative").cogs_ils), 195.6);
    assert.equal(round1(r(8, "lean").cogs_ils), 151.5);
    assert.equal(round1(r(11, "lean").cogs_ils), 178.7);
    // Pair margin = gift revenue - redeem COGS - gift fee = the shipped-kit contribution.
    const pair = costFor({ kind: "gift_sale", meetings: 8 }).contribution_ils + r(8, "conservative").contribution_ils;
    assert.equal(round1(pair), 123.9);
  });
  test("Ran handling only when Ran ships", () => {
    assert.equal(round1(kit(8, "conservative", { ranShips: true }).cogs_ils - kit(8).cogs_ils), 12);
  });
  test("real page counts replace the default print line", () => {
    const b = kit(11, "conservative", { pages: { couple: 102, personal: 88 } });
    assert.equal(b.lines[0].ils, 156.5);
  });
  test("no line is NaN and the sum equals cogs", () => {
    for (const m of [8, 11] as const) for (const basis of ["conservative", "lean"] as const) {
      const b = kit(m, basis, { batched: false, shipping: "express_no_voucher", ranShips: true });
      assert.ok(b.lines.every((l) => Number.isFinite(l.ils)));
      assert.equal(Math.round(b.lines.reduce((s, l) => s + l.ils, 0) * 100) / 100, b.cogs_ils);
    }
  });
});

describe("PLAN 4.3 break-even CAC", () => {
  test("124 (8 meetings) / 148 (11 meetings), conservative", () => {
    assert.equal(breakEvenCac(8), 124);
    assert.equal(breakEvenCac(11), 148);
  });
  test("lean break-even", () => {
    assert.equal(breakEvenCac(8, "lean"), 141);
    assert.equal(breakEvenCac(11, "lean"), 165);
  });
  test("working target 0.6 x break-even, about 75", () => {
    assert.equal(WORKING_TARGET_FACTOR, 0.6);
    assert.equal(WORKING_TARGET_CAC_ILS, 75);
    assert.ok(Math.abs(WORKING_TARGET_FACTOR * breakEvenCac(8) - WORKING_TARGET_CAC_ILS) <= 1);
  });
  test("mix-weighted break-even only from 10 paid kits", () => {
    assert.equal(weightedBreakEvenCac(3, 6), 124);
    assert.equal(weightedBreakEvenCac(5, 5), Math.round((kit(8).contribution_ils + kit(11).contribution_ils) / 2));
    assert.equal(weightedBreakEvenCac(0, 10), 148);
  });
  test("decision 7.8 defaults: 171.9 / 199.7", () => {
    assert.equal(round1(kit(8).cogs_ils), 171.9);
    assert.equal(round1(kit(11).cogs_ils), 199.7);
  });
});

describe("fixed monthly costs", () => {
  test("Grow 29 + domain 6.17 = 35.2", () => {
    assert.equal(FIXED_MONTHLY_ILS.grow_light, 29);
    assert.equal(FIXED_MONTHLY_ILS.domain, 6.17);
    assert.equal(round1(FIXED_MONTHLY_ILS.total), 35.2);
  });
  test("Vercel Pro about 74; per order at 10 a month about 3.5 (about 11 with Pro)", () => {
    assert.equal(Math.round(VERCEL_PRO_MONTHLY_ILS), 74);
    assert.equal(round1(fixedPerOrder(10)), 3.5);
    assert.equal(Math.round(fixedPerOrder(10, true)), 11);
    assert.equal(fixedPerOrder(0), 0);
  });
});

describe("cogs_ledger.json: the 7-kit invoice fit", () => {
  type Kit = { kit: string; pages: { couple: number; personal: number }; model_print_ils: number; inferred: boolean };
  type Inv = { invoice: string; net_ils: number; vat_ils: number; gross_ils: number; kits: Kit[]; candidate_kits?: Kit[] };
  const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8")) as {
    invoices: Inv[];
    fits: Array<{ id: string; invoices: string[]; kits: string[]; invoiced_net_ils: number; model_print_ils: number; inferred: boolean }>;
  };
  const fit = ledger.fits.find((f) => f.id === "fit-2026-06-to-08")!;
  test("964.32 invoiced vs 947 modelled, within 10%", () => {
    assert.ok(fit);
    assert.equal(fit.kits.length, 7);
    assert.equal(fit.invoices.length, 5);
    assert.equal(fit.invoiced_net_ils, 964.32);
    assert.equal(fit.model_print_ils, 947);
    assert.equal(fit.inferred, true);
    assert.ok(Math.abs(fit.invoiced_net_ils - fit.model_print_ils) / fit.model_print_ils < 0.1);
  });
  test("the fit recomputes from the ledger with the rate card", () => {
    const inv = ledger.invoices.filter((i) => fit.invoices.includes(i.invoice));
    assert.equal(Math.round(inv.reduce((s, i) => s + i.net_ils, 0) * 100) / 100, 964.32);
    const kits = inv.flatMap((i) => i.kits);
    assert.deepEqual(kits.map((k) => k.kit).sort(), [...fit.kits].sort());
    for (const k of kits) {
      assert.equal(k.inferred, true);
      assert.equal(printFromPages(k.pages), k.model_print_ils, k.kit);
    }
    assert.equal(kits.reduce((s, k) => s + printFromPages(k.pages), 0), 947);
  });
  test("every invoice adds up, and no kit mapping is unmarked", () => {
    for (const i of ledger.invoices) {
      assert.equal(Math.round((i.net_ils + i.vat_ils) * 100) / 100, i.gross_ils, i.invoice);
      for (const k of [...i.kits, ...(i.candidate_kits ?? [])]) assert.equal(k.inferred, true, `${i.invoice} ${k.kit}`);
    }
    const nov = ledger.invoices.find((i) => i.invoice === "4-109663")!;
    assert.equal(nov.net_ils, 262.71);
    assert.deepEqual(nov.kits, []);   // Lihi says which kits it covered (PLAN.md:204)
  });
  test("the ledger holds no phone, email or money-less PII fields", () => {
    const text = fs.readFileSync(LEDGER, "utf8");
    assert.doesNotMatch(text, /@/);
    assert.doesNotMatch(text, /0\d{1,2}-?\d{7}/);
    assert.doesNotMatch(text, /"(phone|email|address|buyer)"/);
  });
});

// ---------------------------------------------------------------------------------------------
// cogs-sync
// ---------------------------------------------------------------------------------------------

const PII = { buyer: { name: "Dana Cohen", phone: "0521234567", email: "dana@example.com" }, couple: { name1: "Dana", name2: "Yoni" }, client_ip: "10.1.2.3" };
function ord(id: string, p: Record<string, unknown> = {}) {
  return {
    order_id: id, order_kind: "order", created_at: "2026-11-10T09:00:00Z", payment_status: "paid",
    amount_expected: 349, price_rule: "base_349", paid_amount: 349, paid_at: "2026-11-10T10:00:00Z", ...PII, ...p,
  } as unknown as Parameters<typeof costRow>[0];
}
const FIXTURE = [
  ord("BT2611AAAA01"),
  ord("BT2611AAAA02", { amount_expected: 390, paid_amount: 390, price_rule: "promo5_390", all_meetings: true }),
  ord("BT2611AAAA03", { order_kind: "gift", amount_expected: 410, paid_amount: 410, price_rule: "gift_all_410" }),
  ord("BT2611AAAA04", { order_kind: "redeem", amount_expected: 0, paid_amount: null, payment_status: "free", price_rule: "voucher_free", paid_at: null }),
  ord("BT2611AAAA05", { payment_status: "pending", paid_amount: null, paid_at: null }),
  ord("BT2611TEST01"),
  ord("BT2611AAAA06", { payment_status: "cancelled" }),
  ord("BT2611AAAA07", { amount_expected: 399, paid_amount: 399, price_rule: "base_349+express_50", express_ils: 50 }),
];

describe("cogs-sync rows", () => {
  const rows = buildCostRows(FIXTURE, { basis: "conservative", now: NOW });
  const by = (id: string) => rows.find((r) => r.order_id === id)!;
  test("only paid, free and refunded orders; tests excluded", () => {
    assert.deepEqual(rows.map((r) => r.order_id), ["BT2611AAAA01", "BT2611AAAA02", "BT2611AAAA03", "BT2611AAAA04", "BT2611AAAA07"]);
  });
  test("dry run reproduces section 4 per variant", () => {
    assert.equal(by("BT2611AAAA01").variant, "kit_8m");
    assert.equal(round1(Number(by("BT2611AAAA01").cogs_ils)), 171.9);
    assert.equal(round1(Number(by("BT2611AAAA01").contribution_ils)), 123.9);
    assert.equal(by("BT2611AAAA02").variant, "kit_11m");
    assert.equal(round1(Number(by("BT2611AAAA02").cogs_ils)), 199.5);
    assert.equal(round1(Number(by("BT2611AAAA02").contribution_ils)), 131.0);
    assert.equal(by("BT2611AAAA03").variant, "gift_sale_11m");
    assert.equal(by("BT2611AAAA03").cogs_ils, 4.1);
    assert.equal(by("BT2611AAAA03").pages_source, "");
    assert.equal(by("BT2611AAAA04").variant, "gift_redeem_8m");
    assert.equal(round1(Number(by("BT2611AAAA04").cogs_ils)), 168.4);
    assert.equal(by("BT2611AAAA04").gross_ils, 0);
    assert.equal(by("BT2611AAAA07").shipping, "express_voucher");
    near(Number(by("BT2611AAAA07").contribution_ils) - Number(by("BT2611AAAA01").contribution_ils), 16.37);
  });
  test("every row has exactly the tab headers", () => {
    for (const r of rows) assert.deepEqual(Object.keys(r), [...COST_HEADERS]);
  });
  test("rows never carry PII", () => {
    const text = JSON.stringify(rows);
    for (const s of ["Dana", "Yoni", "0521234567", "@", "10.1.2.3"]) assert.ok(!text.includes(s), s);
  });
  test("date range filter and test id list", () => {
    assert.equal(buildCostRows(FIXTURE, { basis: "lean", now: NOW, from: "2026-11-11" }).length, 0);
    assert.equal(buildCostRows(FIXTURE, { basis: "lean", now: NOW, testIds: new Set(["BT2611AAAA01"]) }).length, 4);
  });
  test("page counts per order", () => {
    const r = buildCostRows([ord("BT2611AAAA09", { all_meetings: true, price_rule: "all_410", paid_amount: 410 })], {
      basis: "conservative", now: NOW, pages: { BT2611AAAA09: { couple: 102, personal: 88 } },
    })[0];
    assert.equal(r.print_ils, 156.5);
    assert.equal(r.pages_source, "page_counts");
  });
  test("meetings from the price rule or meetings list", () => {
    assert.equal(meetingsOf(ord("X", { price_rule: "all_410" })), 11);
    assert.equal(meetingsOf(ord("X", { price_rule: "base_349" })), 8);
    assert.equal(meetingsOf(ord("X", { price_rule: "voucher_free", meetings: Array.from({ length: 11 }, (_, i) => String(i)) })), 11);
  });
});

describe("cogs-sync args and write guard", () => {
  test("defaults to a dry run", () => {
    const a = parseArgs([], {});
    assert.equal(a.write, false);
    assert.equal(a.source, "file");
  });
  test("--write refuses fixture or file sources", () => {
    assert.throws(() => parseArgs(["--write"], {}), ArgError);
    assert.throws(() => parseArgs(["--write", "--fixture", "x.json"], {}), ArgError);
    assert.throws(() => parseArgs(["--source", "sheet", "--fixture", "x.json"], {}), ArgError);
    assert.equal(parseArgs(["--write", "--source", "sheet"], {}).write, true);
    assert.throws(() => parseArgs(["--basis", "cheap"], {}), ArgError);
    assert.throws(() => parseArgs(["--from", "7.11.2026"], {}), ArgError);
  });
  const rows = buildCostRows(FIXTURE, { basis: "conservative", now: NOW });
  const fake = (headers: string[] | null) => {
    const calls: CostRow[][] = [];
    const w: CostTabWriter = { headers: async () => headers, upsert: async (r) => { calls.push(r); return { inserted: r.length, updated: 0 }; } };
    return { w, calls };
  };
  test("refuses when the tab does not exist", async () => {
    const { w, calls } = fake(null);
    await assert.rejects(writeCostRows(rows, w), (e: unknown) => e instanceof WriteRefused && e.message.includes(COST_TAB));
    assert.equal(calls.length, 0);
  });
  test("refuses when headers are missing", async () => {
    const { w, calls } = fake(["order_id", "cogs_ils"]);
    await assert.rejects(writeCostRows(rows, w), WriteRefused);
    assert.equal(calls.length, 0);
  });
  test("writes when the tab and headers exist", async () => {
    const { w, calls } = fake([...COST_HEADERS]);
    assert.deepEqual(await writeCostRows(rows, w), { inserted: 5, updated: 0 });
    assert.equal(calls[0].length, 5);
  });
  test("--source sheet refuses until the sheet loader exists", async () => {
    const mod = (await import("../../scripts/report-lib/load.ts")) as Record<string, unknown>;
    if (typeof mod.loadSheetReportData === "function") return;   // built by Stage 1.5; covered there
    await assert.rejects(run(["--source", "sheet"], { out: () => {} }), ArgError);
    await assert.rejects(run(["--source", "sheet", "--write"], { out: () => {}, writer: async () => fake([...COST_HEADERS]).w }), ArgError);
  });
  test("parseEnvFile", () => {
    assert.deepEqual(parseEnvFile("# c\nexport A_B=1\nC='x y'\nD=\"z\"\nbad line\n"), { A_B: "1", C: "x y", D: "z" });
  });
});

describe("cogs-sync CLI dry run (fixture)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cogs-sync-"));
  const fx = path.join(tmp, "orders.json");
  fs.writeFileSync(fx, JSON.stringify({ orders: FIXTURE }));
  test("loadFixture: array, {orders}, jsonl", () => {
    assert.equal(loadFixture(fx).length, FIXTURE.length);
    const arr = path.join(tmp, "arr.json");
    fs.writeFileSync(arr, JSON.stringify(FIXTURE.slice(0, 2)));
    assert.equal(loadFixture(arr).length, 2);
    const jl = path.join(tmp, "orders.jsonl");
    fs.writeFileSync(jl, [
      JSON.stringify({ op: "insert", order_id: "BT2611AAAA01", data: { ...FIXTURE[0], payment_status: "pending" } }),
      "torn{",
      JSON.stringify({ op: "update", order_id: "BT2611AAAA01", data: { payment_status: "paid" } }),
    ].join("\n"));
    const o = loadFixture(jl);
    assert.equal(o.length, 1);
    assert.equal(o[0].payment_status, "paid");
  });
  test("loadPages averages the two personal booklets", () => {
    const pf = path.join(tmp, "page_counts.json");
    fs.writeFileSync(pf, JSON.stringify({ A: { couple: 94, personal1: 80, personal2: 82 }, B: { couple: 70 } }));
    assert.deepEqual(loadPages(pf), { A: { couple: 94, personal: 81 } });
  });
  test("run() prints rows and never PII", async () => {
    let out = "";
    assert.equal(await run(["--fixture", fx], { out: (s) => { out += s; }, now: NOW }), 0);
    assert.match(out, /dry run/);
    assert.match(out, /BT2611AAAA01/);
    assert.doesNotMatch(out, /BT2611TEST01|BT2611AAAA05/);
    for (const s of ["Dana", "Yoni", "0521234567", "@", "10.1.2.3"]) assert.ok(!out.includes(s), s);
    let json = "";
    await run(["--fixture", fx, "--json", "--basis", "lean"], { out: (s) => { json += s; }, now: NOW });
    const j = JSON.parse(json);
    assert.equal(j.tab, COST_TAB);
    assert.equal(j.dry_run, true);
    assert.equal(round1(j.rows.find((r: CostRow) => r.order_id === "BT2611AAAA01").cogs_ils), 155.0);
  });
  test("the CLI runs as a script and refuses --write on a fixture", () => {
    const tsx = path.join(WEBSITE, "node_modules", ".bin", "tsx");
    const ok = spawnSync(tsx, ["scripts/cogs-sync.ts", "--fixture", fx], { cwd: WEBSITE, encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /BT2611AAAA07/);
    assert.ok(!ok.stdout.includes("0521234567"));
    const bad = spawnSync(tsx, ["scripts/cogs-sync.ts", "--fixture", fx, "--write"], { cwd: WEBSITE, encoding: "utf8" });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /refused/);
  });
});
