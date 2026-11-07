/**
 * PLAN.md marketing_machine_2026-11 Stage 5: the weekly review (scripts/ads-review.ts).
 * Offline: the sheet rows, the Meta cache and the campaign folders are fixtures in a temp dir.
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  META_URL_PARAMS, MAX_SLOTS, buildDraftFolder, buildReview, calloutOf, cleanUrl, draftFolderName, draftFolderProblems,
  isoWeek, loadCopyIndex, matchCopy, parseVariants, reviewPath, run, serializeReview, variantProblems, vTag, type Review,
} from "../../scripts/ads-review.ts";
import { CHIP } from "../../scripts/report-lib/bayes.ts";
import type { InsightRow, SpendData } from "../../scripts/report-lib/join.ts";
import { parseCsv } from "../../scripts/meta-lib/approvals.ts";
import { sheetDataFromRows, type SheetRow } from "../../scripts/report-lib/load.ts";

const NOW = new Date("2026-11-22T06:00:00Z");   // Sunday 22.11.2026, ISO week 47
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ads-review-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const CAMPAIGNS = path.join(tmp, "campaigns");
const V3 = "2026-11_meta_v3";
function writeCampaigns(): void {
  fs.mkdirSync(path.join(CAMPAIGNS, V3), { recursive: true });
  fs.writeFileSync(path.join(CAMPAIGNS, V3, "ads.json"), JSON.stringify({
    campaign: V3, landing: "https://beshaa-tova.co.il/",
    ads: [
      { id: "eng-s1", channel: "meta", format: "static", placement: "feed+stories", campaign: "א. זוגות", adSetName: "1. מאורסים",
        onImage: "מאורסים? / מזל טוב! / ערכת מפגשים זוגיים", primaryText: "בין כל ההכנות, ערב רק לשניכם.\nבוחרים נושאים ומדברים.",
        headline: "מפגשים זוגיים מותאמים אישית", description: "בבית או בבית קפה, בקצב שלכם", cta: "LEARN_MORE",
        creatives: { "4x5": "creatives/static/E1_4x5.png", "1x1": "creatives/static/E1_1x1.png" }, aiGenerated: true,
        ref: "202611-v3-eng-s1", url: "https://beshaa-tova.co.il/?ref=202611-v3-eng-s1&utm_source=meta" },
      { id: "cpl-r2br", channel: "meta", format: "reel", placement: "reels", campaign: "א. זוגות", adSetName: "1. מאורסים",
        onImage: "כל השבוע, / כל אחד / בלו״ז העמוס שלו", primaryText: "ערב אחד רק לשניכם.\nעוד שורה.", headline: "ערב אחד בשבוע",
        description: "", cta: "LEARN_MORE", creatives: {}, video: "creatives/reels/r2b.mp4", aiGenerated: false, ref: "202611-v3-cpl-r2br" },
      { id: "grp-x", channel: "groups", onImage: "x" },
    ],
  }));
  fs.mkdirSync(path.join(CAMPAIGNS, "2026-11_meta_v2"), { recursive: true });
  fs.writeFileSync(path.join(CAMPAIGNS, "2026-11_meta_v2", "ads.json"), JSON.stringify({
    ads: [{ id: "eng_s1_moorasim", channel: "meta", format: "static", onImage: { hook: "מאורסים? מזל טוב!", kit: "ערכה", logo: "logo_compact" },
      primaryText: "א", headline: "ב", ref: "202611-meta-eng-s1m" }],
  }));
}
writeCampaigns();

const CAMP = "120000000000000001", SET = "120000000000000002", AD_GOOD = "120000000000000003", AD_BAD = "120000000000000004";
const irow = (p: Partial<InsightRow> & Pick<InsightRow, "date_start" | "ad_id" | "spend">): InsightRow => ({
  date_stop: p.date_start, account_currency: "ILS", campaign_id: CAMP, campaign_name: "v3_zugot", adset_id: SET, adset_name: "broad",
  ad_name: p.ad_id === AD_GOOD ? `${V3}_eng-s1` : "renamed in ads manager", impressions: 0, clicks: 0, inline_link_clicks: 0, ...p,
});
function spendFixture(): SpendData {
  const rows: InsightRow[] = [];
  for (let d = 10; d <= 21; d++) {
    const day = `2026-11-${d}`;
    rows.push(irow({ date_start: day, ad_id: AD_GOOD, spend: 12, impressions: 700, inline_link_clicks: 14,
      actions: [{ action_type: "landing_page_view", value: 11 }, { action_type: "offsite_conversion.fb_pixel_initiate_checkout", value: 2 }] }));
    rows.push(irow({ date_start: day, ad_id: AD_BAD, spend: 8, impressions: 600, inline_link_clicks: 4, actions: [{ action_type: "landing_page_view", value: 3 }] }));
  }
  return { rows, ads: [{ id: AD_BAD, name: "renamed", adset_id: SET, campaign_id: CAMP, url_tags: `${META_URL_PARAMS}&v=202611-v3-cpl-r2br` }], ref_to_ad_name: {}, fetched_at: "2026-11-22T03:45:00.000Z" };
}

const BUYER = "Yonatan Avrahami";
function rows(): SheetRow[] {
  return [{
    order_id: "BT2611PAID01", order_kind: "order", payment_status: "paid", amount_expected: "349", paid_amount: "349", price_rule: "base_349",
    credit_rule: "last_touch", credited_channel: "paid_meta", "שם 1 (ממלא/ת)": BUYER, "טלפון": "0521234567", "מייל": "y.a@gmail.com",
    "תאריך הזמנה": "15.11.2026", paid_at: "2026-11-16T09:00:00.000Z", lt_ts: "2026-11-15T08:00:00.000Z", lt_channel: "paid_meta",
    lt_meta_campaign_id: CAMP, lt_meta_adset_id: SET, lt_meta_ad_id: AD_GOOD, touches_json: "",
  }];
}
const data = (withSpend: boolean) => { const d = sheetDataFromRows(rows(), [], new Set()); d.meta_spend = withSpend ? spendFixture() : null; return d; };
const idx = loadCopyIndex(CAMPAIGNS);

describe("ads-review: helpers", () => {
  test("ISO week in Israel time and the draft folder name", () => {
    assert.equal(isoWeek(NOW).label, "2026-W47");
    assert.equal(isoWeek(new Date("2026-01-01T12:00:00Z")).label, "2026-W01");
    assert.equal(isoWeek(new Date("2027-01-01T12:00:00Z")).label, "2026-W53");
    assert.equal(isoWeek(new Date("2026-11-21T22:30:00Z")).week, 47);       // 00:30 Sunday in Israel
    assert.equal(draftFolderName(NOW), "2026-11_meta_w47");
    assert.equal(reviewPath("/x", NOW), path.join("/x", "2026-W47", "review.json"));
  });

  test("copy index: v3 strings, v2 objects, non-Meta ads skipped; callout and clean URL", () => {
    assert.equal(calloutOf("מאורסים? / מזל טוב!"), "מאורסים?");
    assert.equal(calloutOf({ hook: "מאורסים? מזל טוב!" }), "מאורסים? מזל טוב!");
    assert.equal(cleanUrl("https://beshaa-tova.co.il/give-a-gift?ref=x"), "https://beshaa-tova.co.il/give-a-gift");
    assert.equal(cleanUrl("https://evil.example/"), "https://beshaa-tova.co.il/");
    const c = idx.get(`${V3}_eng-s1`.toLowerCase());
    assert.ok(c);
    assert.equal(c.opening_line, "בין כל ההכנות, ערב רק לשניכם.");
    assert.equal(c.website_url, "https://beshaa-tova.co.il/");
    assert.equal(idx.get(`${V3}_cpl-r2br`)?.format, "reel");
    assert.equal(idx.get("2026-11_meta_v2_eng_s1_moorasim")?.on_image, "מאורסים? מזל טוב! / ערכה");
    assert.equal(idx.get(`${V3}_grp-x`), undefined);
    assert.equal(vTag(`${META_URL_PARAMS}&v=202611-v3-eng-s1`), "202611-v3-eng-s1");
    assert.equal(matchCopy(AD_BAD, "renamed in ads manager", spendFixture(), idx)?.ads_json_id, "cpl-r2br");   // through url_tags v=
    assert.equal(matchCopy("9", "nothing", null, idx), null);
  });
});

describe("ads-review: review", () => {
  test("no spend: status no_spend with the message, no ads, no slots", () => {
    const r = buildReview(data(false), { now: NOW, copyIndex: idx });
    assert.equal(r.status, "no_spend");
    assert.equal(r.message, "אין עדיין נתוני הוצאה");
    assert.deepEqual(r.ads, []);
    assert.deepEqual(r.variant_slots, []);
    assert.equal(r.iso_week, "2026-W47");
    assert.equal(r.draft_campaign_dir, "marketing/campaigns/2026-11_meta_w47");
  });

  test("with spend: chips, evidence, the leader's copy and change-one-element slots", () => {
    const r = buildReview(data(true), { now: NOW, copyIndex: idx, seed: 1 });
    assert.equal(r.status, "ok");
    const good = r.ads.find((a) => a.ad_id === AD_GOOD)!, bad = r.ads.find((a) => a.ad_id === AD_BAD)!;
    assert.equal(bad.chip, CHIP.replace);
    assert.ok(bad.reasons.includes("kill_no_ic"));
    assert.equal(good.evidence.spend, 144);
    assert.equal(good.evidence.impressions, 8400);
    assert.equal(good.evidence.proxy_conversions, 24);
    assert.ok(good.evidence.proxy_cpa && good.evidence.proxy_cpa.p05 < good.evidence.proxy_cpa.median && good.evidence.proxy_cpa.median < good.evidence.proxy_cpa.p95);
    assert.ok(good.evidence.ctr !== null && good.evidence.ctr > 0.01);
    assert.equal(good.copy?.ads_json_id, "eng-s1");
    assert.equal(r.winner?.ad_id, AD_GOOD);
    assert.deepEqual(r.replace_ad_ids, [AD_BAD]);
    assert.deepEqual(r.variant_slots.map((s) => s.element), ["callout", "headline", "opening_line", "format"]);   // the replaced ad gets no slots
    assert.ok(r.variant_slots.length <= MAX_SLOTS);
    const fmt = r.variant_slots.find((s) => s.element === "format")!;
    assert.equal(fmt.current, "static");
    assert.equal(fmt.target_format, "reel");
    assert.equal(fmt.template, "marketing/reels/22_engaged_chaos/reel.html");
    assert.equal(r.variant_slots[0].current, "מאורסים?");
    assert.deepEqual(buildReview(data(true), { now: NOW, copyIndex: idx, seed: 1 }), r);      // deterministic
  });

  test("a second live ad adds callout and headline slots, capped at 6", () => {
    const d = data(true);
    d.meta_spend!.rows = d.meta_spend!.rows.map((x) => (x.ad_id === AD_BAD ? { ...x, inline_link_clicks: 14, actions: [{ action_type: "landing_page_view", value: 11 }, { action_type: "initiate_checkout", value: 1 }] } : x));
    const r = buildReview(d, { now: NOW, copyIndex: idx, seed: 1 });
    assert.equal(r.variant_slots.length, 6);
    assert.deepEqual(r.variant_slots.slice(4).map((s) => [s.element, s.base_ad_id]), [["callout", AD_BAD], ["headline", AD_BAD]]);
    assert.deepEqual(r.variant_slots.map((s) => s.slot), ["V1", "V2", "V3", "V4", "V5", "V6"]);
  });

  test("PII guard: no buyer data in the JSON; a planted buyer name in Meta data is caught", () => {
    const r = buildReview(data(true), { now: NOW, copyIndex: idx, seed: 1 });
    const { json, issues } = serializeReview(r, [BUYER]);
    assert.deepEqual(issues, []);
    assert.ok(!json.includes("@") && !json.includes("0521234567") && !json.includes("Yonatan"));
    const planted: Review = { ...r, ads: r.ads.map((a) => ({ ...a, ad_name: `ad for ${BUYER}` })) };
    assert.ok(serializeReview(planted, [BUYER]).issues.length > 0);
  });
});

describe("ads-review: variants and the draft folder", () => {
  const review = buildReview(data(true), { now: NOW, copyIndex: idx, seed: 1 });
  const good = [
    { slot: "V2", new_value: "ערב אחד רק לשניכם", why: "כותרת קצרה יותר" },
    { slot: "V3", new_value: "גם בתוך כל ההכנות, יש ערב שהוא רק שלכם.", why: "פתיחה רכה יותר" },
    { slot: "V4", new_value: "reel", why: "לבדוק ריל מול תמונה" },
  ];

  test("variant checks: one line, a real slot, a real change, copy QA", () => {
    assert.deepEqual(variantProblems(review, good), []);
    const bad = variantProblems(review, [
      { slot: "V9", new_value: "x", why: "y" },
      { slot: "V2", new_value: "מפגשים זוגיים מותאמים אישית", why: "y" },
      { slot: "V1", new_value: "מהרו! רק היום", why: "y" },
      { slot: "V3", new_value: "רק 349 ₪ \u2014 לזוג", why: "y" },
      { slot: "V4", new_value: "static", why: "" },
    ]);
    assert.ok(bad.some((p) => p.startsWith("V9: not a slot")));
    assert.ok(bad.some((p) => p.includes("equals the current")));
    assert.ok(bad.some((p) => p.includes("urgency")));
    assert.ok(bad.some((p) => p.includes("price")) && bad.some((p) => p.includes("em_dash")));
    assert.ok(bad.some((p) => p.includes('takes "reel"')) && bad.some((p) => p.includes("why is empty")));
    assert.ok(variantProblems(review, Array.from({ length: 7 }, (_, i) => ({ slot: `V${i + 1}`, new_value: "a", why: "b" }))).some((p) => p.includes("expected 1-6")));
    assert.ok(variantProblems({ ...review, status: "no_spend" }, good).some((p) => p.includes("no_spend")));
    assert.deepEqual(parseVariants(JSON.stringify({ variants: good })), good);
    assert.throws(() => parseVariants("{"));
  });

  test("the folder: v3 CSV schema, Status=draft, 9.1 URL parameters, one change per ad, decision spec", () => {
    const dir = path.join(tmp, "out", "2026-11_meta_w47");
    const built = buildDraftFolder(review, good, dir, NOW);
    assert.equal(built.drafts.length, 3);
    const csv = parseCsv(fs.readFileSync(path.join(dir, "meta_upload.csv"), "utf8"));
    assert.equal(csv.length, 3);
    for (const r of csv) {
      assert.equal(r.Status, "draft");
      assert.ok(r["URL parameters"].startsWith(META_URL_PARAMS + "&v=202611-w47-v"));
      assert.equal(r["Website URL"], "https://beshaa-tova.co.il/");
      assert.equal(r["Ad set budget (proposal)"], "");
    }
    const [h, o, f] = csv;
    assert.equal(h["Ad name"], "2026-11_meta_w47_v2");
    assert.equal(h.Headline, "ערב אחד רק לשניכם");
    assert.equal(h["Primary text"], "בין כל ההכנות, ערב רק לשניכם.\nבוחרים נושאים ומדברים.");     // only the headline changed
    assert.equal(h["Creative 4:5"], "creatives/static/E1_4x5.png");
    assert.match(h["Ready to upload"], /^yes/);
    assert.equal(o.Headline, "מפגשים זוגיים מותאמים אישית");
    assert.equal(o["Primary text"], "גם בתוך כל ההכנות, יש ערב שהוא רק שלכם.\nבוחרים נושאים ומדברים.");
    assert.equal(f.Format, "reel");
    assert.equal(f["Ready to upload"], "no");
    assert.match(f.Missing, /reel\.html/);
    const ads = JSON.parse(fs.readFileSync(path.join(dir, "ads.json"), "utf8"));
    assert.equal(ads.status, "draft");
    assert.deepEqual(ads.ads.map((a: { change: { element: string } }) => a.change.element), ["headline", "opening_line", "format"]);
    assert.equal(ads.ads[0].creatives["4x5"], "marketing/campaigns/2026-11_meta_v3/creatives/static/E1_4x5.png");
    const spec = JSON.parse(fs.readFileSync(path.join(dir, "decision_spec.json"), "utf8"));
    assert.equal(spec.name, "ADS_WEEKLY_2026_W47");
    assert.equal(spec.sections[0].items.length, 3);
    for (const it of spec.sections[0].items) assert.ok(it.now && it.prop && it.id);
    const all = fs.readdirSync(dir).map((n) => fs.readFileSync(path.join(dir, n), "utf8")).join("");
    assert.ok(!all.includes("\u2014"), "no em dash anywhere");
    assert.ok(!all.includes("@") && !all.includes("Yonatan"));
    assert.deepEqual(draftFolderProblems(dir), []);
    buildDraftFolder(review, good.slice(0, 1), dir, NOW);                                  // its own folder may be rebuilt
    assert.equal(parseCsv(fs.readFileSync(path.join(dir, "meta_upload.csv"), "utf8")).length, 1);
  });

  test("refusals: a foreign folder, a bad name, QA failure; check-drafts catches edits", () => {
    const foreign = path.join(tmp, "out2", "2026-11_meta_w47");
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, "ads.json"), JSON.stringify({ status: "approved", ads: [] }));
    assert.throws(() => buildDraftFolder(review, good, foreign, NOW), /not overwriting/);
    assert.throws(() => buildDraftFolder(review, good, path.join(tmp, "out3", "my_folder"), NOW), /yyyy-mm/);
    assert.throws(() => buildDraftFolder(review, [{ slot: "V2", new_value: "מבצע", why: "x" }], path.join(tmp, "out4", "2026-11_meta_w47"), NOW), /refused/);
    const dir = path.join(tmp, "out5", "2026-11_meta_w47");
    buildDraftFolder(review, good, dir, NOW);
    const p = path.join(dir, "meta_upload.csv");
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/"draft"/g, '"ACTIVE"').replace("&v=202611-w47-v2", ""));
    const probs = draftFolderProblems(dir);
    assert.ok(probs.some((x) => x.includes("Status is not draft")));
    assert.ok(probs.some((x) => x.includes("9.1")));
  });
});

describe("ads-review: CLI", () => {
  const metaEmpty = path.join(tmp, "meta-empty");
  const metaFull = path.join(tmp, "meta-full");
  fs.mkdirSync(metaEmpty, { recursive: true });
  fs.mkdirSync(metaFull, { recursive: true });
  fs.writeFileSync(path.join(metaEmpty, "insights_2026-10-01_2026-11-22.json"), JSON.stringify({ fetched_at: "2026-11-22T03:00:00Z", rows: [] }));
  const sp = spendFixture();
  fs.writeFileSync(path.join(metaFull, "insights_2026-11-01_2026-11-22.json"), JSON.stringify({ fetched_at: sp.fetched_at, rows: sp.rows }));
  fs.writeFileSync(path.join(metaFull, "ads.json"), JSON.stringify({ ads: sp.ads }));
  fs.writeFileSync(path.join(tmp, "upload.csv"), "\"Ad name\",\"Ref code\"\n");
  const base = ["--campaigns-dir", CAMPAIGNS, "--ads-csv", path.join(tmp, "upload.csv")];

  test("no spend: writes review.json with status no_spend and never loads the sheet", async () => {
    const outRoot = path.join(tmp, "weekly-a");
    const logs: string[] = [];
    let loaded = false;
    const code = await run([...base, "--meta-dir", metaEmpty, "--out-root", outRoot, "--source", "sheet"],
      { now: NOW, load: async () => { loaded = true; return data(false); }, log: (s) => logs.push(s), err: () => {} });
    assert.equal(code, 0);
    assert.equal(loaded, false);
    const j = JSON.parse(fs.readFileSync(path.join(outRoot, "2026-W47", "review.json"), "utf8"));
    assert.equal(j.status, "no_spend");
    assert.match(logs[0], /wrote .*review\.json status=no_spend/);
  });

  test("with spend: review, check-variants, draft-from, check-drafts (injected loader, no network)", async () => {
    const outRoot = path.join(tmp, "weekly-b");
    const logs: string[] = [], errs: string[] = [];
    const deps = { now: NOW, load: async () => data(false), log: (s: string) => logs.push(s), err: (s: string) => errs.push(s) };
    assert.equal(await run([...base, "--meta-dir", metaFull, "--out-root", outRoot, "--seed", "1"], deps), 0);
    const rp = path.join(outRoot, "2026-W47", "review.json");
    const review = JSON.parse(fs.readFileSync(rp, "utf8")) as Review;
    assert.equal(review.status, "ok");
    assert.equal(review.variant_slots.length, 4);
    const vp = path.join(tmp, "variants.json");
    fs.writeFileSync(vp, JSON.stringify({ variants: [{ slot: "V2", new_value: "ערב אחד רק לשניכם", why: "קצר יותר" }] }));
    assert.equal(await run(["--check-variants", vp, "--review", rp], deps), 0);
    const dir = path.join(tmp, "cli-out", "2026-11_meta_w47");
    assert.equal(await run(["--draft-from", vp, "--review", rp, "--campaign-dir", dir], deps), 0);
    assert.equal(await run(["--check-drafts", dir], deps), 0);
    fs.writeFileSync(vp, JSON.stringify({ variants: [{ slot: "V2", new_value: "הזדמנות אחרונה", why: "x" }] }));
    assert.equal(await run(["--check-variants", vp, "--review", rp], deps), 1);
    assert.equal(await run(["--bogus"], deps), 2);
    assert.equal(await run(["--source", "sheet", "--dir", ".test-data"], deps), 2);
  });
});
