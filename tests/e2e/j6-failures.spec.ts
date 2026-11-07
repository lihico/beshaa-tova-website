/**
 * J6: failure and abuse cases on the preferred provider (a per-order Grow link made through Make;
 * docs/attribution/GROW_LIGHT_SETUP.md). Each test starts from an empty store.
 */
import type { Page } from "@playwright/test";
import {
  test, expect, API, CARD_DECLINE, CARD_OK, GROW_SECRET_FOR_TESTS, assertPaidRecord, capiEvents, cookie, fillSelfOrder,
  order, payOnMockGrow, pixelTracks, post, resetStore, state, waitForPayPage, type TestState,
} from "./helpers.ts";

const LANDING = "/?ref=meta-120200000000000003&utm_source=ig&utm_medium=paid_social&utm_campaign=2611_zugot&utm_term=eng-sec"
  + "&utm_content=2611_eng-sec_s1_a&cid=120200000000000001&asid=120200000000000002&aid=120200000000000003&fbclid=IwAR_TEST_J6";
const BUYER = { partner1: "גלית", partner2: "יואב", phone: "0501239876", email: "j6@example.test", lastName: "ברק" };
const BUYER_NAME = "גלית ברק";
const MAKE_SECRET = "test-make-secret-0123456789";   // the dummy in tests/e2e/test.env

test.beforeEach(async () => { await resetStore(); });

/** A J1-style order up to the fake Grow payment link; returns the order id (the link's cField1). */
async function orderToPayPage(page: Page): Promise<string> {
  await page.goto(LANDING);
  await page.goto("/order");
  await fillSelfOrder(page, BUYER, { expectPrice: 349 });
  const linkId = await waitForPayPage(page);
  const s = await state();
  const id = s.mock_grow?.make.links[linkId]?.order_id;
  expect(id, "cField1 carries the order id").toBeTruthy();
  return id as string;
}

function purchasesFor(s: TestState, orderId: string) {
  return {
    capi: capiEvents(s).filter((e) => e.event_name === "Purchase" && (e.event_id === `purchase_${orderId}` || e.custom_data?.order_id === orderId)),
    pixel: pixelTracks(s, "Purchase").filter((l) => JSON.stringify(l.args).includes(orderId)),
  };
}

/** Counts that must not move when a notify is rejected. */
function footprint(s: TestState) {
  return {
    orders: (s.orders ?? []).length, payments: (s.payments ?? []).length, capi: (s.capi ?? []).length,
    approvals: (s.mock_grow?.make_approvals ?? []).length, fulfil: (s.fulfil ?? []).length,
  };
}

async function paidOrderWithNotify(page: Page): Promise<{ orderId: string; body: string }> {
  const orderId = await orderToPayPage(page);
  await payOnMockGrow(page, CARD_OK);
  const s = await state();
  const n = (s.mock_grow?.make_notifies ?? []).find((x) => x.order_id === orderId);
  expect(n?.body, "the fake Make scenario forwarded Grow's notify").toBeTruthy();
  return { orderId, body: n!.body };
}

const relay = (body: string, secret: string | null, k = GROW_SECRET_FOR_TESTS) => fetch(`${API}/api/grow-notify/${k}`, {
  method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { "x-grow-make-secret": secret } : {}) }, body,
});

