// Server-side gift voucher validation (Lihi, 21.10.2026). A code is a valid gift voucher when it is
// in the hard-coded list (src/data/vouchers.ts) or has a gift row in the order sheet ("קוד שובר"
// column of "מעקב הזמנות", or the older "שוברי מתנה" tab), and no redemption row uses it yet.
// Used by api/voucher-check.ts (the order form asks while the couple types) and api/order.ts (the
// order itself is re-checked, never trusting the browser).
import fs from "node:fs";
import path from "node:path";
import type { GoogleSpreadsheetWorksheet } from "google-spreadsheet";
import { getOrderDoc, GIFT_ALL_MEETINGS_NOTE } from "./_sheets.js";
import { onTestReset } from "./_bg.js";
import { VOUCHERS, AUTO_VOUCHER_CODE } from "../src/data/vouchers.js";

export { AUTO_VOUCHER_CODE };

export const MAIN_TAB = "מעקב הזמנות";
const GIFT_TAB = "שוברי מתנה";
export const CODE_HEADER = "קוד שובר";
export const VOUCHER_SENT_HEADER = "שובר נשלח";
const REDEEM_SOURCE = "מימוש שובר";

export type VoucherStatus = "valid" | "invalid" | "redeemed" | "error";

export interface VoucherVerdict {
  status: VoucherStatus;
  code: string;
  /** Display names of the couple on the gift row, when known. */
  names: string | null;
  /** The gift row is marked "שובר נשלח" (payment confirmed and voucher released). */
  released: boolean;
  /** Found in the hard-coded list rather than the sheet. */
  fromList: boolean;
  /** A full-kit voucher (all 11 meetings): price_rule gift_all_* or the notes mark. */
  allMeetings: boolean;
}

export function normalizeVoucherCode(code: unknown): string {
  return typeof code === "string" ? code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40) : "";
}

interface IndexEntry { gift: boolean; redeemed: boolean; names: string | null; released: boolean; allMeetings: boolean }

let _cache: { at: number; index: Map<string, IndexEntry> } | null = null;

export function invalidateVoucherCache() {
  _cache = null;
}
onTestReset(invalidateVoucherCache);   // POST /__test/reset (test mode only; a no-op elsewhere)

function mainTab(doc: NonNullable<Awaited<ReturnType<typeof getOrderDoc>>>): GoogleSpreadsheetWorksheet {
  return doc.sheetsByTitle[MAIN_TAB] || doc.sheetsByIndex[0];
}

/**
 * Test mode only (ATTR_TEST=1 + STORE_MODE=file; docs/attribution 11.3 J7): the index comes from the
 * file store instead of the sheet: seeded gift codes in `vouchers.json` ({code, names, released}),
 * gift orders that carry a voucher code, and redemption orders (`order_kind = redeem`) as redeemed.
 */
function fileStoreIndex(dir: string): Map<string, IndexEntry> {
  const index = new Map<string, IndexEntry>();
  const entry = (code: string) => {
    let e = index.get(code);
    if (!e) { e = { gift: false, redeemed: false, names: null, released: false, allMeetings: false }; index.set(code, e); }
    return e;
  };
  try {
    const seeded = JSON.parse(fs.readFileSync(path.join(dir, "vouchers.json"), "utf8")) as Array<{ code?: string; names?: string; released?: boolean; all_meetings?: boolean }>;
    for (const v of Array.isArray(seeded) ? seeded : []) {
      const code = normalizeVoucherCode(v.code);
      if (!code) continue;
      const e = entry(code);
      e.gift = true; e.names = v.names ?? null; e.released = !!v.released; e.allMeetings = !!v.all_meetings;
    }
  } catch { /* no seed file */ }
  let lines: string[] = [];
  try { lines = fs.readFileSync(path.join(dir, "orders.jsonl"), "utf8").split("\n"); } catch { /* no orders yet */ }
  const orders = new Map<string, Record<string, unknown>>();
  for (const l of lines) {
    try {
      const x = JSON.parse(l) as { op?: string; order_id?: string; data?: Record<string, unknown> };
      if (!x.order_id || !x.data) continue;
      orders.set(x.order_id, x.op === "insert" ? { ...x.data } : { ...(orders.get(x.order_id) ?? {}), ...x.data });
    } catch { /* torn line */ }
  }
  for (const o of orders.values()) {
    const code = normalizeVoucherCode(o.voucher_code);
    if (!code) continue;
    const e = entry(code);
    if (o.order_kind === "redeem") e.redeemed = true;
    else if (o.order_kind === "gift") {
      e.gift = true;
      if (o.payment_status === "paid") e.released = true;
      if (String(o.price_rule ?? "").startsWith("gift_all")) e.allMeetings = true;
    }
  }
  return index;
}

