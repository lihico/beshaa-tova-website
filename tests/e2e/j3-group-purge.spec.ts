/** J3: Facebook group post (organic, with Facebook's fbclid), storage purge, later direct visit, pay (express is off for now). */
import { test, expect, assertPaidRecord, cookie, fillSelfOrder, payOnMockGrow, state } from "./helpers.ts";

const LANDING = "/?ref=grp-p4-g07&utm_source=facebook&utm_medium=community&utm_campaign=2611_groups&utm_content=p4&utm_term=g07&fbclid=IwAR_TEST_J3";
const BUYER = { partner1: "מיכל", partner2: "דניאל", phone: "0533334455", email: "j3@example.test", lastName: "מזרחי" };

test("J3 group post with fbclid, storage purge, direct return, order, pay", async ({ context, page, startedAt }) => {
  await page.goto(LANDING);
  await expect.poll(() => cookie(context, "bsh_vid"), { message: "bsh_vid set by /api/touch" }).toBeTruthy();
  await expect.poll(() => cookie(context, "bsh_att")).toBeTruthy();
  const vid = await cookie(context, "bsh_vid");

  // Safari's 7-day purge: script storage gone, HTTP cookies kept.
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto("/");
  await page.locator('header a[href="/order"]').first().click();
  await page.waitForURL(/\/order/);
  await fillSelfOrder(page, BUYER, { expectPrice: 349 }); // express is off for now (Lihi, 4.11.2026)
  const orderId = await payOnMockGrow(page, "4580111111111121");

  const fbp = await cookie(context, "_fbp");
  const fbc = await cookie(context, "_fbc");
  expect(fbc).toMatch(/^fb\.1\.\d+\.IwAR_TEST_J3$/);
  const s = await state();
  const o = assertPaidRecord(s, orderId!, {
    buyer: { name: "מיכל מזרחי", phone: BUYER.phone, email: BUYER.email }, amount: 349,
    credited_channel: "community_group", credit_rule: "last_touch", credited_detail: "grp-p4-g07", fbp, fbc, startedAt,
    cols: { lt_ref: "grp-p4-g07", ft_ref: "grp-p4-g07", lt_channel: "community_group", touches_count: "1", click_fbclid: "IwAR_TEST_J3" },
  });
  expect(o.credited_channel, "not paid_meta despite the fbclid").not.toBe("paid_meta");
  expect(o.last?.ref, "the direct visit did not overwrite last").toBe("grp-p4-g07");
  expect(o.first?.ref, "first came back from the bsh_att cookie").toBe("grp-p4-g07");
  expect(o.visitor_id, "visitor id unchanged from the first visit").toBe(vid);
  expect(o.price_rule, "regular shipping only").toBe("base_349");
  expect(o.express_ils ?? 0).toBe(0);
  const link = Object.values(s.mock_grow?.make.links ?? {}).find((l) => l.order_id === orderId);
  expect(link?.amount, "the Make link asks for the exact amount").toBe(349);
});
