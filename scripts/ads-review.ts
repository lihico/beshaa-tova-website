/**
 * Weekly ads review (PLAN.md marketing_machine_2026-11, Stage 5 and sections 6.1-6.2).
 *
 *   npx tsx scripts/ads-review.ts [--source sheet|file] [--dir .test-data] [--secrets <report.env>]
 *        [--meta-dir website/.data/meta] [--ads-csv <meta_upload.csv>] [--campaigns-dir marketing/campaigns]
 *        [--out-root website/.data/weekly] [--out <review.json>] [--window 7d|28d|all] [--proxy ic|lead] [--seed N]
 *     writes website/.data/weekly/<ISO-week>/review.json: per ad the verdict chip (report-lib/bayes.ts),
 *     the evidence (spend, impressions, CTR, proxy conversions, proxy CPA interval, paid CAC interval),
 *     the copy elements of each ad from marketing/campaigns/<dir>/ads.json, the winning (or leading) ad,
 *     and up to 6 "change one element" variant slots (callout / headline / opening line / format).
 *     With no Meta spend in the window it writes status "no_spend" and does not load the sheet.
 *
 *   npx tsx scripts/ads-review.ts --check-variants <variants.json> [--review <review.json>]
 *     checks a variants file (written by the weekly claude -p run) against the review: 1-6 variants,
 *     each fills a slot, changes exactly one element, passes the Hebrew copy QA. Writes nothing.
 *
 *   npx tsx scripts/ads-review.ts --draft-from <variants.json> [--review <review.json>] [--campaign-dir <dir>]
 *     builds the draft campaign folder marketing/campaigns/<yyyy-mm>_meta_wNN/ (ads.json and
 *     meta_upload.csv in the v3 schema, Status=draft, URL parameters = 00_DESIGN 9.1 string + v=<ref>)
 *     and decision_spec.json for ~/.claude/skills/decision-sheet/make_sheet.py.
 *
 *   npx tsx scripts/ads-review.ts --check-drafts <campaign_dir>
 *     re-checks a built folder: Status=draft on every row, the 9.1 URL parameters, a clean Website URL,
 *     at most 6 ads, copy QA. Exit 0 clean, 1 problems.
 *
 * Nothing here calls Meta, Grow, Make or Google except the READ ONLY sheet load of --source sheet
 * (report-lib/load.ts). It never creates ads: meta-create-paused.ts is a separate, attended step.
 * No buyer data: the review copies only ids, Meta names (through dashboard-data safeText), numbers and
 * our own ad copy; before writing, dashboard-data piiIssues scans it (the copy fields are excluded
 * from the buyer-name scan only, because they come from the repo, not from the sheet).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_OUT_DIR as META_CACHE_DIR } from "./meta-insights.ts";
import { loadSpend } from "./attribution-report.ts";
import { NO_SPEND_MESSAGE, buildDashboard, namesIn, piiIssues, windows, type DrillNode, type WindowKey } from "./dashboard-data.ts";
import { CHIP, DEFAULT_SEED, type CpaSummary, type Proxy } from "./report-lib/bayes.ts";
import { DEFAULT_REPORT_ENV, envFileModeWarning, loadReportData, loadSheetData, type ReportData } from "./report-lib/load.ts";
import type { SpendData } from "./report-lib/join.ts";
import { parseCsv } from "./meta-lib/approvals.ts";
import { qaCopy, type QaIssue } from "./meta-lib/copy-qa.ts";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(WEBSITE_DIR, "..");
export const DEFAULT_CAMPAIGNS_DIR = path.join(REPO_ROOT, "marketing", "campaigns");
export const DEFAULT_OUT_ROOT = path.join(WEBSITE_DIR, ".data", "weekly");
export const SCHEMA_VERSION = 1;
export const MAX_SLOTS = 6;
export const MIN_VARIANTS = 1;
export const GENERATED_BY = "ads-review.ts";

/** docs/attribution/00_DESIGN.md 9.1 (same string as marketing/campaigns/2026-11_meta_v3/_package/build.py). */
export const META_URL_PARAMS =
  "ref=meta-{{ad.id}}&utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}" +
  "&utm_term={{adset.name}}&utm_content={{ad.name}}&utm_id={{campaign.id}}&cid={{campaign.id}}&asid={{adset.id}}&aid={{ad.id}}&plc={{placement}}";
export const DEFAULT_LANDING = "https://beshaa-tova.co.il/";

/** PLAN Stage 5: renders use the existing templates. */
export const TEMPLATES = { reel: "marketing/reels/22_engaged_chaos/reel.html", static: "marketing/posts/14_expectation_reality/image.html" } as const;

export type Element = "callout" | "headline" | "opening_line" | "format";
export const ELEMENTS: Element[] = ["callout", "headline", "opening_line", "format"];
/** Hebrew labels for the decision page (draft wording for Lihi). */
export const ELEMENT_LABEL: Record<Element, string> = {
  callout: "הקריאה לקהל בשנייה הראשונה",
  headline: "הכותרת",
  opening_line: "שורת הפתיחה של הטקסט",
  format: "הפורמט (ריל או תמונה)",
};

/** The same columns, in the same order, as marketing/campaigns/2026-11_meta_v3/meta_upload.csv. */
export const CSV_COLUMNS = [
  "Ad name", "Campaign", "Ad set", "Phase", "Age (proposal)", "Ad set budget (proposal)", "Format", "Placement",
  "Primary text", "Headline", "Description", "CTA", "Creative 4:5", "Creative 9:16", "Creative 1:1", "Video 9:16",
  "Website URL", "URL parameters", "Ref code", "Earlier working ref", "AI generated", "Ready to upload", "Missing", "Status",
  "Previous website URL",
];

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