test("J6a declined card: stays on the pay page, order pending, Lead but no Purchase", async ({ page }) => {
  const orderId = await orderToPayPage(page);
  await payOnMockGrow(page, CARD_DECLINE, { expectThanks: false });
  await expect(page.locator("#error")).toBeVisible();
  expect(page.url()).toMatch(/\/_mock\/grow\/link\//);
  const s = await state();
  expect(order(s, orderId).payment_status).toBe("pending");
  expect((s.payments ?? []).filter((p) => p.order_id === orderId)).toEqual([]);
  const p = purchasesFor(s, orderId);
  expect(p.capi).toEqual([]);
  expect(p.pixel).toEqual([]);
  expect(capiEvents(s).filter((e) => e.event_name === "Lead" && e.event_id === `lead_${orderId}`).length).toBe(1);
});

test("J6b the same notify relayed three more times: one payment, one Purchase, every reply says approve", async ({ page }) => {
  const { orderId } = await paidOrderWithNotify(page);
  for (let i = 0; i < 3; i++) {
    const r = await post(`/__test/replay-make-notify?o=${orderId}`, {});
    expect(r.status).toBe(200);
  }
  const s = await state();
  expect(order(s, orderId).payment_status).toBe("paid");
  expect((s.payments ?? []).filter((p) => p.order_id === orderId).length).toBe(1);
  expect(purchasesFor(s, orderId).capi.length).toBe(1);
  const replays = (s.mock_grow?.make_notifies ?? []).filter((n) => n.order_id === orderId && n.kind === "replay");
  expect(replays.length).toBe(3);
  expect(replays.every((n) => n.reply?.approve === true && n.reply?.duplicate === true), "duplicates are acknowledged, so Grow stops re-sending").toBe(true);
});

test("J6c wrong secret in the notify path: 404, nothing changes", async ({ page }) => {
  const { body } = await paidOrderWithNotify(page);
  const before = footprint(await state());
  const r = await relay(body, MAKE_SECRET, "wrong-secret");
  expect(r.status).toBe(404);
  expect(footprint(await state())).toEqual(before);
});

test("J6d Make relay without the secret header: 403; with it but an unknown order: approve false, alert", async ({ page }) => {
  const { body } = await paidOrderWithNotify(page);
  const before = await state();
  const forged = JSON.parse(body) as { data: Record<string, unknown> };
  forged.data.customFields = { cField1: "BT2611ZZZZZZ" };
  forged.data.transactionId = "99999999";
  const noHeader = await relay(JSON.stringify(forged), null);
  expect(noHeader.status).toBe(403);
  const r = await relay(JSON.stringify(forged), MAKE_SECRET);
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ ok: true, approve: false });
  const after = await state();
  expect(footprint(after)).toEqual(footprint(before));
  const alerts = (after.alerts ?? []).slice((before.alerts ?? []).length);
  expect(alerts.map((a) => a.kind)).toEqual(["make_notify_unknown_order"]);
  expect(alerts[0].ids.order_id).toBe("BT2611ZZZZZZ");
});

test("J6e buyer closes the tab after paying: paid with the server Purchase, no browser Purchase", async ({ context, page, startedAt }) => {
  const orderId = await orderToPayPage(page);
  await payOnMockGrow(page, CARD_OK, { query: "?noredirect=1", expectThanks: false });
  await expect(page.locator("#paid")).toBeVisible();
  const fbp = await cookie(context, "_fbp");
  const fbc = await cookie(context, "_fbc");
  const s = await state();
  assertPaidRecord(s, orderId, {
    buyer: { name: BUYER_NAME, phone: BUYER.phone, email: BUYER.email }, amount: 349,
    credited_channel: "paid_meta", credit_rule: "last_touch", fbp, fbc, startedAt, browserPurchase: false,
  });
  expect(purchasesFor(s, orderId).pixel).toEqual([]);
});

test("J6g tampered notify sum: order stays pending, no approve, no Purchase, alert", async ({ page }) => {
  const orderId = await orderToPayPage(page);
  await payOnMockGrow(page, CARD_OK, { query: "?tamper_sum=1", expectThanks: false });
  await page.waitForURL(new RegExp(`/order/thanks/${orderId}`));
  const s = await state();
  const o = order(s, orderId);
  expect(o.payment_status).toBe("pending");
  expect(String(o.payment_fallback_reason)).toBe("make_notify_sum_mismatch:350");
  expect((s.payments ?? []).filter((p) => p.order_id === orderId)).toEqual([]);
  expect((s.mock_grow?.make_approvals ?? []).filter((a) => a.order_id === orderId), "Approve Transaction not run").toEqual([]);
  expect((s.alerts ?? []).map((a) => a.kind)).toContain("make_notify_sum_mismatch");
  const p = purchasesFor(s, orderId);
  expect(p.capi).toEqual([]);
  expect(p.pixel).toEqual([]);
  await expect(page.getByText("התשלום התקבל")).toHaveCount(0);
});

test("J6j the legacy /redeem post to /api/gift never becomes a paid gift order", async () => {
  const r = await post("/api/gift", {
    giverName: "מימוש שובר: BST-TEST-0001", giverPhone: "0501239876", giverEmail: "redeem@voucher",
    coupleName1: "גלית", coupleName2: "יואב", weddingDate: "2027-01-01", blessing: "קוד שובר: BST-TEST-0001",
  });
  expect(r.status).toBe(400);
  const s = await state();
  expect(Object.keys(s.orders_replayed ?? {})).toEqual([]);
  expect(s.mock_grow?.make.creates ?? 0, "no Make link requested").toBe(0);
  expect(capiEvents(s).filter((e) => e.event_name === "Lead")).toEqual([]);
});

test("J6h a browser Purchase sent to /api/track is refused", async () => {
  const r = await fetch(`${API}/api/track`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_name: "Purchase", event_id: "purchase_BT2611ZZZZZZ", custom_data: { value: 349, currency: "ILS" } }),
  });
  expect(r.status).toBe(400);
  const s = await state();
  expect(capiEvents(s).filter((e) => e.event_name === "Purchase")).toEqual([]);
});
