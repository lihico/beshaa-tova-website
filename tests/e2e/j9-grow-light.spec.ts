/**
 * J9: Grow Light without the API (docs/attribution/GROW_LIGHT_SETUP.md). Each test starts from an empty
 * store (runs in the "failures" project). The preferred path is a per-order link through Make; when the
 * Make scenario is down or slow the order falls back to the fixed Grow page for its exact amount, where
 * the buyer types the order code; payment is confirmed by Grow's server update or Lihi's signed link.
 */
import type { Page } from "@playwright/test";
import {
  test, expect, API, GROW_SECRET_FOR_TESTS, LIHI_TEST_EMAIL, assertPaidRecord, capiEvents, cookie, emailsFor, fillSelfOrder,
  markPaidLink, order, payOnFixedPage, payOnMockGrow, pixelTracks, post, resetStore, setMakeMode, setProvider, state, waitForPayScreen,
} from "./helpers.ts";

const BUYER = { partner1: "אור", partner2: "נגה", phone: "0521112233", email: "j9@example.test", lastName: "שמש" };
const NAME = "אור שמש";

test.beforeEach(async () => { await resetStore(); });

async function selfOrder(page: Page, opts: { code?: string; expectPrice?: number } = {}): Promise<void> {
  await page.goto("/order?ref=grp-p4-g07&utm_source=facebook&utm_medium=community");
  await fillSelfOrder(page, BUYER, { expectPrice: opts.expectPrice ?? 349, code: opts.code });
}

/** An odd but valid way to type the code: lower case, spaces, no "BT". */
const oddly = (id: string) => `${id.slice(2, 6)} ${id.slice(6).toLowerCase()}`;

const purchases = (s: Awaited<ReturnType<typeof state>>, id: string) =>
  capiEvents(s).filter((e) => e.event_name === "Purchase" && e.custom_data?.order_id === id);

test("J9a Make link happy path: per-order link, paid, thank-you shows the code and no typing instruction", async ({ context, page, startedAt }) => {
  await selfOrder(page);
  const orderId = await payOnMockGrow(page);
  await expect(page.getByTestId("order-code")).toHaveText(orderId!);
  await expect(page.getByTestId("type-code-instruction")).toHaveCount(0);
  const s = await state();
  assertPaidRecord(s, orderId!, {
    buyer: { name: NAME, phone: BUYER.phone, email: BUYER.email }, amount: 349, credited_channel: "community_group",
    credit_rule: "last_touch", fbp: await cookie(context, "_fbp"), startedAt,
  });
  expect(s.mock_grow?.make.creates).toBe(1);
});

test("J9b Make down -> fixed page; code typed oddly; multipart webhook; paid once", async ({ context, page, startedAt }) => {
  await setMakeMode("down");
  await selfOrder(page);
  const orderId = await waitForPayScreen(page);
  const amount = await payOnFixedPage(page, { name: NAME, phone: BUYER.phone, email: BUYER.email, code: oddly(orderId) }, { query: "?encoding=multipart" });
  expect(amount, "the page for the exact amount").toBe(349);
  await expect(page.getByText("התשלום התקבל")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("order-code")).toHaveText(orderId);
  const s = await state();
  assertPaidRecord(s, orderId, {
    buyer: { name: NAME, phone: BUYER.phone, email: BUYER.email }, amount: 349, credited_channel: "community_group",
    credit_rule: "last_touch", fbp: await cookie(context, "_fbp"), startedAt, via: "grow_pages",
  });
  const hooks = (s.mock_grow?.page_webhooks ?? []);
  expect(hooks.map((h) => [h.content_type, h.status])).toEqual([["multipart", 200]]);
});

test("J9c Make times out -> fixed page fallback (JSON webhook), paid", async ({ context, page, startedAt }) => {
  await setMakeMode("timeout");
  await selfOrder(page);
  const orderId = await waitForPayScreen(page);
  await payOnFixedPage(page, { name: NAME, phone: BUYER.phone, email: BUYER.email, code: orderId });
  await expect(page.getByText("התשלום התקבל")).toBeVisible({ timeout: 20_000 });
  const s = await state();
  assertPaidRecord(s, orderId, {
    buyer: { name: NAME, phone: BUYER.phone, email: BUYER.email }, amount: 349, credited_channel: "community_group",
    credit_rule: "last_touch", fbp: await cookie(context, "_fbp"), startedAt, via: "grow_pages",
  });
  expect(s.mock_grow?.make.creates, "Make was asked once").toBe(1);
  // Make may still finish after we gave up: that late link is never shown and stays unpaid.
  expect(Object.values(s.mock_grow?.make.links ?? {}).map((l) => l.status).filter((x) => x !== "created"), "a late Make link is never used").toEqual([]);
  const inserts = (s.orders as Array<{ order_id: string; data: Record<string, unknown> }>).filter((l) => l.order_id === orderId);
  expect(inserts.some((l) => l.data.payment_fallback_reason === "make_timeout"), "the timeout is recorded").toBe(true);
});

