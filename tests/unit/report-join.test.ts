/**
 * PLAN.md marketing_machine_2026-11 Stage 1 (1.1, 1.4, 1.5, 1.6): spend join and CAC, the insights
 * puller, the token check and the sheet loader. Offline: every fetch and every sheet read is injected.
 */
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTouch, type OrderRecord, type Touch } from "../../api/_attribution_core.ts";
import { META_GRAPH_VERSION } from "../../api/_meta_version.ts";
import { buildReport, jsonView } from "../../scripts/report-lib/build.ts";
import {
  EARLY_LABEL, UNKNOWN_LABEL, cacOf, joinSpend, parseCsv, refMapFromCsv, resolveTouch, buildLookup,
  type InsightRow, type SpendData,
} from "../../scripts/report-lib/join.ts";
import {
  heDateToIso, loadSheetData, loadTestIds, parseEnvFile, readSecretEnv, sheetDataFromRows, testReason, type ReportData, type SheetRow,
} from "../../scripts/report-lib/load.ts";
import { renderText } from "../../scripts/report-lib/render.ts";
import {
  defaultWindow, fetchAllPages, insightsUrl, mergeCaches, normalizeInsight, readInsightsCache, run as runInsights, scrub, writeCache,
  type FetchLike, type InsightsCache,
} from "../../scripts/meta-insights.ts";
import { pickTokenInfo, run as runTokenCheck } from "../../scripts/meta-token-check.ts";

const WEBSITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOST = "beshaa-tova.co.il";
const NOW = new Date("2026-11-20T10:00:00Z");
const TOKEN = "EAAtestTOKENvalue123";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "report-join-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function touch(url: string, ts = "2026-11-10T08:00:00Z"): Touch {
  const t = parseTouch(`https://${HOST}${url}`, null, HOST, { ts });
  assert.ok(t, `no touch for ${url}`);
  return t;
}

let seq = 0;
function order(p: { last: Touch | null; first?: Touch | null; status?: OrderRecord["payment_status"]; paid_at?: string; amount?: number; id?: string }): OrderRecord {
  seq += 1;
  const id = p.id ?? `BT2611JJJJ${String(seq).padStart(2, "0")}`;
  const status = p.status ?? "paid";
  const channel = p.last?.channel ?? "direct";
  return {
    order_id: id, order_kind: "order", created_at: "2026-11-10T09:00:00Z", payment_status: status,
    amount_expected: p.amount ?? 349, currency: "ILS", price_rule: "base_349", client_displayed_amount: null,
    promo_code: null, partner_id: null, credit_rule: p.last ? "last_touch" : "none", credited_channel: channel, credited_detail: null,
    first: p.first ?? p.last, last: p.last, touches: [p.first ?? p.last, p.last].filter((t, i, a): t is Touch => !!t && a.indexOf(t) === i),
    self_reported_source: null, not_engaged: false, visitor_id: "v_x", session_id: null,
    fbc: null, fbp: null, ga_client_id: null, client_ip: null, user_agent: null, event_source_url: null, consent_marketing: "unknown",
    buyer: { name: `Buyer Secret ${seq}`, phone: "0501234567", email: "buyer@example.com" }, couple: { name1: "A", name2: "B" },
    lead_event_id: `lead_${id}`, grow_process_ids: [], grow_process_token: null, payment_fallback_reason: null,
    paid_at: status === "paid" || status === "refunded" ? (p.paid_at ?? "2026-11-10T09:05:00Z") : null,
    paid_amount: status === "paid" ? (p.amount ?? 349) : null,
    grow_transaction_id: null, asmachta: null, payment_method: null, payer_name: null, payer_phone: null, payer_email: null,
    match_method: null, capi_purchase_event_id: `purchase_${id}`, capi_purchase_sent_at: null, capi_purchase_result: null,
    commission_ils: null, commission_status: null, invoice_number: null, invoice_url: null,
  } as OrderRecord;
}

