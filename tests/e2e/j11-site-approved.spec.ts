/**
 * J11: the site changes Lihi approved on 14.11.2026 (sheets_html/SITE_CHANGES_2026-11-14_answers.txt, "מאשרת").
 * Runs in the "failures" project: it may create a test order, so it stays away from the report journey.
 */
import { test, expect, fillMeetings, state } from "./helpers.ts";

test("J11a home: new hero, share link, gift button to the gift page, quotes, story after quotes, behaviour events", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator('[data-section="hero"]');
  await expect(hero.getByRole("heading", { level: 1 })).toContainText("מפגשים זוגיים");
  await expect(hero).toContainText("לחתונה יש אולם, צלם ומפיק");
  await expect(hero).toContainText("מבוססת מחקר");
  await expect(hero.getByRole("link", { name: "הזמנה כשובר מתנה לזוג" })).toHaveAttribute("href", "/give-a-gift");
  await expect(hero.getByRole("link", { name: "לשלוח לבן או בת הזוג" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);

  // H2: the rotating prompts come after "how it works"; U2: the story right after the quotes.
  const order = await page.locator("[data-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
  expect(order.slice(0, 5)).toEqual(["hero", "how", "prompts", "quotes", "story"]);

  // Q1 + Q2 + U1: new title, the four new quotes first, three open, the rest behind a button, stars on each.
  const quotes = page.locator('[data-section="quotes"]');
  await quotes.scrollIntoViewIfNeeded();
  await expect(quotes.getByRole("heading", { name: "דיברתם על זה? לא ככה." })).toBeVisible();
  await expect(quotes.locator("figure")).toHaveCount(3);
  await expect(quotes.locator("figure").first()).toContainText("כבר דיברנו על הכל");
  await quotes.getByRole("button", { name: /עוד ציטוטים/ }).click();
  expect(await quotes.locator("figure").count()).toBeGreaterThan(10);
  expect(await quotes.locator("figure").first().locator("svg").count()).toBe(5);

  // S2: no image text names Nativ.
  const alts = await page.locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("alt") ?? ""));
  expect(alts.join(" ")).not.toContain("נתיב");

  // M2: section views reach gtag (fixed names only).
  await page.locator('[data-section="pricing"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const s = await state();
  const events = (s.gtag ?? []).map((l) => (l as { args?: unknown[] }).args ?? []).filter((a) => a[0] === "event");
  const sections = events.filter((a) => a[1] === "view_section").map((a) => (a[2] as { section?: string }).section);
  expect(sections).toContain("hero");
  expect(sections).toContain("pricing");
});

test("J11b gift page quotes and FAQ questions; student code on the flyer page", async ({ page }) => {
  await page.goto("/give-a-gift");
  await expect(page.getByText("הערכה היא מתנה ענקית לכל זוג!!!", { exact: false })).toBeVisible();
  await expect(page.getByText("זו מתנה מצוינת לעצמנו ואנחנו ממליצים בחום!!", { exact: false })).toBeVisible();

  await page.goto("/faq");
  for (const q of ["איך מציעים את זה לבן או בת הזוג?", "אנחנו כבר נשואים. זה בשבילנו?"]) {
    await expect(page.getByRole("button", { name: q })).toBeVisible();
  }
  await expect(page.locator("body")).not.toContainText("סקאלות");

  await page.goto("/flyer/students");
  await expect(page.getByRole("link", { name: "STUDENT2026" })).toHaveAttribute("href", "/order?promo=STUDENT2026");
});

test("J11c order form: extras folded, zip optional, review screen masked for Clarity, price box readable", async ({ page }) => {
  await page.goto("/order");
  await page.getByRole("button", { name: /אנחנו מזמינים לעצמנו/ }).click();
  await expect(page.getByText("הכי מתאים כששניכם רוצים.")).toBeVisible();
  await expect(page.getByTestId("extras-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByPlaceholder("למשל: YAEL-TOMER-2609")).toHaveCount(0);
  await page.getByTestId("extras-toggle").click();
  await expect(page.getByPlaceholder("למשל: YAEL-TOMER-2609")).toBeVisible();
  await expect(page.getByTestId("kit-value")).toHaveAttribute("data-clarity-unmask", "true");

  await page.locator("#partner1").fill("נועה");
  await page.getByRole("button", { name: "היא", exact: true }).first().click();
  await page.locator("#partner2").fill("איתי");
  await page.getByRole("button", { name: "הוא", exact: true }).nth(1).click();
  await page.locator("#phone").fill("0541112233");
  await page.locator("#lastName").fill("לוי");
  await page.locator("#street").fill("הרצל 10");
  await page.locator("#city").fill("חיפה");
  // no zip code
  await fillMeetings(page);   // the pending set asks for exactly as many meetings as the kit (O2)
  const terms = page.locator("label", { hasText: "תנאי השימוש" }).locator("[role=checkbox]");
  await terms.click();
  await page.getByRole("button", { name: /להזמנה \(תשלום לאחר מכן\)/ }).click();
  await expect(page.getByRole("heading", { name: "לפני שנשלח - בואו נוודא" })).toBeVisible();
  await expect(page.locator("[data-clarity-mask=true]").first()).toBeVisible();
});