/** YYYY-MM-DD in Asia/Jerusalem. */
export function ilDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
}

/** ISO 8601 week of the Israel calendar date: { year, week, label "2026-W45" }. */
export function isoWeek(d: Date): { year: number; week: number; label: string } {
  const [y, m, day] = ilDate(d).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  const dow = t.getUTCDay() || 7;                    // Monday 1 .. Sunday 7
  t.setUTCDate(t.getUTCDate() + 4 - dow);            // the Thursday of this week decides the year
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return { year, week, label: `${year}-W${String(week).padStart(2, "0")}` };
}

/** marketing/campaigns/<yyyy-mm>_meta_wNN (the month is the run date's, the week its ISO week). */
export function draftFolderName(d: Date): string {
  return `${ilDate(d).slice(0, 7)}_meta_w${String(isoWeek(d).week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------
// Ad copy from marketing/campaigns/*/ads.json
// ---------------------------------------------------------------------------------------------

export interface AdCopy {
  campaign_dir: string;            // relative to the repo root
  ads_json_id: string;
  ad_name: string;                 // <folder>_<id>, the "Ad name" column
  ref: string | null;
  format: "reel" | "static";
  format_raw: string | null;
  callout: string | null;
  on_image: string | null;
  opening_line: string | null;
  primary_text: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  website_url: string;
  campaign: string | null;
  ad_set: string | null;
  placement: string | null;
  creatives: Record<string, string>;
  video: string | null;
  ai_generated: boolean;
}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function onImageText(v: unknown): string | null {
  if (typeof v === "string") return s(v);
  if (v && typeof v === "object") {
    const parts = Object.entries(v as Record<string, unknown>).filter(([k, x]) => k !== "logo" && typeof x === "string").map(([, x]) => x as string);
    return parts.length ? parts.join(" / ") : null;
  }
  return null;
}

/** The first-second audience callout (MARKETING_STANDARDS section 3): onImage.hook, else the first " / " segment of onImage. */
export function calloutOf(onImage: unknown): string | null {
  if (onImage && typeof onImage === "object" && typeof (onImage as Record<string, unknown>).hook === "string") return s((onImage as Record<string, string>).hook);
  const t = onImageText(onImage);
  return t ? s(t.split(" / ")[0].trim()) : null;
}

export const openingLineOf = (primary: string | null): string | null => (primary ? s(primary.split("\n")[0].trim()) : null);

/** A clean Website URL (no query): the ad's url or the campaign landing, else the home page. */
export function cleanUrl(u: unknown): string {
  try {
    const x = new URL(String(u));
    if (x.protocol !== "https:" || !/^(www\.)?beshaa-tova\.co\.il$/.test(x.hostname)) return DEFAULT_LANDING;
    return `https://${x.hostname}${x.pathname}`;
  } catch { return DEFAULT_LANDING; }
}

export function copyFromAd(dirName: string, doc: Record<string, unknown>, a: Record<string, unknown>): AdCopy | null {
  const id = s(a.id);
  if (!id) return null;
  if (a.channel !== undefined && a.channel !== "meta") return null;
  const primary = s(a.primaryText);
  const fmt = s(a.format);
  const creatives: Record<string, string> = {};
  if (a.creatives && typeof a.creatives === "object") for (const [k, v] of Object.entries(a.creatives as Record<string, unknown>)) if (typeof v === "string") creatives[k] = v;
  return {
    campaign_dir: path.posix.join("marketing", "campaigns", dirName), ads_json_id: id, ad_name: `${dirName}_${id}`,
    ref: s(a.ref), format: fmt && /reel/i.test(fmt) && !/^static/i.test(fmt) ? "reel" : "static", format_raw: fmt,
    callout: calloutOf(a.onImage), on_image: onImageText(a.onImage), opening_line: openingLineOf(primary), primary_text: primary,
    headline: s(a.headline), description: s(a.description), cta: s(a.cta), website_url: cleanUrl(a.url ?? a.landing ?? doc.landing),
    campaign: s(a.campaign), ad_set: s(a.adSetName), placement: s(a.placement), creatives, video: s(a.video),
    ai_generated: a.aiGenerated === true,
  };
}

/** Every Meta ad of every campaign folder, keyed by lower-case ad name and by lower-case ref. */
export function loadCopyIndex(campaignsDir: string): Map<string, AdCopy> {
  const idx = new Map<string, AdCopy>();
  let dirs: string[] = [];
  try { dirs = fs.readdirSync(campaignsDir).sort(); } catch { return idx; }
  for (const d of dirs) {
    let doc: Record<string, unknown>;
    try { doc = JSON.parse(fs.readFileSync(path.join(campaignsDir, d, "ads.json"), "utf8")); } catch { continue; }
    const ads = Array.isArray(doc?.ads) ? (doc.ads as Record<string, unknown>[]) : [];
    for (const a of ads) {
      const c = copyFromAd(d, doc, a);
      if (!c) continue;
      idx.set(c.ad_name.toLowerCase(), c);
      if (c.ref) idx.set(`ref:${c.ref.toLowerCase()}`, c);
    }
  }
  return idx;
}

/** The v=<slug> of an ad's url_tags (00_DESIGN 9.1 keeps the human ref there). */
export function vTag(urlTags: string | null | undefined): string | null {
  if (!urlTags) return null;
  const m = /(?:^|[?&])v=([^&]+)/.exec(urlTags);
  return m ? decodeURIComponent(m[1]) : null;
}

