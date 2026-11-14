/**
 * Shared helpers for the E2E journeys (docs/attribution/00_DESIGN.md section 11.1).
 * Test mode only: every call goes to dev-api on 127.0.0.1:3001 or Vite on localhost:5173.
 */
import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toSheetColumns, type OrderRecord, type PaymentRecord, type Touch } from "../../api/_attribution_core.ts";

export const API = "http://127.0.0.1:3001";
export const SITE = "http://localhost:5173";
export const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = path.join(WEBSITE_DIR, ".test-data");
export const LIHI_TEST_EMAIL = "lihi-test@example.test";
export const CARD_OK = "4580458045804580";
export const CARD_DECLINE = "4000000000000002";
/** The per-order Grow payment link made through the (fake) Make scenario: the preferred provider. */
export const PAY_PAGE_RE = /^http:\/\/127\.0\.0\.1:3001\/_mock\/grow\/link\/(\d+)/;
/** A fixed Grow sales page for one amount (fallback). */
export const FIXED_PAGE_RE = /^http:\/\/127\.0\.0\.1:3001\/_mock\/grow\/page\/(\d+)/;
export const THANKS_RE = /\/order\/thanks\/(BT\d{4}[0-9A-HJKMNP-TV-Z]{6})(?:\?|$)/;
export const PAY_SCREEN_RE = /\/order\/pay\/(BT\d{4}[0-9A-HJKMNP-TV-Z]{6})$/;
export const ORDER_ID_RE = /^BT\d{4}[0-9A-HJKMNP-TV-Z]{6}$/;

/** Events the browser mirrors to /api/track (random ids; allowed next to the two order events). */
export const MIRROR_EVENTS = new Set(["PageView", "ViewContent", "InitiateCheckout", "AddPaymentInfo"]);

// ---------------------------------------------------------------------------------------------
// Test state (GET /__test/state)
// ---------------------------------------------------------------------------------------------

export interface CapiEvent {
  event_name: string; event_time: number; event_id: string; event_source_url?: string; action_source: string;
  user_data: Record<string, string | string[] | undefined>; custom_data: Record<string, unknown>;
}
export interface CapiLine { payload: { data: CapiEvent[]; test_event_code?: string }; would_send: boolean; at: string }
export interface PixelLine { args: unknown[]; url: string; ts: number; page_load: string; received_at: number }
export interface EmailRecord { n: number; to: unknown; subject: string | null; html: string | null }
export interface SheetRowLine { op: string; order_id: string; row: Record<string, string>; unknown_keys: string[] }
export interface MockGrowState {
  processes: Record<string, { processId: string; status: string; sum: number; cFields: Record<string, string>; transaction?: { transactionId: string } }>;
  approvals: Array<{ transactionId: string | null; processId: string | null }>;
  notifies: Array<{ order_id: string | null; processId: string; kind: string; status: number | null }>;
  make: { mode: string; creates: number; links: Record<string, { linkId: string; order_id: string; amount: number; status: string; transaction?: { transactionId: string } }> };
  page_tx: Array<{ transactionId: string; amount: number; typed_code: string; phone: string }>;
  page_webhooks: Array<{ transactionId: string; content_type: string; status: number | null; reply: Record<string, unknown> | null; kind: string }>;
  make_notifies: Array<{ order_id: string; transactionId: string; status: number | null; reply: Record<string, unknown> | null; kind: string; body: string }>;
  make_approvals: Array<{ transactionId: string; order_id: string }>;
}
export type StoredTouch = Touch & { visitor_id?: string };

export interface TestState {
  orders?: unknown[];
  orders_replayed?: Record<string, OrderRecord>;
  payments?: PaymentRecord[];
  capi?: CapiLine[];
  pixel?: PixelLine[];
  gtag?: unknown[];
  touches?: StoredTouch[];
  mock_grow?: MockGrowState;
  sheet_rows?: SheetRowLine[];
  affiliate?: Array<Record<string, unknown>>;
  fulfil?: Array<Record<string, unknown>>;
  alerts?: Array<{ kind: string; ids: Record<string, unknown> }>;
  blocked_egress: unknown[];
  emails: EmailRecord[];
}

