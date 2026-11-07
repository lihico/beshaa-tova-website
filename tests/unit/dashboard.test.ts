/**
 * PLAN.md marketing_machine_2026-11 Stage 4: decision maths (report-lib/bayes.ts) and the dashboard
 * data builder (scripts/dashboard-data.ts). Offline: the sheet rows are a fixture, nothing is fetched.
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CHIP, PRIOR_COST, adsetVerdicts, cpaInterval, earlyKill, mulberry32, paidVerdict, posterior, probBest, probZeroGiven,
  quantile, sampleGamma, sampleRates, type AdStats,
} from "../../scripts/report-lib/bayes.ts";
import {
  IL_PHONE_RE, NO_SPEND_MESSAGE, buildDashboard, namesIn, piiIssues, run as runDashboard, safeText, serializeDashboard, stripTouch,
} from "../../scripts/dashboard-data.ts";
import { buildReport } from "../../scripts/report-lib/build.ts";
import type { InsightRow, SpendData } from "../../scripts/report-lib/join.ts";
import { orderExtras, sheetDataFromRows, type SheetRow } from "../../scripts/report-lib/load.ts";

const NOW = new Date("2026-11-20T10:00:00Z");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// ---------------------------------------------------------------------------------------------
// bayes.ts
// ---------------------------------------------------------------------------------------------

describe("bayes: sampler and posterior", () => {
  test("mulberry32 is deterministic per seed", () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xa = [a(), a(), a()], xb = [b(), b(), b()], xc = [c(), c(), c()];
    assert.deepEqual(xa, xb);
    assert.notDeepEqual(xa, xc);
    for (const x of xa) assert.ok(x >= 0 && x < 1);
  });

  test("Marsaglia-Tsang draws have the Gamma mean and variance (shape >= 1 and the shape < 1 boost)", () => {
    for (const [shape, rate] of [[1, 124], [4, 324], [11, 165], [0.5, 2]] as const) {
      const r = sampleRates({ shape, rate }, 40000, mulberry32(7));
      const mean = r.reduce((s, x) => s + x, 0) / r.length;
      const v = r.reduce((s, x) => s + (x - mean) ** 2, 0) / r.length;
      assert.ok(Math.abs(mean / (shape / rate) - 1) < 0.03, `mean shape ${shape}`);
      assert.ok(Math.abs(v / (shape / rate ** 2) - 1) < 0.08, `variance shape ${shape}`);
    }
    assert.throws(() => sampleGamma(0, 1, mulberry32(1)));
  });

  test("posterior is Gamma(1 + k, prior_cost + S)", () => {
    assert.deepEqual(posterior(3, 200, 124), { shape: 4, rate: 324 });
    assert.deepEqual(posterior(0, 0, 15), { shape: 1, rate: 15 });
  });

  test("cpaInterval: 4000 draws, deterministic, prior-only median = prior_cost / ln 2", () => {
    const a = cpaInterval(0, 0, 124, { seed: 1 });
    const b = cpaInterval(0, 0, 124, { seed: 1 });
    assert.deepEqual(a, b);
    assert.equal(a.samples, 4000);
    assert.ok(Math.abs(a.median / (124 / Math.LN2) - 1) < 0.05, `median ${a.median}`);
    const c = cpaInterval(10, 150, 15, { seed: 2 });
    assert.ok(c.p05 < c.median && c.median < c.p95);
    assert.ok(c.median > 13 && c.median < 18, `median ${c.median}`);   // (15 + 150) / ~10.67
  });

  test("quantile, probBest and P(0 | true CAC)", () => {
    assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
    assert.equal(quantile([0, 10], 0.25), 2.5);
    const strong = sampleRates(posterior(20, 100, 15), 4000, mulberry32(3));
    const weak = sampleRates(posterior(2, 100, 15), 4000, mulberry32(4));
    const [pS, pW] = probBest([strong, weak]);
    assert.ok(pS > 0.95 && Math.abs(pS + pW - 1) < 1e-9);
    assert.ok(Math.abs(probZeroGiven(250, 124) - 0.133) < 0.002);   // PLAN 6.2: 13% at 250
    assert.ok(Math.abs(probZeroGiven(370, 124) - 0.0506) < 0.002);  // 5% at 370
  });
});

const ad = (p: Partial<AdStats> & Pick<AdStats, "id">): AdStats =>
  ({ spend: 0, impressions: 0, link_clicks: 0, lpv: 0, ic: 0, lead: 0, days_live: 3, ...p });

describe("bayes: verdict chips", () => {
  test("no spend and below the minimum are מוקדם מדי", () => {
    const v = adsetVerdicts([ad({ id: "a" }), ad({ id: "b", spend: 30, impressions: 2000, link_clicks: 40, lpv: 30, ic: 2 })], { seed: 5 });
    assert.equal(v.a.chip, CHIP.early);
    assert.deepEqual(v.a.reasons, ["no_spend"]);
    assert.equal(v.b.chip, CHIP.early);                           // 30 < 3 x 15
    assert.deepEqual(v.b.reasons, ["below_minimum"]);
    const fewImpr = adsetVerdicts([ad({ id: "c", spend: 50, impressions: 1200, link_clicks: 30, lpv: 25, ic: 3 })], { seed: 5 });
    assert.equal(fewImpr.c.code, "early");                        // spend is enough, impressions are not
  });

  test("the early-kill floor fires before the statistics", () => {
    assert.deepEqual(earlyKill(ad({ id: "x", spend: 41, impressions: 1600, link_clicks: 10, lpv: 3, ic: 0 })), ["kill_ctr", "kill_no_ic"]);
    assert.deepEqual(earlyKill(ad({ id: "x", spend: 20, impressions: 1000, link_clicks: 40, lpv: 10, ic: 1 })), ["kill_lpv"]);
    assert.deepEqual(earlyKill(ad({ id: "x", spend: 70, impressions: 3000, link_clicks: 60, lpv: 50, ic: 2, days_live: 7 })), ["kill_ic_cpa_day7"]);
    assert.deepEqual(earlyKill(ad({ id: "x", spend: 70, impressions: 3000, link_clicks: 60, lpv: 50, ic: 2, days_live: 6 })), []);
    const v = adsetVerdicts([ad({ id: "k", spend: 42, impressions: 900, link_clicks: 15, lpv: 12, ic: 0 })], { seed: 1 });
    assert.equal(v.k.chip, CHIP.replace);
    assert.deepEqual(v.k.reasons, ["kill_no_ic"]);
  });

  test("להחליף when P(CPA > 2 x target) > 0.8; מנצח when P(best) > 0.8 with 3+ conversions; else להמשיך", () => {
    const bad = adsetVerdicts([ad({ id: "bad", spend: 200, impressions: 6000, link_clicks: 120, lpv: 100, ic: 2 })], { seed: 9 });
    assert.equal(bad.bad.chip, CHIP.replace);
    assert.deepEqual(bad.bad.reasons, ["p_cpa_above_2x_target"]);
    assert.ok((bad.bad.p_replace ?? 0) > 0.8);

    const set = [
      ad({ id: "A", spend: 100, impressions: 5000, link_clicks: 100, lpv: 80, ic: 20 }),
      ad({ id: "B", spend: 100, impressions: 5000, link_clicks: 100, lpv: 80, ic: 5 }),
    ];
    const v1 = adsetVerdicts(set, { seed: 11 });
    const v2 = adsetVerdicts(set, { seed: 11 });
    assert.deepEqual(v1, v2);                                     // same seed, same verdicts
    assert.equal(v1.A.chip, CHIP.winner);
    assert.ok((v1.A.p_best ?? 0) > 0.8);
    assert.equal(v1.B.chip, CHIP.keep);
    assert.ok(v1.A.cpa && v1.A.cpa.median < v1.B.cpa!.median);
  });

  test("paid verdicts: no-sales stop, scale proposal, early", () => {
    const stop = paidVerdict(0, 260, { breakEven: 124, seed: 1 });
    assert.equal(stop.chip, CHIP.replace);
    assert.deepEqual(stop.reasons, ["no_sales_stop"]);
    assert.ok(Math.abs((stop.p_zero_at_break_even ?? 0) - 0.12) < 0.01);
    const scale = paidVerdict(8, 300, { breakEven: 124, seed: 1 });
    assert.equal(scale.chip, CHIP.winner);
    assert.ok(scale.cpa && scale.cpa.p95 < 124);
    assert.equal(paidVerdict(1, 100, { seed: 1 }).chip, CHIP.early);
    assert.equal(paidVerdict(0, 0).chip, CHIP.early);
    assert.equal(PRIOR_COST.paid, 124);
  });
});

// ---------------------------------------------------------------------------------------------
// dashboard-data.ts
// ---------------------------------------------------------------------------------------------

/** Rows that look like the live sheet, full of buyer data that must never reach data.json. */
const PII = {
  names: ["Yonatan Avrahami", "Michal Ben-David", "רונית שמואלי", "אביגיל", "Payer Personname"],
  phones: ["0521234567", "052-765-4321", "+972541112233"],
  emails: ["yonatan.a@gmail.com", "michal_bd@walla.co.il", "payer@example.org"],
  address: "רחוב הרצל 12 דירה 4, רמת גן",
  ip: "79.181.22.143",
};