export function matchCopy(adId: string, adName: string | null, spend: SpendData | null, idx: Map<string, AdCopy>): AdCopy | null {
  if (adName) {
    const byName = idx.get(adName.toLowerCase());
    if (byName) return byName;
  }
  const meta = spend?.ads.find((a) => a.id === adId);
  const v = vTag(meta?.url_tags);
  if (v) { const byRef = idx.get(`ref:${v.toLowerCase()}`); if (byRef) return byRef; }
  if (meta?.name) { const byMetaName = idx.get(meta.name.toLowerCase()); if (byMetaName) return byMetaName; }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The review
// ---------------------------------------------------------------------------------------------

export interface ReviewAd {
  ad_id: string; ad_name: string | null;
  campaign_id: string; campaign_name: string | null; adset_id: string; adset_name: string | null;
  chip: string | null; verdict_code: string | null; reasons: string[]; p_best: number | null; p_replace: number | null;
  evidence: {
    spend: number; impressions: number; link_clicks: number; ctr: number | null; lpv: number | null;
    ic: number | null; add_payment_info: number | null; leads: number; paid: number;
    proxy: Proxy; proxy_conversions: number; proxy_cpa: CpaSummary | null; paid_cac: CpaSummary | null; days_live: number | null;
  };
  copy: AdCopy | null;
}

export interface VariantSlot {
  slot: string;                    // V1..V6
  element: Element;
  element_label: string;
  base_ad_id: string;
  base_ad_name: string;            // the ads.json "Ad name"
  current: string | null;          // the value of that element today
  target_format: "reel" | "static" | null;   // format slots only
  template: string | null;         // format and callout slots: the render template
  rule: string;
}

export interface Review {
  schema: number; generated_by: string; generated_at: string; source: string;
  iso_week: string; week: number; draft_campaign_dir: string;
  status: "ok" | "no_spend";
  message: string | null;
  window: { key: WindowKey; from: string | null; to: string | null; label: string };
  proxy: Proxy; spend_fetched_at: string | null;
  totals: { spend: number; impressions: number; ads: number; ads_with_spend: number };
  campaigns: Array<{ id: string; name: string | null; spend: number; paid: number; chip: string | null; reasons: string[]; cac: CpaSummary | null }>;
  ads: ReviewAd[];
  winner: { ad_id: string; basis: "verdict" | "leader" | "early_only"; copy: AdCopy } | null;
  replace_ad_ids: string[];
  variant_slots: VariantSlot[];
  notes: string[];
}

export interface ReviewOptions {
  now: Date; window?: WindowKey; from?: string | null; proxy?: Proxy; seed?: number; source?: string;
  copyIndex: Map<string, AdCopy>;
}

function spendInWindow(spend: SpendData | null, w: { from: string | null; to: string | null }): number {
  if (!spend) return 0;
  return spend.rows.filter((r) => (!w.from || r.date_start >= w.from) && (!w.to || r.date_start <= w.to)).reduce((x, r) => x + (r.spend || 0), 0);
}

/** True when the Meta cache has spend in the window (no sheet load is needed to say "no spend"). */
export function hasSpend(spend: SpendData | null, now: Date, key: WindowKey = "28d", from: string | null = null): boolean {
  return spendInWindow(spend, windows(now, from)[key]) > 0;
}

function baseReview(opts: ReviewOptions, spend: SpendData | null): Review {
  const key = opts.window ?? "28d";
  const w = windows(opts.now, opts.from ?? null)[key];
  const wk = isoWeek(opts.now);
  return {
    schema: SCHEMA_VERSION, generated_by: GENERATED_BY, generated_at: opts.now.toISOString(), source: opts.source ?? "file",
    iso_week: wk.label, week: wk.week, draft_campaign_dir: path.posix.join("marketing", "campaigns", draftFolderName(opts.now)),
    status: "no_spend", message: NO_SPEND_MESSAGE,
    window: { key, ...w }, proxy: opts.proxy ?? "ic", spend_fetched_at: spend?.fetched_at ?? null,
    totals: { spend: 0, impressions: 0, ads: 0, ads_with_spend: 0 },
    campaigns: [], ads: [], winner: null, replace_ad_ids: [], variant_slots: [], notes: [],
  };
}

/** The no-spend review: written instead of failing when the cache has no spend in the window. */
export function noSpendReview(opts: ReviewOptions, spend: SpendData | null): Review {
  const r = baseReview(opts, spend);
  r.notes.push(spend && spend.rows.length ? "spend_zero_in_window" : "no_insights_rows");
  return r;
}

const rankKey = (a: ReviewAd) => [a.p_best ?? -1, -(a.evidence.proxy_cpa?.median ?? Number.POSITIVE_INFINITY)];
function byRank(a: ReviewAd, b: ReviewAd): number {
  const [x1, x2] = rankKey(a), [y1, y2] = rankKey(b);
  return y1 - x1 || y2 - x2 || b.evidence.proxy_conversions - a.evidence.proxy_conversions || a.ad_id.localeCompare(b.ad_id);
}

function slotsFor(ad: ReviewAd, elements: Element[], start: number): VariantSlot[] {
  const c = ad.copy as AdCopy;
  return elements.map((e, i) => {
    const target = e === "format" ? (c.format === "reel" ? "static" : "reel") : null;
    return {
      slot: `V${start + i}`, element: e, element_label: ELEMENT_LABEL[e], base_ad_id: ad.ad_id, base_ad_name: c.ad_name,
      current: e === "callout" ? c.callout : e === "headline" ? c.headline : e === "opening_line" ? c.opening_line : c.format,
      target_format: target,
      template: e === "format" ? TEMPLATES[target as "reel" | "static"] : e === "callout" ? TEMPLATES[c.format] : null,
      rule: "change only this element; every other field stays as in the base ad",
    };
  });
}

/** Builds the review from loaded sheet data with Meta spend (pure, apart from the copy index passed in). */
export function buildReview(data: ReportData, opts: ReviewOptions): Review {
  const spend = data.meta_spend && data.meta_spend.rows.length ? data.meta_spend : null;
  const key = opts.window ?? "28d";
  if (!hasSpend(spend, opts.now, key, opts.from ?? null)) return noSpendReview(opts, spend);
  const proxy = opts.proxy ?? "ic";
  const r = baseReview(opts, spend);
  r.status = "ok"; r.message = null;
  const d = buildDashboard(data, { now: opts.now, from: opts.from ?? null, proxy, seed: opts.seed ?? DEFAULT_SEED });
  const drill: DrillNode[] = d.drill[key];
  for (const c of drill) {
    if (c.id === "unknown") continue;
    r.campaigns.push({ id: c.id, name: c.name, spend: c.spend ?? 0, paid: c.paid, chip: c.verdict?.chip ?? null, reasons: c.verdict?.reasons ?? [], cac: c.cac });
    for (const st of c.children) for (const a of st.children) {
      const proxyConv = proxy === "lead" ? a.leads : a.ic ?? 0;
      r.ads.push({
        ad_id: a.id, ad_name: a.name, campaign_id: c.id, campaign_name: c.name, adset_id: st.id, adset_name: st.name,
        chip: a.verdict?.chip ?? null, verdict_code: a.verdict?.code ?? null, reasons: a.verdict?.reasons ?? [],
        p_best: a.verdict?.p_best ?? null, p_replace: a.verdict?.p_replace ?? null,
        evidence: {
          spend: a.spend ?? 0, impressions: a.impressions ?? 0, link_clicks: a.link_clicks ?? 0, ctr: a.link_ctr,
          lpv: a.lpv, ic: a.ic, add_payment_info: a.api, leads: a.leads, paid: a.paid,
          proxy, proxy_conversions: proxyConv, proxy_cpa: a.verdict?.cpa ?? null, paid_cac: a.cac, days_live: a.days_live,
        },
        copy: matchCopy(a.id, a.name, spend, opts.copyIndex),
      });
    }
  }
  r.totals = {
    spend: round2(r.ads.reduce((x, a) => x + a.evidence.spend, 0)), impressions: r.ads.reduce((x, a) => x + a.evidence.impressions, 0),
    ads: r.ads.length, ads_with_spend: r.ads.filter((a) => a.evidence.spend > 0).length,
  };
  r.replace_ad_ids = r.ads.filter((a) => a.verdict_code === "replace").map((a) => a.ad_id);

  // Winner: the "מנצח" chip; else the leader among ads that are not to be replaced; else any ad with spend.
  const spent = r.ads.filter((a) => a.evidence.spend > 0).sort(byRank);
  const winners = spent.filter((a) => a.verdict_code === "winner");
  const alive = spent.filter((a) => a.verdict_code !== "replace");
  const ranked = [...winners, ...alive.filter((a) => !winners.includes(a)), ...spent.filter((a) => !alive.includes(a))];
  const withCopy = ranked.filter((a) => a.copy);
  if (!withCopy.length) {
    r.notes.push(spent.length ? "no_copy_match" : "no_ads_with_spend");
    return r;
  }
  const top = withCopy[0];
  const basis: "verdict" | "leader" | "early_only" =
    top.verdict_code === "winner" ? "verdict" : spent.some((a) => a.verdict_code === "keep" || a.verdict_code === "winner") ? "leader" : "early_only";
  r.winner = { ad_id: top.ad_id, basis, copy: top.copy as AdCopy };
  if (basis !== "verdict") r.notes.push(basis === "leader" ? "no_winner_chip_using_leader" : "verdicts_early_using_leader");
  r.variant_slots = slotsFor(top, ELEMENTS, 1);
  const second = withCopy.slice(1).find((a) => a.verdict_code !== "replace" && a.copy?.ad_name !== top.copy?.ad_name);
  if (second) r.variant_slots.push(...slotsFor(second, ["callout", "headline"], r.variant_slots.length + 1));
  r.variant_slots = r.variant_slots.slice(0, MAX_SLOTS);
  return r;
}

/** JSON text plus PII issues. Copy fields come from the repo, so they are left out of the buyer-name scan only. */
export function serializeReview(r: Review, names: string[]): { json: string; issues: string[] } {
  const json = JSON.stringify(r, null, 1) + "\n";
  const noCopy: Review = {
    ...r, ads: r.ads.map((a) => ({ ...a, copy: null })), winner: r.winner ? { ...r.winner, copy: null as unknown as AdCopy } : null,
    variant_slots: r.variant_slots.map((x) => ({ ...x, current: null })),
  };
  const issues = [...new Set([...piiIssues(json, []), ...piiIssues(JSON.stringify(noCopy), names)])];
  return { json, issues };
}

// ---------------------------------------------------------------------------------------------
// Variants (written by the weekly claude -p run) and the draft folder
// ---------------------------------------------------------------------------------------------

export interface Variant { slot: string; new_value: string; why: string }

export function parseVariants(text: string): Variant[] {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("variants file is not valid JSON"); }
  const list = Array.isArray(raw) ? raw : (raw as { variants?: unknown })?.variants;
  if (!Array.isArray(list)) throw new Error("variants file has no variants array");
  return list.map((v) => ({ slot: String((v as Variant)?.slot ?? ""), new_value: String((v as Variant)?.new_value ?? ""), why: String((v as Variant)?.why ?? "") }));
}

