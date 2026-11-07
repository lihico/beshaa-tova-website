/**
 * PLAN.md marketing_machine_2026-11 Stage 2: the Meta event pipeline. Every Graph call goes to a fake
 * fetch; nothing leaves the machine.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { capiOutcome, capiPurchase, graphError, sendLeadRecorded, sendMetaEvent } from "../../api/_meta-capi.ts";
import { META_GRAPH_VERSION } from "../../api/_meta_version.ts";
import { adsToken, fetchInsights, GraphCallError } from "../../api/meta-ads.ts";
import { SHEET_ATTRIBUTION_HEADERS, toSheetColumns, type OrderRecord } from "../../api/_attribution_core.ts";
import { parseArgs, runRetry, selectRetryOrders, type RetryRow } from "../../scripts/capi-retry.ts";

const SECRET = "EAAG-secret-token-value";
const ENV_KEYS = ["META_CAPI_TOKEN", "META_ACCESS_TOKEN", "CAPI_MODE", "ATTR_TEST", "ATTR_DATA_DIR", "META_PIXEL_ID", "META_TEST_EVENT_CODE"];

interface Call { url: string; body: unknown }
let calls: Call[] = [];
let saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
const realError = console.error;
let errLines: string[] = [];

function fakeFetch(status: number, json: unknown) {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = []; errLines = [];
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  // Any fetch a test did not fake fails loudly, so no test can reach graph.facebook.com.
  globalThis.fetch = (async () => { throw new Error("real fetch blocked in unit tests"); }) as typeof fetch;
  console.error = (...a: unknown[]) => { errLines.push(a.map(String).join(" ")); };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const META_400 = { error: { message: "Invalid OAuth access token - Cannot parse access token for user@example.com", type: "OAuthException", code: 190, error_subcode: 463, fbtrace_id: "AbC123" } };

class MemStore {
  patches: Array<[string, Record<string, unknown>]> = [];
  async updateOrder(id: string, patch: Partial<OrderRecord> | Record<string, unknown>) { this.patches.push([id, patch as Record<string, unknown>]); }
}

const order = (p: Partial<OrderRecord> = {}): OrderRecord => ({
  order_id: "BT2611AB12CD", order_kind: "order", created_at: "", payment_status: "paid",
  amount_expected: 349, currency: "ILS", price_rule: "base", client_displayed_amount: null,
  promo_code: null, partner_id: null, credit_rule: "none", credited_channel: "direct", credited_detail: null,
  first: null, last: null, touches: [], self_reported_source: null, not_engaged: false,
  visitor_id: "v_1", session_id: null, fbc: null, fbp: null, ga_client_id: null,
  client_ip: null, user_agent: null, event_source_url: null, consent_marketing: "unknown",
  buyer: { name: "יעל לוי", phone: "0501234567", email: "a@example.com" }, couple: { name1: "יעל", name2: "דן" },
  lead_event_id: "lead_BT2611AB12CD", grow_process_ids: [], grow_process_token: null, payment_fallback_reason: null,
  paid_at: "2026-11-06T10:00:00.000Z", paid_amount: 349, grow_transaction_id: null, asmachta: null,
  payment_method: null, payer_name: null, payer_phone: null, payer_email: null, match_method: "order_id",
  capi_purchase_event_id: null, capi_purchase_sent_at: null, capi_purchase_result: null,
  commission_ils: null, commission_status: null, invoice_number: null, invoice_url: null, ...p,
} as OrderRecord);

describe("Graph version and tokens", () => {
  test("one pinned version, vNN.0", () => assert.match(META_GRAPH_VERSION, /^v\d{2}\.0$/));

  test("CAPI uses META_CAPI_TOKEN first, META_ACCESS_TOKEN as fallback, and the pinned version", async () => {
    fakeFetch(200, { events_received: 1, fbtrace_id: "x" });
    process.env.META_ACCESS_TOKEN = "old";
    process.env.META_CAPI_TOKEN = "new";
    await sendMetaEvent({ event_name: "Lead", event_id: "lead_x", user_data: {} });
    assert.ok(calls[0].url.startsWith(`https://graph.facebook.com/${META_GRAPH_VERSION}/946664901627405/events?`));
    assert.match(calls[0].url, /access_token=new$/);
    delete process.env.META_CAPI_TOKEN;
    await sendMetaEvent({ event_name: "Lead", event_id: "lead_x", user_data: {} });
    assert.match(calls[1].url, /access_token=old$/);
  });

  test("meta-ads token: META_ADS_TOKEN || META_ACCESS_TOKEN", () => {
    assert.equal(adsToken({ META_ADS_TOKEN: "a", META_ACCESS_TOKEN: "b" } as NodeJS.ProcessEnv), "a");
    assert.equal(adsToken({ META_ACCESS_TOKEN: "b" } as NodeJS.ProcessEnv), "b");
    assert.equal(adsToken({} as NodeJS.ProcessEnv), "");
  });
});

describe("sendMetaEvent errors", () => {
  test("400: code and subcode only; the message and token never reach the result or the log", async () => {
    fakeFetch(400, META_400);
    process.env.META_CAPI_TOKEN = SECRET;
    const r = await sendMetaEvent({ event_name: "Purchase", event_id: "purchase_x", user_data: { em: "a@example.com" } });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.equal(r.error_code, 190);
    assert.equal(r.error_subcode, 463);
    const all = JSON.stringify(r) + errLines.join("\n");
    assert.ok(!all.includes("example.com"), "no message body");
    assert.ok(!all.includes(SECRET), "no token");
    assert.ok(!all.includes("Invalid OAuth"), "no message");
  });

  test("graphError keeps numbers, type and trace id only", () => {
    assert.deepEqual(graphError(META_400), { code: 190, error_subcode: 463, type: "OAuthException", fbtrace_id: "AbC123" });
    assert.deepEqual(graphError({ error: { code: "100" } }), { code: 100 });
    assert.deepEqual(graphError("nope"), {});
    assert.deepEqual(graphError({ error: { type: "has spaces and @ signs" } }), {});
  });

  test("capiOutcome strings", () => {
    assert.deepEqual(capiOutcome({ ok: true, events_received: 1 }), { result: "ok:1", sent: true, error_code: null });
    assert.deepEqual(capiOutcome({ ok: false, logged: true }), { result: "logged", sent: false, error_code: null });
    assert.deepEqual(capiOutcome({ ok: false, error: "capi off" }), { result: "off", sent: false, error_code: null });
    assert.deepEqual(capiOutcome({ ok: false, status: 400, error_code: 190, error_subcode: 463 }), { result: "error:400", sent: false, error_code: "190:463" });
    assert.deepEqual(capiOutcome({ ok: false, status: 400, error_code: 100 }), { result: "error:400", sent: false, error_code: "100" });
    assert.deepEqual(capiOutcome({ ok: false, error: "fetch failed" }), { result: "error:", sent: false, error_code: "fetch" });
  });
});

describe("Purchase result on the order (capiPurchase)", () => {
  test("success writes ok and the sent time", async () => {
    fakeFetch(200, { events_received: 1 });
    process.env.META_CAPI_TOKEN = SECRET;
    const store = new MemStore();
    const after = await capiPurchase(store as never, order());
    assert.equal(after.capi_purchase_result, "ok:1");
    assert.ok(after.capi_purchase_sent_at);
    assert.equal(after.capi_purchase_event_id, "purchase_BT2611AB12CD");
    assert.equal(store.patches[0][1].capi_last_error_code, undefined);
    const ev = (calls[0].body as { data: Array<{ event_name: string; custom_data: { value: number } }> }).data[0];
    assert.equal(ev.event_name, "Purchase");
    assert.equal(ev.custom_data.value, 349);
  });

  test("400 writes error:400 and the error code, and leaves sent_at empty for the retry", async () => {
    fakeFetch(400, META_400);
    process.env.META_CAPI_TOKEN = SECRET;
    const store = new MemStore();
    const after = await capiPurchase(store as never, order());
    assert.equal(after.capi_purchase_result, "error:400");
    assert.equal(after.capi_purchase_sent_at, null);
    assert.equal(after.capi_last_error_code, "190:463");
    assert.ok(!JSON.stringify(store.patches).includes(SECRET));
  });

  test("consent denied: no call, skipped_consent", async () => {
    fakeFetch(200, { events_received: 1 });
    process.env.META_CAPI_TOKEN = SECRET;
    const after = await capiPurchase(new MemStore() as never, order({ consent_marketing: "denied" }));
    assert.equal(calls.length, 0);
    assert.equal(after.capi_purchase_result, "skipped_consent");
  });

  test("already sent: no call", async () => {
    fakeFetch(200, { events_received: 1 });
    process.env.META_CAPI_TOKEN = SECRET;
    await capiPurchase(new MemStore() as never, order({ capi_purchase_sent_at: "2026-11-06T10:00:01Z" }));
    assert.equal(calls.length, 0);
  });
});

describe("Lead result on the order (sendLeadRecorded)", () => {
  const args = { event_id: "lead_BT2611AB12CD", user_data: { em: "a@example.com" }, custom_data: { value: 349, currency: "ILS" } };

  test("success writes ok:1 and capi_lead_sent_at", async () => {
    fakeFetch(200, { events_received: 1 });
    process.env.META_CAPI_TOKEN = SECRET;
    const store = new MemStore();
    const p = await sendLeadRecorded(store, order(), args);
    assert.equal(p.capi_lead_result, "ok:1");
    assert.ok(p.capi_lead_sent_at);
    assert.equal(store.patches[0][0], "BT2611AB12CD");
    assert.equal(store.patches[0][1].capi_lead_result, "ok:1");
    assert.equal((calls[0].body as { data: Array<{ event_name: string }> }).data[0].event_name, "Lead");
  });

  test("400 writes error:400 and capi_last_error_code", async () => {
    fakeFetch(400, META_400);
    process.env.META_CAPI_TOKEN = SECRET;
    const store = new MemStore();
    const p = await sendLeadRecorded(store, order(), args);
    assert.deepEqual(store.patches[0][1], { capi_lead_result: "error:400", capi_lead_sent_at: null, capi_last_error_code: "190:463" });
    assert.equal(p.capi_lead_result, "error:400");
  });

  test("consent denied: no call, skipped_consent", async () => {
    fakeFetch(200, { events_received: 1 });
    process.env.META_CAPI_TOKEN = SECRET;
    const store = new MemStore();
    await sendLeadRecorded(store, order({ consent_marketing: "denied" }), args);
    assert.equal(calls.length, 0);
    assert.equal(store.patches[0][1].capi_lead_result, "skipped_consent");
  });

  test("a failed sheet write never throws", async () => {
    fakeFetch(200, { events_received: 1 });
    process.env.META_CAPI_TOKEN = SECRET;
    const p = await sendLeadRecorded({ updateOrder: async () => { throw new Error("no row"); } }, order(), args);
    assert.equal(p.capi_lead_result, "ok:1");
  });
});

describe("sheet columns", () => {
  test("the 3 Lead columns are appended at the end, after the old last column", () => {
    const h = [...SHEET_ATTRIBUTION_HEADERS];
    // Stage 6 appended ga_session_id after them and Stage 3 the 9 reconciliation columns; the Stage 2 block keeps its place.
    const at = h.indexOf("commission_status");
    assert.deepEqual(h.slice(at, at + 5), ["commission_status", "capi_lead_result", "capi_lead_sent_at", "capi_last_error_code", "ga_session_id"]);
    assert.equal(h.length, at + 5 + 9);
    const cols = toSheetColumns(order({ capi_lead_result: "ok:1", capi_lead_sent_at: "2026-11-06T10:00:00Z", capi_last_error_code: "190" }));
    assert.equal(cols.capi_lead_result, "ok:1");
    assert.equal(cols.capi_last_error_code, "190");
    assert.equal(toSheetColumns(order()).capi_lead_sent_at, "");
  });
});

describe("meta-ads insights fetch", () => {
  test("pinned version, params, data rows", async () => {
    fakeFetch(200, { data: [{ campaign_name: "c", spend: "10" }] });
    const rows = await fetchInsights("act_123", SECRET, ["campaign_name", "spend"], { level: "ad", time_range: { since: "2026-11-01", until: "2026-11-07" } });
    assert.equal(rows.length, 1);
    const u = new URL(calls[0].url);
    assert.equal(u.pathname, `/${META_GRAPH_VERSION}/act_123/insights`);
    assert.equal(u.searchParams.get("level"), "ad");
    assert.equal(u.searchParams.get("time_range"), '{"since":"2026-11-01","until":"2026-11-07"}');
  });

  test("Graph error -> GraphCallError with code and subcode, no message, no token", async () => {
    fakeFetch(400, META_400);
    await assert.rejects(fetchInsights("123", SECRET, ["spend"], {}), (e: unknown) => {
      assert.ok(e instanceof GraphCallError);
      assert.equal(e.code, 190);
      assert.equal(e.error_subcode, 463);
      assert.ok(!e.message.includes(SECRET) && !e.message.includes("example.com"));
      return true;
    });
  });
});

describe("capi-retry", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
  const row = (p: Partial<OrderRecord>, notes: string | null = null): RetryRow => ({ order: order(p), notes });
  const rows: RetryRow[] = [
    row({ order_id: "BT2611FRESH1", paid_at: hoursAgo(20), capi_purchase_result: "error:400" }),
    row({ order_id: "BT2611NEVER1", paid_at: hoursAgo(1) }),
    row({ order_id: "BT2611OLD001", paid_at: hoursAgo(7 * 24 + 1) }),
    row({ order_id: "BT2611SENT01", paid_at: hoursAgo(5), capi_purchase_sent_at: hoursAgo(5), capi_purchase_result: "ok:1" }),
    row({ order_id: "BT2611TEST01", paid_at: hoursAgo(3) }),
    row({ order_id: "BT2611NOTE01", paid_at: hoursAgo(3) }, "בדיקת מערכת של Claude 4.11"),
    row({ order_id: "BT2611LIST01", paid_at: hoursAgo(3) }),
    row({ order_id: "BT2611DENY01", paid_at: hoursAgo(3), consent_marketing: "denied" }),
    row({ order_id: "BT2611PEND01", paid_at: null, payment_status: "pending" }),
  ];
  const testIds = new Set(["BT2611LIST01"]);

  test("selects only paid, unsent, real orders paid under 7 days ago", () => {
    const { pick, skipped } = selectRetryOrders(rows, now, testIds);
    assert.deepEqual(pick.map((p) => p.order_id), ["BT2611FRESH1", "BT2611NEVER1"]);
    const why = Object.fromEntries(skipped.map((s) => [s.order_id, s.reason]));
    assert.equal(why.BT2611OLD001, "older_than_7_days");
    assert.equal(why.BT2611SENT01, "already_sent");
    assert.equal(why.BT2611TEST01, "test:id_has_TEST");
    assert.equal(why.BT2611NOTE01, "test:notes");
    assert.equal(why.BT2611LIST01, "test:test_orders.json");
    assert.equal(why.BT2611DENY01, "consent_denied");
    assert.equal(why.BT2611PEND01, undefined, "unpaid orders are not listed at all");
  });

  test("dry run sends nothing and prints ids only", async () => {
    const lines: string[] = [];
    let resent = 0;
    const code = await runRetry({ send: false }, {
      now, testIds, loadRows: async () => rows, log: (l) => lines.push(l),
      resend: async (o) => { resent++; return o; },
    });
    assert.equal(code, 0);
    assert.equal(resent, 0);
    const out = lines.join("\n");
    assert.match(out, /would send BT2611FRESH1/);
    assert.ok(!out.includes("יעל") && !out.includes("0501234567") && !out.includes("example.com"), "no PII");
  });

  test("--send re-sends through capiPurchase and reports results", async () => {
    fakeFetch(400, META_400);
    process.env.META_CAPI_TOKEN = SECRET;
    const store = new MemStore();
    const lines: string[] = [];
    const code = await runRetry({ send: true }, {
      now, testIds, loadRows: async () => rows, log: (l) => lines.push(l),
      resend: (o) => capiPurchase(store as never, o),
    });
    assert.equal(code, 1);
    assert.equal(calls.length, 2);
    assert.match(lines.join("\n"), /sent BT2611NEVER1 result=error:400 error_code=190:463/);
    assert.ok(!lines.join("\n").includes(SECRET));
  });

  test("args: dry run by default, --env path, --send", () => {
    assert.equal(parseArgs([]).send, false);
    assert.match(parseArgs([]).envFile, /\.config\/besha\/report\.env$/);
    const a = parseArgs(["--env", "/tmp/x.env", "--send"]);
    assert.equal(a.envFile, "/tmp/x.env");
    assert.equal(a.send, true);
    assert.throws(() => parseArgs(["--bogus"]));
  });
});
