/**
 * Pricing (docs/attribution/00_DESIGN.md section 5.3): the server side of the price table.
 * Amounts live in api/_price_table.ts (one table, shared with the browser). NEW_PRICES=1 switches
 * to the 2.11.2026 prices (349/410, express +50, codes 5%); unset keeps today's (320/370, 10%).
 */
import type { Partner, ResolvedPromo } from "./_attribution_core.js";
import { FRIEND_CODES_10PCT } from "./_friend_codes_10pct.js";
import { priceTable, quote, type PriceTable } from "./_price_table.js";

export type { ResolvedPromo, PriceTable };
export { PRICES_2026_10, PRICES_2026_11, quote, chargeableAmounts } from "./_price_table.js";

/** NEW_PRICES=1 -> the 2026-11 table. Read at call time (tests switch it per run). */
export function newPricesEnabled(): boolean {
  return process.env.NEW_PRICES === "1";
}

export function activePrices(): PriceTable {
  return priceTable(newPricesEnabled());
}

/** Built-in codes (mirror src/pages/Order.tsx); their percentage comes from the table (promoPct). */
export const BUILTIN_PROMO_CODES = new Set(["STUDENT2026"]);

/** Friend vouchers printed in every kit since 13.7 (mirrors FRIEND_GIFT_CODE in Order.tsx). */
export const FRIEND_GIFT_CODE = /^([a-z0-9-]+)-gift$/i;

/** Partner codes: 6-16 letters/digits (Order.tsx only live-checks codes of 6+ characters). */
export const PARTNER_CODE_RE = /^[A-Z0-9]{6,16}$/i;

export interface PriceInput {
  kind: "order" | "gift";
  allMeetings: boolean;
  promo: Pick<ResolvedPromo, "discount_pct"> | null;
  freeVoucher: boolean;
  /** Express shipping (self orders only; ignored when the table has no express). */
  express?: boolean;
}

export function priceOrder(i: PriceInput, table: PriceTable = activePrices()): { amount: number; rule: string; express: number } {
  const q = quote(table, {
    kind: i.kind, allMeetings: i.allMeetings, express: Boolean(i.express),
    discountPct: i.promo ? i.promo.discount_pct : 0, freeVoucher: i.freeVoucher,
  });
  return { amount: q.amount, rule: q.rule, express: q.express };
}

/** Active flag plus optional start/end dates (YYYY-MM-DD, inclusive, compared in Israel time). */
export function isPartnerActive(p: Pick<Partner, "active" | "start" | "end">, now: Date = new Date()): boolean {
  if (!p.active) return false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);  // YYYY-MM-DD
  if (p.start && today < p.start) return false;
  if (p.end && today > p.end) return false;
  return true;
}

export interface ResolvePromoDeps {
  /** store.getPartnerByCode (wired by the store slice); without it partner codes resolve to null. */
  getPartnerByCode?: (code: string) => Promise<Partner | null>;
  now?: Date;
  /** Defaults to activePrices(). */
  table?: PriceTable;
}

/**
 * STUDENT2026 -> table.promoPct, no partner. "<couple>-gift" -> table.friendPct, referral "frd-<couple>".
 * An active partner code -> table.promoPct (2026-11) or its registry buyer discount (2026-10) + partner
 * id. Anything else -> null (full price; the caller adds a warning line to Lihi's email).
 */
export async function resolvePromo(code: string | null | undefined, deps: ResolvePromoDeps = {}): Promise<ResolvedPromo | null> {
  const t = deps.table ?? activePrices();
  const raw = (code ?? "").trim();
  if (!raw || raw.length > 64) return null;
  const upper = raw.toUpperCase();
  if (BUILTIN_PROMO_CODES.has(upper)) {
    return { code: upper, discount_pct: t.promoPct, partner_id: null, referral: null, source: "builtin" };
  }
  const friend = FRIEND_GIFT_CODE.exec(raw);
  if (friend) {
    const couple = friend[1].toLowerCase();
    const pct = FRIEND_CODES_10PCT.has(couple) ? Math.max(t.friendPct, 10) : t.friendPct;
    return { code: raw.toLowerCase(), discount_pct: pct, partner_id: null, referral: `frd-${couple}`, source: "friend" };
  }
  if (PARTNER_CODE_RE.test(raw) && deps.getPartnerByCode) {
    const p = await deps.getPartnerByCode(upper);
    if (p && p.code.toUpperCase() === upper && isPartnerActive(p, deps.now)) {
      if (!t.partnerPctFromRegistry && p.buyer_discount_pct !== t.promoPct) {
        console.warn(`[pricing] partner ${p.partner_id}: registry discount ${p.buyer_discount_pct}% ignored, the price table gives ${t.promoPct}%`);
      }
      const pct = t.partnerPctFromRegistry ? p.buyer_discount_pct : t.promoPct;
      return { code: upper, discount_pct: pct, partner_id: p.partner_id, referral: null, source: "partner" };
    }
  }
  return null;
}
