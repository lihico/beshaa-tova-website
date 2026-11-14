/**
 * The cost table: dated COGS rate cards, the per-order cost breakdown and revenue ex-VAT.
 * Pure (no imports), so the report scripts, the dashboard builder and the tests can all use it.
 * Spec: docs/attribution/marketing_machine_2026-11/PLAN.md section 4 (Stage 3, cost-table part).
 *
 * All amounts are ILS ex-VAT. Since 2.11.2026 Ran (Copy Dfoos) invoices Cybercamp (invoice 4-109663),
 * so input VAT is assumed reclaimable (PLAN.md:297; the accountant should confirm, PLAN.md:453).
 * Exception: the prepaid express voucher is a final price with no VAT to reclaim (printing_pipeline.md:77,81).
 *
 * Source paths below are relative to ~/Documents/Couples_Project/. "UNVERIFIED" marks estimates with
 * no written source; they stay estimates until Lihi confirms (PLAN.md:202-204, 508-512).
 */

// ---------------------------------------------------------------------------------------------
// VAT and fixed costs
// ---------------------------------------------------------------------------------------------

/** Israeli VAT. CLAUDE.md:460 ("מע"מ בישראל: 18%"); every Ran invoice prints "מע"מ 18.0%" (bookkeeping/supplier_invoices/copydfoos/4-109663.signed.pdf). */
export const VAT_RATE = 0.18;

/** Revenue ex-VAT from a gross (VAT-inclusive) amount, to the agora. 349 -> 295.76 (PLAN.md:325). */
export function revenueExVat(gross: number): number {
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  return round2(gross / (1 + VAT_RATE));
}

/**
 * Fixed monthly costs, kept outside COGS (PLAN.md:335).
 * - grow_light: 29 per month, billed yearly as 348, plus VAT (docs/attribution/strategy_2026-11/CONCLUSIONS.md:52,229;
 *   future/business_plan_2027/clearing_options_2026-10.md:15).
 * - domain: beshaa-tova.co.il renewal 74 per year at MyNames (future/business_plan_2027/internal_plan_2026-10-21.md:137,388),
 *   74 / 12 = 6.17 a month (PLAN.md:335).
 */
export const FIXED_MONTHLY_ILS = {
  grow_light: 29,
  domain: round2(74 / 12),
  /** 29 + 6.17 = 35.17, shown as 35.2 (PLAN.md:335). */
  total: round2(29 + 74 / 12),
} as const;

/** Vercel Pro if adopted: about 890 a year (future/business_plan_2027/internal_plan_2026-10-21.md:149), about 74 a month (PLAN.md:335). Not in FIXED_MONTHLY_ILS until Lihi decides (PLAN.md:468). */
export const VERCEL_PRO_MONTHLY_ILS = round2(890 / 12);

/** Fixed monthly cost per order at a given monthly volume (PLAN.md:335: 10 orders a month -> about 3.5, about 11 with Pro). */
export function fixedPerOrder(ordersPerMonth: number, withVercelPro = false): number {
  if (!(ordersPerMonth > 0)) return 0;
  const total = FIXED_MONTHLY_ILS.total + (withVercelPro ? VERCEL_PRO_MONTHLY_ILS : 0);
  return round2(total / ordersPerMonth);
}

// ---------------------------------------------------------------------------------------------
// Rate cards
// ---------------------------------------------------------------------------------------------

export type Basis = "conservative" | "lean";
/** 4 = the lite kit (199, from 14.11.2026), 8 = the regular kit, 11 = the full kit. */
export type Meetings = 4 | 8 | 11;

export interface PageCounts {
  /** Pages of the couple booklet (colour, duplex). */
  couple: number;
  /** Pages of ONE personal booklet (B&W, duplex); every kit has two. */
  personal: number;
}