function piiRows(): SheetRow[] {
  const base = (p: SheetRow): SheetRow => ({
    order_id: "", order_kind: "order", payment_status: "pending", amount_expected: "349", price_rule: "base_349",
    credit_rule: "last_touch", credited_channel: "paid_meta",
    "שם 1 (ממלא/ת)": PII.names[0], "שם 2": PII.names[1], "טלפון": PII.phones[0], "מייל": PII.emails[0],
    "כתובת מלאה": PII.address, client_ip: PII.ip, user_agent: "Mozilla/5.0 (iPhone)", fbc: "fb.1.123.abc", fbp: "fb.1.456.789",
    self_reported_source: `אינסטגרם, תתקשרו ${PII.phones[1]}`, "הערות": `לחזור ל${PII.names[2]}`,
    "תאריך הזמנה": "10.11.2026", touches_json: "", ...p,
  });
  return [
    base({
      order_id: "BT2611PAID01", payment_status: "paid", paid_amount: "349", paid_at: "2026-11-12T09:00:00.000Z",
      payer_name: PII.names[4], payer_phone: PII.phones[2], payer_email: PII.emails[2], payment_method: "bit",
      capi_purchase_result: "error:400", capi_lead_result: "ok:1", capi_lead_sent_at: "2026-11-10T18:30:00.000Z",
      lt_ts: "2026-11-10T18:00:00.000Z", lt_channel: "paid_meta", lt_utm_source: "ig", lt_utm_medium: "paid_social",
      lt_utm_campaign: `cyber ${PII.emails[1]}`, lt_meta_campaign_id: "120000000000000001", lt_meta_adset_id: "120000000000000002", lt_meta_ad_id: "120000000000000003",
      ft_ts: "2026-11-08T07:00:00.000Z", ft_channel: "organic_social", ft_utm_source: "instagram",
      "נשלח ללקוח": "TRUE", recon_status: "matched",
    }),
    base({
      order_id: "BT2611PEND02", "שם 1 (ממלא/ת)": PII.names[3], "טלפון": PII.phones[1], "מייל": PII.emails[1], "תאריך הזמנה": "15.11.2026",
      lt_ts: "2026-11-15T08:00:00.000Z", lt_channel: "paid_meta", lt_meta_campaign_id: "120000000000000001", lt_meta_adset_id: "120000000000000002", lt_meta_ad_id: "120000000000000004",
    }),
    base({ order_id: "BT2611QQQQ03", credited_channel: "direct", credit_rule: "none", "תאריך הזמנה": "19.11.2026", "נשלח ללקוח": "" }),
    base({ order_id: "BT2611TEST09", "הערות": "בדיקת מערכת" }),
  ];
}