const row = (p: Partial<InsightRow> & Pick<InsightRow, "date_start" | "campaign_id" | "adset_id" | "ad_id" | "spend">): InsightRow => ({
  date_stop: p.date_start, account_currency: "ILS", impressions: 1000, reach: 800, clicks: 20, inline_link_clicks: 15, ...p,
});

// Two campaigns: A (111) with two ads in one ad set, B (444) with one ad.
const ROWS: InsightRow[] = [
  row({ date_start: "2026-11-10", campaign_id: "111", campaign_name: "202611_v3_zugot", adset_id: "222", adset_name: "eng", ad_id: "333", ad_name: "2026-11_meta_v3_eng-s1", spend: 40,
    actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "1" }, { action_type: "link_click", value: "15" }] }),
  row({ date_start: "2026-11-11", campaign_id: "111", campaign_name: "202611_v3_zugot", adset_id: "222", adset_name: "eng", ad_id: "333", ad_name: "2026-11_meta_v3_eng-s1", spend: 30 }),
  row({ date_start: "2026-11-10", campaign_id: "111", campaign_name: "202611_v3_zugot", adset_id: "222", adset_name: "eng", ad_id: "335", ad_name: "2026-11_meta_v3_eng-f1r", spend: 50 }),
  row({ date_start: "2026-11-10", campaign_id: "444", campaign_name: "202611_v3_married", adset_id: "555", adset_name: "married", ad_id: "666", ad_name: "2026-11_meta_v3_mar-s1", spend: 80 }),
  row({ date_start: "2026-10-01", campaign_id: "444", campaign_name: "202611_v3_married", adset_id: "555", adset_name: "married", ad_id: "666", ad_name: "2026-11_meta_v3_mar-s1", spend: 999 }),
];
const CSV = '﻿"Ad name","Campaign","Primary text","Ref code","Earlier working ref"\n' +
  '"2026-11_meta_v3_eng-s1","א. זוגות","שורה אחת,\nשורה שתיים ""מצוטטת""","202611-v3-eng-s1","202611-meta-eng-s1m"\n' +
  '"2026-11_meta_v3_eng-f1r","א. זוגות","x","202611-v3-eng-f1r",""\n';
const SPEND: SpendData = { rows: ROWS, ads: [], ref_to_ad_name: refMapFromCsv(CSV), fetched_at: "2026-11-20T03:00:00Z" };

const tById = touch("/?ref=meta-333&utm_source=ig&utm_medium=paid_social&utm_campaign=202611_v3_zugot&cid=111&asid=222&aid=333&plc=instagram_feed");
const tByRef = touch("/?ref=202611-v3-eng-f1r&utm_source=meta&utm_medium=paid&utm_campaign=202611_v3_zugot&utm_content=eng-f1r");
const tUnknown = touch("/?utm_source=facebook&utm_medium=paid_social&utm_campaign=something_else");
const tGroup = touch("/?ref=grp-tlv-brides");

// 3 paid Meta orders (one unmatched), plus orders that must not count.
const oId = order({ last: tById, first: tGroup });
const oRef = order({ last: tByRef, first: tById });
const oUnknown = order({ last: tUnknown });
const oNonMeta = order({ last: tGroup });
const oRefunded = order({ last: tById, status: "refunded" });
const oPending = order({ last: tById, status: "pending" });
const oOutside = order({ last: tById, paid_at: "2026-10-01T09:00:00Z" });
const ORDERS = [oId, oRef, oUnknown, oNonMeta, oRefunded, oPending, oOutside];
const WIN = { from: "2026-11-01", to: "2026-11-30" };