async function buildIndex(): Promise<Map<string, IndexEntry>> {
  const dir = process.env.ATTR_DATA_DIR;
  if (process.env.ATTR_TEST === "1" && process.env.STORE_MODE === "file" && dir) return fileStoreIndex(dir);
  const doc = await getOrderDoc();
  if (!doc) throw new Error("sheet not configured");
  const index = new Map<string, IndexEntry>();
  const entry = (code: string) => {
    let e = index.get(code);
    if (!e) { e = { gift: false, redeemed: false, names: null, released: false, allMeetings: false }; index.set(code, e); }
    return e;
  };

  const main = mainTab(doc);
  for (const r of await main.getRows()) {
    const code = normalizeVoucherCode(r.get(CODE_HEADER));
    if (!code) continue;
    const source = String(r.get("מקור") || "");
    const status = String(r.get("סטטוס") || "");
    const e = entry(code);
    if (source.startsWith(REDEEM_SOURCE) || status === REDEEM_SOURCE) {
      e.redeemed = true;
    } else {
      e.gift = true;
      e.names = e.names || String(r.get("שמות תצוגה") || "").trim() || null;
      if (String(r.get(VOUCHER_SENT_HEADER) || "").toUpperCase() === "TRUE") e.released = true;
      if (String(r.get("price_rule") || "").startsWith("gift_all") || String(r.get("הערות") || "").includes(GIFT_ALL_MEETINGS_NOTE)) e.allMeetings = true;
    }
  }

  const giftTab = doc.sheetsByTitle[GIFT_TAB];
  if (giftTab) {
    try {
      for (const r of await giftTab.getRows()) {
        const code = normalizeVoucherCode(r.get(CODE_HEADER));
        if (!code) continue;
        const e = entry(code);
        e.gift = true;
        if (String(r.get("סטטוס") || "") === "מומש") e.redeemed = true;
        if (String(r.get(VOUCHER_SENT_HEADER) || "").toUpperCase() === "TRUE") e.released = true;
      }
    } catch (err) {
      console.error("[voucher] gift tab read failed:", err);
    }
  }
  return index;
}

/**
 * Check a code. maxAgeMs = how stale the cached sheet read may be (0 = read now). Never throws:
 * a sheet failure returns status "error" so the caller decides (order.ts flags it for Lihi).
 */
export async function checkVoucher(rawCode: unknown, maxAgeMs = 60_000): Promise<VoucherVerdict> {
  const code = normalizeVoucherCode(rawCode);
  const base: VoucherVerdict = { status: "invalid", code, names: null, released: false, fromList: false, allMeetings: false };
  if (!code) return base;

  const listed = VOUCHERS[code];
  let index: Map<string, IndexEntry>;
  try {
    if (!_cache || Date.now() - _cache.at > maxAgeMs) {
      _cache = { at: Date.now(), index: await buildIndex() };
    }
    index = _cache.index;
  } catch (err) {
    console.error("[voucher] sheet read failed:", err);
    // The hard-coded list does not need the sheet.
    return listed ? { ...base, status: "valid", names: listed.coupleNames, fromList: true } : { ...base, status: "error" };
  }

  const e = index.get(code);
  if (e?.redeemed) return { ...base, status: "redeemed", names: e.names || listed?.coupleNames || null, released: e.released, fromList: !!listed };
  if (listed) return { ...base, status: "valid", names: listed.coupleNames, released: true, fromList: true };
  if (e?.gift) return { ...base, status: "valid", names: e.names, released: e.released, allMeetings: e.allMeetings };
  return base;
}

export interface OrderVoucherResolution {
  /** Treat the order as a free voucher redemption. */
  redeem: boolean;
  code: string | null;
  /** Hebrew warning for Lihi's email and the sheet notes (draft wording), or null. */
  warning: string | null;
  verdict: VoucherVerdict | null;
}

/**
 * Decide on the server whether an order really redeems a voucher. fromLink = the couple came
 * through an /order?voucher= link. Hand-made codes Lihi sends as links (not in the list or the
 * sheet) still go through as before, flagged for a manual check; auto BST- codes must be in the sheet.
 */
export async function resolveOrderVoucher(input: { code: unknown; fromLink: boolean; isPromo: boolean }): Promise<OrderVoucherResolution> {
  const code = normalizeVoucherCode(input.code);
  if (!code || input.isPromo) return { redeem: false, code: code || null, warning: null, verdict: null };

  const verdict = await checkVoucher(code, 0);
  const auto = AUTO_VOUCHER_CODE.test(code);
  const claimed = input.fromLink || auto || verdict.status === "valid";

  if (verdict.status === "valid") {
    const warning = !verdict.released && !verdict.fromList
      ? "בטבלה עדיין לא מסומן \"שובר נשלח\" לשובר הזה - לוודא שהנותנ/ת שילמ/ה לפני הפקה"
      : null;
    return { redeem: true, code, warning, verdict };
  }
  if (verdict.status === "redeemed") {
    return { redeem: false, code, warning: "השובר הזה כבר מומש בעבר - ההזמנה נרשמה כהזמנה רגילה בתשלום. לבדוק לפני הפקה", verdict };
  }
  if (verdict.status === "error" && claimed) {
    return { redeem: true, code, warning: "לא הצלחתי לבדוק את השובר מול הטבלה - לבדוק ידנית לפני הפקה", verdict };
  }
  if (input.fromLink && !auto) {
    return { redeem: true, code, warning: "קוד מקישור שלא מופיע ברשימת השוברים ולא בטבלה - לבדוק לפני הפקה", verdict };
  }
  if (claimed) {
    return { redeem: false, code, warning: "קוד השובר לא נמצא בטבלה - ההזמנה נרשמה כהזמנה רגילה בתשלום", verdict };
  }
  // A typed code that is not a voucher (e.g. a typo): keep it as a plain note, as before.
  return { redeem: false, code, warning: null, verdict };
}
