/**
 * Identifiers (docs/attribution/00_DESIGN.md section 2). Server only.
 */
import { randomBytes } from "node:crypto";
import { crockford, newTouchId, isVisitorId, VISITOR_ID_RE, LEGACY_UUID_RE } from "./_attribution_core.js";

export { newTouchId, isVisitorId };

/** v_ + 22 chars base64url of 16 random bytes. */
export function newVisitorId(): string {
  return "v_" + randomBytes(16).toString("base64url");
}

/**
 * The visitor id to keep: the bsh_vid cookie when valid, else the localStorage id the page sent
 * (`vid_ls`, adopts today's UUIDs so current visitors keep their id), else a new one.
 */
export function adoptVisitorId(
  cookieVid: string | null | undefined,
  vidLs: unknown,
): { visitor_id: string; source: "cookie" | "local_storage" | "new" } {
  if (typeof cookieVid === "string" && (VISITOR_ID_RE.test(cookieVid) || LEGACY_UUID_RE.test(cookieVid))) {
    return { visitor_id: cookieVid, source: "cookie" };
  }
  if (isVisitorId(vidLs)) return { visitor_id: vidLs, source: "local_storage" };
  return { visitor_id: newVisitorId(), source: "new" };
}

/** BT + yymm (Asia/Jerusalem) + 6 Crockford base32; no hyphen (Grow dislikes special characters). */
export const ORDER_ID_RE = /^BT\d{4}[0-9A-HJKMNP-TV-Z]{6}$/;

export function isOrderId(v: unknown): v is string {
  return typeof v === "string" && ORDER_ID_RE.test(v);
}

/** "2611" for November 2026 in Israel (the month flips at Israeli midnight, not UTC). */
export function yymmJerusalem(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", year: "2-digit", month: "2-digit" }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "00";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  return y + m;
}

export interface OrderIdLookup {
  getOrder(order_id: string): Promise<unknown | null>;
}

/** A new order id, unique-checked against the store; retries on a clash (5 tries, then throws). */
export async function newOrderId(
  store: OrderIdLookup,
  opts: { now?: Date; maxTries?: number; random?: () => string } = {},
): Promise<string> {
  const prefix = "BT" + yymmJerusalem(opts.now ?? new Date());
  const tries = opts.maxTries ?? 5;
  for (let i = 0; i < tries; i++) {
    const id = prefix + (opts.random ? opts.random() : crockford(6));
    if (!ORDER_ID_RE.test(id)) throw new Error("newOrderId: generated id does not match the format");
    if (!(await store.getOrder(id))) return id;
  }
  throw new Error(`newOrderId: ${tries} clashes in a row`);
}

/** Meta event ids derived from the order id. */
export const leadEventId = (order_id: string) => `lead_${order_id}`;
export const purchaseEventId = (order_id: string) => `purchase_${order_id}`;

/**
 * A typed order code back to the order id (the buyer types it in Grow's "קוד הזמנה" field):
 * case, spaces, dashes, dots, the Hebrew maqaf and similar separators are ignored, "BT" may be
 * missing, and Crockford look-alikes in the random part are fixed (O -> 0, I and L -> 1). Finds the
 * code inside a longer text too. null when nothing order-shaped is there.
 */
export function normalizeOrderCode(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).toUpperCase().replace(/[\s\-_.:#/\\־‐-―]+/g, "").slice(0, 200);
  const fix = (r: string) => r.replace(/O/g, "0").replace(/[IL]/g, "1");
  const inText = /BT(\d{4})([0-9A-Z]{6})/.exec(s);
  if (inText) {
    const id = `BT${inText[1]}${fix(inText[2])}`;
    if (ORDER_ID_RE.test(id)) return id;
  }
  // Without "BT" the yymm must be plausible (year 26 or later, month 01-12): a typed phone number
  // such as 0501234567 is not an order code.
  const bare = /^(\d{4})([0-9A-Z]{6})$/.exec(s);
  const yy = bare ? Number(bare[1].slice(0, 2)) : 0, mm = bare ? Number(bare[1].slice(2)) : 0;
  if (bare && yy >= 26 && mm >= 1 && mm <= 12) {
    const id = `BT${bare[1]}${fix(bare[2])}`;
    if (ORDER_ID_RE.test(id)) return id;
  }
  return null;
}