describe("join: spend + CAC per campaign / ad set / ad (PLAN 1.6)", () => {
  const cac = joinSpend(ORDERS, SPEND, WIN);
  const A = cac.campaigns.find((c) => c.id === "111");
  const B = cac.campaigns.find((c) => c.id === "444");

  test("fixture: 2 campaigns, 3 paid Meta orders, 1 unmatched", () => {
    assert.equal(cac.campaigns.length, 2);
    assert.ok(A && B);
    assert.equal(cac.totals.paid, 3);
    assert.deepEqual(cac.unknown, { label: UNKNOWN_LABEL, paid: 1, revenue: 349, order_ids: [oUnknown.order_id] });
    assert.deepEqual(cac.matches, { id: 1, ref: 1, utm_campaign: 0, unknown: 1 });
  });
  test("CAC math: spend in the window / last-touch credited paid orders; refunded, pending, outside and non-Meta are out", () => {
    assert.ok(A && B);
    assert.equal(A.spend, 120);                         // 40 + 30 + 50 (the 2026-10-01 row is outside)
    assert.equal(A.paid, 2);
    assert.equal(A.cac, 60);
    assert.deepEqual(A.order_ids.sort(), [oId.order_id, oRef.order_id].sort());
    assert.equal(B.spend, 80);
    assert.equal(B.paid, 0);
    assert.equal(B.cac, null);
    assert.equal(cac.totals.spend, 200);
    assert.equal(cac.totals.cac, Math.round((200 / 3) * 100) / 100);
    assert.equal(A.roas_ex_vat, Math.round((698 / 1.18 / 120) * 100) / 100);
  });
  test("under 3 paid orders the CAC is labelled מוקדם; 3 or more is not", () => {
    assert.equal(EARLY_LABEL, "מוקדם");
    assert.equal(A?.cac_label, "מוקדם");
    assert.equal(B?.cac_label, "מוקדם");
    assert.deepEqual(cacOf(300, 3), { cac: 100, cac_label: null });
    assert.deepEqual(cacOf(100, 2), { cac: 50, cac_label: "מוקדם" });
    assert.deepEqual(cacOf(100, 0), { cac: null, cac_label: "מוקדם" });
  });
  test("ad level: by id and by the CSV ref fallback; ad set and campaign are sums of the ads", () => {
    const set = A?.adsets.find((s) => s.id === "222");
    assert.ok(set);
    const ad333 = set.ads.find((a) => a.id === "333"), ad335 = set.ads.find((a) => a.id === "335");
    assert.deepEqual([ad333?.spend, ad333?.paid, ad333?.cac, ad333?.meta_claimed], [70, 1, 70, 1]);
    assert.deepEqual([ad335?.spend, ad335?.paid, ad335?.cac], [50, 1, 50]);
    assert.equal(set.spend, 120);
    assert.equal(set.impressions, 3000);
    assert.equal(A?.meta_claimed, 1);
  });
  test("first touch is shown (paid_ft), never credited", () => {
    const ad333 = A?.adsets[0].ads.find((a) => a.id === "333");
    assert.equal(ad333?.paid_ft, 1);                    // oRef's first touch was ad 333
    assert.equal(ad333?.paid, 1);                       // only oId credits it
  });
  test("fallback to utm_campaign -> campaign name; ambiguous names do not guess", () => {
    const L = buildLookup(SPEND);
    const r = resolveTouch(touch("/?utm_source=fb&utm_medium=paid_social&utm_campaign=202611_v3_married"), L);
    assert.deepEqual(r, { campaign_id: "444", adset_id: null, ad_id: null, method: "utm_campaign" });
    assert.equal(resolveTouch(tUnknown, L), null);
    const r2 = resolveTouch(touch("/?ref=202611-meta-eng-s1m"), L);         // the CSV's "Earlier working ref"
    assert.deepEqual(r2, { campaign_id: "111", adset_id: "222", ad_id: "333", method: "ref" });
  });
  test("url_tags from the ads list resolve a ref (ref= or v=)", () => {
    const spend: SpendData = { rows: ROWS, ads: [{ id: "666", name: "x", adset_id: "555", campaign_id: "444", url_tags: "v=mar-slug&utm_medium=paid_social" }], ref_to_ad_name: {} };
    assert.deepEqual(resolveTouch(touch("/?ref=mar-slug"), buildLookup(spend)), { campaign_id: "444", adset_id: "555", ad_id: "666", method: "ref" });
  });
  test("CSV parser: BOM, quoted commas, newlines and doubled quotes", () => {
    const rows = parseCsv(CSV);
    assert.equal(rows.length, 3);
    assert.equal(rows[0][0], "Ad name");
    assert.equal(rows[1][2], 'שורה אחת,\nשורה שתיים "מצוטטת"');
    assert.equal(SPEND.ref_to_ad_name["202611-v3-eng-s1"], "2026-11_meta_v3_eng-s1");
  });
  test("the real meta_upload.csv parses into a ref map (34 ads)", () => {
    const f = path.resolve(WEBSITE, "..", "marketing", "campaigns", "2026-11_meta_v3", "meta_upload.csv");
    if (!fs.existsSync(f)) return;
    const m = refMapFromCsv(fs.readFileSync(f, "utf8"));
    assert.ok(Object.keys(m).length >= 30, String(Object.keys(m).length));
  });
});