export interface DraftAd {
  slot: VariantSlot; variant: Variant; base: AdCopy; ad_name: string; ref: string;
  format: "reel" | "static"; on_image: string | null; callout: string | null;
  primary_text: string; headline: string; description: string;
  media_ready: boolean; missing: string;
}

/** Applies one variant to its base ad: exactly one element changes. */
export function applyVariant(slot: VariantSlot, v: Variant, base: AdCopy, folder: string): DraftAd {
  const nv = v.new_value.trim();
  const id = slot.slot.toLowerCase();
  const d: DraftAd = {
    slot, variant: v, base, ad_name: `${folder}_${id}`, ref: `${folder.slice(0, 7).replace("-", "")}-w${folder.slice(-2)}-${id}`,
    format: base.format, on_image: base.on_image, callout: base.callout, primary_text: base.primary_text ?? "",
    headline: base.headline ?? "", description: base.description ?? "", media_ready: true, missing: "",
  };
  if (slot.element === "headline") d.headline = nv;
  else if (slot.element === "opening_line") {
    const lines = (base.primary_text ?? "").split("\n");
    lines[0] = nv;
    d.primary_text = lines.join("\n");
  } else if (slot.element === "callout") {
    d.callout = nv;
    const rest = (base.on_image ?? "").split(" / ").slice(1);
    d.on_image = [nv, ...rest].join(" / ");
    d.media_ready = false;
    d.missing = `render: new callout on frame 0 / on image (${slot.template ?? TEMPLATES[base.format]})`;
  } else if (slot.element === "format") {
    d.format = nv === "reel" || nv === "static" ? nv : (slot.target_format ?? (base.format === "reel" ? "static" : "reel"));
    d.media_ready = false;
    d.missing = `render: ${d.format} from ${TEMPLATES[d.format]}`;
  }
  return d;
}

