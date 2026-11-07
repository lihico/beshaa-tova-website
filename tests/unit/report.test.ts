import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { creditOrder, parseTouch, refPartnerId, type OrderRecord, type Partner, type Touch } from "../../api/_attribution_core.ts";
import { attachRefPartner, closeCommissions, computeCommission } from "../../api/_affiliate.ts";
import { buildReport, jsonView, maskPhone, type Report } from "../../scripts/report-lib/build.ts";
import { capiEvents, loadReportData, replayOrders, type ReportData } from "../../scripts/report-lib/load.ts";
import { renderText } from "../../scripts/report-lib/render.ts";

const WEBSITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = new Date("2026-11-20T10:00:00Z");
const HOST = "beshaa-tova.co.il";

const partner: Partner = {
  partner_id: "testcreator", code: "TESTCREATOR10", name: "Test Creator", platform: "instagram", handle: "@testcreator",
  commission_type: "percent", commission_value: 15, buyer_discount_pct: 10, active: true, fp_ref_id: null,
};

function touch(url: string, ts: string, opts: Parameters<typeof parseTouch>[3] = {}): Touch {
  const t = parseTouch(`https://${HOST}${url}`, null, HOST, { ts, ...opts });
  assert.ok(t, `no touch for ${url}`);
  return t;
}

let seq = 0;
function order(p: Partial<OrderRecord> & { first?: Touch | null; last?: Touch | null }): OrderRecord {
  seq += 1;
  const id = `BT2611AAAA${String(seq).padStart(2, "0")}`.replace(/[ILOU]/g, "A");
  const first = p.first ?? null, last = p.last ?? first;
  const promo = p.partner_id && p.promo_code ? { partner_id: p.partner_id, referral: null } : null;   // a ref-only partner is not a code
  const credit = creditOrder({ first, last }, promo, p.self_reported_source ?? null);
  const paid = p.payment_status === "paid";
  return {
    order_id: id, order_kind: "order", created_at: "2026-11-10T09:00:00Z", payment_status: "pending",
    amount_expected: 320, currency: "ILS", price_rule: "base_320", client_displayed_amount: 320,
    promo_code: null, partner_id: null, ...credit,
    touches: [first, last].filter((t, i, a): t is Touch => !!t && a.indexOf(t) === i),
    self_reported_source: null, not_engaged: false, visitor_id: `v_${"x".repeat(22)}`, session_id: null,
    fbc: null, fbp: null, ga_client_id: null, client_ip: null, user_agent: null, event_source_url: null,
    consent_marketing: "unknown", buyer: { name: `Buyer ${seq}`, phone: `05012345${String(seq).padStart(2, "0")}`, email: null },
    couple: { name1: "A", name2: "B" }, lead_event_id: `lead_${id}`, grow_process_ids: [], grow_process_token: null,
    payment_fallback_reason: null, paid_at: paid ? "2026-11-10T09:05:00Z" : null, paid_amount: paid ? (p.amount_expected ?? 320) : null,
    grow_transaction_id: null, asmachta: null, payment_method: paid ? "card" : null, payer_name: null, payer_phone: null, payer_email: null,
    match_method: paid ? "order_id" : null, capi_purchase_event_id: paid ? `purchase_${id}` : null,
    capi_purchase_sent_at: paid ? "2026-11-10T09:05:01Z" : null, capi_purchase_result: paid ? "logged" : null,
    commission_ils: null, commission_status: null, invoice_number: null, invoice_url: null,
    ...p, first, last,
  } as OrderRecord;
}

const META_URL = "/?ref=meta-333&utm_source=ig&utm_medium=paid_social&utm_campaign=2611_zugot&utm_term=eng-sec&utm_content=2611_eng-sec_s1_a&utm_id=111&cid=111&asid=222&aid=333&plc=instagram_feed";
const tMeta = touch(META_URL, "2026-11-10T08:00:00Z");
const tQr = touch("/?ref=pst-v5-eng-1a-biulib&utm_source=poster&utm_medium=print", "2026-11-10T08:00:00Z", { kind: "qr_scan", q_code: "pst-v5-eng-1a-biulib" });
const tAff = touch("/?ref=aff-testcreator&utm_source=instagram&utm_medium=affiliate", "2026-11-01T08:00:00Z", { kind: "ref_link", q_code: "aff-testcreator" });
const tGrp = touch("/?ref=grp-tlv-brides", "2026-11-10T08:00:00Z");

