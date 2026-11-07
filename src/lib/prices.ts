/**
 * Prices shown in the browser. One table (api/_price_table.ts) for the page and the server, so the
 * page never shows an amount the server would not charge. NEW_PRICES=1 at build time (Vercel env,
 * read by vite.config.ts) selects the 2.11.2026 table; unset keeps today's prices.
 */
import { PRICES_2026_10, PRICES_2026_11, quote, type PriceTable, type Quote, type QuoteInput } from "../../api/_price_table";

declare const __BESHAA_NEW_PRICES__: boolean | undefined;

export const NEW_PRICES: boolean = typeof __BESHAA_NEW_PRICES__ !== "undefined" && __BESHAA_NEW_PRICES__ === true;

export const PRICES: PriceTable = NEW_PRICES ? PRICES_2026_11 : PRICES_2026_10;

export function quoteNow(i: QuoteInput): Quote {
  return quote(PRICES, i);
}

/** "349 ₪" */
export function ils(n: number): string {
  return `${n} ₪`;
}

export type { PriceTable, Quote, QuoteInput };