/** Problems with a variants file against a review. Empty = fine. */
export function variantProblems(review: Review, variants: Variant[]): string[] {
  const p: string[] = [];
  if (review.status !== "ok") p.push(`review status is ${review.status}; no variants are drafted`);
  if (variants.length < MIN_VARIANTS || variants.length > MAX_SLOTS) p.push(`expected 1-${MAX_SLOTS} variants, got ${variants.length}`);
  const seen = new Set<string>();
  for (const v of variants) {
    const slot = review.variant_slots.find((x) => x.slot === v.slot);
    if (!slot) { p.push(`${v.slot || "(no slot)"}: not a slot of this review`); continue; }
    if (seen.has(v.slot)) p.push(`${v.slot}: used twice`);
    seen.add(v.slot);
    const nv = v.new_value.trim();
    if (!nv) { p.push(`${v.slot}: new_value is empty`); continue; }
    if (nv.includes("\n")) p.push(`${v.slot}: new_value must be one line`);
    if (slot.element === "format" && nv !== slot.target_format) p.push(`${v.slot}: a format slot takes "${slot.target_format}"`);
    if (slot.element !== "format" && slot.current !== null && nv === slot.current.trim()) p.push(`${v.slot}: new_value equals the current ${slot.element}`);
    if (!v.why.trim()) p.push(`${v.slot}: why is empty`);
    for (const q of qaCopy({ new_value: nv, why: v.why })) p.push(`${v.slot}: ${q.field} ${q.rule} (${q.detail})`);
  }
  return p;
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
export function toCsv(rows: Record<string, string>[]): string {
  return "﻿" + [CSV_COLUMNS.map(csvCell).join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c] ?? "")).join(","))].join("\n") + "\n";
}

export function csvRow(d: DraftAd, folder: string): Record<string, string> {
  const c = d.media_ready ? d.base.creatives : {};
  const v = d.media_ready ? d.base.video ?? "" : "";
  return {
    "Ad name": d.ad_name, Campaign: d.base.campaign ?? "", "Ad set": d.base.ad_set ?? "", Phase: `weekly ${folder.slice(-3)}`,
    "Age (proposal)": "", "Ad set budget (proposal)": "", Format: d.format, Placement: d.base.placement ?? "",
    "Primary text": d.primary_text, Headline: d.headline, Description: d.description, CTA: d.base.cta ?? "LEARN_MORE",
    "Creative 4:5": c["4x5"] ?? "", "Creative 9:16": c["9x16"] ?? "", "Creative 1:1": c["1x1"] ?? "", "Video 9:16": d.format === "reel" ? v : "",
    "Website URL": d.base.website_url, "URL parameters": `${META_URL_PARAMS}&v=${d.ref}`, "Ref code": d.ref,
    "Earlier working ref": d.base.ref ?? "", "AI generated": d.base.ai_generated && d.media_ready ? "yes" : d.media_ready ? "no" : "",
    "Ready to upload": d.media_ready ? "yes, after Hebrew approval" : "no", Missing: d.missing, Status: "draft", "Previous website URL": "",
  };
}

/** Media paths of a draft point into the base campaign folder; they are kept relative to the repo for ads.json. */
const repoMedia = (base: AdCopy, rel: string) => (rel ? path.posix.join(base.campaign_dir, rel) : "");