/** The fake Make "create link" scenario: ok | timeout | down | nourl (reset to ok by resetStore). */
export async function setMakeMode(mode: "ok" | "timeout" | "down" | "nourl"): Promise<void> {
  const r = await fetch(`${API}/__test/make-mode?mode=${mode}`, { method: "POST" });
  expect(r.status, "POST /__test/make-mode").toBe(200);
}

/** Switches PAYMENT_PROVIDER in the test api until the next resetStore(). */
export async function setProvider(p: "manual" | "grow_make" | "grow_pages"): Promise<void> {
  const r = await fetch(`${API}/__test/provider?p=${p}`, { method: "POST" });
  expect(r.status, "POST /__test/provider").toBe(200);
}

export async function resetStore(): Promise<void> {
  const r = await fetch(`${API}/__test/reset`, { method: "POST" });
  expect(r.status, "POST /__test/reset").toBe(200);
}

/** Waits for dev-api's background work (afterResponse) to settle, then reads every file. */
export async function state(): Promise<TestState> {
  const idle = await fetch(`${API}/__test/idle`);
  expect(idle.status, "GET /__test/idle").toBe(200);
  const r = await fetch(`${API}/__test/state`);
  expect(r.status, "GET /__test/state").toBe(200);
  return (await r.json()) as TestState;
}

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Israeli mobile "050-123 4567" -> "972501234567" (what Meta's CAPI hashes). */
export function e164(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("0") ? `972${d.slice(1)}` : d;
}

export function capiEvents(s: TestState): CapiEvent[] {
  return (s.capi ?? []).flatMap((l) => l.payload?.data ?? []);
}

export function order(s: TestState, orderId: string): OrderRecord {
  const o = s.orders_replayed?.[orderId];
  expect(o, `order ${orderId} in orders.jsonl`).toBeTruthy();
  return o as OrderRecord;
}

export function sheetColumns(o: OrderRecord): Record<string, string> {
  return toSheetColumns(o) as Record<string, string>;
}

/** Pixel `track` calls (from the fbevents stub). */
export function pixelTracks(s: TestState, name?: string): PixelLine[] {
  return (s.pixel ?? []).filter((l) => Array.isArray(l.args) && l.args[0] === "track" && (!name || l.args[1] === name));
}

export function pixelEventId(l: PixelLine): string | undefined {
  const opts = l.args[3] as { eventID?: string } | undefined;
  return opts?.eventID;
}

/** POST to dev-api (test-process side, not through the browser). */
export async function post(pathname: string, body: unknown, contentType = "application/json"): Promise<Response> {
  return fetch(`${API}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------------------------
// Browser guard: only localhost / 127.0.0.1 may be reached; everything else is aborted and listed
// ---------------------------------------------------------------------------------------------

export function isLocalUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.protocol === "data:" || x.protocol === "blob:" || x.protocol === "about:") return true;
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(x.hostname);
  } catch {
    return false;
  }
}

export async function guardBrowser(context: BrowserContext, external: string[]): Promise<void> {
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (isLocalUrl(url)) return route.continue();
    external.push(url);
    return route.abort();
  });
}

const CONTEXT_OPTIONS = { baseURL: SITE, locale: "he-IL", timezoneId: "Asia/Jerusalem" } as const;

type Fixtures = {
  /** Every non-local URL any guarded context tried to reach (asserted empty after the test). */
  external: string[];
  /** A fresh, guarded context ("another phone"); closed after the test. */
  newGuardedContext: () => Promise<BrowserContext>;
  /** Test start (ms), for the Pixel lines that belong to this test. */
  startedAt: number;
};

export const test = base.extend<Fixtures>({
  startedAt: async ({}, use) => { await use(Date.now()); },
  external: async ({}, use) => {
    const list: string[] = [];
    await use(list);
    expect(list, "browser requests to non-local hosts (facebook, google, ...)").toEqual([]);
    const s = await state();
    expect(s.blocked_egress, "dev-api blocked_egress.jsonl").toEqual([]);
  },
  context: async ({ context, external }, use) => {
    await guardBrowser(context, external);
    await use(context);
  },
  newGuardedContext: async ({ browser, external }, use) => {
    const made: BrowserContext[] = [];
    await use(async () => {
      const c = await (browser as Browser).newContext(CONTEXT_OPTIONS);
      await guardBrowser(c, external);
      made.push(c);
      return c;
    });
    for (const c of made) await c.close();
  },
});
export { expect };

// ---------------------------------------------------------------------------------------------
// Order form and fake Grow
// ---------------------------------------------------------------------------------------------

export interface SelfBuyer { partner1: string; partner2: string; phone: string; email: string; lastName: string }

export const BUYER_DEFAULTS = { street: "הרצל 10", city: "תל אביב", zipCode: "6120101" };

/** Fills the self order form (Order.tsx ids), optionally a code, ticks the terms and confirms. */
export async function fillSelfOrder(page: Page, b: SelfBuyer, opts: { chooseFlow?: boolean; code?: string; expectPrice?: number; express?: boolean } = {}): Promise<void> {
  if (opts.chooseFlow !== false) await page.getByRole("button", { name: /אנחנו מזמינים לעצמנו/ }).click();
  await page.locator("#partner1").fill(b.partner1);
  await page.getByRole("button", { name: "היא", exact: true }).first().click();
  await page.locator("#partner2").fill(b.partner2);
  await page.getByRole("button", { name: "הוא", exact: true }).nth(1).click();
  await page.locator("#phone").fill(b.phone);
  await page.locator("#email").fill(b.email);
  await page.locator("#lastName").fill(b.lastName);
  await page.locator("#street").fill(BUYER_DEFAULTS.street);
  await page.locator("#city").fill(BUYER_DEFAULTS.city);
  await page.locator("#zipCode").fill(BUYER_DEFAULTS.zipCode);
  if (opts.express) {
    await page.locator("#express").click();
    await expect(page.locator("#express")).toHaveAttribute("aria-checked", "true");
  }
  if (opts.code) {
    // The code field folds under "עוד פרטים (לא חובה)" (U4, 14.11.2026).
    await openExtras(page);
    await page.getByPlaceholder("למשל: YAEL-TOMER-2609").fill(opts.code);
  }
  if (opts.expectPrice !== undefined) {
    await expect(page.getByText(`${opts.expectPrice} ₪`, { exact: true }).first()).toBeVisible();
  }
  const terms = page.locator("label", { hasText: "תנאי השימוש" }).locator("[role=checkbox]");
  await terms.click();
  await expect(terms).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /להזמנה \(תשלום לאחר מכן\)|שליחת הטופס/ }).click();
  await page.getByRole("button", { name: "הכל נכון, שלחו!" }).click();
}

/** Opens "עוד פרטים (לא חובה)" on the order form when it is folded (notes, religious/married boxes, voucher code). */
export async function openExtras(page: Page): Promise<void> {
  const t = page.getByTestId("extras-toggle");
  if ((await t.count()) && (await t.getAttribute("aria-expanded")) !== "true") await t.click();
}

export interface GiftGiver { giverName: string; giverPhone: string; giverEmail: string; couple1: string; couple2: string }

/** Fills the gift form (flow=gift already chosen), no wedding date yet, ticks the terms and confirms. */
export async function fillGiftOrder(page: Page, g: GiftGiver, opts: { plan?: "base" | "all"; expectPrice?: number } = {}): Promise<void> {
  await page.locator("#giverName").fill(g.giverName);
  await page.locator("#giverPhone").fill(g.giverPhone);
  await page.locator("#giverEmail").fill(g.giverEmail);
  await page.locator("#coupleName1Gift").fill(g.couple1);
  await page.locator("#coupleName2Gift").fill(g.couple2);
  await page.locator("#giftWeddingDate").fill("2027-03-18");
  if (opts.plan) await page.locator(`[data-gift-plan=${opts.plan}]`).click();
  if (opts.expectPrice !== undefined) await expect(page.getByText(`${opts.expectPrice} ₪`, { exact: true }).first()).toBeVisible();
  const terms = page.locator("label", { hasText: "תנאי השימוש" }).locator("[role=checkbox]");
  await terms.click();
  await expect(terms).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "הזמנת שובר מתנה" }).click();
  await page.getByRole("button", { name: "הכל נכון, שלחו!" }).click();
}

/** Waits for the fake Grow payment link (made through Make) and returns its link id. */
export async function waitForPayPage(page: Page): Promise<string> {
  await page.waitForURL(PAY_PAGE_RE, { timeout: 20_000 });
  return PAY_PAGE_RE.exec(page.url())![1];
}

/** The pay screen of a fixed-page order (/order/pay/<id>): code, copy button, instruction; returns the id. */
export async function waitForPayScreen(page: Page): Promise<string> {
  await page.waitForURL(PAY_SCREEN_RE, { timeout: 20_000 });
  const id = PAY_SCREEN_RE.exec(page.url())![1];
  await expect(page.getByTestId("order-code")).toHaveText(id);
  await expect(page.getByTestId("type-code-instruction")).toBeVisible();
  return id;
}

/**
 * On /order/pay/<id>: click the pay button, then on the fake fixed Grow page type the details and the
 * order code (as the buyer would, possibly in an odd format) and pay. `query` adds test options
 * (?encoding=multipart, ?notify=none, ?tamper_sum=1, ?noredirect=1). Returns the page amount.
 */
export async function payOnFixedPage(page: Page, b: { name: string; phone: string; email: string; code: string },
  opts: { query?: string; card?: string; expectThanks?: boolean } = {}): Promise<number> {
  await page.locator("#go-pay").click();
  await page.waitForURL(FIXED_PAGE_RE, { timeout: 20_000 });
  const amount = Number(FIXED_PAGE_RE.exec(page.url())![1]);
  if (opts.query) await page.goto(page.url().replace(/\?.*$/, "") + opts.query);
  await page.locator("#fullName").fill(b.name);
  await page.locator("#phone").fill(b.phone);
  await page.locator("#email").fill(b.email);
  await page.locator("#orderCode").fill(b.code);
  await page.locator("#card").fill(opts.card ?? CARD_OK);
  await page.locator("#exp").fill("12/30");
  await page.locator("#cvv").fill("123");
  await page.locator("#pay").click();
  if (opts.expectThanks !== false) await page.waitForURL(/\/order\/thanks$/, { timeout: 20_000 });
  return amount;
}

/** The "סמני כשולם" link from Lihi's order email for this order (null when absent). */
export function markPaidLink(s: TestState, orderId: string): string | null {
  for (const e of emailsFor(s, orderId)) {
    const m = /href="([^"]*action=mark-paid[^"]*)"/.exec(e.html ?? "");
    if (m) return m[1].replace(/&amp;/g, "&");
  }
  return null;
}

/** Pays on the fake Grow page; `query` re-opens the page with a test option (e.g. "?noredirect=1"). */
export async function payOnMockGrow(page: Page, card = CARD_OK, opts: { query?: string; expectThanks?: boolean } = {}): Promise<string | null> {
  await waitForPayPage(page);
  if (opts.query) await page.goto(page.url().replace(/\?.*$/, "") + opts.query);
  await page.locator("#card").fill(card);
  await page.locator("#exp").fill("12/30");
  await page.locator("#cvv").fill("123");
  await page.locator("#pay").click();
  if (opts.expectThanks === false) return null;
  await page.waitForURL(THANKS_RE, { timeout: 20_000 });
  await expect(page.getByText("התשלום התקבל")).toBeVisible({ timeout: 20_000 });
  return THANKS_RE.exec(page.url())![1];
}

export async function cookie(context: BrowserContext, name: string): Promise<string | null> {
  const all = await context.cookies(SITE);
  return all.find((c) => c.name === name)?.value ?? null;
}

// ---------------------------------------------------------------------------------------------
// Section 11.2: the "paid record proof" shared by every paying journey
// ---------------------------------------------------------------------------------------------

export interface PaidExpectation {
  buyer: { name: string; phone: string; email: string };
  amount: number;
  credited_channel: string;
  credit_rule: string;
  credited_detail?: string | null;
  /** Expected sheet columns (toSheetColumns names: lt_*, ft_*, promo_code, ...). */
  cols?: Record<string, string>;
  /** Browser cookies at payment time (the CAPI copy must carry the same values). */
  fbp: string | null;
  fbc?: string | null;
  /** false when the buyer never reached the thank-you page (J6e). */
  browserPurchase?: boolean;
  startedAt: number;
  /** How the order was paid: the Make link (default), a fixed page, or Lihi's mark-paid link. */
  via?: "grow_make" | "grow_pages" | "manual";
  /** Expected match_method (default: order_id for Make, order_code for a fixed page, manual for the link). */
  match?: string;
}

function toList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];
}

export function emailsFor(s: TestState, orderId: string): EmailRecord[] {
  return s.emails.filter((e) => `${e.subject ?? ""} ${e.html ?? ""}`.includes(orderId));
}

/** PageView once per page load and path (StrictMode or a stray inline tag would double it). */
export function assertPageViews(s: TestState, startedAt: number): void {
  const byLoad = new Map<string, PixelLine[]>();
  for (const l of (s.pixel ?? []).filter((x) => x.ts >= startedAt)) {
    const list = byLoad.get(l.page_load) ?? [];
    list.push(l);
    byLoad.set(l.page_load, list);
  }
  expect(byLoad.size, "page loads that ran the Pixel stub").toBeGreaterThan(0);
  for (const [load, lines] of byLoad) {
    const pvs = lines.filter((l) => l.args[0] === "track" && l.args[1] === "PageView").map((l) => new URL(l.url).pathname);
    expect(pvs.length, `PageView in page load ${load}`).toBeGreaterThan(0);
    expect(new Set(pvs).size, `duplicate PageView in page load ${load}: ${pvs.join(", ")}`).toBe(pvs.length);
  }
}

export function assertPaidRecord(s: TestState, orderId: string, x: PaidExpectation): OrderRecord {
  const purchaseId = `purchase_${orderId}`;
  const leadId = `lead_${orderId}`;
  // 1. the order record
  const inserts = (s.orders as Array<{ op: string; order_id: string }> | undefined ?? []).filter((l) => l.op === "insert" && l.order_id === orderId);
  expect(inserts.length, "one order record").toBe(1);
  const o = order(s, orderId);
  expect(o.payment_status).toBe("paid");
  expect(o.amount_expected).toBe(x.amount);
  expect(o.paid_amount).toBe(o.amount_expected);
  expect(o.buyer.name).toBe(x.buyer.name);
  expect(o.buyer.phone.replace(/\D/g, "")).toBe(x.buyer.phone.replace(/\D/g, ""));
  expect(o.buyer.email).toBe(x.buyer.email);
  const via = x.via ?? "grow_make";
  if (via !== "manual") expect(o.grow_transaction_id).toBeTruthy();
  expect(o.match_method).toBe(x.match ?? (via === "grow_make" ? "order_id" : via === "grow_pages" ? "order_code" : "manual"));
  expect(o.verify_mode).toBe(via === "manual" ? "manual_token" : "unsigned_webhook");
  expect(o.credited_channel).toBe(x.credited_channel);
  expect(o.credit_rule).toBe(x.credit_rule);
  if (x.credited_detail !== undefined) expect(o.credited_detail).toBe(x.credited_detail);
  const cols = sheetColumns(o);
  for (const [k, v] of Object.entries(x.cols ?? {})) expect(cols[k], `column ${k}`).toBe(v);

  // 2. payments
  const pays = (s.payments ?? []).filter((p) => p.order_id === orderId);
  expect(pays.length, "one payment row").toBe(1);
  expect(pays[0].provider).toBe(via);
  expect(pays[0].verification).toBe(via === "manual" ? "manual_token" : "unsigned_webhook");
  expect(pays[0].verified, "an unsigned Grow webhook is never marked verified").toBe(via === "manual");
  expect(pays[0].amount).toBe(x.amount);

  // 3. CAPI log
  const capi = capiEvents(s);
  const purchases = capi.filter((e) => e.event_name === "Purchase");
  const mine = purchases.filter((e) => e.event_id === purchaseId);
  expect(mine.length, "exactly one CAPI Purchase").toBe(1);
  expect(purchases.filter((e) => e.custom_data?.order_id === orderId).length, "no other Purchase for this order").toBe(1);
  const p = mine[0];
  expect(p.custom_data.value).toBe(x.amount);
  expect(p.custom_data.currency).toBe("ILS");
  expect(p.custom_data.order_id).toBe(orderId);
  expect(toList(p.user_data.em)[0]).toBe(sha256(x.buyer.email.trim().toLowerCase()));
  expect(toList(p.user_data.ph)[0]).toBe(sha256(e164(x.buyer.phone)));
  expect(toList(p.user_data.external_id)).toContain(sha256(o.visitor_id));
  expect(p.user_data.fbp, "CAPI fbp = browser _fbp").toBe(x.fbp ?? undefined);
  if (x.fbc !== undefined) expect(p.user_data.fbc, "CAPI fbc = browser _fbc").toBe(x.fbc ?? undefined);
  expect(p.user_data.client_ip_address).toBeTruthy();
  expect(p.user_data.client_user_agent).toBeTruthy();
  expect(capi.filter((e) => e.event_name === "Lead" && e.event_id === leadId).length, "exactly one CAPI Lead").toBe(1);
  const strays = capi.filter((e) => !MIRROR_EVENTS.has(e.event_name) && e.event_id !== purchaseId && e.event_id !== leadId
    && !/^(lead|purchase)_BT/.test(e.event_id));
  expect(strays.map((e) => `${e.event_name}:${e.event_id}`), "CAPI events with unexpected ids").toEqual([]);

  // 4. Pixel (browser)
  const pxPurchase = pixelTracks(s, "Purchase").filter((l) => pixelEventId(l) === purchaseId);
  if (x.browserPurchase === false) {
    expect(pxPurchase.length, "no browser Purchase (buyer never saw the thank-you page)").toBe(0);
  } else {
    expect(pxPurchase.length, "exactly one browser Purchase").toBe(1);
    expect(pxPurchase[0].ts).toBeGreaterThan(Date.parse(o.paid_at as string));
  }
  expect(pixelTracks(s, "Lead").filter((l) => pixelEventId(l) === leadId).length, "exactly one browser Lead").toBe(1);
  assertPageViews(s, x.startedAt);

  // 5. no Purchase anywhere for an unpaid order
  const paidIds = new Set(Object.values(s.orders_replayed ?? {}).filter((r) => r.payment_status === "paid").map((r) => r.order_id));
  for (const e of purchases) expect(paidIds.has(String(e.custom_data?.order_id)), `CAPI Purchase ${e.event_id} for an unpaid order`).toBe(true);
  for (const l of pixelTracks(s, "Purchase")) {
    expect(paidIds.has(String(pixelEventId(l)).replace(/^purchase_/, "")), `Pixel Purchase ${pixelEventId(l)} for an unpaid order`).toBe(true);
  }

  // 6. Make link: the scenario ran Grow's Approve Transaction (our reply said approve: true)
  if (via === "grow_make") {
    const approvals = (s.mock_grow?.make_approvals ?? []).filter((a) => a.transactionId === o.grow_transaction_id);
    expect(approvals.length, "Approve Transaction at least once").toBeGreaterThanOrEqual(1);
  }

  // 7. no egress; Lihi's order email and the paid email, both to the test inbox
  expect(s.blocked_egress).toEqual([]);
  const mails = emailsFor(s, orderId).filter((e) => toList(e.to).includes(LIHI_TEST_EMAIL));
  expect(mails.filter((e) => (e.subject ?? "").startsWith("שולם:")).length, "one paid email to Lihi").toBe(1);
  expect(mails.filter((e) => !(e.subject ?? "").startsWith("שולם:")).length, "order email to Lihi").toBeGreaterThanOrEqual(1);

  // 8. nothing would be dropped by the sheet
  const rows = (s.sheet_rows ?? []).filter((r) => r.order_id === orderId);
  expect(rows.length, "sheet rows written").toBeGreaterThan(0);
  for (const r of rows) expect(r.unknown_keys, "sheet keys missing from fixtures/sheet_headers.json").toEqual([]);
  return o;
}

/** The dummy notify secret from tests/e2e/test.env (a test value, never a real one). */
export const GROW_SECRET_FOR_TESTS: string = (() => {
  const txt = fs.readFileSync(path.join(WEBSITE_DIR, "tests", "e2e", "test.env"), "utf8");
  const m = /^GROW_NOTIFY_SECRET=(\S+)$/m.exec(txt);
  if (!m) throw new Error("GROW_NOTIFY_SECRET missing from tests/e2e/test.env");
  return m[1];
})();