export interface RateCard {
  id: string;
  /** First day (YYYY-MM-DD, Israel date) the card applies to. */
  effective_from: string;
  bw_sheet: number;
  colour_sheet: number;
  cover: number;
  covers_per_kit: number;
  personal_booklets_per_kit: number;
  /** Fraction of the print line added when Ran prints fewer than 2 kits in one order. */
  single_set_surcharge: number;
  blessing_and_friend_card: number;
  packaging: Record<Basis, number>;
  pens_and_bag: Record<Basis, number>;
  registered_post: number;
  express_voucher: number;
  express_no_voucher: number;
  ran_handling: number;
  grow: {
    pct: number; min_fee: number; included_transactions: number; included_documents: number;
    over_quota_transaction: number; over_quota_document: number; refund: number; chargeback: number;
  };
  make_per_order: number;
  /** Mean page counts (pdfinfo over pilot/print-ready). */
  default_pages: Record<Meetings, PageCounts>;
  /** The print line at the mean page counts, as PLAN section 4 states it (rounded to 0.1). */
  default_print: Record<Meetings, number>;
  /** Kit list prices incl. VAT (website/api/_price_table.ts:37-40). */
  list_price: Record<Meetings, number>;
}

/** cybercamp-2026-11, effective 2026-11-02 (PLAN.md:299). */
export const CYBERCAMP_2026_11: RateCard = {
  id: "cybercamp-2026-11",
  effective_from: "2026-11-02",                  // PLAN.md:299; first Ran invoice to Cybercamp after the switch: 4-109663, 2.11.2026
  bw_sheet: 0.5,                                 // docs/printing_pipeline.md:67 (Ran tariff, March 2026)
  colour_sheet: 1.5,                             // docs/printing_pipeline.md:68
  cover: 12,                                     // docs/printing_pipeline.md:69
  covers_per_kit: 3,                             // PLAN.md:305 (couple booklet + 2 personal); pilot/print-ready/2026-04-24_הזמנה_לרן_אוריאן_עדן_שליו_תכלת_איתמר.md:14
  personal_booklets_per_kit: 2,                  // PLAN.md:318 (two personal booklets per kit)
  single_set_surcharge: 0.25,                    // docs/printing_pipeline.md:70 (+25% when fewer than 2 kits)
  blessing_and_friend_card: 4.0,                 // PLAN.md:307, report 4 estimate, UNVERIFIED
  packaging: { conservative: 5.1, lean: 3.0 },   // sheets_html/STRATEGY_FOR_CYBERCAMP_2026-10-21_v2.html:170 / PLAN.md:308 report 4 estimate, UNVERIFIED
  pens_and_bag: { conservative: 14.8, lean: 0 }, // sheets_html/STRATEGY_FOR_CYBERCAMP_2026-10-21_v2.html:171 / PLAN.md:309 (no purchase in bookkeeping/expenses.json), UNVERIFIED
  registered_post: 24.5,                         // docs/printing_pipeline.md:76
  express_voucher: 50,                           // docs/printing_pipeline.md:77,81 (final price, no VAT reclaim)
  express_no_voucher: 68.25,                     // docs/printing_pipeline.md:78
  ran_handling: 12,                              // docs/printing_pipeline.md:79 (only if Ran ships; Lihi collects today, CLAUDE.md "אף פעם לא לכלול משלוח")
  grow: {
    pct: 0.01,                                   // docs/attribution/strategy_2026-11/CONCLUSIONS.md:229 ("1% + 29 ₪/month ... plus VAT")
    min_fee: 0.5,                                // PLAN.md:314 (grow.business/fees, fetched 7.11.2026); see the note in the Stage 3 return: CONCLUSIONS.md:229 calls 0.5 the minimum AMOUNT
    included_transactions: 20,                   // CONCLUSIONS.md:52; clearing_options_2026-10.md:15
    included_documents: 20,                      // CONCLUSIONS.md:52; clearing_options_2026-10.md:15
    over_quota_transaction: 1,                   // CONCLUSIONS.md:229 ("+1 ₪ per transaction or document above 20 a month")
    over_quota_document: 1,                      // CONCLUSIONS.md:229
    refund: 6.9,                                 // CONCLUSIONS.md:129 ("refund 6.90 ₪")
    chargeback: 55,                              // future/business_plan_2027/clearing_options_2026-10.md:24,56
  },
  make_per_order: 0,                             // PLAN.md:315 (Make Free; Grow says Make is free on every plan, CONCLUSIONS.md:229)
  default_pages: {
    // Lite (4 meetings): no lite kit has been printed yet, so this is a straight-line estimate from the 8 and 11
    // means (couple 7.6 pages and personal 6.7 pages per meeting, plus the fixed front and back matter). UNVERIFIED
    // until the first lite kit's pdfinfo; replace with the real counts then.
    4: { couple: 41.0, personal: 34.1 },
    8: { couple: 71.4, personal: 60.9 },         // PLAN.md:318 (pdfinfo means over pilot/print-ready)
    11: { couple: 94.2, personal: 81.0 },        // PLAN.md:319 (newest kits run 100-102 pages, may be about 5 low)
  },
  default_print: {
    4: 83.8,                                     // estimate: 41.0/2*1.5 + 2*34.1/2*0.5 + 3*12 = 83.8 (UNVERIFIED, see default_pages)
    8: 120.0,                                    // PLAN.md:318; 71.4/2*1.5 + 2*60.9/2*0.5 + 3*12 = 120.0
    11: 147.2,                                   // PLAN.md:319; 94.2/2*1.5 + 2*81.0/2*0.5 + 3*12 = 147.15, PLAN rounds to 147.2
  },
  list_price: { 4: 199, 8: 349, 11: 410 },       // website/api/_price_table.ts (PRICES_2026_11, confirmed 2.11.2026; lite 199 from 14.11.2026)
};