export function adsJson(review: Review, drafts: DraftAd[], folder: string, now: Date): Record<string, unknown> {
  return {
    campaign: folder, month: folder.slice(0, 7), slug: folder, landing: DEFAULT_LANDING, built: ilDate(now),
    status: "draft", generated_by: GENERATED_BY, review_week: review.iso_week, hebrew: "draft for Lihi",
    rules: { noPrice: true, noEmDash: true, noUrgency: true, oneChangePerVariant: true, noUploadNoSpendNoPosting: true },
    ads: drafts.map((d) => ({
      id: d.slot.slot.toLowerCase(), name: `${d.slot.slot}: ${d.slot.element_label}`, format: d.format, placement: d.base.placement,
      ref: d.ref, channel: "meta", campaign: d.base.campaign, adSetName: d.base.ad_set, cta: d.base.cta ?? "LEARN_MORE",
      onImage: d.on_image, primaryText: d.primary_text, headline: d.headline, description: d.description,
      creatives: d.media_ready ? Object.fromEntries(Object.entries(d.base.creatives).map(([k, v]) => [k, repoMedia(d.base, v)])) : {},
      template: d.media_ready ? null : (d.slot.element === "format" ? TEMPLATES[d.format] : d.slot.template),
      aiGenerated: d.base.ai_generated, url: d.base.website_url, status: "draft", ready: d.media_ready,
      change: { element: d.slot.element, from: d.slot.current, to: d.variant.new_value.trim(), why: d.variant.why.trim(), base_ad_id: d.slot.base_ad_id, base_ad_name: d.base.ad_name },
      qa: [] as QaIssue[],
    })),
  };
}

const fmtCpa = (c: CpaSummary | null) => (c ? `חציון ${c.median}, טווח 5-95%: ${c.p05}-${c.p95}` : "אין עדיין");

/** The spec for ~/.claude/skills/decision-sheet/make_sheet.py (Hebrew wording: drafts for Lihi). */
export function decisionSpec(review: Review, drafts: DraftAd[], folder: string): Record<string, unknown> {
  const adById = new Map(review.ads.map((a) => [a.ad_id, a]));
  const proxyHe = review.proxy === "lead" ? "לידים" : "התחלות תשלום";
  return {
    name: `ADS_WEEKLY_${review.iso_week.replace("-", "_")}`,
    title: `הצעות למודעות חדשות, שבוע ${review.week}`,
    subtitle: [
      `כל הצעה משנה דבר אחד בלבד במודעה קיימת. הנתונים: <bdi dir="ltr">${review.window.from ?? ""}</bdi> עד היום, הוצאה ${review.totals.spend} ₪.`,
      `התיקייה: <bdi dir="ltr">${folder}</bdi>. שום דבר לא עלה למטא. אחרי האישור: <bdi dir="ltr">meta-create-paused.ts</bdi> יוצר מודעות מושהות בלבד.`,
    ],
    notes: [
      ...(review.winner && review.winner.basis !== "verdict"
        ? [{ kind: "warn", html: "<b>אין עדיין מודעה מנצחת לפי הכללים.</b> ההצעות נבנו על המודעה המובילה כרגע, והראיות חלשות." }]
        : []),
      { kind: "info", html: "תקציב, קהלים והפעלה נשארים אצלך בלבד. הצעות של פתיח או פורמט צריכות עדיין עיצוב." },
    ],
    sections: [{
      title: "הצעות השבוע",
      desc: `המדד למודעה: ${proxyHe}. הכלל: שינוי אחד בכל הצעה.`,
      items: drafts.map((d) => {
        const a = adById.get(d.slot.base_ad_id);
        const e = a?.evidence;
        const ctr = e?.ctr !== null && e?.ctr !== undefined ? `${round2(e.ctr * 100)}%` : "לא ידוע";
        return {
          id: d.slot.slot,
          title: `${d.slot.slot}: ${d.slot.element_label}, על בסיס ${d.base.ad_name}`,
          now: e
            ? `המודעה ${d.base.ad_name}: ${a?.chip ?? "ללא סטטוס"}. הוצאה ${e.spend} ₪, ${e.impressions} חשיפות, CTR ${ctr}, ${e.proxy_conversions} ${proxyHe}, עלות ל${review.proxy === "lead" ? "ליד" : "התחלת תשלום"}: ${fmtCpa(e.proxy_cpa)}. היום: "${d.slot.current ?? ""}"`
            : `המודעה ${d.base.ad_name}. היום: "${d.slot.current ?? ""}"`,
          prop: `לשנות רק את ${d.slot.element_label} ל: "${d.variant.new_value.trim()}". למה: ${d.variant.why.trim()}${d.media_ready ? "" : " (צריך עיצוב לפני העלאה)"}`,
          files: [["ads.json", `${folder}/ads.json`], ["meta_upload.csv", `${folder}/meta_upload.csv`]],
        };
      }),
    }],
    copy_label: `ADS WEEKLY ${review.iso_week}`,
  };
}

export interface BuiltDrafts { dir: string; drafts: DraftAd[]; files: string[] }

