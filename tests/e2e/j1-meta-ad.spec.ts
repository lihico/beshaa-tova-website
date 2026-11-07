/** J1: Meta ad click with dynamic params, browse, return in a new tab, pay (00_DESIGN.md 11.3). */
import { test, expect, assertPaidRecord, cookie, fillSelfOrder, payOnMockGrow, sheetColumns, state } from "./helpers.ts";

const LANDING = "/?ref=meta-120200000000000003&utm_source=ig&utm_medium=paid_social&utm_campaign=2611_zugot&utm_term=eng-sec"
  + "&utm_content=2611_eng-sec_s1_a&utm_id=120200000000000001&cid=120200000000000001&asid=120200000000000002"
  + "&aid=120200000000000003&plc=Instagram_Stories&fbclid=IwAR_TEST_J1";

const BUYER = { partner1: "יעל", partner2: "תומר", phone: "0501234567", email: "j1@example.test", lastName: "כהן" };

test("J1 Meta ad click, browse, order in a new tab, pay", async ({ context, page, startedAt }) => {
  await page.goto(LANDING);
  await expect.poll(() => cookie(context, "_fbc"), { message: "_fbc set from the fbclid" }).toMatch(/^fb\.1\.\d+\.IwAR_TEST_J1$/);
  await page.locator('header a[href="/about"]').first().click();
  await page.waitForURL(/\/about$/);

  // A new tab in the same browser: cookies and localStorage shared, sessionStorage empty.
  const tab = await context.newPage();
  await tab.goto("/order");
  expect(await tab.evaluate(() => sessionStorage.getItem("bsh_last_order"))).toBeNull();
  await fillSelfOrder(tab, BUYER, { expectPrice: 349 });
  const orderId = await payOnMockGrow(tab, "4580458045804580");
  expect(orderId).toBeTruthy();

  const fbc = await cookie(context, "_fbc");
  const fbp = await cookie(context, "_fbp");
  expect(fbc).toMatch(/^fb\.1\.\d+\.IwAR_TEST_J1$/);
  const s = await state();
  const o = assertPaidRecord(s, orderId!, {
    buyer: { name: "יעל כהן", phone: BUYER.phone, email: BUYER.email }, amount: 349,
    credited_channel: "paid_meta", credit_rule: "last_touch", fbp, fbc, startedAt,
    cols: {
      lt_meta_campaign_id: "120200000000000001", lt_meta_adset_id: "120200000000000002", lt_meta_ad_id: "120200000000000003",
      lt_utm_campaign: "2611_zugot", lt_utm_term: "eng-sec", lt_placement: "Instagram_Stories", click_fbclid: "IwAR_TEST_J1",
    },
  });
  expect(o.fbc).toBe(fbc);
  const cols = sheetColumns(o);
  for (const k of Object.keys(cols).filter((c) => c.startsWith("ft_"))) {
    const lt = `lt_${k.slice(3)}`;
    if (lt in cols) expect(cols[k], `${k} == ${lt}`).toBe(cols[lt]);
  }
});
