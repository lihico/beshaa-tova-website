/** J8: a legacy printed student poster (utm only, no ref) with the STUDENT2026 promo, pay. */
import { test, expect, assertPaidRecord, cookie, fillSelfOrder, payOnMockGrow, state } from "./helpers.ts";

const LANDING = "/flyer/students?utm_source=flyer&utm_medium=print&utm_campaign=uni2026_r2_v3a";
const BUYER = { partner1: "הילה", partner2: "רון", phone: "0587776655", email: "j8@example.test", lastName: "אברהם" };

test("J8 legacy utm-only student poster, STUDENT2026, pay", async ({ context, page, startedAt }) => {
  await page.goto(LANDING);
  await page.getByRole("link", { name: "להזמנת הערכה" }).first().click();
  await page.waitForURL(/\/order/);
  await fillSelfOrder(page, BUYER, { code: "STUDENT2026", expectPrice: 332 });
  const orderId = await payOnMockGrow(page);

  const fbp = await cookie(context, "_fbp");
  const s = await state();
  const o = assertPaidRecord(s, orderId!, {
    buyer: { name: "הילה אברהם", phone: BUYER.phone, email: BUYER.email }, amount: 332,
    credited_channel: "offline_print", credit_rule: "last_touch", fbp, fbc: null, startedAt,
    cols: { lt_utm_campaign: "uni2026_r2_v3a", lt_utm_source: "flyer", lt_utm_medium: "print", lt_landing: "/flyer/students" },
  });
  expect(o.promo_code).toBe("STUDENT2026");
  expect(o.partner_id, "STUDENT2026 is a promo, not a partner").toBeNull();
  expect(o.commission_ils).toBeNull();
});