test("J9d Flow A: paid on the fixed page, no webhook; Lihi's signed link marks it paid once, a replay does nothing", async ({ context, page, startedAt }) => {
  await setMakeMode("down");
  await selfOrder(page);
  const orderId = await waitForPayScreen(page);
  await payOnFixedPage(page, { name: NAME, phone: BUYER.phone, email: BUYER.email, code: orderId }, { query: "?notify=none" });
  await expect(page.getByTestId("order-code")).toHaveText(orderId);
  const fbp = await cookie(context, "_fbp");
  await page.goto("/");                                       // the buyer moves on before Lihi checks Grow
  let s = await state();
  expect(order(s, orderId).payment_status).toBe("pending");
  const link = markPaidLink(s, orderId);
  expect(link, "the mark-paid link is in Lihi's order email").toMatch(/^http:\/\/localhost:5173\/api\/pay-status\?action=mark-paid&t=BT/);

  const lihi = await context.newPage();
  await lihi.goto(link!);                                     // GET only shows the confirmation page
  await expect(lihi.getByRole("heading", { name: "סימון הזמנה כשולמה" })).toBeVisible();
  expect(order(await state(), orderId).payment_status, "a GET never marks anything").toBe("pending");
  await lihi.locator("#method").selectOption("bit");
  await lihi.locator("#confirm").click();
  await expect(lihi.getByRole("heading", { name: /סומן כשולם/ })).toBeVisible();

  s = await state();
  const o = assertPaidRecord(s, orderId, {
    buyer: { name: NAME, phone: BUYER.phone, email: BUYER.email }, amount: 349, credited_channel: "community_group",
    credit_rule: "last_touch", fbp, startedAt, via: "manual", browserPurchase: false,
  });
  expect(o.payment_method).toBe("bit");

  // Replay the POST: nothing new.
  const token = new URL(link!).searchParams.get("t")!;
  const again = await fetch(`${API}/api/pay-status?action=mark-paid`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ t: token }).toString() });
  expect(await again.text()).toContain("כבר מסומנת כשולמה");
  // Grow's server update arrives late: kept on the order, no second Purchase, no alert.
  const tx = (await state()).mock_grow!.page_tx[0].transactionId;
  expect((await post(`/__test/replay-page-webhook?tx=${tx}`, {})).status).toBe(200);
  s = await state();
  expect(purchases(s, orderId).length, "still one Purchase").toBe(1);
  expect((s.payments ?? []).filter((p) => p.order_id === orderId).length).toBe(1);
  expect(order(s, orderId).grow_transaction_id).toBe(tx);
  expect((s.alerts ?? []).map((a) => a.kind)).not.toContain("second_payment_for_paid_order");
  expect(emailsFor(s, orderId).filter((e) => (e.subject ?? "").startsWith("שולם:")).length, "one paid email").toBe(1);
});

test("J9e webhook without a code: matched by payer phone + exact sum (urlencoded), a line in the paid email, no alert", async ({ context, page, startedAt }) => {
  await setMakeMode("down");
  await selfOrder(page);
  const orderId = await waitForPayScreen(page);
  const body = new URLSearchParams({ status: "שולם", sum: "349", fullName: NAME, payerPhone: "+972-52-111-2233", payerEmail: BUYER.email,
    transactionId: "55500011", transactionType: "אשראי" }).toString();
  const r = await post(`/api/grow-notify/${GROW_SECRET_FOR_TESTS}`, body, "application/x-www-form-urlencoded");
  expect(r.status).toBe(200);
  const s = await state();
  assertPaidRecord(s, orderId, {
    buyer: { name: NAME, phone: BUYER.phone, email: BUYER.email }, amount: 349, credited_channel: "community_group",
    credit_rule: "last_touch", fbp: await cookie(context, "_fbp"), startedAt, via: "grow_pages", match: "phone_sum", browserPurchase: false,
  });
  expect((s.alerts ?? []).map((a) => a.kind)).not.toContain("matched_by_phone_sum");
  const paidMail = emailsFor(s, orderId).filter((e) => (e.subject ?? "").startsWith("שולם:"));
  expect(paidMail.length).toBe(1);
  expect(paidMail[0].html).toContain("ההתאמה נעשתה לפי הטלפון והסכום");
});

