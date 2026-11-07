/**
 * J10: /order?debug=true (Lihi, 7.11.2026). The form arrives filled in, the consent bar is shown even
 * after a choice, and the order is saved as a system test that never reaches Meta's server events.
 * Runs in the "failures" project (before the store reset), so it never touches the report journey.
 */
import { test, expect, capiEvents, state } from "./helpers.ts";

test("J10 debug autofill: filled form, consent bar shown, test order kept away from Meta", async ({ page }) => {
  await page.goto("/order?debug=true");
  await expect(page.getByTestId("debug-banner")).toBeVisible();
  await expect(page.locator("#partner1")).toHaveValue("יעל");
  await expect(page.locator("#phone")).not.toHaveValue("");
  await expect(page.locator("#city")).not.toHaveValue("");
  const terms = page.locator("label", { hasText: "תנאי השימוש" }).locator("[role=checkbox]");
  await expect(terms).toHaveAttribute("aria-checked", "true");

  // The consent bar is there to test, and accepting it keeps the page working.
  const bar = page.getByRole("region", { name: "עוגיות" }).or(page.locator("[aria-label='עוגיות']"));
  await expect(bar.first()).toBeVisible();
  await bar.first().getByRole("button", { name: "אישור" }).click();
  await expect(bar.first()).toBeHidden();

  // Reload: a choice is saved, but debug still shows the bar.
  await page.reload();
  await expect(page.locator("[aria-label='עוגיות']").first()).toBeVisible();

  await page.getByRole("button", { name: /שליחת הטופס|להזמנה \(תשלום/ }).first().click();
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/order") && r.request().method() === "POST");
  await page.getByRole("button", { name: /הכל נכון/ }).first().click();
  const res = await sent;
  const reqBody = res.request().postDataJSON() as { test?: boolean; freeText?: string };
  expect(reqBody.test).toBe(true);
  expect(reqBody.freeText).toContain("בדיקת מערכת");
  const body = await res.json() as { order_id: string };

  const s = await state();
  const o = s.orders_replayed![body.order_id];
  expect(o.consent_marketing, "a test order is stored as denied so no CAPI event goes out").toBe("denied");
  const capi = capiEvents(s).filter((e) => e.event_id.endsWith(body.order_id) || e.custom_data?.order_id === body.order_id);
  expect(capi, "no server Lead or Purchase for a test order").toEqual([]);
});