describe("build + render with spend", () => {
  const data: ReportData = {
    source: "file", dir: "x", orders: ORDERS, touches: [], payments: [], capi: [], codes: [], partners: [], blocked_egress: null, meta_spend: SPEND,
  };
  const rep = buildReport(data, { ...WIN, model: "credited", paidOnly: false, now: NOW });
  test("drill rows carry spend, cac and meta_claimed by id; report.meta.cac is the join", () => {
    const c = rep.meta.campaigns.find((x) => x.campaign_id === "111");
    assert.deepEqual([c?.spend, c?.cac, c?.cac_label, c?.meta_claimed], [120, 60, "מוקדם", 1]);
    assert.equal(rep.meta.cac?.unknown.paid, 1);
  });
  test("text shows the CAC table and the unknown row, and no buyer data without --orders", () => {
    const txt = renderText(rep, { withOrders: false });
    assert.match(txt, /Spend and CAC/);
    assert.ok(txt.includes(UNKNOWN_LABEL));
    assert.ok(txt.includes("60.00 (מוקדם)"));
    assert.ok(!txt.includes("Buyer Secret") && !txt.includes("@example.com") && !txt.includes("0501234567"));
    const j = JSON.stringify(jsonView(rep, false));
    assert.ok(!j.includes("Buyer Secret") && !j.includes("@example.com"));
  });
  test("without spend: drill spend is null and the text says how to load it", () => {
    const r2 = buildReport({ ...data, meta_spend: null }, { ...WIN, model: "credited", paidOnly: false, now: NOW });
    assert.equal(r2.meta.cac, null);
    assert.equal(r2.meta.campaigns[0].spend, null);
    assert.match(renderText(r2, { withOrders: false }), /no Meta spend loaded/);
  });
});

// ---------------------------------------------------------------------------------------------
// Insights puller (1.4)
// ---------------------------------------------------------------------------------------------

function fakeFetch(pages: Record<string, unknown>, seen: string[] = []): FetchLike {
  return async (url: string) => {
    seen.push(url);
    const key = Object.keys(pages).find((k) => url.includes(k));
    const body = key ? pages[key] : { error: { message: "no page", code: 100 } };
    return { ok: !(body as { error?: unknown }).error, status: (body as { error?: unknown }).error ? 400 : 200, json: async () => body };
  };
}