/** Every card, oldest first. Add a new card (never edit an old one) when Ran or Grow change prices. */
export const RATE_CARDS: readonly RateCard[] = [CYBERCAMP_2026_11];

/**
 * The card in force on a date (YYYY-MM-DD or ISO). A date before the first card gets the first card
 * with `before_first: true`: the March 2026 tariff is the only written one (printing_pipeline.md:63-70).
 */
export function rateCardFor(date?: string | null): { card: RateCard; before_first: boolean } {
  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null;
  if (!day) return { card: RATE_CARDS[RATE_CARDS.length - 1], before_first: false };
  let found: RateCard | null = null;
  for (const c of RATE_CARDS) if (c.effective_from <= day) found = c;
  return found ? { card: found, before_first: false } : { card: RATE_CARDS[0], before_first: true };
}

// ---------------------------------------------------------------------------------------------
// Print and fees
// ---------------------------------------------------------------------------------------------

/** Duplex sheets for a page count (a booklet with an odd page count still uses a whole last sheet). */
export function sheets(pages: number): number {
  return Math.ceil(Math.max(0, pages) / 2 - 1e-9);
}

/**
 * Ran's print line for one kit: colour couple booklet + 2 B&W personal booklets + 3 covers.
 * `exact: false` (default) charges whole sheets as Ran does; `exact: true` uses pages/2, which is how
 * PLAN section 4 turns mean page counts into the default print figure.
 */
export function printFromPages(p: PageCounts, card: RateCard = CYBERCAMP_2026_11, exact = false): number {
  const s = exact ? (n: number) => Math.max(0, n) / 2 : sheets;
  return round2(
    s(p.couple) * card.colour_sheet
    + card.personal_booklets_per_kit * s(p.personal) * card.bw_sheet
    + card.covers_per_kit * card.cover,
  );
}

/** Grow's per-transaction fee: 1% of the gross charged, at least 0.50; nothing on a 0 amount. */
export function growFee(gross: number, card: RateCard = CYBERCAMP_2026_11): number {
  if (!(gross > 0)) return 0;
  return round2(Math.max(card.grow.min_fee, gross * card.grow.pct));
}

/** Grow overage for a month: +1 per transaction and +1 per document above the 20 included (PLAN.md:314). */
export function growMonthlyOverage(transactions: number, documents: number, card: RateCard = CYBERCAMP_2026_11): number {
  const tx = Math.max(0, Math.floor(transactions) - card.grow.included_transactions);
  const docs = Math.max(0, Math.floor(documents) - card.grow.included_documents);
  return round2(tx * card.grow.over_quota_transaction + docs * card.grow.over_quota_document);
}

