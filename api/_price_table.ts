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
 *     Added 14.11.2026 (Lihi, SITE_CHANGES_2026-11-14 P2/P3, draft until she approves the build): the lite
 *     kit ("לייט", 4 meetings) 199, also as a gift voucher; two kits, the cheaper one 25% off
 *     (pairQuote: 611 / 672 / 718, two lites 348).
 */

/** The three kits: lite = 4 meetings, base = 8, all = all 11. */
export type KitTier = "lite" | "base" | "all";

/** How many meetings each kit holds (the ketubah meeting is optional and counts within the number). */
export const TIER_MEETINGS: Record<KitTier, number> = { lite: 4, base: 8, all: 11 };

export function isKitTier(v: unknown): v is KitTier {
  return v === "lite" || v === "base" || v === "all";
}

export interface PriceTable {
  id: "2026-10" | "2026-11";
  /** The regular kit (up to 7 topics + the ketubah meeting), regular shipping included. */
  base: number;
  /** The full kit, all 11 meetings, regular shipping included. */
  all: number;
  /** The lite kit (4 meetings), regular shipping included; null = not sold under this table. */
  lite: number | null;
  /** Express shipping surcharge; null = the order form offers no express option. */
  express: number | null;
  /** Gift voucher price; `all` null = the gift form offers one plan only (today). */
  gift: { base: number; all: number | null; lite: number | null };
  /** Two kits bought together: the cheaper one gets this discount (percent); null = no pair offer. */
  pairPct: number | null;
  /** STUDENT2026 and partner / influencer codes. */
  promoPct: number;
  /** Friend codes "<couple>-gift" printed in every kit (5% from 3.11.2026; legacy cards keep 10%, see _friend_codes_10pct.ts). */
  friendPct: number;
  /** true: a partner code uses its own buyer_discount_pct from the registry; false: promoPct. */
  partnerPctFromRegistry: boolean;
}

export const PRICES_2026_10: PriceTable = {
  id: "2026-10", base: 320, all: 370, lite: null, express: null, gift: { base: 320, all: null, lite: null }, pairPct: null,
  promoPct: 10, friendPct: 10, partnerPctFromRegistry: true,
};

export const PRICES_2026_11: PriceTable = {
  // Express shipping (+50) is off for now: only regular shipping, up to 14 business days (Lihi, 4.11.2026).
  // To turn it on: express: 50, and build the 399 / 460 Grow pages (GROW_PAGE_URLS).
  // Lite 199 and the pair discount 25%: Lihi, 13-14.11.2026 (STRATEGY answers, SITE_CHANGES P2/P3).
  id: "2026-11", base: 349, all: 410, lite: 199, express: null, gift: { base: 349, all: 410, lite: 199 }, pairPct: 25,
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
  /** Kept for old callers; `tier` wins when given. */
  allMeetings: boolean;
  /** lite / base / all. A tier the table does not sell (lite under 2026-10) prices as base. */
  tier?: KitTier;
  /** Ignored for gifts, free vouchers and tables without express. */
  express?: boolean;
  /** 0 or null = no code. Clamped to 0..90. */
  discountPct?: number | null;
  freeVoucher?: boolean;
}