const oMeta = order({ first: tMeta, payment_status: "paid", self_reported_source: "instagram" });
const oQr = order({ first: tQr, payment_status: "paid", self_reported_source: "friend" });
const oCode = order({ first: tGrp, partner_id: "testcreator", promo_code: "TESTCREATOR10", payment_status: "paid", amount_expected: 288,
  price_rule: "promo10_288", client_displayed_amount: 288, commission_ils: 43, commission_status: "pending" });
const oRef = order({ first: tAff, last: tMeta, partner_id: "testcreator", payment_status: "paid", commission_ils: 48, commission_status: "pending",
  capi_purchase_event_id: null, capi_purchase_sent_at: null });   // health: missing CAPI id + no logged Purchase
const oFree = order({ first: null, payment_status: "free", amount_expected: 0, price_rule: "voucher_free", client_displayed_amount: 0, order_kind: "redeem" });
const oOld = order({ first: tGrp, created_at: "2026-11-15T09:00:00Z", client_displayed_amount: 300, payment_fallback_reason: "payments_disabled" });
const oOutside = order({ first: tMeta, created_at: "2026-09-01T09:00:00Z", payment_status: "paid" });

function data(orders: OrderRecord[]): ReportData {
  const purchases = orders.filter((o) => o.capi_purchase_event_id).map((o) => ({ event_name: "Purchase", event_id: `purchase_${o.order_id}`, order_id: o.order_id }));
  const leads = orders.map((o) => ({ event_name: "Lead", event_id: `lead_${o.order_id}`, order_id: o.order_id }));
  return {
    source: "file", dir: "/x/.test-data", orders,
    touches: [tMeta, tMeta, tQr, tAff, tGrp].map((t) => ({ ...t, visitor_id: "v_1" })),
    payments: orders.filter((o) => o.payment_status === "paid").map((o) => ({
      payment_id: `p_${o.order_id}`, order_id: o.order_id, provider: "grow_mock", amount: o.paid_amount ?? 0, currency: "ILS",
      paid_at: o.paid_at ?? "", asmachta: null, method: "card", card_suffix: null, installments: 1, verified: true,
      verification: "process_info", raw_notify_digest: "d",
    })),
    capi: [...leads, ...purchases],
    codes: [{ code: "pst-v5-eng-1a-biulib", channel: "offline_print", landing: "/", location: "BIU library", cost_ils: 12, status: "active" },
      { code: "old-retired", landing: "/", status: "retired" }],
    partners: [partner], blocked_egress: [],
  };
}

const ALL = [oMeta, oQr, oCode, oRef, oFree, oOld, oOutside];
const rep: Report = buildReport(data(ALL), { from: "2026-11-01", to: "2026-11-30", model: "credited", paidOnly: false, now: NOW });