// ---------------------------------------------------------------------------------------------
// costFor
// ---------------------------------------------------------------------------------------------

/**
 * - kit: a paid kit order (shipped unless `shipping` says otherwise).
 * - gift_sale: a digital gift voucher; only the Grow fee, the kit is costed on the redeem order (PLAN.md:332).
 * - gift_redeem: the kit sent for a redeemed voucher (amount 0, no fee, PLAN.md:333).
 */
export type VariantKind = "kit" | "gift_sale" | "gift_redeem";
export type Shipping = "post" | "pickup" | "express_voucher" | "express_no_voucher";

export interface Variant {
  kind: VariantKind;
  meetings: Meetings;
}

export interface CostOptions {
  basis?: Basis;
  /** What the buyer paid incl. VAT (kit after any discount, plus express). Default: the list price (+ express when chosen); 0 for gift_redeem. */
  gross?: number;
  /** Discount in percent, used only when `gross` is not given (5 -> 349 becomes 332, rounded half up as in _price_table.ts:49-52). */
  discountPct?: number;
  /** false = fewer than 2 kits in the Ran order (+25% of print). Default true. */
  batched?: boolean;
  /** Default "post". "pickup" = the cafe pickup, no post (PLAN.md:330). */
  shipping?: Shipping;
  /** true = Ran packs and posts (+12 handling). Default false: Lihi collects. */
  ranShips?: boolean;
  /** Real page counts for this kit; otherwise the card's default print figure. */
  pages?: PageCounts | null;
  /** Order date, for the rate card. */
  date?: string | null;
  /** A specific card (tests, what-if). Wins over `date`. */
  card?: RateCard;
}

export interface CostLine {
  key: "print" | "single_set" | "blessing_card" | "packaging" | "pens_bag" | "shipping" | "ran_handling" | "grow_fee" | "make";
  ils: number;
  note: string;
}

export interface CostBreakdown {
  card_id: string;
  card_before_first: boolean;
  variant: Variant;
  basis: Basis;
  shipping: Shipping | null;
  gross_ils: number;
  revenue_ex_vat: number;
  lines: CostLine[];
  /** Kit COGS without the Grow fee. */
  kit_cogs_ils: number;
  fee_ils: number;
  /** COGS including the Grow fee (the "COGS" column of PLAN.md:323). */
  cogs_ils: number;
  /** revenue_ex_vat - cogs_ils: contribution before ads (and before fixed costs). */
  contribution_ils: number;
}

const SHIP_NOTE: Record<Shipping, string> = {
  post: "registered post", pickup: "cafe pickup, no post", express_voucher: "express, prepaid voucher (no VAT reclaim)",
  express_no_voucher: "express without voucher",
};

