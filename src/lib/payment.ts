/**
 * Shared bits of the payment flow (docs/attribution/00_DESIGN.md 4.3, 4.4): the order response
 * shape, the redirect to the hosted payment page, and the small note the thank-you page reads.
 * No name, phone or email leaves the browser through this file.
 */

/** What /api/order and /api/gift answer on success. */
export interface OrderResponse {
  success?: boolean;
  order_id?: string;
  amount?: number;
  currency?: string;
  /** A per-order payment page (Grow API, or a Grow link made through Make): go straight there. */
  payment_url?: string | null;
  /** A fixed Grow page for the exact amount: show /order/pay/<id> (the order code to type) first. */
  pay_url?: string | null;
  /** manual: no link on the site; Lihi sends a one-time Grow link by WhatsApp (thank-you screen promises when). */
  pay_mode?: "hosted" | "fixed_page" | "manual" | null;
  lead_event_id?: string;
}

export const ORDER_ID_RE = /^BT\d{4}[0-9A-HJKMNP-TV-Z]{6}$/;

/** Parse a successful order response; null fields when an older server answers without them. */
export async function readOrderResponse(r: Response): Promise<OrderResponse> {
  try {
    const j = (await r.json()) as OrderResponse;
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

/**
 * Only an https page (Grow), or the local fake Grow in test mode, is a payment page.
 * Anything else is ignored and the page falls back to today's WhatsApp screen.
 */
export function isPaymentUrl(u: unknown): u is string {
  if (typeof u !== "string" || !u) return false;
  try {
    const url = new URL(u);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

/** Leave for the payment page. A short pause lets the Pixel Lead beacon go out first. */
export function goToPayment(url: string) {
  setTimeout(() => window.location.assign(url), 300);
}

export interface LastOrderNote {
  order_id: string;
  kind: "order" | "gift";
  /** self: the two partners; gift: the giver */
  names: string[];
  /** gift only: the couple's names and how the voucher is delivered */
  couple?: string[];
  delivery?: "self" | "direct";
  /** Fixed-page orders: the Grow page and the amount, for /order/pay/<id>. */
  pay_url?: string;
  amount?: number;
}

const SS_LAST_ORDER = "bsh_last_order";

export function rememberOrder(note: LastOrderNote) {
  try {
    sessionStorage.setItem(SS_LAST_ORDER, JSON.stringify(note));
  } catch {
    // the thank-you page then greets without names
  }
}

/** The note for this order id; without an id, the last order of this tab (Grow's fixed-page return URL has no id). */
export function readLastOrder(orderId?: string): LastOrderNote | null {
  try {
    const j = JSON.parse(sessionStorage.getItem(SS_LAST_ORDER) || "null") as LastOrderNote | null;
    if (!j || typeof j.order_id !== "string" || !ORDER_ID_RE.test(j.order_id)) return null;
    return orderId === undefined || j.order_id === orderId ? j : null;
  } catch {
    return null;
  }
}

/** Copy text to the clipboard; false when the browser refuses (the code stays visible to copy by hand). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** One browser Purchase per order: sessionStorage guard plus an in-memory fallback. */
const firedInMemory = new Set<string>();
export function claimPurchaseOnce(orderId: string): boolean {
  const key = `bsh_purchase_${orderId}`;
  if (firedInMemory.has(key)) return false;
  firedInMemory.add(key);
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    // storage blocked: the in-memory guard still holds for this page
  }
  return true;
}
