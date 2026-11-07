/**
 * Decision maths for the dashboard (PLAN.md marketing_machine_2026-11, Stage 4 and section 6.2).
 * Pure, no dependency, no fs, no network. Every random draw comes from a seedable PRNG, so a run with
 * the same seed gives the same numbers (the unit tests rely on this).
 *
 * Model (6.2): conversions of a unit (ad, ad set, campaign) are Poisson in spend with rate lambda
 * (conversions per ILS). The prior is Gamma(shape 1, rate prior_cost), whose mean 1/prior_cost is a
 * cost per conversion of prior_cost. After k conversions on S ILS the posterior is
 * Gamma(1 + k, prior_cost + S). The cost per conversion is 1/lambda; it is reported as the median and
 * the 5-95% interval of 4,000 posterior draws.
 *
 * prior_cost: 124 for paid (break-even CAC, section 4.3), 40 for Lead, 15 for IC (judgement, 6.2).
 * Each ad is shrunk toward its ad set: the ad's prior_cost is the ad set's posterior median cost, so an
 * ad with little spend reads like its ad set rather than like the global prior.
 *
 * Verdict chips (section 5, item 3): מוקדם מדי / להמשיך / להחליף / מנצח.
 */

export const DEFAULT_SAMPLES = 4000;
export const DEFAULT_SEED = 20261107;

/** 6.2 prior costs, ILS per conversion. */
export const PRIOR_COST = { paid: 124, lead: 40, ic: 15 } as const;
export type Proxy = "ic" | "lead";

export const CHIP = {
  early: "מוקדם מדי",
  keep: "להמשיך",
  replace: "להחליף",
  winner: "מנצח",
} as const;
export type ChipCode = keyof typeof CHIP;

/** 6.2 thresholds. */
export const RULES = {
  /** Minimum before any verdict: max(3 x proxy target, 1,500 impressions). */
  min_spend_factor: 3,
  min_impressions: 1500,
  /** Replace if P(proxy CPA > 2 x target) > 0.8 after the minimum. */
  replace_factor: 2,
  replace_prob: 0.8,
  /** Winner if P(best in ad set) > 0.8 and 3 or more proxy conversions. */
  winner_prob: 0.8,
  winner_min_conversions: 3,
  /** Early-kill floor (v3 strategy section 9). */
  kill_ctr: 0.01,
  kill_ctr_impressions: 1500,
  kill_lpv_rate: 0.5,
  /** Not in the PLAN: LPV per click is judged only from this many link clicks, so 1 click with no LPV is not a kill. */
  kill_lpv_min_clicks: 20,
  kill_spend_no_ic: 40,
  kill_ic_cpa_day7: 30,
  kill_ic_cpa_day: 7,
  /** "No sales" stop: 2 x break-even CAC with zero paid orders (6.2 allows 2-3 x). */
  no_sales_factor: 2,
  /** Scale proposal: upper bound below break-even with 3 or more paid orders. */
  scale_min_paid: 3,
} as const;

// ---------------------------------------------------------------------------------------------
// PRNG and samplers
// ---------------------------------------------------------------------------------------------

export type Rng = () => number;

