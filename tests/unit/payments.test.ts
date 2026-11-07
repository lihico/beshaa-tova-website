import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GrowAdapter, flattenNotifyBody, type GrowConfig } from "../../api/_payments_grow.ts";
import { methodFromType } from "../../api/_payments.ts";
import { FileStore } from "../../api/_store_file.ts";
import { computeCommission } from "../../api/_affiliate.ts";
import { visitorHex, preflightReason } from "../../api/_checkout.ts";
import type { OrderRecord, Partner } from "../../api/_attribution_core.ts";

const cfg: GrowConfig = { apiBase: "http://grow.invalid/api", userId: "u", pageCode: "p", notifySecret: "s".repeat(32), publicBaseUrl: "http://localhost:5173", notifyBaseUrl: "http://localhost:3001" };

/** GrowAdapter whose HTTP call is replaced by a canned getPaymentProcessInfo answer. */
class StubGrow extends GrowAdapter {
  calls: Array<[string, Record<string, unknown>]> = [];
  constructor(private info: Record<string, unknown> | Error) { super(cfg); }
  protected override async call(method: string, fields: Record<string, string | number | null | undefined>) {
    this.calls.push([method, fields]);
    if (this.info instanceof Error) throw this.info;
    return this.info;
  }
}

const order = (o: Partial<OrderRecord> = {}): OrderRecord => ({
  order_id: "BT2611K7Q3XA", order_kind: "order", amount_expected: 320, grow_process_ids: ["111"], grow_process_token: "tok",
  buyer: { name: "יעל לוי", phone: "0501234567", email: null }, touches: [], ...o,
} as OrderRecord);

const bracketed = "err=&status=1&data[statusCode]=2&data[sum]=320&data[transactionId]=555&data[transactionToken]=tt&data[transactionTypeId]=6" +
  "&data[processId]=111&data[processToken]=tok&data[asmachta]=9&data[customFields][cField1]=BT2611K7Q3XA&data[paymentsNum]=1";

describe("parseNotify", () => {
  const g = new GrowAdapter(cfg);
  const check = (n: ReturnType<GrowAdapter["parseNotify"]>) => {
    assert.equal(n.processId, "111"); assert.equal(n.transactionId, "555"); assert.equal(n.sum, 320);
    assert.equal(n.customFields.cField1, "BT2611K7Q3XA"); assert.equal(n.transactionTypeId, "6");
  };
  test("bracketed form keys (object from the body parser)", () => {
    const o: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(bracketed)) o[k] = v;
    check(g.parseNotify(o, "application/x-www-form-urlencoded"));
  });
  test("raw urlencoded string", () => check(g.parseNotify(bracketed, "application/x-www-form-urlencoded")));
  test("flat keys", () => check(g.parseNotify({ processId: "111", transactionId: "555", sum: "320", transactionTypeId: "6", cField1: "BT2611K7Q3XA" }, "")));
  test("nested JSON object and JSON string", () => {
    const body = { status: 1, data: { processId: "111", transactionId: "555", sum: 320, transactionTypeId: 6, customFields: { cField1: "BT2611K7Q3XA" } } };
    check(g.parseNotify(body, "application/json"));
    check(g.parseNotify(JSON.stringify(body), "application/json"));
    check(g.parseNotify(Buffer.from(JSON.stringify(body)), ""));
  });
  test("flatten keeps bracket paths", () => {
    assert.equal(flattenNotifyBody({ data: { customFields: { cField2: "x" } } })["data[customFields][cField2]"], "x");
  });
  test("methodFromType", () => {
    assert.deepEqual(["1", "5", "6", "13", "14", "15", "99", null].map(methodFromType), ["card", "paybox", "bit", "apple_pay", "google_pay", "bank", "other", "other"]);
  });
});

describe("verify", () => {
  const n = () => new GrowAdapter(cfg).parseNotify(bracketed, "application/x-www-form-urlencoded");
  test("ok: statusCode 2, sum and process match; uses the stored token", async () => {
    const g = new StubGrow({ statusCode: "2", sum: "320", transactionId: "555" });
    const v = await g.verify(n(), order());
    assert.deepEqual(v, { ok: true, sum: 320, statusCode: "2", transactionId: "555", via: "process_info" });
    assert.equal(g.calls[0][0], "getPaymentProcessInfo");
    assert.equal(g.calls[0][1].processToken, "tok");
  });
  const fails: Array<[string, Partial<OrderRecord>, Record<string, unknown> | Error, string]> = [
    ["process not ours", { grow_process_ids: ["222"] }, { statusCode: "2", sum: "320" }, "process_not_for_order"],
    ["cField1 differs", { order_id: "BT2611AAAAAA" }, { statusCode: "2", sum: "320" }, "cfield1_mismatch"],
    ["notify sum differs", { amount_expected: 288 }, { statusCode: "2", sum: "288" }, "notify_sum_mismatch"],
    ["not paid", {}, { statusCode: "1", sum: "320" }, "not_paid:1"],
    ["info call fails", {}, new Error("x"), "process_info_error"],
    ["transaction differs", {}, { statusCode: "2", sum: "320", transactionId: "777" }, "transaction_mismatch"],
  ];
  for (const [name, o, info, reason] of fails) {
    test(`fails: ${name}`, async () => {
      const v = await new StubGrow(info).verify(n(), order(o));
      assert.equal(v.ok, false);
      assert.equal((v as { reason: string }).reason, reason);
    });
  }
  test("info sum differs from the order", async () => {
    const nn = n(); nn.sum = null;
    const v = await new StubGrow({ statusCode: "2", sum: "1" }).verify(nn, order());
    assert.equal((v as { reason: string }).reason, "sum_mismatch");
  });
});