describe("affiliate credit and commission (section 8)", () => {
  test("refPartnerId: last touch first, then first touch; Meta / QR refs never match", () => {
    assert.equal(refPartnerId({ first: tAff, last: tMeta }), "testcreator");
    assert.equal(refPartnerId({ first: tMeta, last: tAff }), "testcreator");
    assert.equal(refPartnerId({ first: tMeta, last: tQr }), null);
    assert.equal(refPartnerId({ first: null, last: null }), null);
    const plain = touch("/?ref=AFF-Noa_1", "2026-11-01T08:00:00Z");
    assert.equal(refPartnerId({ first: null, last: plain }), "noa_1");
  });
  test("attachRefPartner: registry + active check; a typed code wins; lookup errors are swallowed", async () => {
    const store = { getPartnerById: async (id: string) => (id === "testcreator" ? partner : null) };
    const o = order({ first: tAff, last: tMeta });
    assert.equal((await attachRefPartner(o, store)).partner_id, "testcreator");
    const coded = order({ first: tAff, partner_id: "other" });
    assert.equal((await attachRefPartner(coded, store)).partner_id, "other");
    const inactive = { getPartnerById: async () => ({ ...partner, active: false }) };
    assert.equal((await attachRefPartner(order({ first: tAff }), inactive)).partner_id, null);
    const ended = { getPartnerById: async () => ({ ...partner, end: "2026-10-01" }) };
    assert.equal((await attachRefPartner(order({ first: tAff }), ended, NOW)).partner_id, null);
    const broken = { getPartnerById: async () => { throw new Error("sheet down"); } };
    assert.equal((await attachRefPartner(order({ first: tAff }), broken)).partner_id, null);
    assert.equal((await attachRefPartner(order({ first: tQr }), store)).partner_id, null);
  });
  test("commission: 15% of the paid amount (net of discount); self-referral void", () => {
    assert.deepEqual(computeCommission(partner, 288, { phone: "0501111111" }, NOW), { commission_ils: 43, commission_status: "pending", reason: "ok" });
    const self = computeCommission({ ...partner, phone: "+972-50-111-1111" }, 288, { phone: "0501111111" }, NOW);
    assert.equal(self.commission_status, "void");
  });
  test("closeCommissions: hold passed -> approved, refunded/cancelled -> void, others untouched", () => {
    const base = { partner_id: "testcreator", commission_ils: 43, commission_status: "pending" as const };
    const a = order({ ...base, payment_status: "paid", paid_at: "2026-11-01T09:00:00Z" });
    const b = order({ ...base, payment_status: "paid", paid_at: "2026-11-15T09:00:00Z" });
    const c = order({ ...base, payment_status: "refunded" });
    const d = order({ ...base, payment_status: "cancelled" });
    const e = order({ partner_id: "testcreator", commission_ils: 43, commission_status: "approved", payment_status: "paid", paid_at: "2026-10-01T09:00:00Z" });
    const ch = closeCommissions([a, b, c, d, e], NOW, 14);
    assert.deepEqual(ch.map((x) => [x.order_id, x.to, x.reason]), [
      [a.order_id, "approved", "hold_passed"], [c.order_id, "void", "order_refunded"], [d.order_id, "void", "order_cancelled"],
    ]);
    assert.equal(closeCommissions([b], NOW, 0).length, 1);
  });
});