test("J9f webhook with the wrong sum: stays pending, alert, no Purchase", async ({ page }) => {
  await setMakeMode("down");
  await selfOrder(page);
  const orderId = await waitForPayScreen(page);
  await payOnFixedPage(page, { name: NAME, phone: BUYER.phone, email: BUYER.email, code: orderId }, { query: "?tamper_sum=1" });
  const s = await state();
  const o = order(s, orderId);
  expect(o.payment_status).toBe("pending");
  expect(o.payment_fallback_reason).toBe("webhook_sum_mismatch:350");
  expect((s.alerts ?? []).map((a) => a.kind)).toContain("webhook_sum_mismatch");
  expect(purchases(s, orderId)).toEqual([]);
  expect(pixelTracks(s, "Purchase").filter((l) => JSON.stringify(l.args).includes(orderId))).toEqual([]);
  await expect(page.getByText("התשלום התקבל")).toHaveCount(0);
});

test("J9g an amount with no fixed page (friend code, 314) and Make down: today's WhatsApp screen, flagged for Lihi", async ({ page }) => {
  await setMakeMode("down");
  await selfOrder(page, { code: "tamar-roi-gift", expectPrice: 314 });
  await expect(page.getByText("קיבלנו את ההזמנה")).toBeVisible();
  expect(page.url()).toMatch(/\/order(\?|$)/);
  const s = await state();
  const id = Object.keys(s.orders_replayed ?? {})[0];
  const o = order(s, id);
  expect(o.amount_expected).toBe(314);
  expect(o.payment_fallback_reason).toBe("make_http_500|no_grow_page_for_amount");
  expect((s.mock_grow?.page_tx ?? []).length).toBe(0);
  const lihi = emailsFor(s, id).find((e) => JSON.stringify(e.to).includes(LIHI_TEST_EMAIL));
  expect(lihi?.html ?? "").toContain("לא נוצר קישור תשלום אוטומטי");
});

test("J9h manual Grow link (Stage 1): time promise on the thank-you screen, Lihi's box, mark paid with the amount charged", async ({ context, page, startedAt }) => {
  await setProvider("manual");
  await selfOrder(page);
  await expect(page.getByText("תוך 24 שעות")).toBeVisible();
  let s = await state();
  const o0 = Object.values(s.orders_replayed ?? {}).find((o) => o.buyer.phone === BUYER.phone && o.payment_status === "pending");
  expect(o0, "a pending order").toBeTruthy();
  const orderId = o0!.order_id;
  expect(o0!.payment_fallback_reason).toBe("manual_link");
  expect(s.mock_grow?.make.creates ?? 0, "no Make call").toBe(0);
  const lihiMail = emailsFor(s, orderId).find((e) => (e.html ?? "").includes("לשלוח בקשת תשלום ב-Grow"));
  expect(lihiMail, "the manual box is in Lihi's order email").toBeTruthy();
  expect(lihiMail!.html).not.toContain("לא נוצר קישור תשלום אוטומטי");
  expect(lihiMail!.html).toContain("https://wa.me/972521112233?text=");

  // The couple paid 399 (express added on WhatsApp after the order): Lihi types what Grow charged.
  const link = markPaidLink(s, orderId);
  const lihi = await context.newPage();
  await lihi.goto(link!);
  await expect(lihi.locator("#paid_amount")).toHaveValue("349");
  await lihi.locator("#paid_amount").fill("399");
  await expect(lihi.locator("#diff")).toBeVisible();
  await lihi.locator("#method").selectOption("card");
  await lihi.locator("#confirm").click();
  await expect(lihi.getByRole("heading", { name: /סומן כשולם/ })).toBeVisible();

  s = await state();
  const o = order(s, orderId);
  expect(o.payment_status).toBe("paid");
  expect(o.paid_amount).toBe(399);
  expect(o.amount_expected).toBe(349);
  expect(purchases(s, orderId).map((p) => p.custom_data.value), "one Purchase at the charged amount").toEqual([399]);
  const paidMail = emailsFor(s, orderId).filter((e) => (e.subject ?? "").startsWith("שולם:"));
  expect(paidMail.length).toBe(1);
  expect(paidMail[0].html).toContain("נגבה סכום אחר");
  void startedAt;
});

test("J9i alerts are deduped: Grow resending a wrong-sum webhook alerts once", async ({ page }) => {
  await setMakeMode("down");
  await selfOrder(page);
  const orderId = await waitForPayScreen(page);
  await payOnFixedPage(page, { name: NAME, phone: BUYER.phone, email: BUYER.email, code: orderId }, { query: "?tamper_sum=1" });
  let s = await state();
  const tx = s.mock_grow!.page_tx[0].transactionId;
  expect((await post(`/__test/replay-page-webhook?tx=${tx}`, {})).status).toBe(200);
  s = await state();
  expect((s.alerts ?? []).filter((a) => a.kind === "webhook_sum_mismatch").length, "one alert for one payment").toBe(1);
});
