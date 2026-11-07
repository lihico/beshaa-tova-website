/**
 * Dashboard data builder (PLAN.md marketing_machine_2026-11, Stage 4 and section 5).
 *
 *   npx tsx scripts/dashboard-data.ts [--source sheet|file] [--out <path>] [--from YYYY-MM-DD]
 *        [--dir .test-data] [--secrets ~/.config/besha/report.env] [--meta-dir website/.data/meta]
 *        [--ads-csv <meta_upload.csv>] [--basis conservative|lean] [--proxy ic|lead] [--seed N]
 *
 * Writes one JSON file (default website/.data/dashboard/data.json) for the phone page
 * sheets_html/ads_dashboard/index.html: the health strip, the KPI row for 7 days / 28 days / all,
 * the drill table campaign > ad set > ad with verdict chips (report-lib/bayes.ts), the funnel, time
 * to purchase, per-order stories keyed by order id, and the money footer.
 *
 * Sources: `--source sheet` reads the order sheet READ ONLY through report-lib/load.ts (readonly scope,
 * secrets from ~/.config/besha/report.env); `--source file` (default) reads the test store in --dir.
 * Spend comes from the scripts/meta-insights.ts cache when it exists; with no cache the spend fields
 * are null and the page says "אין עדיין נתוני הוצאה". COGS comes from api/_cost_table.ts (through
 * cogs-sync.ts costRow). Nothing here calls Meta, Grow, Make or writes to the sheet.
 *
 * No buyer data: only whitelisted fields are copied (ids, channels, utm source / medium / campaign,
 * Meta ids, timestamps, amounts, short status codes). Before writing, `piiIssues` scans the JSON for
 * '@', an Israeli phone pattern and every buyer, couple and payer name in memory; any hit refuses the
 * write and prints only the kind and count, never the value.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OrderRecord, Touch } from "../api/_attribution_core.ts";
import { FIXED_MONTHLY_ILS, WORKING_TARGET_CAC_ILS, revenueExVat, weightedBreakEvenCac, type Basis } from "../api/_cost_table.ts";
import { DEFAULT_OUT_DIR as META_CACHE_DIR } from "./meta-insights.ts";
import { loadSpend } from "./attribution-report.ts";
import { costRow, meetingsOf } from "./cogs-sync.ts";
import { adsetVerdicts, cpaInterval, paidVerdict, PRIOR_COST, type AdStats, type CpaSummary, type Proxy, type Verdict, DEFAULT_SEED } from "./report-lib/bayes.ts";
import { buildReport, isPaid, israelDate, modelTouch, revenueOf, type Model, type Report } from "./report-lib/build.ts";
import { RECON_OK, isRefunded, refundOf } from "./report-lib/recon.ts";
import { actionValue, buildLookup, isMetaTouch, joinSpend, resolveTouch, type InsightRow, type MetaCac, type SpendData } from "./report-lib/join.ts";
import { DEFAULT_META_ENV, DEFAULT_REPORT_ENV, envFileModeWarning, loadReportData, loadSheetData, type ReportData } from "./report-lib/load.ts";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_OUT = path.join(WEBSITE_DIR, ".data", "dashboard", "data.json");
export const SCHEMA_VERSION = 1;
export const NO_SPEND_MESSAGE = "אין עדיין נתוני הוצאה";
export const SPEND_STALE_HOURS = 36;
export const TOKEN_WARN_DAYS = 14;
export const GROW_MONTHLY_QUOTA = 20;
const H = 3600 * 1000;

const MODELS: Model[] = ["credited", "first", "last"];
export type WindowKey = "7d" | "28d" | "all";

// ---------------------------------------------------------------------------------------------
// Sanitising
// ---------------------------------------------------------------------------------------------

export const EMAIL_RE = /@/;
/** Israeli phone numbers: 05x / 0x landlines / +972, with optional dashes or spaces; not inside a longer digit run. */
export const IL_PHONE_RE = /(?<![\d])(?:\+?972[-\s]?|0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}(?![\d])/;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A free-ish string (utm value, ad name) with anything that looks like contact data removed. */
export function safeText(v: unknown, max = 80): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim().slice(0, max);
  if (!t) return null;
  if (EMAIL_RE.test(t) || IL_PHONE_RE.test(t)) return "[הוסר]";
  return t;
}

/** A short machine code (status, result, rule); anything else becomes "other". */
export function safeCode(v: unknown, max = 40): string | null {
  if (v === null || v === undefined || v === "") return null;
  const t = String(v).trim();
  return new RegExp(`^[A-Za-z0-9_:.\\-]{1,${max}}$`).test(t) ? t : "other";
}

const safeId = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null);
const safeTs = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);

export interface StoryTouch {
  ts: string | null; kind: string | null; channel: string | null;
  source: string | null; medium: string | null; campaign: string | null;
  campaign_id: string | null; adset_id: string | null; ad_id: string | null; placement: string | null;
}