const irow = (p: Partial<InsightRow> & Pick<InsightRow, "date_start" | "ad_id" | "spend">): InsightRow => ({
  date_stop: p.date_start, account_currency: "ILS", campaign_id: "120000000000000001", campaign_name: "cyber_test",
  adset_id: "120000000000000002", adset_name: "broad", ad_name: `ad ${p.ad_id.slice(-1)}`,
  impressions: 0, clicks: 0, inline_link_clicks: 0, ...p,
});

function spendFixture(): SpendData {
  const rows: InsightRow[] = [];
  for (const d of ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"]) {
    rows.push(irow({ date_start: d, ad_id: "120000000000000003", spend: 12, impressions: 700, inline_link_clicks: 14,
      actions: [{ action_type: "landing_page_view", value: 11 }, { action_type: "offsite_conversion.fb_pixel_initiate_checkout", value: 2 }, { action_type: "initiate_checkout", value: 2 }] }));
    rows.push(irow({ date_start: d, ad_id: "120000000000000004", spend: 8, impressions: 600, inline_link_clicks: 4,
      actions: [{ action_type: "landing_page_view", value: 3 }] }));
  }
  return { rows, ads: [], ref_to_ad_name: {}, fetched_at: "2026-11-20T03:45:00.000Z" };
}