export interface Quote {
  /** What the buyer pays (kit after discount + express). */
  amount: number;
  /** e.g. base_349, all_410, lite_199, promo5_332, lite_promo5_189, promo5_332+express_50, gift_all_410, gift_lite_199, voucher_free */
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

/** The tier a quote input asks for, after the table: lite only where the table sells it. */
export function tierFor(t: PriceTable, i: Pick<QuoteInput, "allMeetings" | "tier" | "kind">): KitTier {
  const want: KitTier = i.tier ?? (i.allMeetings ? "all" : "base");
  if (want === "lite" && (i.kind === "gift" ? t.gift.lite : t.lite) === null) return "base";
  if (want === "all" && i.kind === "gift" && t.gift.all === null) return "base";
  return want;
}

/** The list price of one kit of a tier (the order price; gift vouchers cost the same under 2026-11). */
export function kitPrice(t: PriceTable, tier: KitTier): number {
  return tier === "all" ? t.all : tier === "lite" && t.lite !== null ? t.lite : t.base;
}

export function quote(t: PriceTable, i: QuoteInput): Quote {
  const tier = tierFor(t, i);
  if (i.kind === "gift") {
    const amount = tier === "all" ? (t.gift.all as number) : tier === "lite" ? (t.gift.lite as number) : t.gift.base;
    const rule = tier === "all" ? `gift_all_${amount}` : tier === "lite" ? `gift_lite_${amount}` : `gift_${amount}`;
    return { amount, rule, full: amount, kit: amount, express: 0, pct: 0 };
  }
  if (i.freeVoucher) return { amount: 0, rule: "voucher_free", full: 0, kit: 0, express: 0, pct: 0 };
  const full = kitPrice(t, tier);
  const pct = i.discountPct ? Math.min(90, Math.max(0, Math.round(i.discountPct))) : 0;
  const kit = pct > 0 ? discounted(full, pct) : full;
  // Lite rules always say "lite" (also with a code), so reports can tell the 4-meeting kit apart.
  const core = tier === "lite"
    ? (pct > 0 ? `lite_promo${pct}_${kit}` : `lite_${kit}`)
    : pct > 0 ? `promo${pct}_${kit}` : tier === "all" ? `all_${kit}` : `base_${kit}`;
  const express = i.express && t.express ? t.express : 0;
  return { amount: kit + express, rule: express ? `${core}+express_${express}` : core, full, kit, express, pct };
}

/** The tier recorded by a price rule (lite_*, gift_lite_* -> lite; all_*, gift_all_* -> all; else null = unknown). */
export function tierOfRule(rule: string | null | undefined): KitTier | null {
  const r = String(rule ?? "");
  if (/(^|_)lite(_|$)/.test(r)) return "lite";
  if (/(^|_)all(_|$)/.test(r)) return "all";
  if (/^(base|gift)_\d/.test(r)) return "base";
  return null;
}

export interface PairQuote {
  /** Both kits at list price. */
  full: number;
  /** What the buyer pays: the dearer kit in full, the cheaper one with pairPct off. */
  amount: number;
  /** The discounted (second) kit. */
  second: number;
  saving: number;
  /** e.g. pair_base_base_611 */
  rule: string;
}

/** Two kits together (P3): the cheaper one is pairPct off, no other code on top. Null when the table has no pair offer. */
export function pairQuote(t: PriceTable, a: KitTier, b: KitTier): PairQuote | null {
  if (t.pairPct === null) return null;
  const ta = tierFor(t, { kind: "order", allMeetings: false, tier: a });
  const tb = tierFor(t, { kind: "order", allMeetings: false, tier: b });
  const [hi, lo] = kitPrice(t, ta) >= kitPrice(t, tb) ? [ta, tb] : [tb, ta];
  const second = discounted(kitPrice(t, lo), t.pairPct);
  const amount = kitPrice(t, hi) + second;
  const full = kitPrice(t, hi) + kitPrice(t, lo);
  return { full, amount, second, saving: full - amount, rule: `pair_${hi}_${lo}_${amount}` };
}

/** The pair combinations the site shows, dearest first: 11+11, 11+8, 8+8, then 4+4 when lite is sold. */
export function pairOptions(t: PriceTable): Array<{ a: KitTier; b: KitTier; q: PairQuote }> {
  const combos: Array<[KitTier, KitTier]> = [["all", "all"], ["all", "base"], ["base", "base"]];
  if (t.lite !== null) combos.push(["lite", "lite"]);
  return combos.flatMap(([a, b]) => { const q = pairQuote(t, a, b); return q ? [{ a, b, q }] : []; });
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
  const tiers: KitTier[] = t.lite !== null ? ["lite", "base", "all"] : ["base", "all"];
  const tierLabel: Record<KitTier, string> = { lite: "lite kit (4 meetings)", base: "8 meetings", all: "full kit" };
  for (const [dLabel, pct] of variants) {
    for (const tier of tiers) {
      for (const express of t.express ? [false, true] : [false]) {
        const q = quote(t, { kind: "order", allMeetings: tier === "all", tier, express, discountPct: pct });
        add(q.amount, [tierLabel[tier], dLabel, express ? `express +${t.express}` : ""].filter(Boolean).join(", "));
      }
    }
  }
  add(t.gift.base, "gift voucher, 8 meetings");
  if (t.gift.all !== null) add(t.gift.all, "gift voucher, full kit");
  if (t.gift.lite !== null) add(t.gift.lite, "gift voucher, lite kit");
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([amount, labels]) => ({ amount, label: labels.join(" / ") }));
}

/**
 * The two-kit amounts (P3). Not in chargeableAmounts: the site does not charge a pair by itself yet
 * (stage A: the buyer writes on WhatsApp and Lihi sends a Grow link), so these need no fixed page today.
 */
export function pairAmounts(t: PriceTable): ChargeableAmount[] {
  return pairOptions(t).map(({ a, b, q }) => ({ amount: q.amount, label: `two kits ${TIER_MEETINGS[a]}+${TIER_MEETINGS[b]} (${q.full} - ${q.saving})` }));
}