/** An itemised cost breakdown for one order variant. */
export function costFor(variant: Variant, opts: CostOptions = {}): CostBreakdown {
  const { card, before_first } = opts.card ? { card: opts.card, before_first: false } : rateCardFor(opts.date);
  const basis: Basis = opts.basis ?? "conservative";
  const m = variant.meetings;
  const lines: CostLine[] = [];
  const add = (key: CostLine["key"], ils: number, note: string) => { lines.push({ key, ils: round2(ils), note }); };

  const shipsKit = variant.kind !== "gift_sale";
  const shipping: Shipping | null = shipsKit ? (opts.shipping ?? "post") : null;
  const expressGross = shipping === "express_voucher" || shipping === "express_no_voucher" ? 50 : 0;   // _price_table.ts:38-40 (+50, currently OFF); printing_pipeline.md:77

  let gross: number;
  if (variant.kind === "gift_redeem") gross = 0;
  else if (typeof opts.gross === "number" && Number.isFinite(opts.gross)) gross = Math.max(0, opts.gross);
  else {
    const pct = Math.min(90, Math.max(0, opts.discountPct ?? 0));
    gross = Math.round((card.list_price[m] * (100 - pct)) / 100) + (variant.kind === "kit" ? expressGross : 0);
  }

  if (shipsKit) {
    const print = opts.pages ? printFromPages(opts.pages, card) : card.default_print[m];
    add("print", print, opts.pages ? `pages ${opts.pages.couple}/${opts.pages.personal}x2` : `default print, ${m} meetings`);
    if (opts.batched === false) add("single_set", print * card.single_set_surcharge, "fewer than 2 kits in the Ran order");
    add("blessing_card", card.blessing_and_friend_card, "blessing letter + friend card (estimate)");
    add("packaging", card.packaging[basis], `packaging (${basis})`);
    add("pens_bag", card.pens_and_bag[basis], `pens + bag (${basis})`);
    const ship = shipping === "post" ? card.registered_post
      : shipping === "pickup" ? 0
      : shipping === "express_voucher" ? card.express_voucher
      : card.express_no_voucher;
    add("shipping", ship, SHIP_NOTE[shipping as Shipping]);
    if (opts.ranShips) add("ran_handling", card.ran_handling, "Ran packs and posts");
  }
  const fee = growFee(gross, card);
  add("grow_fee", fee, gross > 0 ? "Grow 1% of gross" : "no charge, no fee");
  if (card.make_per_order) add("make", card.make_per_order, "Make");

  const cogs = round2(lines.reduce((s, l) => s + l.ils, 0));
  const revenue = revenueExVat(gross);
  return {
    card_id: card.id, card_before_first: before_first, variant, basis, shipping,
    gross_ils: gross, revenue_ex_vat: revenue, lines,
    kit_cogs_ils: round2(cogs - fee), fee_ils: fee, cogs_ils: cogs,
    contribution_ils: round2(revenue - cogs),
  };
}

// ---------------------------------------------------------------------------------------------
// Break-even CAC (PLAN.md section 4.3)
// ---------------------------------------------------------------------------------------------

/** Break-even CAC = contribution before ads, for a shipped, batched, undiscounted kit, rounded to the shekel. 8 -> 124, 11 -> 148 (PLAN.md:340). */
export function breakEvenCac(meetings: Meetings, basis: Basis = "conservative", card?: RateCard): number {
  return Math.round(costFor({ kind: "kit", meetings }, { basis, card }).contribution_ils);
}

/** Working target = 0.6 x break-even (PLAN.md:341). */
export const WORKING_TARGET_FACTOR = 0.6;
/** PLAN.md:341 and decision 9 (PLAN.md:451) round 0.6 x 124 = 74.4 up to a planning value of 75. */
export const WORKING_TARGET_CAC_ILS = 75;
/** Before 10 paid orders the dashboard uses the 8-meeting break-even (PLAN.md:340). */
export const MIX_WEIGHTED_MIN_ORDERS = 10;

/** Order-mix-weighted break-even (PLAN.md:340): falls back to the 8-meeting value below 10 paid kits. kits4 = lite kits (14.11.2026). */
export function weightedBreakEvenCac(kits8: number, kits11: number, basis: Basis = "conservative", kits4 = 0): number {
  const n = Math.max(0, kits8) + Math.max(0, kits11) + Math.max(0, kits4);
  if (n < MIX_WEIGHTED_MIN_ORDERS) return breakEvenCac(8, basis);
  const c4 = costFor({ kind: "kit", meetings: 4 }, { basis }).contribution_ils;
  const c8 = costFor({ kind: "kit", meetings: 8 }, { basis }).contribution_ils;
  const c11 = costFor({ kind: "kit", meetings: 11 }, { basis }).contribution_ils;
  return Math.round((Math.max(0, kits4) * c4 + Math.max(0, kits8) * c8 + Math.max(0, kits11) * c11) / n);
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;
}

/** Round half up to one decimal, for display and for pinning PLAN's one-decimal figures. */
export function round1(n: number): number {
  return Math.round((n + Math.sign(n) * 1e-9) * 10) / 10;
}