describe("meta-insights", () => {
  const raw = (ad: string, day: string, spend: string) => ({
    date_start: day, date_stop: day, account_currency: "ILS", campaign_id: "111", campaign_name: "c", adset_id: "222", adset_name: "s",
    ad_id: ad, ad_name: `ad ${ad}`, spend, impressions: "100", reach: "90", clicks: "3", inline_link_clicks: "2",
    actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "1" }],
  });

  test("request: version constant, level=ad, daily, 7d_click + 1d_view, conversion time, limit 500", () => {
    const u = new URL(insightsUrl(META_GRAPH_VERSION, "act_1", TOKEN, "2026-11-01", "2026-11-07"));
    assert.equal(u.pathname, `/${META_GRAPH_VERSION}/act_1/insights`);
    assert.equal(u.searchParams.get("level"), "ad");
    assert.equal(u.searchParams.get("time_increment"), "1");
    assert.deepEqual(JSON.parse(u.searchParams.get("action_attribution_windows") ?? ""), ["7d_click", "1d_view"]);
    assert.equal(u.searchParams.get("action_report_time"), "conversion");
    assert.equal(u.searchParams.get("limit"), "500");
    assert.deepEqual(JSON.parse(u.searchParams.get("time_range") ?? ""), { since: "2026-11-01", until: "2026-11-07" });
    assert.match(u.searchParams.get("fields") ?? "", /campaign_id.*adset_id.*ad_id.*spend.*actions/);
  });
  test("pagination follows paging.next until it is absent", async () => {
    const seen: string[] = [];
    const f = fakeFetch({
      "/insights?": { data: [raw("1", "2026-11-01", "10.5")], paging: { next: "https://graph.facebook.com/x/page2?access_token=" + TOKEN } },
      "/page2": { data: [raw("2", "2026-11-01", "4")], paging: { next: "https://graph.facebook.com/x/page3" } },
      "/page3": { data: [raw("3", "2026-11-02", "1")], paging: {} },
    }, seen);
    const rows = await fetchAllPages<Record<string, unknown>>(insightsUrl("v26.0", "act_1", TOKEN, "2026-11-01", "2026-11-02"), TOKEN, f);
    assert.equal(rows.length, 3);
    assert.equal(seen.length, 3);
    const n = normalizeInsight(rows[0]);
    assert.deepEqual([n.spend, n.impressions, n.reach, n.actions?.[0].value], [10.5, 100, 90, 1]);
  });
  test("errors carry code and subcode, never the token", async () => {
    const f: FetchLike = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: `bad token ${TOKEN} access_token=${TOKEN}`, code: 190, error_subcode: 463, type: "OAuthException" } }) });
    await assert.rejects(fetchAllPages("u", TOKEN, f), (e: Error) => /code 190 subcode 463/.test(e.message) && !e.message.includes(TOKEN));
    assert.equal(scrub(`x ${TOKEN} y`, TOKEN), "x <token> y");
  });
  test("default window re-pulls the last 7 Israel days, today included", () => {
    assert.deepEqual(defaultWindow(new Date("2026-11-07T23:30:00Z")), { since: "2026-11-02", until: "2026-11-08" });   // 01:30 on the 8th in Israel
  });
  test("cache: written to insights_<since>_<until>.json; newer pulls replace restated days", () => {
    const dir = path.join(tmp, "meta");
    const base = { version: "v26.0", account_id: "act_1", params: { level: "ad", time_increment: 1, action_attribution_windows: [], action_report_time: "conversion" } } as const;
    const old: InsightsCache = { ...base, params: { ...base.params, action_attribution_windows: [] }, fetched_at: "2026-11-08T03:00:00Z", since: "2026-11-01", until: "2026-11-07",
      rows: [normalizeInsight(raw("1", "2026-11-01", "10")), normalizeInsight(raw("1", "2026-11-06", "10")), normalizeInsight(raw("2", "2026-11-06", "5"))] };
    const neu: InsightsCache = { ...old, fetched_at: "2026-11-09T03:00:00Z", since: "2026-11-03", until: "2026-11-09",
      rows: [normalizeInsight(raw("1", "2026-11-06", "12"))] };
    assert.equal(path.basename(writeCache(dir, old)), "insights_2026-11-01_2026-11-07.json");
    writeCache(dir, neu);
    const merged = readInsightsCache(dir);
    assert.deepEqual(merged.rows.map((r) => [r.date_start, r.ad_id, r.spend]), [["2026-11-01", "1", 10], ["2026-11-06", "1", 12]]);
    assert.equal(merged.fetched_at, "2026-11-09T03:00:00Z");
    assert.deepEqual(mergeCaches([]).rows, []);
  });
  test("CLI run: reads meta.env (injected), writes the cache, logs no token", async () => {
    const logs: string[] = [];
    const out = path.join(tmp, "meta-cli");
    const f = fakeFetch({ "/insights?": { data: [raw("1", "2026-11-19", "7")] }, "/ads?": { data: [{ id: "1", name: "a", adset_id: "222", campaign_id: "111", creative: { url_tags: "v=x" } }] } });
    const code = await runInsights(["--out-dir", out, "--ads", "--secrets", "/nowhere/meta.env"], {
      fetch: f, now: NOW, log: (s) => logs.push(s), readFile: () => `META_ADS_TOKEN="${TOKEN}"\nMETA_AD_ACCOUNT_ID=289945905492499\n`,
    });
    assert.equal(code, 0, logs.join("\n"));
    assert.ok(fs.existsSync(path.join(out, "insights_2026-11-14_2026-11-20.json")));
    const c = readInsightsCache(out);
    assert.equal(c.rows[0].spend, 7);
    assert.equal(c.ads[0].url_tags, "v=x");
    assert.ok(!logs.join("\n").includes(TOKEN));
    assert.ok(!fs.readFileSync(path.join(out, "insights_2026-11-14_2026-11-20.json"), "utf8").includes(TOKEN));
  });
  test("CLI run: refuses .env.local and a half window", async () => {
    await assert.rejects(runInsights(["--secrets", "/x/.env.local"], { fetch: fakeFetch({}), readFile: () => "" }), /refusing/);
    await assert.rejects(runInsights(["--since", "2026-11-01"], { fetch: fakeFetch({}) }), /both --since and --until/);
  });
});