/** mulberry32: a small, fast 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal draw (Box-Muller; the second value is discarded to keep the stream simple). */
export function normal(rng: Rng): number {
  let u = 0;
  while (u <= Number.MIN_VALUE) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * One Gamma(shape, rate) draw by Marsaglia and Tsang (2000). For shape < 1 it uses the boost
 * Gamma(shape) = Gamma(shape + 1) * U^(1/shape).
 */
export function sampleGamma(shape: number, rate: number, rng: Rng): number {
  if (!(shape > 0) || !(rate > 0)) throw new Error("sampleGamma: shape and rate must be > 0");
  if (shape < 1) {
    let u = 0;
    while (u <= Number.MIN_VALUE) u = rng();
    return sampleGamma(shape + 1, rate, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return (d * v) / rate;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return (d * v) / rate;
  }
}

// ---------------------------------------------------------------------------------------------
// Posterior
// ---------------------------------------------------------------------------------------------

export interface Posterior { shape: number; rate: number }

/** Gamma(1, prior_cost) prior, k conversions on S ILS -> Gamma(1 + k, prior_cost + S). */
export function posterior(k: number, spend: number, priorCost: number): Posterior {
  if (!(priorCost > 0)) throw new Error("posterior: prior_cost must be > 0");
  return { shape: 1 + Math.max(0, k), rate: priorCost + Math.max(0, spend) };
}

/** Draws of lambda (conversions per ILS). */
export function sampleRates(p: Posterior, n: number, rng: Rng): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = sampleGamma(p.shape, p.rate, rng);
  return out;
}

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const pos = Math.min(Math.max(q, 0), 1) * (n - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface CpaSummary {
  /** Posterior median cost per conversion, ILS. */
  median: number;
  p05: number;
  p95: number;
  k: number;
  spend: number;
  prior_cost: number;
  samples: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Cost per conversion draws (1 / lambda), ascending. */
export function cpaDraws(rates: Float64Array): Float64Array {
  const c = new Float64Array(rates.length);
  for (let i = 0; i < rates.length; i++) c[i] = 1 / rates[i];
  return c.sort();
}

export function summarize(cpaSorted: Float64Array, k: number, spend: number, priorCost: number): CpaSummary {
  return {
    median: round2(quantile(cpaSorted, 0.5)), p05: round2(quantile(cpaSorted, 0.05)), p95: round2(quantile(cpaSorted, 0.95)),
    k, spend: round2(spend), prior_cost: priorCost, samples: cpaSorted.length,
  };
}

/** One-call summary: posterior cost per conversion for k conversions on S ILS. */
export function cpaInterval(k: number, spend: number, priorCost: number, opts: { n?: number; seed?: number; rng?: Rng } = {}): CpaSummary {
  const rng = opts.rng ?? mulberry32(opts.seed ?? DEFAULT_SEED);
  const rates = sampleRates(posterior(k, spend, priorCost), opts.n ?? DEFAULT_SAMPLES, rng);
  return summarize(cpaDraws(rates), k, spend, priorCost);
}

/** Share of draws with cost per conversion above a threshold. */
export function probAbove(cpaSorted: Float64Array, threshold: number): number {
  if (!cpaSorted.length) return 0;
  let n = 0;
  for (let i = 0; i < cpaSorted.length; i++) if (cpaSorted[i] > threshold) n++;
  return n / cpaSorted.length;
}

/** For each unit, the share of draws in which it has the highest rate (= lowest cost). Draws are paired by index. */
export function probBest(ratesByUnit: Float64Array[]): number[] {
  const m = ratesByUnit.length;
  if (!m) return [];
  const n = Math.min(...ratesByUnit.map((r) => r.length));
  const wins = new Array<number>(m).fill(0);
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let j = 1; j < m; j++) if (ratesByUnit[j][i] > ratesByUnit[best][i]) best = j;
    wins[best]++;
  }
  return wins.map((w) => (n ? w / n : 0));
}

/** P(0 conversions | true cost per conversion c) after S ILS = e^(-S/c) (6.2 "no sales" stop). */
export function probZeroGiven(spend: number, trueCost: number): number {
  return Math.exp(-Math.max(0, spend) / trueCost);
}

// ---------------------------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------------------------

export interface Verdict {
  chip: string;
  code: ChipCode;
  /** Machine codes for the reasons; the page turns them into Hebrew. */
  reasons: string[];
  p_replace: number | null;
  p_best: number | null;
  cpa: CpaSummary | null;
}

export interface AdStats {
  id: string;
  spend: number;
  impressions: number;
  link_clicks: number;
  lpv: number;
  ic: number;
  lead: number;
  days_live: number;
}

export interface AdsetVerdictOptions {
  proxy?: Proxy;
  /** Proxy target CPA (default PRIOR_COST[proxy]). */
  target?: number;
  n?: number;
  seed?: number;
}

const proxyCount = (a: AdStats, proxy: Proxy) => (proxy === "lead" ? a.lead : a.ic);

/** The early-kill floor (before the statistics apply). Returns reason codes, empty when none fire. */
export function earlyKill(a: AdStats): string[] {
  const r: string[] = [];
  if (a.impressions >= RULES.kill_ctr_impressions && a.link_clicks / a.impressions < RULES.kill_ctr) r.push("kill_ctr");
  if (a.link_clicks >= RULES.kill_lpv_min_clicks && a.lpv / a.link_clicks < RULES.kill_lpv_rate) r.push("kill_lpv");
  if (a.spend >= RULES.kill_spend_no_ic && a.ic === 0) r.push("kill_no_ic");
  if (a.days_live >= RULES.kill_ic_cpa_day && a.ic > 0 && a.spend / a.ic > RULES.kill_ic_cpa_day7) r.push("kill_ic_cpa_day7");
  return r;
}

/** Minimum before any verdict: spend >= 3 x target and impressions >= 1,500. */
export function belowMinimum(a: Pick<AdStats, "spend" | "impressions">, target: number): boolean {
  return a.spend < RULES.min_spend_factor * target || a.impressions < RULES.min_impressions;
}

const verdict = (code: ChipCode, reasons: string[], extra: Partial<Verdict> = {}): Verdict =>
  ({ chip: CHIP[code], code, reasons, p_replace: null, p_best: null, cpa: null, ...extra });

/**
 * Verdicts for the ads of one ad set, judged on a proxy (IC by default). The ad set's pooled
 * posterior sets each ad's prior (shrinkage); P(best) is computed across the ads of the set.
 */
export function adsetVerdicts(ads: AdStats[], opts: AdsetVerdictOptions = {}): Record<string, Verdict> {
  const proxy = opts.proxy ?? "ic";
  const target = opts.target ?? PRIOR_COST[proxy];
  const n = opts.n ?? DEFAULT_SAMPLES;
  const rng = mulberry32(opts.seed ?? DEFAULT_SEED);
  const K = ads.reduce((s, a) => s + proxyCount(a, proxy), 0);
  const S = ads.reduce((s, a) => s + a.spend, 0);
  const setCpa = cpaDraws(sampleRates(posterior(K, S, target), n, rng));
  const shrunkPrior = Math.max(0.01, quantile(setCpa, 0.5));

  const rates = ads.map((a) => sampleRates(posterior(proxyCount(a, proxy), a.spend, shrunkPrior), n, rng));
  const best = ads.length > 1 ? probBest(rates) : ads.map(() => null);
  const out: Record<string, Verdict> = {};
  ads.forEach((a, i) => {
    const k = proxyCount(a, proxy);
    const cpaSorted = cpaDraws(rates[i]);
    const cpa = a.spend > 0 ? summarize(cpaSorted, k, a.spend, round2(shrunkPrior)) : null;
    const pReplace = a.spend > 0 ? probAbove(cpaSorted, RULES.replace_factor * target) : null;
    const pBest = best[i];
    const extra = { cpa, p_replace: pReplace === null ? null : round2(pReplace), p_best: pBest === null ? null : round2(pBest) };
    if (a.spend <= 0) { out[a.id] = verdict("early", ["no_spend"]); return; }
    const kill = earlyKill(a);
    if (kill.length) { out[a.id] = verdict("replace", kill, extra); return; }
    if (belowMinimum(a, target)) { out[a.id] = verdict("early", ["below_minimum"], extra); return; }
    if ((pReplace ?? 0) > RULES.replace_prob) { out[a.id] = verdict("replace", ["p_cpa_above_2x_target"], extra); return; }
    if (pBest !== null && pBest > RULES.winner_prob && k >= RULES.winner_min_conversions) { out[a.id] = verdict("winner", ["p_best"], extra); return; }
    out[a.id] = verdict("keep", [], extra);
  });
  return out;
}

export interface PaidVerdictOptions { breakEven?: number; n?: number; seed?: number }

/**
 * A campaign or ad set judged on paid CAC (6.2): the "no sales" stop after 2 x break-even with zero
 * paid; a scale proposal when the 95th percentile CAC is below break-even with 3 or more paid.
 */
export function paidVerdict(paid: number, spend: number, opts: PaidVerdictOptions = {}): Verdict & { p_zero_at_break_even: number | null } {
  const be = opts.breakEven ?? PRIOR_COST.paid;
  if (!(spend > 0)) return { ...verdict("early", ["no_spend"]), p_zero_at_break_even: null };
  const cpa = cpaInterval(paid, spend, PRIOR_COST.paid, { n: opts.n, seed: opts.seed });
  const pZero = round2(probZeroGiven(spend, be));
  if (paid === 0 && spend >= RULES.no_sales_factor * be) return { ...verdict("replace", ["no_sales_stop"], { cpa }), p_zero_at_break_even: pZero };
  if (paid >= RULES.scale_min_paid && cpa.p95 < be) return { ...verdict("winner", ["scale_proposal"], { cpa }), p_zero_at_break_even: pZero };
  if (paid < RULES.scale_min_paid && spend < RULES.no_sales_factor * be) return { ...verdict("early", ["below_minimum"], { cpa }), p_zero_at_break_even: pZero };
  return { ...verdict("keep", [], { cpa }), p_zero_at_break_even: pZero };
}
