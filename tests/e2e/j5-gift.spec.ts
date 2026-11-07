/** J5: gift purchase from an HR one-pager link (partner credit, voucher released once on payment). */
import { test, expect, assertPaidRecord, capiEvents, cookie, fillGiftOrder, payOnMockGrow, state } from "./helpers.ts";

const LANDING = "/give-a-gift?ref=hr-testco&utm_source=hr&utm_medium=partner&utm_campaign=2611_hr";
// Grow needs a two-word buyer name (a one-word giver falls back to today's WhatsApp flow).
const GIVER = { giverName: "דנה לוי", giverPhone: "0527654321", giverEmail: "giver@example.test", couple1: "רותם", couple2: "גיל" };

test("J5 gift purchase from a partner link, pay", async ({ context, page, startedAt }) => {
  await page.goto(LANDING);
  await page.getByRole("link", { name: "לשליחת שובר מתנה" }).first().click();
  await page.waitForURL(/\/order\?flow=gift/);
  await fillGiftOrder(page, GIVER, { plan: "all", expectPrice: 410 });
  const orderId = await payOnMockGrow(page);

  const fbp = await cookie(context, "_fbp");
  const s = await state();
  const o = assertPaidRecord(s, orderId!, {
    buyer: { name: GIVER.giverName, phone: GIVER.giverPhone, email: GIVER.giverEmail }, amount: 410,
    credited_channel: "partner", credit_rule: "last_touch", fbp, fbc: null, startedAt,
    cols: { lt_ref: "hr-testco", lt_utm_campaign: "2611_hr" },
  });
  expect(o.order_kind).toBe("gift");
  expect(o.price_rule).toBe("gift_all_410");
  expect(o.all_meetings).toBe(true);
  expect(o.couple).toEqual({ name1: GIVER.couple1, name2: GIVER.couple2 });
  const purchase = capiEvents(s).find((e) => e.event_name === "Purchase" && e.event_id === `purchase_${orderId}`)!;
  expect(purchase.custom_data.content_category).toBe("gift");

  const released = (s.fulfil ?? []).filter((l) => l.order_id === orderId);
  expect(released.length, "voucher released exactly once").toBe(1);
  expect(String(released[0].would_release)).toMatch(/^BST-/);
  expect(released[0].would_release).toBe(o.voucher_code);
  // A full-kit voucher redeems as the full kit (the order form preselects all 11 meetings).
  const vc = await (await page.request.get(`/api/voucher-check?code=${o.voucher_code}`)).json();
  expect(vc).toMatchObject({ status: "valid", all_meetings: true });

  // The appended gift row (later lines are updates and carry only the patched columns).
  const inserted = (s.sheet_rows ?? []).find((r) => r.order_id === orderId && r.op === "insert")!;
  expect(inserted, "gift row appended").toBeTruthy();
  for (const k of ["fbc", "fbp", "visitor_id", "event_id"]) expect(Object.keys(inserted.row), `gift row has ${k}`).toContain(k);
  expect(inserted.row.fbp).toBe(fbp);
  expect(inserted.row.visitor_id).toBe(o.visitor_id);
  expect(inserted.row.event_id).toBeTruthy();
});