// ---------------------------------------------------------------------------------------------
// Token check (1.1)
// ---------------------------------------------------------------------------------------------

describe("meta-token-check", () => {
  const env = `META_ADS_TOKEN=${TOKEN}\nMETA_APP_ID=12345\nMETA_APP_SECRET=s3cr3tAPPsecret\n`;
  test("prints is_valid, type, expires_at, scopes only; OK for a never-expiring System User", async () => {
    const seen: string[] = [], logs: string[] = [];
    const f = fakeFetch({ "/debug_token?": { data: { app_id: "12345", application: "AppName", type: "SYSTEM_USER", is_valid: true, expires_at: 0, data_access_expires_at: 0, scopes: ["ads_read"], user_id: "98765" } } }, seen);
    const code = await runTokenCheck([], { fetch: f, now: NOW, log: (s) => logs.push(s), readFile: () => env });
    const out = logs.join("\n");
    assert.equal(code, 0);
    assert.ok(seen[0].includes(`/${META_GRAPH_VERSION}/debug_token?`));
    assert.match(out, /is_valid: true/);
    assert.match(out, /type: SYSTEM_USER/);
    assert.match(out, /expires_at: 0 \(never\)/);
    assert.match(out, /scopes: ads_read/);
    assert.match(out, /verdict: OK/);
    for (const secret of [TOKEN, "s3cr3tAPPsecret", "98765", "AppName"]) assert.ok(!out.includes(secret), secret);
  });
  test("an expired user token: exit 1, days left, error code, no secret", async () => {
    const logs: string[] = [];
    const exp = Math.floor(Date.parse("2026-11-25T00:00:00Z") / 1000);
    const f = fakeFetch({ "/debug_token?": { data: { type: "USER", is_valid: false, expires_at: exp, scopes: [], error: { code: 190, subcode: 463, message: "expired" } } } });
    assert.equal(await runTokenCheck([], { fetch: f, now: NOW, log: (s) => logs.push(s), readFile: () => env }), 1);
    assert.match(logs.join("\n"), /4 days left/);
    assert.match(logs.join("\n"), /error: code 190 subcode 463/);
    assert.match(logs.join("\n"), /verdict: INVALID/);
  });
  test("setup errors exit 2 and name the variable, not the value; --var picks another token", async () => {
    const logs: string[] = [];
    assert.equal(await runTokenCheck(["--var", "META_CAPI_TOKEN"], { fetch: fakeFetch({}), log: (s) => logs.push(s), readFile: () => env }), 2);
    assert.match(logs.join("\n"), /missing META_CAPI_TOKEN/);
    assert.equal(await runTokenCheck(["--secrets", "/a/.env.local"], { fetch: fakeFetch({}), log: (s) => logs.push(s), readFile: () => env }), 2);
    assert.deepEqual(pickTokenInfo(null).is_valid, false);
  });
  test("a Graph-level error (HTTP 400) exits 1 with the secret scrubbed", async () => {
    const logs: string[] = [];
    const f: FetchLike = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 190, type: `OAuth 12345|s3cr3tAPPsecret` } }) });
    assert.equal(await runTokenCheck([], { fetch: f, log: (s) => logs.push(s), readFile: () => env }), 1);
    assert.ok(!logs.join("\n").includes("s3cr3tAPPsecret"));
  });
});