/** A touch stripped to channel, source, medium, campaign, Meta ids and the timestamp. */
export function stripTouch(t: Touch): StoryTouch {
  return {
    ts: safeTs(t.ts), kind: safeCode(t.kind), channel: safeCode(t.channel),
    source: safeText(t.utm_source, 40), medium: safeText(t.utm_medium, 40), campaign: safeText(t.utm_campaign),
    campaign_id: safeId(t.meta_campaign_id), adset_id: safeId(t.meta_adset_id), ad_id: safeId(t.meta_ad_id),
    placement: safeCode(t.placement),
  };
}

/** Problems found in the serialised JSON. Values are never returned, only the kind. */
export function piiIssues(json: string, names: string[]): string[] {
  const out: string[] = [];
  if (json.includes("@")) out.push("email_at_sign");
  if (IL_PHONE_RE.test(json)) out.push("phone_pattern");
  const letter = "A-Za-z\\u0590-\\u05FF";
  let nameHits = 0;
  for (const raw of names) {
    const n = (raw ?? "").trim();
    if (n.length < 2) continue;
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![${letter}])${esc}(?![${letter}])`, "u").test(json)) nameHits++;
  }
  if (nameHits) out.push(`name_x${nameHits}`);
  return out;
}

/** Every buyer, couple and payer name (and name part) the data holds, for the guard. */
export function namesIn(orders: OrderRecord[]): string[] {
  const s = new Set<string>();
  for (const o of orders) {
    for (const v of [o.buyer?.name, o.couple?.name1, o.couple?.name2, o.payer_name]) {
      const t = (v ?? "").trim();
      if (!t) continue;
      s.add(t);
      for (const part of t.split(/\s+/)) if (part.length >= 2) s.add(part);
    }
  }
  return [...s];
}

// ---------------------------------------------------------------------------------------------
// Helpers over orders and spend
// ---------------------------------------------------------------------------------------------

export interface DashboardOptions {
  now: Date;
  /** "all" window start (YYYY-MM-DD); null = every order. */
  from?: string | null;
  basis?: Basis;
  proxy?: Proxy;
  seed?: number;
  /** Health inputs from outside the data (the CLI fills these). */
  metaEnvPresent?: boolean;
  tokenExpiresAt?: string | null;
}

export function windows(now: Date, from: string | null): Record<WindowKey, { from: string | null; to: string | null; label: string }> {
  const d = (off: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(now.getTime() + off * 86_400_000));
  return {
    "7d": { from: d(-6), to: null, label: "7 ימים" },
    "28d": { from: d(-27), to: null, label: "28 ימים" },
    all: { from, to: null, label: "מתחילת הקמפיין" },
  };
}

const inW = (day: string, w: { from: string | null; to: string | null }) => !!day && (!w.from || day >= w.from) && (!w.to || day <= w.to);

/** Meta action counts, first matching type wins (Meta reports the pixel and the omni versions of the same event). */
const ACTIONS = {
  lpv: ["landing_page_view", "omni_landing_page_view"],
  ic: ["offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout", "initiate_checkout"],
  api: ["offsite_conversion.fb_pixel_add_payment_info", "omni_add_payment_info", "add_payment_info"],
  lead: ["offsite_conversion.fb_pixel_lead", "lead", "onsite_conversion.lead_grouped"],
} as const;

export function pickAction(row: InsightRow, types: readonly string[]): number {
  for (const t of types) if ((row.actions ?? []).some((a) => a.action_type === t)) return actionValue(row.actions, t);
  return 0;
}

interface Agg { spend: number; impressions: number; link_clicks: number; lpv: number; ic: number; api: number; meta_lead: number; days: Set<string> }
const agg0 = (): Agg => ({ spend: 0, impressions: 0, link_clicks: 0, lpv: 0, ic: 0, api: 0, meta_lead: 0, days: new Set() });
function addRow(a: Agg, r: InsightRow): void {
  a.spend += r.spend || 0; a.impressions += r.impressions || 0; a.link_clicks += r.inline_link_clicks || 0;
  a.lpv += pickAction(r, ACTIONS.lpv); a.ic += pickAction(r, ACTIONS.ic); a.api += pickAction(r, ACTIONS.api);
  a.meta_lead += pickAction(r, ACTIONS.lead);
  if ((r.spend || 0) > 0) a.days.add(r.date_start);
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const spread = (xs: number[]) => ({ n: xs.length, median: xs.length ? round2(median(xs) as number) : null, min: xs.length ? round2(Math.min(...xs)) : null, max: xs.length ? round2(Math.max(...xs)) : null });

/** The best time the order was submitted: the Lead send time when known (exact), else the sheet date (noon, day precision). */
function submittedAt(o: OrderRecord): { ms: number; exact: boolean } | null {
  const lead = o.capi_lead_sent_at ? Date.parse(o.capi_lead_sent_at) : NaN;
  if (Number.isFinite(lead)) return { ms: lead, exact: true };
  const c = Date.parse(o.created_at);
  return Number.isFinite(c) ? { ms: c, exact: false } : null;
}

const hoursBetween = (a: number, b: number) => Math.max(0, (b - a) / H);
const leadOk = (o: OrderRecord) => /^(ok|logged)/.test(o.capi_lead_result ?? "");

// ---------------------------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------------------------

export interface HealthItem { key: string; count: number | null; status: "ok" | "red" | "unknown"; ids: string[]; note: string | null }

export interface Kpi {
  spend: number | null;
  leads: number; meta_leads_capi: number; meta_leads_reported: number | null;
  paid: number; revenue_gross: number; revenue_ex_vat: number;
  cogs: number; fees: number;
  meta_paid: number | null;
  cac: CpaSummary | null; cac_point: number | null; cac_label: string | null;
  blended_cac: number | null;
  roas_ex_vat: number | null;
  contribution: number;
  break_even_cac: number;
}

export interface DrillNode {
  level: "campaign" | "adset" | "ad";
  id: string; name: string | null;
  spend: number | null; impressions: number | null; link_clicks: number | null; link_ctr: number | null;
  lpv: number | null; ic: number | null; api: number | null; meta_leads: number | null;
  leads: number; paid: number; revenue: number;
  cpl: number | null; cac: CpaSummary | null; cac_point: number | null; roas_ex_vat: number | null; contribution: number | null;
  meta_claimed: number | null;
  status: string; days_live: number | null; first_day: string | null; last_day: string | null;
  verdict: Verdict | null;
  by_model: Record<Model, { orders: number; paid: number }>;
  funnel_hours_lead_to_paid: number | null;
  children: DrillNode[];
}

export interface Story {
  order_id: string; kind: string; created: string | null; created_exact: string | null;
  status: string; amount: number; price_rule: string | null; meetings: 8 | 11; express: boolean; promo: boolean;
  credited: { channel: string | null; rule: string | null };
  model_channels: Record<Model, string | null>;
  touches: StoryTouch[];
  payment: { link_created: boolean; fallback: string | null; paid_at: string | null; method: string | null; paid_amount: number | null; match: string | null };
  capi: { lead: string | null; lead_at: string | null; purchase: string | null; purchase_at: string | null; last_error: string | null };
  recon_status: string | null;
  kit_sent: boolean | null;
  cogs: number | null; contribution_before_ads: number | null;
}

export interface Dashboard {
  schema: number; generated_at: string; source: string;
  spend: { present: boolean; fetched_at: string | null; message: string | null; rows: number; currency: string | null };
  targets: { break_even_cac: number; working_target_cac: number; basis: Basis; prior_cost: typeof PRIOR_COST; proxy: Proxy; paid_kits: { m8: number; m11: number } };
  windows: Record<WindowKey, { from: string | null; to: string | null; label: string }>;
  health: HealthItem[];
  kpi: Record<WindowKey, Kpi>;
  channels: Record<WindowKey, Record<Model, Array<{ channel: string; orders: number; paid: number; revenue: number }>>>;
  drill: Record<WindowKey, DrillNode[]>;
  funnel: Record<WindowKey, Array<{ id: string; name: string | null; steps: Array<{ key: string; value: number | null }>; hours_lead_to_paid: number | null }>>;
  time_to_purchase: Record<WindowKey, { created_minus_first: ReturnType<typeof spread>; created_minus_last: ReturnType<typeof spread>; paid_minus_created: ReturnType<typeof spread>; day_precision: number }>;
  orders: Record<string, Story>;
  order_ids: string[];
  money: Record<WindowKey, {
    gross: number; vat: number; net: number; fees: number; refunds: number; refunded_orders: number; cogs: number;
    spend: number | null; contribution: number; fixed_monthly: number;
  }> & { grow_quota: { month: string; used: number; quota: number } };
  excluded_tests: number;
}

// ---------------------------------------------------------------------------------------------
// The build (pure)
// ---------------------------------------------------------------------------------------------

export function buildDashboard(data: ReportData, opts: DashboardOptions): Dashboard {
  const now = opts.now;
  const basis: Basis = opts.basis ?? "conservative";
  const proxy: Proxy = opts.proxy ?? "ic";
  const seed = opts.seed ?? DEFAULT_SEED;
  const spend: SpendData | null = data.meta_spend && data.meta_spend.rows.length ? data.meta_spend : null;
  const W = windows(now, opts.from ?? null);
  const extras = data.order_extras ?? {};

  // Per-order COGS (paid, free redeem and refunded orders; tests are already out).
  const cost = new Map<string, ReturnType<typeof costRow>>();
  for (const o of data.orders) {
    if (o.payment_status === "paid" || o.payment_status === "free" || o.payment_status === "refunded") {
      cost.set(o.order_id, costRow(o, { basis, now }));
    }
  }
  const paidKits = data.orders.filter((o) => isPaid(o) && o.order_kind !== "gift");
  const m11 = paidKits.filter((o) => meetingsOf(o) === 11).length;
  const breakEven = weightedBreakEvenCac(paidKits.length - m11, m11, basis);
  const cogsOf = (ids: string[]) => round2(ids.reduce((s, id) => s + Number(cost.get(id)?.cogs_ils ?? 0), 0));
  const feesOf = (ids: string[]) => round2(ids.reduce((s, id) => s + Number(cost.get(id)?.grow_fee_ils ?? 0), 0));
  const revExOf = (orders: OrderRecord[]) => round2(orders.reduce((s, o) => s + revenueExVat(revenueOf(o)), 0));
  const lookup = spend ? buildLookup(spend) : null;

  const kpi = {} as Dashboard["kpi"];
  const channels = {} as Dashboard["channels"];
  const drill = {} as Dashboard["drill"];
  const funnel = {} as Dashboard["funnel"];
  const ttp = {} as Dashboard["time_to_purchase"];
  const money = {} as Dashboard["money"];
  let reportAll: Report | null = null;
  let joinAll: MetaCac | null = null;

  for (const key of Object.keys(W) as WindowKey[]) {
    const w = W[key];
    const reports = Object.fromEntries(MODELS.map((m) => [m, buildReport(data, { from: w.from, to: w.to, model: m, paidOnly: false, now })])) as Record<Model, Report>;
    const rep = reports.credited;
    if (key === "all") reportAll = rep;
    const winOrders = data.orders.filter((o) => inW(israelDate(o.created_at), w));
    const paidOrders = winOrders.filter(isPaid);
    const join = spend ? joinSpend(data.orders, spend, w) : null;
    if (key === "all") joinAll = join;
    const rows = spend ? spend.rows.filter((r) => inW(r.date_start, w)) : [];

    // KPI
    const total = agg0();
    rows.forEach((r) => addRow(total, r));
    const spendTotal = spend ? round2(total.spend) : null;
    const paidIds = paidOrders.map((o) => o.order_id);
    const revEx = revExOf(paidOrders);
    const cogs = cogsOf(paidIds);
    const metaPaid = join ? join.totals.paid : null;
    const cacSum = join && join.totals.spend > 0 ? cpaInterval(join.totals.paid, join.totals.spend, PRIOR_COST.paid, { seed }) : null;
    kpi[key] = {
      spend: spendTotal,
      leads: rep.summary.orders_submitted,
      meta_leads_capi: winOrders.filter(leadOk).length,
      meta_leads_reported: spend ? total.meta_lead : null,
      paid: rep.summary.paid,
      revenue_gross: round2(rep.summary.revenue),
      revenue_ex_vat: revEx,
      cogs, fees: feesOf(paidIds),
      meta_paid: metaPaid,
      cac: cacSum,
      cac_point: join ? join.totals.cac : null,
      cac_label: join ? join.totals.cac_label : null,
      blended_cac: spendTotal && rep.summary.paid ? round2(spendTotal / rep.summary.paid) : null,
      roas_ex_vat: join ? join.totals.roas_ex_vat : null,
      contribution: round2(revEx - cogs - (spendTotal ?? 0)),
      break_even_cac: breakEven,
    };

    channels[key] = Object.fromEntries(MODELS.map((m) => [m, rep.by_channel[m].map((c) => ({ channel: c.channel, orders: c.orders, paid: c.paid, revenue: round2(c.revenue) }))])) as Dashboard["channels"][WindowKey];

    // Drill: spend tree (when present) plus touch-based rows from the report.
    drill[key] = buildDrill({ rows, join, reports, winOrders, lookup, cost, breakEven, proxy, seed, now });

    funnel[key] = drill[key].map((c) => ({
      id: c.id, name: c.name,
      steps: [
        { key: "impressions", value: c.impressions }, { key: "link_clicks", value: c.link_clicks }, { key: "lpv", value: c.lpv },
        { key: "ic", value: c.ic }, { key: "api", value: c.api }, { key: "leads", value: c.leads }, { key: "paid", value: c.paid },
      ],
      hours_lead_to_paid: c.funnel_hours_lead_to_paid,
    }));
    funnel[key].unshift({
      id: "total", name: null,
      steps: [
        { key: "impressions", value: spend ? total.impressions : null }, { key: "link_clicks", value: spend ? total.link_clicks : null },
        { key: "lpv", value: spend ? total.lpv : null }, { key: "ic", value: spend ? total.ic : null }, { key: "api", value: spend ? total.api : null },
        { key: "leads", value: winOrders.length }, { key: "paid", value: paidOrders.length },
      ],
      hours_lead_to_paid: leadToPaidHours(paidOrders),
    });

    // Time to purchase
    const cf: number[] = [], cl: number[] = [], pc: number[] = [];
    let dayPrecision = 0;
    for (const o of winOrders) {
      const sub = submittedAt(o);
      if (!sub) continue;
      if (!sub.exact) dayPrecision++;
      const ft = o.first ? Date.parse(o.first.ts) : NaN;
      const lt = o.last ? Date.parse(o.last.ts) : NaN;
      if (Number.isFinite(ft)) cf.push(hoursBetween(ft, sub.ms));
      if (Number.isFinite(lt)) cl.push(hoursBetween(lt, sub.ms));
      const pa = o.paid_at ? Date.parse(o.paid_at) : NaN;
      if (isPaid(o) && Number.isFinite(pa)) pc.push(hoursBetween(sub.ms, pa));
    }
    ttp[key] = { created_minus_first: spread(cf), created_minus_last: spread(cl), paid_minus_created: spread(pc), day_precision: dayPrecision };

    // Money footer
    const gross = round2(rep.summary.revenue);
    // Refunds (Stage 3): the refund_amount column when set, else the whole amount of an order marked refunded.
    const refundedOrders = winOrders.filter(isRefunded);
    const refunds = round2(winOrders.reduce((s, o) => s + (refundOf(o) || (o.payment_status === "refunded" ? Number(o.paid_amount ?? o.amount_expected) || 0 : 0)), 0));
    (money as Record<WindowKey, unknown>)[key] = {
      gross, vat: round2(gross - revEx), net: revEx, fees: feesOf(paidIds), refunds, refunded_orders: refundedOrders.length,
      cogs, spend: spendTotal, contribution: round2(revEx - cogs - (spendTotal ?? 0)), fixed_monthly: FIXED_MONTHLY_ILS.total,
    };
  }

  const month = israelDate(now.toISOString()).slice(0, 7);
  const used = data.orders.filter((o) => isPaid(o) && (Number(o.paid_amount ?? o.amount_expected) || 0) > 0 && israelDate(o.paid_at || o.created_at).slice(0, 7) === month).length;
  money.grow_quota = { month, used, quota: GROW_MONTHLY_QUOTA };

  const health = buildHealth(data, reportAll as Report, joinAll, spend, extras, opts, now);

  // Stories
  const orders: Record<string, Story> = {};
  const sorted = [...data.orders].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "") || b.order_id.localeCompare(a.order_id));
  for (const o of sorted) {
    const id = safeId(o.order_id);
    if (!id) continue;
    const sub = submittedAt(o);
    const c = cost.get(o.order_id);
    const list = [...(o.touches ?? [])];
    for (const t of [o.first, o.last]) if (t && !list.some((x) => x.touch_id === t.touch_id)) list.push(t);
    list.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
    orders[id] = {
      order_id: id, kind: safeCode(o.order_kind) ?? "order",
      created: israelDate(o.created_at) || null, created_exact: sub?.exact ? new Date(sub.ms).toISOString() : null,
      status: safeCode(o.payment_status) ?? "pending", amount: Number(o.amount_expected) || 0,
      price_rule: safeCode(o.price_rule), meetings: meetingsOf(o), express: (o.express_ils ?? 0) > 0, promo: !!o.promo_code,
      credited: { channel: safeCode(o.credited_channel), rule: safeCode(o.credit_rule) },
      model_channels: Object.fromEntries(MODELS.map((m) => [m, m === "credited" ? safeCode(o.credited_channel) : safeCode(modelTouch(o, m)?.channel ?? "direct")])) as Record<Model, string | null>,
      touches: list.slice(-12).map(stripTouch),
      payment: {
        link_created: (o.grow_process_ids ?? []).length > 0, fallback: safeCode(o.payment_fallback_reason),
        paid_at: safeTs(o.paid_at), method: safeCode(o.payment_method), paid_amount: o.paid_amount ?? null, match: safeCode(o.match_method),
      },
      capi: {
        lead: safeCode(o.capi_lead_result), lead_at: safeTs(o.capi_lead_sent_at),
        purchase: safeCode(o.capi_purchase_result), purchase_at: safeTs(o.capi_purchase_sent_at), last_error: safeCode(o.capi_last_error_code),
      },
      recon_status: reconStatusOf(o, extras),
      kit_sent: extras[o.order_id]?.kit_sent ?? null,
      cogs: c ? Number(c.cogs_ils) : null, contribution_before_ads: c ? Number(c.contribution_ils) : null,
    };
  }

  return {
    schema: SCHEMA_VERSION, generated_at: now.toISOString(), source: data.source,
    spend: {
      present: !!spend, fetched_at: spend?.fetched_at ?? null, message: spend ? null : NO_SPEND_MESSAGE, rows: spend?.rows.length ?? 0,
      currency: spend?.rows.find((r) => r.account_currency)?.account_currency ?? null,
    },
    targets: { break_even_cac: breakEven, working_target_cac: WORKING_TARGET_CAC_ILS, basis, prior_cost: PRIOR_COST, proxy, paid_kits: { m8: paidKits.length - m11, m11 } },
    windows: W, health, kpi, channels, drill, funnel, time_to_purchase: ttp,
    orders, order_ids: Object.keys(orders), money, excluded_tests: data.excluded_tests?.length ?? 0,
  };
}

function leadToPaidHours(paid: OrderRecord[]): number | null {
  const xs: number[] = [];
  for (const o of paid) {
    const sub = submittedAt(o);
    const pa = o.paid_at ? Date.parse(o.paid_at) : NaN;
    if (sub && Number.isFinite(pa)) xs.push(hoursBetween(sub.ms, pa));
  }
  const m = median(xs);
  return m === null ? null : round2(m);
}

interface DrillCtx {
  rows: InsightRow[]; join: MetaCac | null; reports: Record<Model, Report>; winOrders: OrderRecord[];
  lookup: ReturnType<typeof buildLookup> | null; cost: Map<string, ReturnType<typeof costRow>>;
  breakEven: number; proxy: Proxy; seed: number; now: Date;
}

function buildDrill(x: DrillCtx): DrillNode[] {
  const today = israelDate(x.now.toISOString());
  const yesterday = israelDate(new Date(x.now.getTime() - 86_400_000).toISOString());
  const aggs = new Map<string, Agg>();
  const aggFor = (k: string) => { let a = aggs.get(k); if (!a) aggs.set(k, (a = agg0())); return a; };
  const names = new Map<string, string | null>();
  for (const r of x.rows) {
    for (const [k, n] of [[`c:${r.campaign_id}`, r.campaign_name], [`s:${r.adset_id}`, r.adset_name], [`a:${r.ad_id}`, r.ad_name]] as const) {
      addRow(aggFor(k), r);
      if (n) names.set(k, n);
    }
  }
  // Sheet leads (all submitted orders) by the last touch, resolved the same way CAC is.
  const leads = new Map<string, number>();
  if (x.lookup) {
    for (const o of x.winOrders) {
      const res = resolveTouch(o.last, x.lookup);
      if (!res) continue;
      const ks = [`c:${res.campaign_id}`];
      if (res.adset_id) ks.push(`s:${res.adset_id}`);
      if (res.adset_id && res.ad_id) ks.push(`a:${res.ad_id}`);
      for (const k of ks) leads.set(k, (leads.get(k) ?? 0) + 1);
    }
  }
  // Per-model order counts from the touch-based drill.
  const byModel = new Map<string, Record<Model, { orders: number; paid: number }>>();
  const bm = (k: string) => { let v = byModel.get(k); if (!v) byModel.set(k, (v = { credited: { orders: 0, paid: 0 }, first: { orders: 0, paid: 0 }, last: { orders: 0, paid: 0 } })); return v; };
  for (const m of MODELS) {
    for (const c of x.reports[m].meta.campaigns) {
      bm(`c:${c.campaign_id}`)[m] = { orders: c.orders, paid: c.paid };
      for (const s of c.adsets) {
        bm(`s:${s.adset_id}`)[m] = { orders: s.orders, paid: s.paid };
        for (const a of s.ads) bm(`a:${a.ad_id}`)[m] = { orders: a.orders, paid: a.paid };
      }
    }
  }
  const ordersById = new Map(x.winOrders.map((o) => [o.order_id, o]));

  const mk = (level: DrillNode["level"], key: string, id: string, name: string | null, j: { spend: number; paid: number; revenue: number; meta_claimed: number; cac: number | null; roas_ex_vat: number | null; order_ids: string[] } | null, paidFallback: { paid: number; revenue: number }): DrillNode => {
    const a = aggs.get(key) ?? null;
    const days = a ? [...a.days].sort() : [];
    const paid = j ? j.paid : paidFallback.paid;
    const revenue = round2(j ? j.revenue : paidFallback.revenue);
    const spendV = x.join ? round2(a?.spend ?? 0) : null;
    const ids = j?.order_ids ?? [];
    const cogs = round2(ids.reduce((s, oid) => s + Number(x.cost.get(oid)?.cogs_ils ?? 0), 0));
    const l = leads.get(key) ?? 0;
    const paidOrders = ids.map((oid) => ordersById.get(oid)).filter((o): o is OrderRecord => !!o);
    return {
      level, id, name: safeText(name ?? names.get(key) ?? null),
      spend: spendV, impressions: a ? a.impressions : x.join ? 0 : null, link_clicks: a ? a.link_clicks : x.join ? 0 : null,
      link_ctr: a && a.impressions ? round2((a.link_clicks / a.impressions) * 100) / 100 : null,
      lpv: a ? a.lpv : null, ic: a ? a.ic : null, api: a ? a.api : null, meta_leads: a ? a.meta_lead : null,
      leads: l, paid, revenue,
      cpl: spendV !== null && l ? round2(spendV / l) : null,
      cac: null, cac_point: j?.cac ?? null, roas_ex_vat: j?.roas_ex_vat ?? null,
      contribution: spendV === null ? null : round2(revenueExVat(revenue) - cogs - spendV),
      meta_claimed: j ? j.meta_claimed : null,
      status: !days.length ? (x.join ? "no_spend" : "unknown") : days[days.length - 1] >= yesterday ? "active" : "idle",
      days_live: days.length ? Math.round((Date.parse(today) - Date.parse(days[0])) / 86_400_000) + 1 : null,
      first_day: days[0] ?? null, last_day: days[days.length - 1] ?? null,
      verdict: null, by_model: bm(key), funnel_hours_lead_to_paid: leadToPaidHours(paidOrders), children: [],
    };
  };

  let out: DrillNode[];
  if (x.join) {
    out = x.join.campaigns.map((c) => {
      const cn = mk("campaign", `c:${c.id}`, c.id, c.name, c, { paid: 0, revenue: 0 });
      cn.children = c.adsets.map((s) => {
        const sn = mk("adset", `s:${s.id}`, s.id, s.name, s, { paid: 0, revenue: 0 });
        sn.children = s.ads.map((a) => mk("ad", `a:${a.id}`, a.id, a.name, a, { paid: 0, revenue: 0 }));
        return sn;
      });
      return cn;
    });
    if (x.join.unknown.paid) {
      const u = mk("campaign", "c:unknown", "unknown", x.join.unknown.label, null, { paid: x.join.unknown.paid, revenue: x.join.unknown.revenue });
      u.status = "unknown";
      out.push(u);
    }
  } else {
    // No spend: the touch-based drill (credited model) so Meta orders still show.
    out = x.reports.credited.meta.campaigns.map((c) => {
      const cn = mk("campaign", `c:${c.campaign_id}`, c.campaign_id, c.campaign_name, null, c);
      cn.children = c.adsets.map((s) => {
        const sn = mk("adset", `s:${s.adset_id}`, s.adset_id, s.adset_name, null, s);
        sn.children = s.ads.map((a) => mk("ad", `a:${a.ad_id}`, a.ad_id, a.ad_name, null, a));
        return sn;
      });
      return cn;
    });
  }

  // Verdicts and CAC intervals
  let n = 0;
  for (const c of out) {
    if (x.join && c.spend !== null && c.id !== "unknown") {
      const v = paidVerdict(c.paid, c.spend, { breakEven: x.breakEven, seed: x.seed + n++ });
      c.verdict = v; c.cac = v.cpa;
    }
    for (const s of c.children) {
      if (x.join && s.spend !== null) {
        const v = paidVerdict(s.paid, s.spend, { breakEven: x.breakEven, seed: x.seed + n++ });
        s.verdict = v; s.cac = v.cpa;
      }
      if (!x.join || !s.children.length) continue;
      const stats: AdStats[] = s.children.map((a) => ({
        id: a.id, spend: a.spend ?? 0, impressions: a.impressions ?? 0, link_clicks: a.link_clicks ?? 0,
        lpv: a.lpv ?? 0, ic: a.ic ?? 0, lead: x.proxy === "lead" ? a.leads : 0, days_live: a.days_live ?? 0,
      }));
      const vs = adsetVerdicts(stats, { proxy: x.proxy, seed: x.seed + n++ });
      for (const a of s.children) {
        a.verdict = vs[a.id] ?? null;
        if (a.spend) a.cac = cpaInterval(a.paid, a.spend, PRIOR_COST.paid, { seed: x.seed + n++ });
      }
    }
  }
  return out;
}

/** The order's recon_status (the OrderRecord field, else the loader's extras), only as a short code. */
function reconStatusOf(o: OrderRecord, extras: NonNullable<ReportData["order_extras"]>): string | null {
  const v = o.recon_status ?? extras[o.order_id]?.recon_status ?? null;
  return v && /^[a-z0-9_:-]{1,30}$/i.test(v) ? v : null;
}

function buildHealth(data: ReportData, rep: Report, join: MetaCac | null, spend: SpendData | null, extras: NonNullable<ReportData["order_extras"]>, opts: DashboardOptions, now: Date): HealthItem[] {
  const paid = data.orders.filter(isPaid);
  const item = (key: string, ids: string[] | null, note: string | null = null): HealthItem =>
    ids === null ? { key, count: null, status: "unknown", ids: [], note } : { key, count: ids.length, status: ids.length ? "red" : "ok", ids: ids.slice(0, 50), note };

  const capiErr = paid.filter((o) => /^error/i.test(o.capi_purchase_result ?? "")).map((o) => o.order_id);
  const unknownAd = join
    ? join.unknown.order_ids
    : paid.filter((o) => (isMetaTouch(o.last) || o.credited_channel === "paid_meta") && !o.last?.meta_ad_id && !/^meta-\d+$/i.test(o.last?.ref ?? "")).map((o) => o.order_id);
  // recon_status (Stage 3, scripts/reconcile-payments.ts): red for every status that needs action; the note
  // counts the statuses (e.g. "amount_mismatch:1,not_in_export:2"). Unknown until the column holds a value.
  const withRecon = data.orders.filter((o) => reconStatusOf(o, extras));
  const recon = withRecon.length ? withRecon.filter((o) => !RECON_OK.has(reconStatusOf(o, extras) as string)).map((o) => o.order_id) : null;
  const reconCounts = new Map<string, number>();
  for (const o of withRecon) { const st = reconStatusOf(o, extras) as string; reconCounts.set(st, (reconCounts.get(st) ?? 0) + 1); }
  const reconNote = [...reconCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(",") || null;

  let token: HealthItem;
  if (opts.tokenExpiresAt) {
    const days = (Date.parse(opts.tokenExpiresAt) - now.getTime()) / 86_400_000;
    token = { key: "token_expiry", count: Math.floor(days), status: days < TOKEN_WARN_DAYS ? "red" : "ok", ids: [], note: null };
  } else {
    token = { key: "token_expiry", count: null, status: "unknown", ids: [], note: opts.metaEnvPresent ? "not_checked" : "no_token" };
  }

  let stale: HealthItem;
  if (!spend || !spend.fetched_at) stale = { key: "spend_stale", count: null, status: "unknown", ids: [], note: "no_spend" };
  else {
    const hours = (now.getTime() - Date.parse(spend.fetched_at)) / H;
    stale = { key: "spend_stale", count: Math.round(hours), status: hours > SPEND_STALE_HOURS ? "red" : "ok", ids: [], note: null };
  }

  return [
    item("paid_capi_error", capiErr),
    item("paid_no_touch", rep.health.paid_no_touch),
    item("pending_over_48h", rep.summary.pending_over_48h),
    item("meta_unknown_ad", unknownAd, join ? null : "no_spend_ids_only"),
    item("recon_not_matched", recon, recon === null ? "no_recon_column" : reconNote),
    token,
    stale,
  ];
}

// ---------------------------------------------------------------------------------------------
// Serialise with the PII guard
// ---------------------------------------------------------------------------------------------

export function serializeDashboard(d: Dashboard, names: string[]): { json: string; issues: string[] } {
  const json = JSON.stringify(d, null, 1) + "\n";
  return { json, issues: piiIssues(json, names) };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

interface Args {
  source: "file" | "sheet"; out: string; from: string | null; dir: string; envFile: string; metaDir: string;
  adsCsv: string | null; basis: Basis; proxy: Proxy; seed: number;
}

function fail(msg: string, code = 2): never {
  console.error(`dashboard-data: ${msg}`);
  process.exit(code);
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): Args {
  const a: Args = {
    source: "file", out: DEFAULT_OUT, from: null, dir: env.ATTR_DATA_DIR || path.join(WEBSITE_DIR, ".test-data"),
    envFile: DEFAULT_REPORT_ENV, metaDir: META_CACHE_DIR, adsCsv: null, basis: "conservative", proxy: "ic", seed: DEFAULT_SEED,
  };
  let dirGiven = false;
  const val = (i: number, f: string) => { const v = argv[i + 1]; if (v === undefined || v.startsWith("--")) fail(`${f} needs a value`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    switch (f) {
      case "--source": { const v = val(i, f); i++; if (v !== "file" && v !== "sheet") fail("--source is file or sheet"); a.source = v; break; }
      case "--out": a.out = val(i, f); i++; break;
      case "--from": { const v = val(i, f); i++; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) fail("--from must be YYYY-MM-DD"); a.from = v; break; }
      case "--dir": a.dir = val(i, f); dirGiven = true; i++; break;
      case "--secrets": a.envFile = val(i, f); i++; break;
      case "--meta-dir": a.metaDir = val(i, f); i++; break;
      case "--ads-csv": a.adsCsv = val(i, f); i++; break;
      case "--basis": { const v = val(i, f); i++; if (v !== "conservative" && v !== "lean") fail("--basis is conservative or lean"); a.basis = v; break; }
      case "--proxy": { const v = val(i, f); i++; if (v !== "ic" && v !== "lead") fail("--proxy is ic or lead"); a.proxy = v; break; }
      case "--seed": { const n = Number(val(i, f)); i++; if (!Number.isInteger(n)) fail("--seed must be an integer"); a.seed = n; break; }
      default: fail(`unknown flag ${f}`);
    }
  }
  if (a.source === "sheet") {
    if (dirGiven) fail("--dir is for --source file only");
    if (env.ATTR_TEST === "1" || env.STORE_MODE === "file") fail("--source sheet is refused in test mode (ATTR_TEST=1 or STORE_MODE=file)");
  }
  return a;
}

export async function run(argv: string[], deps: { now?: Date; load?: (a: Args) => Promise<ReportData>; log?: (s: string) => void } = {}): Promise<number> {
  const args = parseArgs(argv);
  const log = deps.log ?? ((s: string) => console.log(s));
  const now = deps.now ?? new Date();
  let data: ReportData;
  if (deps.load) data = await deps.load(args);
  else if (args.source === "sheet") {
    const warn = envFileModeWarning(args.envFile);
    if (warn) console.error(`dashboard-data: warning: ${warn}`);
    data = await loadSheetData({ envFile: args.envFile });
  } else {
    const dir = path.resolve(args.dir);
    if (!path.basename(dir).startsWith(".test-data")) fail(`the data folder must be a .test-data* folder (got ${dir})`);
    data = loadReportData(dir);
  }
  const spend = loadSpend(path.resolve(args.metaDir), args.adsCsv);
  data.meta_spend = spend.rows.length ? spend : null;
  const d = buildDashboard(data, { now, from: args.from, basis: args.basis, proxy: args.proxy, seed: args.seed, metaEnvPresent: fs.existsSync(DEFAULT_META_ENV) });
  const { json, issues } = serializeDashboard(d, namesIn(data.orders));
  if (issues.length) {
    console.error(`dashboard-data: refusing to write: the output failed the PII guard (${issues.join(", ")})`);
    return 3;
  }
  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, json);
  log(`dashboard-data: wrote ${out} (${d.order_ids.length} orders, spend ${d.spend.present ? "present" : "none"}, ${Buffer.byteLength(json)} bytes)`);
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  run(process.argv.slice(2)).then((c) => process.exit(c), (e) => fail(e instanceof Error ? e.message : String(e), 1));
}
