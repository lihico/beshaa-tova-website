/**
 * J11 (pending set, branch site-changes-1411): the lite kit, the tier step, exact meeting count, lite vouchers,
 * two kits, the gift page prices, landing versions and the About story. Awaiting Lihi's approval; tests only.
 */
import { test, expect, fillGiftOrder, fillSelfOrder, state } from "./helpers.ts";

const BUYER = { partner1: "מאיה", partner2: "רון", phone: "0523334455", email: "lite@example.test", lastName: "בר" };
const GIVER = { giverName: "שני כהן", giverPhone: "0527778899", giverEmail: "lite-gift@example.test", couple1: "דנה", couple2: "עידו" };

test("J11d lite order: tier step first, 199, exactly 4 meetings, rule lite_199", async ({ page }) => {
  await page.goto("/order");
  await page.getByRole("button", { name: /אנחנו מזמינים לעצמנו/ }).click();
  const step = page.getByTestId("tier-step");
  await expect(step).toBeVisible();
  // The tier step comes before the names.
  const order = await page.locator("[data-testid=tier-step], #partner1").evaluateAll((els) => els.map((e) => e.id || e.getAttribute("data-testid")));
  expect(order[0]).toBe("tier-step");
  await expect(step.locator("[data-tier=base]")).toHaveAttribute("aria-checked", "true");
  await expect(step).toContainText("199 ₪");
  await expect(step).toContainText("349 ₪");
  await expect(step).toContainText("410 ₪");

  const sent = page.waitForResponse((r) => r.url().endsWith("/api/order") && r.request().method() === "POST");
  await fillSelfOrder(page, BUYER, { chooseFlow: false, tier: "lite", expectPrice: 199 });
  const body = await (await sent).json() as { order_id: string; amount: number };
  expect(body.amount).toBe(199);
  const s = await state();
  const o = s.orders_replayed![body.order_id];
  expect(o.price_rule).toBe("lite_199");
  expect(o.meetings?.length).toBe(4);
  expect(o.all_meetings).toBe(false);
});

test("J11e exact count: the ketubah is optional and counts; a fifth pick is refused; too few stops the submit", async ({ page }) => {
  await page.goto("/order?tier=lite");
  await page.getByRole("button", { name: /אנחנו מזמינים לעצמנו/ }).click();
  await expect(page.locator("[data-testid=tier-step] [data-tier=lite]")).toHaveAttribute("aria-checked", "true");
  const counter = page.getByTestId("meeting-counter");
  await expect(counter).toHaveText("0/4 נבחרו");
  for (const id of ["13", "02", "05"]) await page.locator(`[data-meeting-id="${id}"]`).click();
  await expect(page.locator('[data-meeting-id="13"]')).toHaveAttribute("aria-pressed", "true");
  await expect(counter).toHaveText("3/4 נבחרו");

  await page.locator("#partner1").fill("מאיה");
  await page.getByRole("button", { name: "היא", exact: true }).first().click();
  await page.locator("#partner2").fill("רון");
  await page.getByRole("button", { name: "הוא", exact: true }).nth(1).click();
  await page.locator("#phone").fill("0523334455");
  await page.locator("#lastName").fill("בר");
  await page.locator("#street").fill("הרצל 10");
  await page.locator("#city").fill("חיפה");
  await page.locator("label", { hasText: "תנאי השימוש" }).locator("[role=checkbox]").click();
  await page.getByRole("button", { name: /להזמנה \(תשלום לאחר מכן\)/ }).click();
  await expect(page.getByText("נשארו עוד 1 מפגשים לבחור (בחרו 4).")).toBeVisible();

  for (const id of ["06", "07"]) await page.locator(`[data-meeting-id="${id}"]`).click();
  await expect(counter).toHaveText("4/4 נבחרו");
  await expect(page.locator('[data-meeting-id="07"]')).toHaveAttribute("aria-pressed", "false");

  // 8 meetings: the counter follows the kit.
  await page.locator("[data-testid=tier-step] [data-tier=base]").click();
  await expect(counter).toHaveText("4/8 נבחרו");
});