describe("dashboard-data: PII", () => {
  test("data.json built from rows full of names, phones, emails, addresses and IPs contains none of them", () => {
    const data = sheetDataFromRows(piiRows(), [{ payment_id: "p1", order_id: "BT2611PAID01", provider: "grow_make", amount: "349", paid_at: "2026-11-12T09:00:00.000Z", method: "bit" }], new Set());
    for (const withSpend of [false, true]) {
      data.meta_spend = withSpend ? spendFixture() : null;
      const d = buildDashboard(data, { now: NOW, seed: 1 });
      const { json, issues } = serializeDashboard(d, namesIn(data.orders));
      assert.deepEqual(issues, []);
      assert.ok(!json.includes("@"), "no @");
      assert.ok(!IL_PHONE_RE.test(json), "no Israeli phone");
      for (const n of [...PII.names, ...PII.names.flatMap((x) => x.split(" "))]) assert.ok(!json.includes(n), `name leaked (${withSpend})`);
      for (const p of PII.phones) assert.ok(!json.includes(p) && !json.includes(p.replace(/\D/g, "")));
      assert.ok(!json.includes("הרצל") && !json.includes(PII.ip) && !json.includes("iPhone") && !json.includes("fb.1."));
      assert.ok(!json.includes("תתקשרו") && !json.includes("לחזור"), "free text (self-report, notes) not copied");
      assert.ok(json.includes("BT2611PAID01"), "order ids are kept");
      assert.ok(!json.includes("BT2611TEST09"), "tests are out");
    }
  });

  test("the guard catches planted PII; safeText scrubs contact data out of utm values", () => {
    assert.deepEqual(piiIssues('{"a":"x@y.co"}', []), ["email_at_sign"]);
    assert.deepEqual(piiIssues('{"a":"054-123-4567"}', []), ["phone_pattern"]);
    assert.deepEqual(piiIssues('{"a":"hello Dana"}', ["Dana"]), ["name_x1"]);
    assert.deepEqual(piiIssues('{"a":"Danaya"}', ["Dana"]), []);                    // whole words only
    assert.deepEqual(piiIssues('{"id":"120000000521234567","t":"2026-11-07T14:30:41.489Z"}', []), []);   // Meta ids and timestamps are not phones
    assert.equal(safeText("spring a@b.com"), "[הוסר]");
    assert.equal(safeText("call 0521234567"), "[הוסר]");
    assert.equal(safeText("cyber_nov"), "cyber_nov");
    const t = stripTouch({ touch_id: "t_1", ts: "2026-11-10T08:00:00Z", kind: "landing", landing_path: "/order", referrer_host: "l.instagram.com",
      ref: "x", utm_source: "ig", utm_medium: "paid_social", utm_campaign: "c", utm_content: "secret content", utm_term: "t", utm_id: null,
      meta_campaign_id: "1", meta_adset_id: "2", meta_ad_id: "3", placement: "ig_stories", fbclid: "IwAR123", gclid: null, gbraid: null,
      wbraid: null, ttclid: null, promo: null, q_code: null, channel: "paid_meta" });
    assert.deepEqual(Object.keys(t).sort(), ["ad_id", "adset_id", "campaign", "campaign_id", "channel", "kind", "medium", "placement", "source", "ts"]);
  });
});

