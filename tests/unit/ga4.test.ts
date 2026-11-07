/**
 * PLAN.md marketing_machine_2026-11 Stage 6: GA4 session id, the server-side Measurement Protocol
 * purchase (session_id, engagement_time_msec, debug mode, consent, off by default) and the Data API
 * report script. Every network call goes to a fake fetch; nothing leaves the machine.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  GA_SESSION_COOKIE, isGaSessionId, parseGaSessionId, SHEET_ATTRIBUTION_HEADERS, toSheetColumns, type OrderRecord,
} from "../../api/_attribution_core.ts";
import { readGaSessionCookie } from "../../api/_cookies.ts";
import { gaSessionIdOf } from "../../api/_order_build.ts";
import {
  ga4BrowserShouldSend, ga4CollectUrl, ga4PurchaseBody, ga4PurchaseFromOrder, ga4ServerWillSend, sendGa4Purchase,
} from "../../api/_ga4.ts";
import {
  batchUrl, buildRequests, flattenReport, parseArgs, pullGa4, quotaLine, REPORT_NAMES, run, type FetchLike,
} from "../../scripts/ga4-report.ts";

const SECRET = "mp-secret-VALUE-123";
const ENV_KEYS = ["GA4_API_SECRET", "GA4_MEASUREMENT_ID", "GA4_DEBUG", "ATTR_TEST", "ATTR_DATA_DIR"];
let saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  globalThis.fetch = (async () => { throw new Error("real fetch blocked in unit tests"); }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const order = (p: Partial<OrderRecord> = {}): OrderRecord => ({
  order_id: "BT2611AB12CD", order_kind: "order", created_at: "", payment_status: "paid",
  amount_expected: 349, currency: "ILS", price_rule: "base", client_displayed_amount: null,
  promo_code: null, partner_id: null, credit_rule: "none", credited_channel: "direct", credited_detail: null,
  first: null, last: null, touches: [], self_reported_source: null, not_engaged: false,
  visitor_id: "v_1", session_id: null, fbc: null, fbp: null, ga_client_id: "1234567890.1730000000",
  client_ip: null, user_agent: null, event_source_url: null, consent_marketing: "unknown",
  buyer: { name: "x", phone: "0501234567", email: null }, couple: { name1: "a", name2: "b" },
  lead_event_id: "lead_BT2611AB12CD", grow_process_ids: [], grow_process_token: null, payment_fallback_reason: null,
  paid_at: "2026-11-06T10:00:00.000Z", paid_amount: 349, grow_transaction_id: null, asmachta: null,
  payment_method: null, payer_name: null, payer_phone: null, payer_email: null, match_method: null,
  capi_purchase_event_id: null, capi_purchase_sent_at: null, capi_purchase_result: null,
  commission_ils: null, commission_status: null, invoice_number: null, invoice_url: null,
  ga_session_id: "1730000000",
  ...p,
});

function configure() {
  process.env.GA4_API_SECRET = SECRET;
  process.env.GA4_MEASUREMENT_ID = "G-W3Z965PSD0";
}

interface Call { url: string; body: Record<string, unknown> }
function fakeMp(status: number, json: unknown) {
  const calls: Call[] = [];
  const f = async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  };
  return { calls, f };
}

describe("GA4 session id (cookie _ga_W3Z965PSD0)", () => {
  test("GS1 form: the third field", () => {
    assert.equal(parseGaSessionId("GS1.1.1730000000.5.1.1730000100.0.0.0"), "1730000000");
    assert.equal(parseGaSessionId("GS1.2.1730000000"), "1730000000");
  });
  test("GS2 form: the s field, in any position", () => {
    assert.equal(parseGaSessionId("GS2.1.s1730000000$o5$g1$t1730000100$j0$l0$h0"), "1730000000");
    assert.equal(parseGaSessionId("GS2.1.o5$s1762500000$g0$t1762500100"), "1762500000");
  });
  test("junk, too short, too long, wrong prefix -> null", () => {
    for (const v of ["", "junk", "GS1.1.abc.1", "GS2.1.o5$g1", "GS1.1.123.4", "GS1.1.1234567890123.1", "GA1.1.1730000000.1", "GS2.1.s12$o1", null, 42]) {
      assert.equal(parseGaSessionId(v), null, String(v));
    }
  });
  test("isGaSessionId is /^\\d{6,12}$/", () => {
    assert.equal(isGaSessionId("123456"), true);
    assert.equal(isGaSessionId("123456789012"), true);
    assert.equal(isGaSessionId("12345"), false);
    assert.equal(isGaSessionId("1234567890123"), false);
    assert.equal(isGaSessionId("12345a"), false);
  });
  test("order build: the body value wins when valid, a raw cookie value is parsed, else the request cookie, else null", () => {
    const withCookie = { headers: { cookie: `${GA_SESSION_COOKIE}=GS2.1.s1762500000$o1$g1; _ga=GA1.1.1.2` } };
    const none = { headers: {} };
    assert.equal(readGaSessionCookie(withCookie), "GS2.1.s1762500000$o1$g1");
    assert.equal(gaSessionIdOf(none, "1730000000"), "1730000000");
    assert.equal(gaSessionIdOf(none, "GS1.1.1730000000.5.1.1730000100.0.0.0"), "1730000000");
    assert.equal(gaSessionIdOf(withCookie, null), "1762500000");
    assert.equal(gaSessionIdOf(withCookie, "=HYPERLINK(1)"), "1762500000");
    assert.equal(gaSessionIdOf(none, "=HYPERLINK(1)"), null);
    assert.equal(gaSessionIdOf(none, 1730000000), null);
    assert.equal(gaSessionIdOf(none, undefined), null);
  });
  test("ga_session_id follows the Stage 2 block (only the Stage 3 reconciliation block comes after it) and is written", () => {
    const at = SHEET_ATTRIBUTION_HEADERS.indexOf("ga_session_id");
    assert.deepEqual(SHEET_ATTRIBUTION_HEADERS.slice(at - 3, at + 1), ["capi_lead_result", "capi_lead_sent_at", "capi_last_error_code", "ga_session_id"]);
    assert.equal(SHEET_ATTRIBUTION_HEADERS[at + 1], "grow_paid_at");
    assert.equal(SHEET_ATTRIBUTION_HEADERS.length, at + 1 + 9);
    assert.equal(toSheetColumns(order()).ga_session_id, "1730000000");
    assert.equal(toSheetColumns(order({ ga_session_id: null })).ga_session_id, "");
    assert.equal(toSheetColumns(order({ ga_session_id: undefined })).ga_session_id, "");
  });
});

describe("server GA4 purchase: off by default, consent, one sender", () => {
  test("OFF unless both GA4_API_SECRET and GA4_MEASUREMENT_ID are set (Production today)", async () => {
    assert.equal(ga4ServerWillSend(order()), false);
    process.env.GA4_MEASUREMENT_ID = "G-TEST000000";
    process.env.GA4_API_SECRET = "";   // the e2e test.env shape
    assert.equal(ga4ServerWillSend(order()), false);
    const mp = fakeMp(204, null);
    assert.deepEqual(await sendGa4Purchase(ga4PurchaseFromOrder(order(), "kit"), { fetch: mp.f }), { ok: true, detail: "off" });
    assert.equal(mp.calls.length, 0);
    // ... and then the browser sends instead
    assert.equal(ga4BrowserShouldSend(order()), true);
  });
  test("configured: the server sends and the browser does not (no double purchase)", () => {
    configure();
    assert.equal(ga4ServerWillSend(order()), true);
    assert.equal(ga4BrowserShouldSend(order()), false);
    // no GA client id: the server cannot send, so the browser does
    assert.equal(ga4ServerWillSend(order({ ga_client_id: null })), false);
    assert.equal(ga4BrowserShouldSend(order({ ga_client_id: null })), true);
  });
  test("consent_marketing denied (incl. test orders): no MP send and no browser purchase", async () => {
    configure();
    const denied = order({ consent_marketing: "denied" });
    assert.equal(ga4ServerWillSend(denied), false);
    assert.equal(ga4BrowserShouldSend(denied), false);
    const mp = fakeMp(204, null);
    const r = await sendGa4Purchase(ga4PurchaseFromOrder(denied, "kit"), { fetch: mp.f });
    assert.deepEqual(r, { ok: true, detail: "skipped_consent" });
    assert.equal(mp.calls.length, 0);
    assert.equal(ga4ServerWillSend(order({ consent_marketing: "granted" })), true);
  });
  test("body: transaction_id, value, session_id, engagement_time_msec 1, timestamp", () => {
    const p = ga4PurchaseFromOrder(order({ paid_amount: 399 }), "kit_all_meetings");
    const b = ga4PurchaseBody(p) as { client_id: string; timestamp_micros: number; events: Array<{ name: string; params: Record<string, unknown> }> };
    assert.equal(b.client_id, "1234567890.1730000000");
    assert.equal(b.timestamp_micros, Date.parse("2026-11-06T10:00:00.000Z") * 1000);
    assert.equal(b.events[0].name, "purchase");
    assert.deepEqual(b.events[0].params, {
      transaction_id: "BT2611AB12CD", value: 399, currency: "ILS",
      items: [{ item_id: "kit_all_meetings", item_name: "kit_all_meetings", price: 399, quantity: 1 }],
      engagement_time_msec: 1, session_id: "1730000000",
    });
    // no (or a bad) session id: the param is left out rather than sent wrong
    const noSess = ga4PurchaseBody(ga4PurchaseFromOrder(order({ ga_session_id: "abc" }), "kit")) as typeof b;
    assert.equal("session_id" in noSess.events[0].params, false);
    assert.equal(noSess.events[0].params.engagement_time_msec, 1);
    assert.equal(JSON.stringify(b).includes(SECRET), false);
  });
  test("send posts to /mp/collect; the detail never carries the secret", async () => {
    configure();
    const mp = fakeMp(204, null);
    const r = await sendGa4Purchase(ga4PurchaseFromOrder(order(), "kit"), { fetch: mp.f });
    assert.deepEqual(r, { ok: true, detail: "http 204" });
    assert.equal(mp.calls.length, 1);
    assert.ok(mp.calls[0].url.startsWith("https://www.google-analytics.com/mp/collect?measurement_id=G-W3Z965PSD0&api_secret="));
    assert.equal(r.detail.includes(SECRET), false);
  });
  test("a fetch error is reported without the secret", async () => {
    configure();
    const f = async (url: string) => { throw new Error(`connect failed ${url}`); };
    const r = await sendGa4Purchase(ga4PurchaseFromOrder(order(), "kit"), { fetch: f });
    assert.equal(r.ok, false);
    assert.equal(r.detail.includes(SECRET), false);
  });
  test("debug mode (GA4_DEBUG=1 or opts.debug) posts to /debug/mp/collect and reports validation messages", async () => {
    configure();
    assert.ok(ga4CollectUrl(true).startsWith("https://www.google-analytics.com/debug/mp/collect?"));
    const good = fakeMp(200, { validationMessages: [] });
    process.env.GA4_DEBUG = "1";
    assert.deepEqual(await sendGa4Purchase(ga4PurchaseFromOrder(order(), "kit"), { fetch: good.f }), { ok: true, detail: "debug valid (http 200)" });
    assert.ok(good.calls[0].url.includes("/debug/mp/collect"));
    delete process.env.GA4_DEBUG;
    const bad = fakeMp(200, { validationMessages: [{ fieldPath: "events[0].params.session_id", description: "bad value", validationCode: "VALUE_INVALID" }] });
    const r = await sendGa4Purchase(ga4PurchaseFromOrder(order(), "kit"), { fetch: bad.f, debug: true });
    assert.equal(r.ok, false);
    assert.match(r.detail, /^debug invalid: events\[0\]\.params\.session_id: VALUE_INVALID bad value$/);
  });
  test("ATTR_TEST=1 logs the body to ga4.jsonl and never fetches", async () => {
    configure();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ga4-"));
    process.env.ATTR_TEST = "1"; process.env.ATTR_DATA_DIR = dir;
    const mp = fakeMp(204, null);
    assert.deepEqual(await sendGa4Purchase(ga4PurchaseFromOrder(order(), "kit"), { fetch: mp.f }), { ok: true, detail: "logged" });
    assert.equal(mp.calls.length, 0);
    const line = JSON.parse(fs.readFileSync(path.join(dir, "ga4.jsonl"), "utf8").trim());
    assert.equal(line.body.events[0].params.session_id, "1730000000");
    assert.equal(JSON.stringify(line).includes(SECRET), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("scripts/ga4-report.ts (Data API, offline)", () => {
  const TOKEN = "ya29.fake-access-token";
  const KEY = "-----BEGIN PRIVATE KEY-----\\nFAKEKEY\\n-----END PRIVATE KEY-----";
  const envText = `GOOGLE_SERVICE_ACCOUNT_EMAIL=sa@example.iam.gserviceaccount.com\nGOOGLE_PRIVATE_KEY="${KEY}"\nGOOGLE_SPREADSHEET_ID=x\n`;
  const report = (dimNames: string[], metNames: string[], rows: Array<[string[], string[]]>) => ({
    dimensionHeaders: dimNames.map((name) => ({ name })), metricHeaders: metNames.map((name) => ({ name, type: "TYPE_INTEGER" })),
    rows: rows.map(([d, m]) => ({ dimensionValues: d.map((value) => ({ value })), metricValues: m.map((value) => ({ value })) })),
    propertyQuota: { tokensPerDay: { consumed: 12, remaining: 199988 }, tokensPerHour: { consumed: 12, remaining: 39988 } },
  });
  const apiAnswer = { reports: [
    report(["date", "sessionSourceMedium", "sessionCampaignName"], ["sessions", "purchaseRevenue"], [[["20261106", "facebook / paid_social", "test1"], ["7", "349"]]]),
    report(["date", "landingPage"], ["sessions"], [[["20261106", "/"], ["5"]], [["20261106", "/order"], ["2"]]]),
    report(["date", "eventName"], ["eventCount"], [[["20261106", "generate_lead"], ["1"]]]),
    report(["date", "transactionId"], ["purchaseRevenue"], [[["20261106", "BT2611AB12CD"], ["349"]]]),
    report(["date", "deviceCategory"], ["sessions"], []),
  ] };

  function fakeApi(status: number, json: unknown) {
    const calls: Array<{ url: string; headers: Record<string, string>; body: { requests: Array<Record<string, unknown>> } }> = [];
    const f: FetchLike = async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return { ok: status >= 200 && status < 300, status, json: async () => json };
    };
    return { calls, f };
  }

  test("5 requests, by date, each with returnPropertyQuota; funnel filtered to the funnel events", () => {
    const r = buildRequests("2026-11-05", "2026-11-07");
    assert.equal(r.length, 5);
    assert.equal(REPORT_NAMES.length, 5);
    for (const q of r) {
      assert.equal(q.returnPropertyQuota, true);
      assert.deepEqual(q.dateRanges, [{ startDate: "2026-11-05", endDate: "2026-11-07" }]);
      assert.equal(q.dimensions[0].name, "date");
    }
    assert.ok(r[3].dimensions.some((d) => d.name === "transactionId"));
    assert.ok(r[4].dimensions.some((d) => d.name === "deviceCategory"));
    assert.ok(JSON.stringify(r[2].dimensionFilter).includes("begin_checkout"));
    assert.equal(batchUrl("532271181"), "https://analyticsdata.googleapis.com/v1beta/properties/532271181:batchRunReports");
    assert.throws(() => batchUrl("5322/../x"));
  });
  test("flattenReport: dates to YYYY-MM-DD, metrics to numbers", () => {
    assert.deepEqual(flattenReport(apiAnswer.reports[0]), [
      { date: "2026-11-06", sessionSourceMedium: "facebook / paid_social", sessionCampaignName: "test1", sessions: 7, purchaseRevenue: 349 },
    ]);
    assert.deepEqual(flattenReport(null), []);
  });
  test("default window re-pulls the last 3 Israel days", () => {
    assert.equal(parseArgs([]).days, 3);
    assert.equal(parseArgs([]).property, "532271181");
    assert.throws(() => parseArgs(["--since", "2026-11-01"]));
    assert.throws(() => parseArgs(["--property", "abc"]));
    assert.throws(() => parseArgs(["--bogus"]));
  });
  test("run: bearer token, one POST, cache file written, quota logged; no key or token printed", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ga4r-"));
    const api = fakeApi(200, apiAnswer);
    const logs: string[] = [];
    let tokenCreds: { email: string; key: string } | null = null;
    const code = await run(["--out-dir", dir, "--secrets", "/nonexistent/report.env"], {
      fetch: api.f, now: new Date("2026-11-07T08:00:00Z"), log: (s) => logs.push(s), readFile: () => envText,
      getAccessToken: async (c) => { tokenCreds = c; return TOKEN; },
    });
    assert.equal(code, 0);
    assert.equal(api.calls.length, 1);
    assert.equal(api.calls[0].headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(api.calls[0].body.requests.length, 5);
    assert.deepEqual((api.calls[0].body.requests[0] as { dateRanges: unknown }).dateRanges, [{ startDate: "2026-11-05", endDate: "2026-11-07" }]);
    assert.equal(tokenCreds!.email, "sa@example.iam.gserviceaccount.com");
    const file = path.join(dir, "ga4_2026-11-05_2026-11-07.json");
    const cache = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(cache.reports.purchases[0].transactionId, "BT2611AB12CD");
    assert.equal(cache.row_counts.landing, 2);
    assert.equal(cache.row_counts.device, 0);
    const out = logs.join("\n");
    assert.match(out, /tokens\/day 12 used, 199988 left/);
    assert.equal(out.includes(TOKEN), false);
    assert.equal(out.includes("FAKEKEY"), false);
    assert.equal(fs.readFileSync(file, "utf8").includes(TOKEN), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test("API error: exit 1, message without the token", async () => {
    const api = fakeApi(403, { error: { code: 403, status: "PERMISSION_DENIED", message: `User does not have sufficient permissions (token ${TOKEN})` } });
    const logs: string[] = [];
    const code = await run(["--out-dir", path.join(os.tmpdir(), "ga4-never")], {
      fetch: api.f, log: (s) => logs.push(s), readFile: () => envText, getAccessToken: async () => TOKEN,
    });
    assert.equal(code, 1);
    assert.match(logs.join("\n"), /PERMISSION_DENIED/);
    assert.equal(logs.join("\n").includes(TOKEN), false);
  });
  test("dry run makes no call and needs no secrets", async () => {
    const api = fakeApi(200, apiAnswer);
    const logs: string[] = [];
    assert.equal(await run(["--dry-run"], { fetch: api.f, log: (s) => logs.push(s), now: new Date("2026-11-07T08:00:00Z") }), 0);
    assert.equal(api.calls.length, 0);
    assert.match(logs[0], /532271181:batchRunReports .* 2026-11-05\.\.2026-11-07/);
  });
  test("pullGa4 rejects a bad window; quotaLine handles a missing quota", async () => {
    await assert.rejects(pullGa4({ token: "t", property: "1", since: "2026-11-07", until: "2026-11-01", fetch: fakeApi(200, {}).f }));
    assert.equal(quotaLine(null), "quota: not returned");
  });
});