// ---------------------------------------------------------------------------------------------
// Sheet loader (1.5)
// ---------------------------------------------------------------------------------------------

describe("load: --source sheet (read only, tests excluded)", () => {
  const sheetRow = (p: SheetRow): SheetRow => ({
    order_id: "", order_kind: "order", payment_status: "pending", amount_expected: "349", price_rule: "base_349",
    credit_rule: "last_touch", credited_channel: "paid_meta", "שם 1 (ממלא/ת)": "Secret Name", "טלפון": "0501234567",
    "מייל": "x@example.com", "תאריך הזמנה": "7.11.2026", "הערות": "", touches_json: "", ...p,
  });
  const rows: SheetRow[] = [
    sheetRow({ order_id: "BT2611QH3W1J", payment_status: "paid", paid_amount: "349", paid_at: "2026-11-04T10:00:00Z", "תאריך הזמנה": "4.11.2026",
      lt_ts: "2026-11-04T09:00:00.000Z", lt_channel: "paid_meta", lt_meta_campaign_id: "111", lt_meta_adset_id: "222", lt_meta_ad_id: "333",
      ft_ts: "2026-11-03T09:00:00.000Z", ft_channel: "community_group", ft_ref: "grp-tlv-brides" }),
    sheetRow({ order_id: "BT2611AAAA02", "הערות": "בדיקת מערכת של Claude 4.11" }),
    sheetRow({ order_id: "BT2611TEST01" }),
    sheetRow({ order_id: "BT2611BBBB03" }),
    sheetRow({ order_id: "BT2611CCCC04", touches_json: JSON.stringify([{ id: "t_aaaaaaaaaaaa", ts: "2026-11-05T08:00:00.000Z", kind: "landing", landing_path: "/", channel: "paid_meta", meta_campaign_id: "111" }]), lt_ts: "2026-11-05T08:00:00.000Z" }),
    sheetRow({ order_id: "" }),
  ];
  const payments: SheetRow[] = [
    { payment_id: "p1", order_id: "BT2611QH3W1J", provider: "manual", amount: "349", paid_at: "2026-11-04T10:00:00Z", method: "bit", verified: "false", verification: "manual_token" },
    { payment_id: "p2", order_id: "BT2611TEST01", provider: "grow_make", amount: "1", paid_at: "2026-11-07T10:00:00Z", method: "card" },
  ];
  const ids = new Set(["BT2611BBBB03"]);

  test("test rules: notes say בדיקת מערכת, the id has TEST, or test_orders.json lists it", () => {
    assert.equal(testReason("BT2611AAAA02", "בדיקת מערכת של Claude", new Set()), "notes");
    assert.equal(testReason("BT2611TEST01", "", new Set()), "id_has_TEST");
    assert.equal(testReason("bt2611bbbb03", "", ids), "test_orders.json");
    assert.equal(testReason("BT2611QH3W1J", "", ids), null);
    assert.ok(loadTestIds().has("BT2611TEST01"));
    assert.ok(!loadTestIds().has("BT2611QH3W1J"));                  // still an open question (PLAN 7.2)
  });
  test("rows -> orders: tests and id-less rows dropped, payments of tests dropped, touches from touches_json or ft_/lt_", () => {
    const d = sheetDataFromRows(rows, payments, ids);
    assert.equal(d.source, "sheet");
    assert.deepEqual(d.orders.map((o) => o.order_id), ["BT2611QH3W1J", "BT2611CCCC04"]);
    assert.deepEqual(d.excluded_tests?.map((e) => [e.order_id, e.reason]), [
      ["BT2611AAAA02", "notes"], ["BT2611TEST01", "id_has_TEST"], ["BT2611BBBB03", "test_orders.json"]]);
    assert.deepEqual(d.payments.map((p) => [p.payment_id, p.amount]), [["p1", 349]]);
    const o = d.orders[0];
    assert.equal(o.created_at, "2026-11-04T10:00:00.000Z");
    assert.deepEqual([o.last?.meta_campaign_id, o.last?.meta_ad_id, o.first?.ref], ["111", "333", "grp-tlv-brides"]);
    assert.equal(d.orders[1].last?.meta_campaign_id, "111");
    assert.ok(d.touches.length >= 3);
    assert.equal(heDateToIso("31/12/2026"), "2026-12-31T10:00:00.000Z");
    assert.equal(heDateToIso("garbage"), null);
  });
  test("loadSheetData: creds from the env file only (injected), read tabs injected; report shows no PII by default", async () => {
    let gotCreds: unknown = null;
    const d = await loadSheetData({
      envFile: "/home/x/.config/besha/report.env",
      readFile: () => 'GOOGLE_SERVICE_ACCOUNT_EMAIL=sa@x.iam\nGOOGLE_PRIVATE_KEY="-----BEGIN-----\\nabc\\n-----END-----"\nGOOGLE_SPREADSHEET_ID=sheet1\n',
      readTabs: async (c) => { gotCreds = c; return { orders: rows, payments }; },
      testIds: ids,
    });
    assert.equal((gotCreds as { GOOGLE_SPREADSHEET_ID: string }).GOOGLE_SPREADSHEET_ID, "sheet1");
    d.meta_spend = SPEND;
    const rep = buildReport(d, { from: "2026-11-01", to: "2026-11-30", model: "credited", paidOnly: false, now: NOW });
    assert.equal(rep.summary.orders_submitted, 2);
    assert.equal(rep.summary.paid, 1);
    assert.equal(rep.meta.cac?.campaigns.find((c) => c.id === "111")?.paid, 1);
    const txt = renderText(rep, { withOrders: false });
    assert.match(txt, /test rows excluded: 3/);
    assert.ok(!txt.includes("Secret Name") && !txt.includes("x@example.com") && !txt.includes("0501234567"));
    await assert.rejects(loadSheetData({ envFile: "/x/report.env", readFile: () => "GOOGLE_SPREADSHEET_ID=1\n", readTabs: async () => ({ orders: [], payments: null }) }),
      /missing GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY/);
  });
  test("env files: parse quotes, comments, export; .env* refused; values never in the error", () => {
    assert.deepEqual(parseEnvFile("# c\nexport A=1\nB='two words'\nC=\"x=y\"\nbad line\n"), { A: "1", B: "two words", C: "x=y" });
    assert.throws(() => readSecretEnv("/w/website/.env.local", ["A"], { readFile: () => "A=1" }), /refusing \.env\.local/);
    assert.throws(() => readSecretEnv("/x/report.env", ["A", "B"], { readFile: () => "A=topsecret" }), (e: Error) => /missing B/.test(e.message) && !e.message.includes("topsecret"));
  });
});

describe("CLI: attribution-report --source sheet guards (no network)", () => {
  const tsx = path.join(WEBSITE, "node_modules", ".bin", "tsx");
  const cli = path.join(WEBSITE, "scripts", "attribution-report.ts");
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(tsx, [cli, ...args], { cwd: WEBSITE, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: tmp, ...env } });
  test("missing env file, .env.local, --dir, --commissions and test mode all exit 2 before any read", () => {
    const r = run(["--source", "sheet", "--secrets", path.join(tmp, "nope.env")]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /no env file/);
    assert.equal(run(["--source", "sheet", "--secrets", path.join(tmp, ".env.local")]).status, 2);
    assert.equal(run(["--source", "sheet", "--dir", tmp]).status, 2);
    assert.equal(run(["--source", "sheet", "--commissions"]).status, 2);
    assert.match(run(["--source", "sheet"], { ATTR_TEST: "1" }).stderr, /test mode/);
  });
});