describe("dashboard-data: contents", () => {
  const data = sheetDataFromRows(piiRows(), [], new Set());

  test("no spend: spend fields null and the no-spend message; KPI equals the attribution report", () => {
    data.meta_spend = null;
    const d = buildDashboard(data, { now: NOW, seed: 1 });
    assert.equal(d.spend.present, false);
    assert.equal(d.spend.message, NO_SPEND_MESSAGE);
    assert.equal(d.kpi.all.spend, null);
    assert.equal(d.kpi.all.cac, null);
    const rep = buildReport(data, { from: null, to: null, model: "credited", paidOnly: false, now: NOW });
    assert.equal(d.kpi.all.leads, rep.summary.orders_submitted);
    assert.equal(d.kpi.all.paid, rep.summary.paid);
    assert.equal(d.kpi.all.revenue_gross, rep.summary.revenue);
    assert.equal(d.kpi.all.revenue_ex_vat, 295.76);
    assert.equal(d.kpi["7d"].leads, 2);                          // 15.11 and 19.11, not 10.11
    assert.equal(d.kpi.all.meta_leads_capi, 1);
    assert.equal(d.targets.break_even_cac, 124);
    const h = Object.fromEntries(d.health.map((x) => [x.key, x]));
    assert.equal(h.paid_capi_error.count, 1);
    assert.equal(h.paid_capi_error.status, "red");
    assert.equal(h.spend_stale.status, "unknown");
    assert.equal(h.recon_not_matched.count, 0);
    assert.equal(h.pending_over_48h.count, 1);                   // 15.11 (19.11 is inside 48 h)
    assert.equal(d.money.all.gross, 349);
    assert.ok(d.money.all.cogs > 150 && d.money.all.contribution < 200);
    assert.deepEqual(d.money.grow_quota, { month: "2026-11", used: 1, quota: 20 });
  });

  test("order stories: touches, CAPI, recon and kit-sent flags, keyed by order id", () => {
    data.meta_spend = null;
    const d = buildDashboard(data, { now: NOW, seed: 1 });
    assert.deepEqual(d.order_ids, ["BT2611QQQQ03", "BT2611PEND02", "BT2611PAID01"]);
    const s = d.orders.BT2611PAID01;
    assert.equal(s.status, "paid");
    assert.equal(s.capi.purchase, "error:400");
    assert.equal(s.recon_status, "matched");
    assert.equal(s.kit_sent, true);
    assert.equal(s.payment.method, "bit");
    assert.equal(s.created_exact, "2026-11-10T18:30:00.000Z");
    assert.equal(s.touches.length, 2);
    assert.equal(s.touches[1].campaign, "[הוסר]");               // the utm value carried an email
    assert.equal(s.touches[1].ad_id, "120000000000000003");
    assert.equal(d.orders.BT2611QQQQ03.kit_sent, null);
    const ttp = d.time_to_purchase.all;
    assert.equal(ttp.paid_minus_created.n, 1);
    assert.equal(ttp.paid_minus_created.median, 38.5);           // 10.11 18:30 -> 12.11 09:00
    assert.deepEqual(orderExtras({ "נשלח ללקוח": "12.11", recon_status: "drift amount!" }), { kit_sent: true, recon_status: null });
  });

  test("with spend: drill tree campaign > ad set > ad with verdicts, funnel and the CAC interval", () => {
    data.meta_spend = spendFixture();
    const d = buildDashboard(data, { now: NOW, seed: 1 });
    assert.equal(d.spend.present, true);
    assert.equal(d.kpi.all.spend, 200);
    assert.equal(d.kpi.all.meta_paid, 1);
    assert.ok(d.kpi.all.cac && d.kpi.all.cac.p05 < d.kpi.all.cac.median && d.kpi.all.cac.median < d.kpi.all.cac.p95);
    const c = d.drill.all[0];
    assert.equal(c.level, "campaign");
    assert.equal(c.spend, 200);
    assert.equal(c.leads, 2);
    assert.equal(c.paid, 1);
    assert.ok(c.verdict);
    const [a3, a4] = c.children[0].children.sort((x, y) => x.id.localeCompare(y.id));
    assert.equal(a3.ic, 20);                                       // pixel IC counted once, not twice
    assert.equal(a3.lpv, 110);
    assert.equal(a3.days_live, 11);
    assert.equal(a4.verdict?.chip, CHIP.replace);                  // 80 ILS, 0 IC, CTR 0.67%
    assert.ok(a4.verdict?.reasons.includes("kill_no_ic"));
    assert.equal(d.funnel.all[0].id, "total");
    assert.deepEqual(d.funnel.all[1].steps.map((s) => s.key), ["impressions", "link_clicks", "lpv", "ic", "api", "leads", "paid"]);
    const det = buildDashboard(data, { now: NOW, seed: 1 });
    assert.deepEqual(det.drill, d.drill);                          // deterministic
    assert.equal(Object.fromEntries(d.health.map((x) => [x.key, x])).spend_stale.status, "ok");
  });

  test("CLI writes data.json through the guard (injected loader, no network)", async () => {
    const out = path.join(tmp, "dash", "data.json");
    const logs: string[] = [];
    const code = await runDashboard(["--out", out, "--meta-dir", path.join(tmp, "no-meta")], {
      now: NOW, load: async () => sheetDataFromRows(piiRows(), [], new Set()), log: (s) => logs.push(s),
    });
    assert.equal(code, 0);
    const j = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(j.spend.message, NO_SPEND_MESSAGE);
    assert.equal(j.order_ids.length, 3);
    assert.ok(logs[0].includes("spend none"));
  });
});
