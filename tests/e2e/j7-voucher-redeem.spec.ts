/** J7: a gift voucher redemption is a Lead, never a Purchase, and never reaches Grow. */
import { test, expect, capiEvents, pixelEventId, pixelTracks, state } from "./helpers.ts";

const CODE = "BST-TEST-0001";   // seeded as a paid gift in the file store (fixtures/vouchers.json)
const BUYER = { partner1: "רוני", partner2: "עמית", phone: "0549998877", email: "j7@example.test", lastName: "שלום" };

test("J7 voucher redemption: free, Lead only, no Grow call", async ({ page }) => {
  const check = page.waitForResponse((r) => r.url().includes("/api/voucher-check"));
  await page.goto(`/order?voucher=${CODE}`);
  expect(await (await check).json()).toMatchObject({ status: "valid" });

  await page.locator("#partner1").fill(BUYER.partner1);
  await page.getByRole("button", { name: "היא", exact: true }).first().click();
  await page.locator("#partner2").fill(BUYER.partner2);
  await page.getByRole("button", { name: "הוא", exact: true }).nth(1).click();
  await page.locator("#phone").fill(BUYER.phone);
  await page.locator("#email").fill(BUYER.email);
  await page.locator("#lastName").fill(BUYER.lastName);
  await page.locator("#street").fill("הרצל 10");
  await page.locator("#city").fill("תל אביב");
  await page.locator("#zipCode").fill("6120101");
  await expect(page.locator("#express"), "no express shipping on a voucher").toHaveCount(0);
  const terms = page.locator("label", { hasText: "תנאי השימוש" }).locator("[role=checkbox]");
  await terms.click();
  await page.getByRole("button", { name: "שליחת הטופס" }).click();
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/order") && r.request().method() === "POST");
  await page.getByRole("button", { name: "הכל נכון, שלחו!" }).click();
  const body = await (await sent).json() as { order_id: string; amount: number; payment_url: string | null };
  await expect(page.getByText("הפנייה נשלחה!")).toBeVisible();
  expect(page.url()).not.toContain("/_mock/grow");
  expect(body.amount).toBe(0);
  expect(body.payment_url).toBeNull();

  const s = await state();
  const o = s.orders_replayed![body.order_id];
  expect(o.order_kind).toBe("redeem");
  expect(o.payment_status).toBe("free");
  expect(o.amount_expected).toBe(0);
  expect(o.voucher_code).toBe(CODE);
  expect(o.grow_process_ids).toEqual([]);
  const grow = Object.values(s.mock_grow?.processes ?? {}).filter((p) => p.cFields.cField1 === body.order_id);
  expect(grow.length, "no Grow payment process").toBe(0);
  expect(Object.values(s.mock_grow?.make.links ?? {}).filter((l) => l.order_id === body.order_id), "no Make payment link").toEqual([]);
  const capi = capiEvents(s).filter((e) => e.event_id.endsWith(body.order_id) || e.custom_data?.order_id === body.order_id);
  expect(capi.map((e) => e.event_name)).toEqual(["Lead"]);
  expect(capi[0].custom_data.content_category).toBe("voucher_redeem");
  expect(capiEvents(s).filter((e) => e.event_name === "Purchase" && e.custom_data?.order_id === body.order_id)).toEqual([]);
  const leads = pixelTracks(s, "Lead").filter((l) => pixelEventId(l) === `lead_${body.order_id}`);
  expect(leads.length).toBe(1);
  expect((leads[0].args[2] as Record<string, unknown>).content_category).toBe("voucher_redeem");
  expect(pixelTracks(s, "Purchase").filter((l) => String(pixelEventId(l)).includes(body.order_id))).toEqual([]);

  // The same code again is now "redeemed".
  const again = await page.request.get(`/api/voucher-check?code=${CODE}`);
  expect(await again.json()).toMatchObject({ status: "redeemed" });
});
