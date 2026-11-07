/** J4: influencer link on one phone, the coupon typed on another (code credit, commission). */
import { test, expect, assertPaidRecord, cookie, fillSelfOrder, payOnMockGrow, state } from "./helpers.ts";

const BUYER = { partner1: "שירה", partner2: "אורי", phone: "0545556677", email: "j4@example.test", lastName: "פרץ" };

test("J4 influencer coupon typed on a second device", async ({ page, startedAt, newGuardedContext }) => {
  // Phone A: the creator's link.
  const resp = await page.goto("/r/testcreator");
  const first = resp!.request().redirectedFrom();
  expect(first, "/r answers with a redirect").toBeTruthy();
  expect((await first!.response())!.status()).toBe(302);
  const u = new URL(page.url());
  expect(u.pathname).toBe("/");
  expect(u.searchParams.get("ref")).toBe("aff-testcreator");
  expect(u.searchParams.get("utm_source")).toBe("instagram");
  expect(u.searchParams.get("utm_medium")).toBe("affiliate");
  const vidA = await cookie(page.context(), "bsh_vid");
  expect(vidA).toBeTruthy();

  // Phone B: a fresh browser, direct to /order, types the code.
  const b = await newGuardedContext();
  const pb = await b.newPage();
  await pb.goto("/order");
  await fillSelfOrder(pb, BUYER, { code: "TESTCREATOR10", expectPrice: 332 });
  const orderId = await payOnMockGrow(pb);

  const fbp = await cookie(b, "_fbp");
  const s = await state();
  const o = assertPaidRecord(s, orderId!, {
    buyer: { name: "שירה פרץ", phone: BUYER.phone, email: BUYER.email }, amount: 332,
    credited_channel: "affiliate", credit_rule: "code", fbp, fbc: null, startedAt,
  });
  expect(o.promo_code).toBe("TESTCREATOR10");
  expect(o.partner_id).toBe("testcreator");
  expect(o.paid_amount).toBe(332);
  expect(o.commission_ils).toBe(50);   // 15% of 332 = 49.8
  expect(o.commission_status).toBe("pending");
  expect(o.visitor_id).not.toBe(vidA);

  const aff = (s.affiliate ?? []).filter((l) => l.order_id === orderId);
  expect(aff.length, "one affiliate postback").toBe(1);
  expect(aff[0]).toMatchObject({ order_id: orderId, partner_id: "testcreator", amount_ils: 332, plan: "kit" });
  for (const k of Object.keys(aff[0])) expect(k, "no buyer data in the postback").not.toMatch(/name|phone|email|address/i);

  const affTouches = (s.touches ?? []).filter((t) => t.channel === "affiliate" && t.ref === "aff-testcreator");
  expect(affTouches.length, "phone A's affiliate touch logged").toBeGreaterThanOrEqual(1);
  expect(affTouches.every((t) => t.visitor_id === vidA && t.visitor_id !== o.visitor_id)).toBe(true);
});