/** Builds the draft folder. Refuses to overwrite a folder this script did not make. */
export function buildDraftFolder(review: Review, variants: Variant[], campaignDir: string, now: Date): BuiltDrafts {
  const problems = variantProblems(review, variants);
  if (problems.length) throw new Error(`variants refused:\n  ${problems.join("\n  ")}`);
  const folder = path.basename(campaignDir);
  if (!/^\d{4}-\d{2}_meta_w\d{2}$/.test(folder)) throw new Error(`campaign folder must be named <yyyy-mm>_meta_wNN (got ${folder})`);
  const adsPath = path.join(campaignDir, "ads.json");
  if (fs.existsSync(adsPath)) {
    let prev: Record<string, unknown> = {};
    try { prev = JSON.parse(fs.readFileSync(adsPath, "utf8")); } catch { /* treated as foreign */ }
    if (prev.generated_by !== GENERATED_BY || prev.status !== "draft") throw new Error(`${adsPath} exists and was not drafted by ${GENERATED_BY}; not overwriting`);
  }
  const copyBySlot = (slot: VariantSlot): AdCopy => {
    const a = review.ads.find((x) => x.ad_id === slot.base_ad_id)?.copy ?? (review.winner?.ad_id === slot.base_ad_id ? review.winner.copy : null);
    if (!a) throw new Error(`${slot.slot}: the base ad has no copy in the review`);
    return a;
  };
  const drafts = variants.map((v) => {
    const slot = review.variant_slots.find((x) => x.slot === v.slot) as VariantSlot;
    return applyVariant(slot, v, copyBySlot(slot), folder);
  });
  const qa = drafts.flatMap((d) => qaCopy({ [`${d.slot.slot}.primary_text`]: d.primary_text, [`${d.slot.slot}.headline`]: d.headline, [`${d.slot.slot}.description`]: d.description, [`${d.slot.slot}.on_image`]: d.on_image ?? "" }));
  if (qa.length) throw new Error(`copy QA failed:\n  ${qa.map((q) => `${q.field} ${q.rule}`).join("\n  ")}`);
  fs.mkdirSync(campaignDir, { recursive: true });
  const files = [adsPath, path.join(campaignDir, "meta_upload.csv"), path.join(campaignDir, "decision_spec.json"), path.join(campaignDir, "variants.json")];
  fs.writeFileSync(files[0], JSON.stringify(adsJson(review, drafts, folder, now), null, 1) + "\n");
  fs.writeFileSync(files[1], toCsv(drafts.map((d) => csvRow(d, folder))));
  fs.writeFileSync(files[2], JSON.stringify(decisionSpec(review, drafts, folder), null, 1) + "\n");
  fs.writeFileSync(files[3], JSON.stringify({ review_week: review.iso_week, variants }, null, 1) + "\n");
  return { dir: campaignDir, drafts, files };
}

/** Problems with a built draft folder. Empty = fine. */
export function draftFolderProblems(campaignDir: string): string[] {
  const p: string[] = [];
  let rows: Record<string, string>[] = [];
  try { rows = parseCsv(fs.readFileSync(path.join(campaignDir, "meta_upload.csv"), "utf8")); } catch { return ["meta_upload.csv is missing"]; }
  let doc: Record<string, unknown> = {};
  try { doc = JSON.parse(fs.readFileSync(path.join(campaignDir, "ads.json"), "utf8")); } catch { p.push("ads.json is missing or not JSON"); }
  const ads = Array.isArray(doc.ads) ? (doc.ads as Record<string, unknown>[]) : [];
  if (doc.status !== "draft") p.push("ads.json status is not draft");
  if (!rows.length) p.push("meta_upload.csv has no rows");
  if (rows.length > MAX_SLOTS) p.push(`more than ${MAX_SLOTS} ads`);
  if (ads.length !== rows.length) p.push("ads.json and meta_upload.csv differ in length");
  for (const r of rows) {
    const n = r["Ad name"] || "(no name)";
    if (r.Status !== "draft") p.push(`${n}: Status is not draft`);
    const up = r["URL parameters"] ?? "";
    if (!up.startsWith(META_URL_PARAMS + "&v=")) p.push(`${n}: URL parameters is not the 9.1 string with v=<ref>`);
    try { if (new URL(r["Website URL"]).search) p.push(`${n}: Website URL is not clean`); } catch { p.push(`${n}: Website URL is not a URL`); }
    for (const q of qaCopy({ primary_text: r["Primary text"], headline: r.Headline, description: r.Description })) p.push(`${n}: ${q.field} ${q.rule}`);
  }
  for (const a of ads) {
    const ch = a.change as Record<string, unknown> | undefined;
    if (!ch || !ELEMENTS.includes(ch.element as Element)) p.push(`${String(a.id)}: no single change recorded`);
    if (typeof a.onImage === "string") for (const q of qaCopy({ on_image: a.onImage })) p.push(`${String(a.id)}: ${q.field} ${q.rule}`);
  }
  return p;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

interface Args {
  mode: "review" | "check-variants" | "draft" | "check-drafts";
  source: "file" | "sheet"; dir: string; envFile: string; metaDir: string; adsCsv: string | null; campaignsDir: string;
  outRoot: string; out: string | null; window: WindowKey; from: string | null; proxy: Proxy; seed: number;
  variants: string | null; review: string | null; campaignDir: string | null;
}

class CliError extends Error {}
const fail = (msg: string): never => { throw new CliError(msg); };

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): Args {
  const a: Args = {
    mode: "review", source: "file", dir: env.ATTR_DATA_DIR || path.join(WEBSITE_DIR, ".test-data"), envFile: DEFAULT_REPORT_ENV,
    metaDir: META_CACHE_DIR, adsCsv: null, campaignsDir: DEFAULT_CAMPAIGNS_DIR, outRoot: DEFAULT_OUT_ROOT, out: null,
    window: "28d", from: null, proxy: "ic", seed: DEFAULT_SEED, variants: null, review: null, campaignDir: null,
  };
  let dirGiven = false;
  const val = (i: number, f: string) => { const v = argv[i + 1]; if (v === undefined || v.startsWith("--")) fail(`${f} needs a value`); return v as string; };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    switch (f) {
      case "--source": { const v = val(i, f); i++; if (v !== "file" && v !== "sheet") fail("--source is file or sheet"); a.source = v as "file" | "sheet"; break; }
      case "--dir": a.dir = val(i, f); dirGiven = true; i++; break;
      case "--secrets": a.envFile = val(i, f); i++; break;
      case "--meta-dir": a.metaDir = val(i, f); i++; break;
      case "--ads-csv": a.adsCsv = val(i, f); i++; break;
      case "--campaigns-dir": a.campaignsDir = val(i, f); i++; break;
      case "--out-root": a.outRoot = val(i, f); i++; break;
      case "--out": a.out = val(i, f); i++; break;
      case "--window": { const v = val(i, f); i++; if (v !== "7d" && v !== "28d" && v !== "all") fail("--window is 7d, 28d or all"); a.window = v as WindowKey; break; }
      case "--from": { const v = val(i, f); i++; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) fail("--from must be YYYY-MM-DD"); a.from = v; break; }
      case "--proxy": { const v = val(i, f); i++; if (v !== "ic" && v !== "lead") fail("--proxy is ic or lead"); a.proxy = v as Proxy; break; }
      case "--seed": { const n = Number(val(i, f)); i++; if (!Number.isInteger(n)) fail("--seed must be an integer"); a.seed = n; break; }
      case "--review": a.review = val(i, f); i++; break;
      case "--campaign-dir": a.campaignDir = val(i, f); i++; break;
      case "--check-variants": a.mode = "check-variants"; a.variants = val(i, f); i++; break;
      case "--draft-from": a.mode = "draft"; a.variants = val(i, f); i++; break;
      case "--check-drafts": a.mode = "check-drafts"; a.campaignDir = val(i, f); i++; break;
      default: fail(`unknown flag ${f}`);
    }
  }
  if (a.source === "sheet") {
    if (dirGiven) fail("--dir is for --source file only");
    if (env.ATTR_TEST === "1" || env.STORE_MODE === "file") fail("--source sheet is refused in test mode (ATTR_TEST=1 or STORE_MODE=file)");
  }
  return a;
}