describe("FileStore", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "filestore-"));
  const s = new FileStore(dir);
  test("insert, update replay, process lookup, sheet rows", async () => {
    let legacy = 0;
    await s.appendOrder(order({ grow_process_ids: [], first: null, last: null } as Partial<OrderRecord>), async () => { legacy++; });
    assert.equal(legacy, 1);
    await assert.rejects(s.appendOrder(order(), async () => undefined));            // same id twice
    await s.updateOrder("BT2611K7Q3XA", { grow_process_ids: ["9"], payment_status: "paid" });
    const o = await s.getOrder("BT2611K7Q3XA");
    assert.equal(o?.payment_status, "paid");
    assert.equal((await s.findOrderByProcessId("9"))?.order_id, "BT2611K7Q3XA");
    assert.equal(await s.findOrderByProcessId("8"), null);
    const rows = fs.readFileSync(path.join(dir, "sheet_rows.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0].unknown_keys, []);
    assert.deepEqual(Object.keys(rows[1].row).sort(), ["grow_process_ids", "payment_status"]);
  });
  test("payments are idempotent on payment_id", async () => {
    const p = { payment_id: "555", order_id: "BT2611K7Q3XA" } as never;
    assert.equal(await s.appendPayment(p), "inserted");
    assert.equal(await s.appendPayment(p), "duplicate");
    assert.equal((await s.getPayment("555"))?.order_id, "BT2611K7Q3XA");
  });
  test("registries", async () => {
    fs.writeFileSync(path.join(dir, "partners.json"), JSON.stringify([{ partner_id: "testcreator", code: "TESTCREATOR10" }]));
    fs.writeFileSync(path.join(dir, "codes.json"), JSON.stringify([{ code: "cafe-tre-table", landing: "/cafe/tre", status: "active" }]));
    assert.equal((await s.getPartnerByCode("testcreator10"))?.partner_id, "testcreator");
    assert.equal((await s.getPartnerById("TestCreator"))?.code, "TESTCREATOR10");
    assert.equal((await s.getCode("CAFE-TRE-TABLE"))?.landing, "/cafe/tre");
  });
});

describe("commission and checkout helpers", () => {
  const partner = { partner_id: "testcreator", code: "TESTCREATOR10", commission_type: "percent", commission_value: 15,
    buyer_discount_pct: 10, active: true, phone: "052-111-2233", email: "c@x.test" } as Partner;
  test("15% of 288 rounds to 43, pending", () => assert.deepEqual(computeCommission(partner, 288, { phone: "0501234567" }),
    { commission_ils: 43, commission_status: "pending", reason: "ok" }));
  test("fixed amount", () => assert.equal(computeCommission({ ...partner, commission_type: "fixed", commission_value: 45 }, 288, {}).commission_ils, 45));
  test("self-referral by phone or email is void", () => {
    assert.equal(computeCommission(partner, 288, { phone: "+972521112233" }).commission_status, "void");
    assert.equal(computeCommission(partner, 288, { email: "C@X.test" }).commission_status, "void");
  });
  test("inactive partner: none", () => assert.equal(computeCommission({ ...partner, active: false }, 288, {}).commission_ils, null));
  test("visitorHex: 32 hex for v_ ids and legacy UUIDs", () => {
    assert.match(visitorHex("v_AAAAAAAAAAAAAAAAAAAAAA"), /^[0-9a-f]{32}$/);
    assert.equal(visitorHex("123e4567-e89b-12d3-a456-426614174000"), "123e4567e89b12d3a456426614174000");
  });
  test("preflightReason (API provider: Grow needs an Israeli mobile and two words)", () => {
    const saved = process.env.PAYMENTS_ENABLED, savedP = process.env.PAYMENT_PROVIDER;
    try {
      delete process.env.PAYMENTS_ENABLED;
      assert.equal(preflightReason({ amount_expected: 320, buyer: { name: "a b", phone: "0501234567", email: null } }), "payments_disabled");
      process.env.PAYMENTS_ENABLED = "1";
      process.env.PAYMENT_PROVIDER = "grow";
      assert.equal(preflightReason({ amount_expected: 320, buyer: { name: "a b", phone: "035551234", email: null } }), "phone_not_il_mobile");
      assert.equal(preflightReason({ amount_expected: 320, buyer: { name: "דנה", phone: "0501234567", email: null } }), "name_one_word");
      assert.equal(preflightReason({ amount_expected: 320, buyer: { name: "דנה כהן", phone: "0501234567", email: null } }), null);
      assert.equal(preflightReason({ amount_expected: 0, buyer: { name: "x", phone: "", email: null } }), null);
    } finally {
      if (saved === undefined) delete process.env.PAYMENTS_ENABLED; else process.env.PAYMENTS_ENABLED = saved;
      if (savedP === undefined) delete process.env.PAYMENT_PROVIDER; else process.env.PAYMENT_PROVIDER = savedP;
    }
  });
});