describe("buildReport (section 10)", () => {
  test("summary", () => {
    const s = rep.summary;
    assert.equal(s.orders_submitted, 6);
    assert.equal(s.payable_orders, 5);
    assert.equal(s.paid, 4);
    assert.equal(s.revenue, 320 + 320 + 288 + 320);
    assert.equal(s.free_redemptions, 1);
    assert.deepEqual(s.pending_over_48h, [oOld.order_id]);
    assert.equal(s.commission_total, 91);
    assert.equal(s.by_kind.redeem.orders, 1);
  });
  test("by channel: credited, first and last", () => {
    const row = (rows: Report["by_channel"]["credited"], ch: string) => rows.find((r) => r.channel === ch);
    assert.equal(rep.by_channel.credited[0].channel, "paid_meta");
    assert.deepEqual({ ...row(rep.by_channel.credited, "paid_meta") }, { channel: "paid_meta", orders: 2, paid: 2, revenue: 640, commission: 48 });
    assert.equal(row(rep.by_channel.credited, "affiliate")?.revenue, 288);
    assert.equal(row(rep.by_channel.credited, "offline_print")?.paid, 1);
    assert.equal(row(rep.by_channel.credited, "direct")?.orders, 1);
    assert.equal(row(rep.by_channel.first, "affiliate")?.revenue, 320);       // oRef's first touch was the creator link
    assert.equal(row(rep.by_channel.first, "community_group")?.orders, 2);
    assert.equal(row(rep.by_channel.last, "paid_meta")?.paid, 2);
  });
  test("Meta drill-down: campaign -> ad set -> ad with names, placement", () => {
    assert.equal(rep.meta.campaigns.length, 1);
    const c = rep.meta.campaigns[0];
    assert.deepEqual([c.campaign_id, c.campaign_name, c.touches, c.orders, c.paid, c.revenue], ["111", "2611_zugot", 2, 2, 2, 640]);
    assert.deepEqual([c.adsets[0].adset_id, c.adsets[0].adset_name], ["222", "eng-sec"]);
    assert.deepEqual([c.adsets[0].ads[0].ad_id, c.adsets[0].ads[0].ad_name, c.adsets[0].ads[0].revenue], ["333", "2611_eng-sec_s1_a", 640]);
    assert.deepEqual(rep.meta.placements.map((p) => [p.placement, p.paid]), [["instagram_feed", 2]]);
    const first = buildReport(data(ALL), { from: "2026-11-01", to: null, model: "first", paidOnly: false, now: NOW });
    assert.equal(first.meta.campaigns[0].orders, 1);                          // under first touch oRef is the creator's
  });
  test("QR and ref codes: scans, touched orders, credited revenue, cost per paid order", () => {
    const qr = rep.codes.find((c) => c.code === "pst-v5-eng-1a-biulib");
    assert.ok(qr);
    assert.deepEqual([qr.scans, qr.orders, qr.paid, qr.revenue, qr.credited_paid, qr.credited_revenue, qr.cost_per_paid, qr.location],
      [1, 1, 1, 320, 1, 320, 12, "BIU library"]);
    const grp = rep.codes.find((c) => c.code === "grp-tlv-brides");
    assert.deepEqual([grp?.orders, grp?.paid, grp?.credited_paid, grp?.in_registry], [2, 1, 0, false]);
    assert.ok(rep.codes.some((c) => c.code === "old-retired" && c.orders === 0));
    assert.ok(!rep.codes.some((c) => c.code.startsWith("meta-") || c.code.startsWith("aff-")));
  });
  test("affiliates: code uses, ref touches, revenue, commission by status", () => {
    const a = rep.affiliates.find((x) => x.partner_id === "testcreator");
    assert.ok(a);
    assert.deepEqual([a.code_uses, a.ref_touches, a.orders, a.paid, a.revenue, a.commission.pending], [1, 1, 2, 2, 608, 91]);
  });
  test("first vs last matrix (paid)", () => {
    const m = rep.first_vs_last.cells;
    assert.equal(m.paid_meta.paid_meta, 1);
    assert.equal(m.affiliate.paid_meta, 1);
    assert.equal(m.offline_print.offline_print, 1);
    assert.equal(m.community_group.community_group, 1);
  });
  test("self-report vs tracked", () => {
    const s = rep.self_report;
    assert.deepEqual([s.with_answer, s.compared, s.agree_strict, s.agree_compatible], [2, 2, 0, 1]);
    assert.deepEqual(s.disagreements.map((d) => [d.order_id, d.self_channel, d.tracked_channel]), [[oQr.order_id, "referral", "offline_print"]]);
  });
  test("health checks", () => {
    const h = rep.health;
    assert.equal(h.ok, false);
    assert.deepEqual(h.paid_missing_capi_event_id, [oRef.order_id]);
    assert.deepEqual(h.paid_without_logged_purchase, [oRef.order_id]);
    assert.deepEqual(h.paid_no_touch, []);
    assert.deepEqual(h.purchase_for_unpaid, []);
    assert.deepEqual(h.price_mismatch.map((p) => p.order_id), [oOld.order_id]);
    assert.deepEqual(h.fallback, [{ order_id: oOld.order_id, reason: "payments_disabled" }]);
    assert.equal(h.capi_purchase_unique, 3);
    assert.equal(h.blocked_egress, 0);
    const d = data(ALL);
    d.capi.push({ event_name: "Purchase", event_id: `purchase_${oOld.order_id}` }, { event_name: "Purchase", event_id: `purchase_${oMeta.order_id}` });
    const h2 = buildReport(d, { model: "credited", paidOnly: false, now: NOW }).health;
    assert.deepEqual(h2.purchase_for_unpaid, [oOld.order_id]);
    assert.deepEqual(h2.duplicate_purchase_events, [oMeta.order_id]);
    const clean = buildReport(data([oMeta, oQr]), { model: "credited", paidOnly: false, now: NOW }).health;
    assert.equal(clean.ok, true);
  });
  test("window and paid-only filters", () => {
    assert.equal(buildReport(data(ALL), { model: "credited", paidOnly: false, now: NOW }).summary.orders_submitted, 7);
    assert.equal(buildReport(data(ALL), { from: "2026-11-01", model: "credited", paidOnly: true, now: NOW }).summary.orders_submitted, 4);
  });
  test("buyer data only in the per-order list; --json drops it unless --orders", () => {
    assert.equal(maskPhone("0501234567"), "***567");
    const j = JSON.stringify(jsonView(rep, false));
    assert.ok(!j.includes("Buyer ") && !j.includes("050123"));
    assert.ok(JSON.stringify(jsonView(rep, true)).includes("Buyer "));
    const txt = renderText(rep, { withOrders: false });
    assert.ok(!txt.includes("Buyer "));
    for (const n of ["1. Summary", "2. By channel", "3. Meta", "4. QR", "5. Affiliates", "6. First", "7. Self-report", "8. Health checks: ATTENTION"]) assert.ok(txt.includes(n), n);
    assert.ok(renderText(rep, { withOrders: true }).includes("Buyer 1"));
    assert.ok(!txt.includes(String.fromCharCode(0x2014)));   // no em dash in the report
  });
});