export function reviewPath(outRoot: string, now: Date): string {
  return path.join(outRoot, isoWeek(now).label, "review.json");
}

export interface RunDeps { now?: Date; load?: (a: Args) => Promise<ReportData>; log?: (s: string) => void; err?: (s: string) => void }

export async function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  const log = deps.log ?? ((x: string) => console.log(x));
  const err = deps.err ?? ((x: string) => console.error(x));
  let args: Args;
  try { args = parseArgs(argv); } catch (e) { err(`ads-review: ${(e as Error).message}`); return 2; }
  const now = deps.now ?? new Date();
  const readReview = (): Review => {
    const p = path.resolve(args.review ?? reviewPath(args.outRoot, now));
    return JSON.parse(fs.readFileSync(p, "utf8")) as Review;
  };
  try {
    if (args.mode === "check-drafts") {
      const problems = draftFolderProblems(path.resolve(args.campaignDir as string));
      for (const p of problems) err(`ads-review: ${p}`);
      log(`ads-review: drafts ${problems.length ? "FAILED" : "clean"} (${problems.length} problems)`);
      return problems.length ? 1 : 0;
    }
    if (args.mode === "check-variants" || args.mode === "draft") {
      const review = readReview();
      const variants = parseVariants(fs.readFileSync(path.resolve(args.variants as string), "utf8"));
      if (args.mode === "check-variants") {
        const problems = variantProblems(review, variants);
        for (const p of problems) err(`ads-review: ${p}`);
        log(`ads-review: variants ${problems.length ? "FAILED" : "clean"} (${variants.length} variants, ${problems.length} problems)`);
        return problems.length ? 1 : 0;
      }
      const dir = path.resolve(args.campaignDir ?? path.join(REPO_ROOT, review.draft_campaign_dir));
      const built = buildDraftFolder(review, variants, dir, now);
      log(`ads-review: drafted ${built.drafts.length} variants in ${dir}`);
      return 0;
    }

    // review
    const spend = loadSpend(path.resolve(args.metaDir), args.adsCsv);
    const sp: SpendData | null = spend.rows.length ? spend : null;
    const ropts: ReviewOptions = {
      now, window: args.window, from: args.from, proxy: args.proxy, seed: args.seed, source: args.source,
      copyIndex: loadCopyIndex(path.resolve(args.campaignsDir)),
    };
    let review: Review;
    let names: string[] = [];
    if (!hasSpend(sp, now, args.window, args.from)) review = noSpendReview(ropts, sp);
    else {
      let data: ReportData;
      if (deps.load) data = await deps.load(args);
      else if (args.source === "sheet") {
        const warn = envFileModeWarning(args.envFile);
        if (warn) err(`ads-review: warning: ${warn}`);
        data = await loadSheetData({ envFile: args.envFile });
      } else {
        const dir = path.resolve(args.dir);
        if (!path.basename(dir).startsWith(".test-data")) fail(`the data folder must be a .test-data* folder (got ${dir})`);
        data = loadReportData(dir);
      }
      data.meta_spend = sp;
      names = namesIn(data.orders);
      review = buildReview(data, ropts);
    }
    const { json, issues } = serializeReview(review, names);
    if (issues.length) { err(`ads-review: refusing to write: the output failed the PII guard (${issues.join(", ")})`); return 3; }
    const out = path.resolve(args.out ?? reviewPath(args.outRoot, now));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, json);
    log(`ads-review: wrote ${out} status=${review.status} ads=${review.ads.length} slots=${review.variant_slots.length}`);
    return 0;
  } catch (e) {
    err(`ads-review: ${e instanceof Error ? e.message : String(e)}`);
    return e instanceof CliError ? 2 : 1;
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  run(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`ads-review: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
