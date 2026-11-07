/**
 * The price table: the single source for every amount the site shows or charges.
 * Pure (no imports): used by the server (api/_pricing.ts) and by the browser (src/lib/prices.ts).
 *
 * Two tables. Which one is live is the NEW_PRICES flag (server env; the same variable is baked into
 * the client bundle at build time by vite.config.ts), so prices can go live alone or together with
 * payments (PAYMENTS_ENABLED). See docs/attribution/GROW_LIGHT_SETUP.md.
 *   - PRICES_2026_10: the prices live until Lihi switches (320 / 370, codes 10%).
 *   - PRICES_2026_11: confirmed by Lihi on 2.11.2026, all including VAT: 8 meetings 349, full kit
 *     (11 meetings) 410, regular shipping included; express shipping +50; discount codes 5%;
 *     gift voucher = kit price (349 or 410).
 */

export interface PriceTable {
  id: "2026-10" | "2026-11";
  /** The regular kit (up to 7 topics + the ketubah meeting), regular shipping included. */
  base: number;
  /** The full kit, all 11 meetings, regular shipping included. */
  all: number;
  /** Express shipping surcharge; null = the order form offers no express option. */
  express: number | null;
  /** Gift voucher price; `all` null = the gift form offers one plan only (today). */
  gift: { base: number; all: number | null };
  /** STUDENT2026 and partner / influencer codes. */
  promoPct: number;
  /** Friend codes "<couple>-gift" printed in every kit (5% from 3.11.2026; legacy cards keep 10%, see _friend_codes_10pct.ts). */
  friendPct: number;
  /** true: a partner code uses its own buyer_discount_pct from the registry; false: promoPct. */
  partnerPctFromRegistry: boolean;
}

export const PRICES_2026_10: PriceTable = {
  id: "2026-10", base: 320, all: 370, express: null, gift: { base: 320, all: null },
  promoPct: 10, friendPct: 10, partnerPctFromRegistry: true,
};

export const PRICES_2026_11: PriceTable = {
  // Express shipping (+50) is off for now: only regular shipping, up to 14 business days (Lihi, 4.11.2026).
  // To turn it on: express: 50, and build the 399 / 460 Grow pages (GROW_PAGE_URLS).
  id: "2026-11", base: 349, all: 410, express: null, gift: { base: 349, all: 410 },
  // Friend codes 5% for kits from 3.11.2026 (Lihi, 2.11); older printed cards keep 10% (_friend_codes_10pct.ts).
  promoPct: 5, friendPct: 5, partnerPctFromRegistry: false,
};

export function priceTable(newPrices: boolean): PriceTable {
  return newPrices ? PRICES_2026_11 : PRICES_2026_10;
}

/** Whole shekels, rounded half up (349 * 0.95 = 331.55 -> 332; 410 * 0.95 = 389.5 -> 390). */
export function discounted(full: number, pct: number): number {
  return Math.round((full * (100 - pct)) / 100);
}

export interface QuoteInput {
  kind: "order" | "gift";
  allMeetings: boolean;
  /** Ignored for gifts, free vouchers and tables without express. */
  express?: boolean;
  /** 0 or null = no code. Clamped to 0..90. */
  discountPct?: number | null;
  freeVoucher?: boolean;
}

export interface Quote {
  /** What the buyer pays (kit after discount + express). */
  amount: number;
  /** e.g. base_349, all_410, promo5_332, promo5_332+express_50, gift_all_410, voucher_free */
  rule: string;
  /** The kit before any discount. */
  full: number;
  /** The kit after the discount (no express). */
  kit: number;
  /** The express surcharge actually added (0 when none). */
  express: number;
  /** The discount actually applied, in percent. */
  pct: number;
}

export function quote(t: PriceTable, i: QuoteInput): Quote {
  if (i.kind === "gift") {
    const all = i.allMeetings && t.gift.all !== null;
    const amount = all ? (t.gift.all as number) : t.gift.base;
    return { amount, rule: all ? `gift_all_${amount}` : `gift_${amount}`, full: amount, kit: amount, express: 0, pct: 0 };
  }
  if (i.freeVoucher) return { amount: 0, rule: "voucher_free", full: 0, kit: 0, express: 0, pct: 0 };
  const full = i.allMeetings ? t.all : t.base;
  const pct = i.discountPct ? Math.min(90, Math.max(0, Math.round(i.discountPct))) : 0;
  const kit = pct > 0 ? discounted(full, pct) : full;
  const core = pct > 0 ? `promo${pct}_${kit}` : i.allMeetings ? `all_${kit}` : `base_${kit}`;
  const express = i.express && t.express ? t.express : 0;
  return { amount: kit + express, rule: express ? `${core}+express_${express}` : core, full, kit, express, pct };
}

export interface ChargeableAmount { amount: number; label: string }

/**
 * Every amount the site can ask for under a table (one Grow fixed page each, Flow A). Gift amounts
 * equal the kit amounts, so they share a page. Partner codes with a registry percentage other than
 * promoPct (old table only) are not listed.
 */
export function chargeableAmounts(t: PriceTable): ChargeableAmount[] {
  const out = new Map<number, string[]>();
  const add = (amount: number, label: string) => out.set(amount, [...(out.get(amount) ?? []), label]);
  const variants: Array<[string, number]> = [["", 0], [`promo ${t.promoPct}%`, t.promoPct]];
  if (t.friendPct !== t.promoPct) variants.push([`friend code ${t.friendPct}%`, t.friendPct]);
  // Friend cards printed before 3.11.2026 say 10% and keep it (_friend_codes_10pct.ts).
  if (t.friendPct < 10 && t.promoPct !== 10) variants.push(["friend code 10% (card printed before 3.11.2026)", 10]);
  for (const [dLabel, pct] of variants) {
    for (const all of [false, true]) {
      for (const express of t.express ? [false, true] : [false]) {
        const q = quote(t, { kind: "order", allMeetings: all, express, discountPct: pct });
        add(q.amount, [all ? "full kit" : "8 meetings", dLabel, express ? `express +${t.express}` : ""].filter(Boolean).join(", "));
      }
    }
  }
  add(t.gift.base, "gift voucher, 8 meetings");
  if (t.gift.all !== null) add(t.gift.all, "gift voucher, full kit");
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([amount, labels]) => ({ amount, label: labels.join(" / ") }));
}
