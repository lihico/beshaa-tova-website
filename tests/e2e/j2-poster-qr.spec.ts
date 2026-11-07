/** J2: poster QR short link (/q/<code>), a cross-origin-style redirect chain, then order and pay. */
import type { Response as PwResponse } from "@playwright/test";
import { test, expect, assertPaidRecord, cookie, fillSelfOrder, payOnMockGrow, state } from "./helpers.ts";

const CODE = "pst-v5-eng-1a-biulib";
const EXPECTED_LANDING = new URLSearchParams({
  ref: CODE, utm_source: "poster", utm_medium: "print", utm_campaign: "2610_posters_v5", utm_content: "eng_1a", utm_term: "biulib",
});
const BUYER = { partner1: "נועה", partner2: "איתי", phone: "0521112233", email: "j2@example.test", lastName: "לוי" };

function sorted(p: URLSearchParams): string[][] {
  return [...p.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Every response of a goto's redirect chain, first to last. */
async function chain(resp: PwResponse | null): Promise<Array<{ url: string; status: number; location: string | null }>> {
  const out: Array<{ url: string; status: number; location: string | null }> = [];
  let req = resp?.request() ?? null;
  while (req) {
    const r = await req.response();
    out.unshift({ url: req.url(), status: r?.status() ?? 0, location: r ? (await r.allHeaders()).location ?? null : null });
    req = req.redirectedFrom();
  }
  return out;
}

test("J2 poster QR short link, hero CTA, order, pay", async ({ context, page, startedAt, newGuardedContext }) => {
  const steps = await chain(await page.goto(`/q/${CODE}`));
  expect(steps[0].status, "/q answers 302").toBe(302);
  const loc = new URL(steps[0].location ?? "", "http://localhost:5173");
  expect(loc.pathname).toBe("/");
  expect(sorted(loc.searchParams)).toEqual(sorted(EXPECTED_LANDING));
  expect(steps.at(-1)!.status).toBe(200);
  expect(sorted(new URL(page.url()).searchParams)).toEqual(sorted(EXPECTED_LANDING));

  await page.getByRole("link", { name: "להזמנת הערכה" }).first().click();
  await page.waitForURL(/\/order/);
  await fillSelfOrder(page, BUYER, { expectPrice: 349 });
  const orderId = await payOnMockGrow(page, "4580000000000000");

  const fbp = await cookie(context, "_fbp");
  const s = await state();
  const o = assertPaidRecord(s, orderId!, {
    buyer: { name: "נועה לוי", phone: BUYER.phone, email: BUYER.email }, amount: 349,
    credited_channel: "offline_print", credit_rule: "last_touch", credited_detail: CODE, fbp, fbc: null, startedAt,
    cols: { lt_q_code: CODE, lt_ref: CODE, lt_utm_campaign: "2610_posters_v5" },
  });
  const scans = (s.touches ?? []).filter((t) => t.visitor_id === o.visitor_id && t.kind === "qr_scan");
  expect(scans.length, "one qr_scan touch logged").toBe(1);
  expect(scans[0].q_code).toBe(CODE);
  expect(o.touches.filter((t) => t.kind === "qr_scan" && t.q_code === CODE).length, "one qr_scan in the order").toBe(1);
  expect(o.touches.length, "the SPA landing after the 302 is not a second touch").toBe(1);

  // Retired and unknown codes never 404: they land on the home page with ref=q-unknown-<code>.
  const other = await newGuardedContext();
  const p2 = await other.newPage();
  for (const c of ["old-retired", "nope"]) {
    const st = await chain(await p2.goto(`/q/${c}`));
    for (const x of st) expect(x.status, `${x.url} status`).not.toBe(404);
    expect(st[0].status).toBe(302);
    const u = new URL(p2.url());
    expect(u.pathname).toBe("/");
    expect(u.searchParams.get("ref")).toBe(`q-unknown-${c}`);
  }
});