describe("loader and CLI (file source)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), ".test-data-unit-report-"));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tsx = path.join(WEBSITE, "node_modules", ".bin", "tsx");
  const cli = path.join(WEBSITE, "scripts", "attribution-report.ts");
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(tsx, [cli, ...args], { cwd: WEBSITE, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env } });

  const lines = [
    { op: "insert", order_id: oCode.order_id, data: { ...oCode, payment_status: "pending", paid_at: null, commission_ils: null, commission_status: null } },
    { op: "update", order_id: oCode.order_id, data: { payment_status: "paid", paid_at: "2026-10-01T09:00:00Z", paid_amount: 288 } },
    { op: "update", order_id: oCode.order_id, data: { commission_ils: 43, commission_status: "pending" } },
    { op: "update", order_id: "BT2611ZZZZZZ", data: { payment_status: "paid" } },        // update without insert: ignored
  ];
  fs.writeFileSync(path.join(dir, "orders.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n{torn\n");
  fs.writeFileSync(path.join(dir, "capi.jsonl"), JSON.stringify({ payload: { data: [{ event_name: "Purchase", event_id: `purchase_${oCode.order_id}`, custom_data: { order_id: oCode.order_id } }] }, would_send: false }) + "\n");
  fs.writeFileSync(path.join(dir, "partners.json"), JSON.stringify([partner]));
  fs.writeFileSync(path.join(dir, "blocked_egress.jsonl"), "");

  test("replay, capi parsing, registries", () => {
    const d = loadReportData(dir);
    assert.equal(d.orders.length, 1);
    assert.equal(d.orders[0].payment_status, "paid");
    assert.equal(d.orders[0].commission_status, "pending");
    assert.deepEqual(capiEvents([{ payload: { data: [{ event_name: "Lead", event_id: "lead_x" }] } }, { nope: 1 }]).map((e) => e.event_id), ["lead_x"]);
    assert.equal(replayOrders([]).length, 0);
    assert.equal(d.partners.length, 1);
    assert.deepEqual(d.blocked_egress, []);
  });
  test("CLI: --commissions --dry-run writes nothing to the store; report.txt written with the order list", () => {
    const r = run(["--dir", dir, "--commissions", "--dry-run"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Commission close \(hold 14 days\) dry run/);
    assert.ok(!r.stdout.includes("Buyer "));
    assert.equal(loadReportData(dir).orders[0].commission_status, "pending");
    const txt = fs.readFileSync(path.join(dir, "report.txt"), "utf8");
    assert.ok(txt.includes("9. Orders") && txt.includes(oCode.order_id) && txt.includes("affiliate"));
  });
  test("CLI: --commissions applies (pending older than the hold -> approved); --json has no buyer data", () => {
    const r = run(["--dir", dir, "--commissions", "--json", "--no-write"]);
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.affiliates[0].commission.approved, 43, r.stderr);
    assert.ok(!r.stdout.includes("Buyer "));
    assert.equal(loadReportData(dir).orders[0].commission_status, "approved");
  });
  test("CLI: refuses --source sheet, a non .test-data folder and unknown flags; --check exits 3 on attention", () => {
    assert.equal(run(["--dir", dir, "--source", "sheet"]).status, 2);
    assert.equal(run(["--dir", os.tmpdir()]).status, 2);
    assert.equal(run(["--dir", dir, "--bogus"]).status, 2);
    assert.equal(run(["--dir", dir, "--check", "--no-write"]).status, 3);   // paid order without a payment record
    assert.equal(run(["--dir", dir, "--no-write"], { ATTR_DATA_DIR: dir }).status, 0);
  });
});