test("J11f lite gift voucher: 199, gift_lite_199, and it redeems as a locked 4-meeting kit", async ({ page }) => {
  await page.goto("/order?flow=gift");
  await expect(page.getByTestId("gift-tier-step")).toBeVisible();
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/gift") && r.request().method() === "POST");
  await fillGiftOrder(page, GIVER, { plan: "lite", expectPrice: 199 });
  const body = await (await sent).json() as { order_id: string };
  const s = await state();
  const o = s.orders_replayed![body.order_id];
  expect(o.price_rule).toBe("gift_lite_199");
  const vc = await (await page.request.get(`/api/voucher-check?code=${o.voucher_code}`)).json();
  expect(vc).toMatchObject({ status: "valid", all_meetings: false, tier: "lite" });

  await page.goto(`/order?voucher=${o.voucher_code}`);
  const step = page.getByTestId("tier-step");
  await expect(step).toContainText("השובר שלכם הוא ל-4 מפגשים.");
  await expect(step.locator("[data-tier=lite]")).toHaveAttribute("aria-checked", "true");
  await expect(step.locator("[data-tier=base]")).toBeDisabled();
  await expect(page.getByTestId("meeting-counter")).toContainText("/4");
});

test("J11g home price cards and two kits; gift page prices, two couples and Shachar's quote", async ({ page }) => {
  await page.goto("/");
  const cards = page.getByTestId("tier-links");
  await cards.scrollIntoViewIfNeeded();
  for (const p of ["199 ₪", "349 ₪", "410 ₪"]) await expect(cards).toContainText(p);
  const pair = page.getByTestId("pair-offer");
  await expect(pair.locator('[data-pair="8+8"]')).toContainText("698 ₪");
  await expect(pair.locator('[data-pair="8+8"]')).toContainText("611 ₪");
  await expect(pair.locator('[data-pair="11+8"]')).toContainText("672 ₪");
  await expect(pair.locator('[data-pair="11+11"]')).toContainText("718 ₪");
  await expect(pair.locator('[data-pair="4+4"]')).toContainText("348 ₪");
  await expect(pair.getByRole("link", { name: /כותבים לי בוואטסאפ/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/972502023669\?text=/);
  await cards.locator("[data-tier=lite]").click();
  await page.waitForURL(/\/order\?.*tier=lite/);
  await page.getByRole("button", { name: /אנחנו מזמינים לעצמנו/ }).click();
  await expect(page.locator("[data-testid=tier-step] [data-tier=lite]")).toHaveAttribute("aria-checked", "true");

  await page.goto("/give-a-gift");
  await expect(page.getByTestId("gift-tier-links")).toContainText("199 ₪");
  await expect(page.getByRole("heading", { name: "עוד זוג חברים שמתחתן בקרוב?" })).toBeVisible();
  await expect(page.getByText("\"ממליצה בתור מתנה לזוג שמתחתן", { exact: false })).toBeVisible();
});

test("J11h landing versions: ?for=married hero, ?for=gift to the gift page with its parameters", async ({ page }) => {
  await page.goto("/?for=married");
  await expect(page.locator('[data-section="hero"]')).toContainText("זמן איכות זוגי, גם אחרי החתונה");
  await expect(page.locator('[data-section="hero"]')).not.toContainText("כבר נשואים?");
  await page.goto("/");
  await expect(page.locator('[data-section="hero"]')).toContainText("מסע זוגי עצמאי לפני החתונה");
  await page.goto("/?for=gift&utm_source=meta&utm_campaign=2611_gift&ref=fb-gift1");
  await page.waitForURL(/\/give-a-gift\?utm_source=meta&utm_campaign=2611_gift&ref=fb-gift1$/);
});

test("J11i About story and photo; FAQ \"על מה זה מבוסס?\" without names", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByText("רצינו שהחתונה שלנו תהיה יותר מאירוע שמח.")).toBeVisible();
  await expect(page.locator('img[src="/illustrations/about-wedding-prep.jpg"]')).toHaveCount(1);
  await expect(page.locator("body")).toContainText("פסיכולוגית ודוקטורנטית. אוהבת שיחות מהלב.");
  await expect(page.locator("body")).not.toContainText("לפני שנה התחתנו");
  await page.goto("/faq");
  await page.getByRole("button", { name: "על מה זה מבוסס?" }).click();
  await expect(page.locator("body")).toContainText("פותחו על בסיס מחקר וידע בתחום הפסיכולוגיה והזוגיות");
  await expect(page.locator("body")).not.toContainText("גוטמן");
});
