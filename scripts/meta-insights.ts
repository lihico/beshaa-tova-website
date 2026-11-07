/**
 * Meta insights puller (PLAN.md marketing_machine_2026-11, Stage 1 item 1.4). Read-only.
 *
 *   npx tsx scripts/meta-insights.ts [--since YYYY-MM-DD --until YYYY-MM-DD] [--days 7] [--ads]
 *        [--secrets ~/.config/besha/meta.env] [--out-dir website/.data/meta] [--dry-run]
 *
 * GET https://graph.facebook.com/<META_GRAPH_VERSION>/act_<id>/insights with level=ad, time_increment=1,
 * action_attribution_windows=["7d_click","1d_view"], action_report_time=conversion, limit=500, and
 * follows paging.next to the end. With no dates it re-pulls the last 7 days (Israel dates, today
 * included), because Meta restates recent data. The rows land in
 * website/.data/meta/insights_<since>_<until>.json (gitignored). `readInsightsCache` merges every
 * cache file, the newest pull winning for each (day, ad), which is how restated days replace older ones.
 * --ads also pulls GET /act_<id>/ads?fields=id,name,adset_id,campaign_id,creative{url_tags} to
 * website/.data/meta/ads.json, used by the ref fallback in report-lib/join.ts.
 *
 * Secrets come ONLY from ~/.config/besha/meta.env (mode 600), never .env.local, never process.env:
 *   META_ADS_TOKEN       System User token with ads_read (PLAN 1.2)
 *   META_AD_ACCOUNT_ID   the ad account, with or without the act_ prefix (act_289945905492499)
 * The token is never printed: errors carry Meta's code, subcode and type, with the token scrubbed.
 * Output is aggregate spend only; Meta insights hold no buyer data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { META_GRAPH_VERSION } from "../api/_meta_version.ts";
import { DEFAULT_META_ENV, envFileModeWarning, readSecretEnv } from "./report-lib/load.ts";
import type { AdMeta, InsightRow, MetaAction } from "./report-lib/join.ts";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_OUT_DIR = path.join(WEBSITE_DIR, ".data", "meta");
export const GRAPH_HOST = "https://graph.facebook.com";
export const MAX_PAGES = 200;

export const INSIGHT_FIELDS = [
  "date_start", "date_stop", "account_currency", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
  "objective", "optimization_goal", "spend", "impressions", "reach", "frequency", "clicks", "inline_link_clicks",
  "actions", "action_values", "cost_per_action_type",
];

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function normalizeAccount(id: string): string {
  const v = id.trim();
  if (!/^(act_)?\d+$/.test(v)) throw new Error("META_AD_ACCOUNT_ID must be digits, optionally prefixed act_");
  return v.startsWith("act_") ? v : `act_${v}`;
}

/** YYYY-MM-DD in Israel time, `offsetDays` from `now`. */
export function israelDate(now: Date, offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(now.getTime() + offsetDays * 86_400_000));
}

/** No dates: the last `days` Israel days, today included (the 7-day re-pull). */
export function defaultWindow(now: Date, days = 7): { since: string; until: string } {
  return { since: israelDate(now, -(days - 1)), until: israelDate(now) };
}

export function insightsUrl(version: string, account: string, token: string, since: string, until: string): string {
  const p = new URLSearchParams({
    level: "ad", time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
    action_report_time: "conversion", limit: "500",
    fields: INSIGHT_FIELDS.join(","),
    access_token: token,
  });
  return `${GRAPH_HOST}/${version}/${account}/insights?${p.toString()}`;
}

export function adsUrl(version: string, account: string, token: string): string {
  const p = new URLSearchParams({ fields: "id,name,adset_id,campaign_id,creative{url_tags}", limit: "500", access_token: token });
  return `${GRAPH_HOST}/${version}/${account}/ads?${p.toString()}`;
}

/** Removes the token (raw and URL-encoded) from any text that may be printed. */
export function scrub(text: string, token: string): string {
  if (!token) return text;
  let out = text.split(token).join("<token>");
  const enc = encodeURIComponent(token);
  if (enc !== token) out = out.split(enc).join("<token>");
  return out.replace(/access_token=[^&\s"]+/g, "access_token=<token>");
}

export class GraphError extends Error {
  constructor(message: string, readonly status: number, readonly code: number | null, readonly subcode: number | null) { super(message); }
}

/** GET every page (paging.next) and return the concatenated `data`. */
export async function fetchAllPages<T>(firstUrl: string, token: string, fetchImpl: FetchLike, maxPages = MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = firstUrl;
  let pages = 0;
  while (url) {
    if (++pages > maxPages) throw new Error(`more than ${maxPages} pages; stopping`);
    const res = await fetchImpl(url);
    let body: unknown = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const err = (body as { error?: { message?: unknown; code?: unknown; error_subcode?: unknown; type?: unknown } } | null)?.error;
    if (!res.ok || err) {
      const code = typeof err?.code === "number" ? err.code : null;
      const sub = typeof err?.error_subcode === "number" ? err.error_subcode : null;
      const msg = scrub(String(err?.message ?? `HTTP ${res.status}`), token).slice(0, 300);
      throw new GraphError(`Graph error ${res.status} code ${code ?? "-"} subcode ${sub ?? "-"} ${err?.type ?? ""}: ${msg}`.trim(), res.status, code, sub);
    }
    const b = body as { data?: unknown; paging?: { next?: unknown } };
    if (Array.isArray(b?.data)) out.push(...(b.data as T[]));
    url = typeof b?.paging?.next === "string" && b.paging.next ? b.paging.next : null;
  }
  return out;
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);
const actions = (v: unknown): MetaAction[] | undefined =>
  Array.isArray(v) ? v.filter((a) => a && typeof a.action_type === "string").map((a) => ({ action_type: a.action_type, value: num(a.value) })) : undefined;

/** Graph returns numbers as strings; this turns a raw row into an InsightRow. */
export function normalizeInsight(raw: Record<string, unknown>): InsightRow {
  return {
    date_start: String(raw.date_start ?? ""), date_stop: String(raw.date_stop ?? raw.date_start ?? ""),
    account_currency: str(raw.account_currency),
    campaign_id: String(raw.campaign_id ?? ""), campaign_name: str(raw.campaign_name),
    adset_id: String(raw.adset_id ?? ""), adset_name: str(raw.adset_name),
    ad_id: String(raw.ad_id ?? ""), ad_name: str(raw.ad_name),
    objective: str(raw.objective), optimization_goal: str(raw.optimization_goal),
    spend: num(raw.spend), impressions: num(raw.impressions), reach: numOrNull(raw.reach), frequency: numOrNull(raw.frequency),
    clicks: num(raw.clicks), inline_link_clicks: num(raw.inline_link_clicks),
    actions: actions(raw.actions), action_values: actions(raw.action_values), cost_per_action_type: actions(raw.cost_per_action_type),
  };
}

export function normalizeAd(raw: Record<string, unknown>): AdMeta {
  const creative = raw.creative as { url_tags?: unknown } | undefined;
  return {
    id: String(raw.id ?? ""), name: str(raw.name), adset_id: str(raw.adset_id), campaign_id: str(raw.campaign_id),
    url_tags: str(creative?.url_tags),
  };
}

export interface InsightsCache {
  fetched_at: string; version: string; account_id: string; since: string; until: string;
  params: { level: "ad"; time_increment: 1; action_attribution_windows: string[]; action_report_time: "conversion" };
  rows: InsightRow[];
}

export interface PullOptions { token: string; account: string; since: string; until: string; version?: string; fetch: FetchLike; now?: Date }

export async function pullInsights(o: PullOptions): Promise<InsightsCache> {
  const version = o.version ?? META_GRAPH_VERSION;
  const account = normalizeAccount(o.account);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.since) || !/^\d{4}-\d{2}-\d{2}$/.test(o.until) || o.since > o.until) throw new Error("bad date window");
  const raw = await fetchAllPages<Record<string, unknown>>(insightsUrl(version, account, o.token, o.since, o.until), o.token, o.fetch);
  return {
    fetched_at: (o.now ?? new Date()).toISOString(), version, account_id: account, since: o.since, until: o.until,
    params: { level: "ad", time_increment: 1, action_attribution_windows: ["7d_click", "1d_view"], action_report_time: "conversion" },
    rows: raw.map(normalizeInsight).filter((r) => r.ad_id && r.date_start),
  };
}

export async function pullAds(o: Omit<PullOptions, "since" | "until">): Promise<AdMeta[]> {
  const raw = await fetchAllPages<Record<string, unknown>>(adsUrl(o.version ?? META_GRAPH_VERSION, normalizeAccount(o.account), o.token), o.token, o.fetch);
  return raw.map(normalizeAd).filter((a) => a.id);
}

export const cachePath = (dir: string, since: string, until: string) => path.join(dir, `insights_${since}_${until}.json`);

export function writeCache(dir: string, c: InsightsCache): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = cachePath(dir, c.since, c.until);
  fs.writeFileSync(file, JSON.stringify(c, null, 1) + "\n");
  return file;
}

/** Merges every insights_*.json in `dir`: per (date_start, ad_id) the newest fetched_at wins. */
export function mergeCaches(caches: InsightsCache[]): { rows: InsightRow[]; fetched_at: string | null } {
  const sorted = [...caches].sort((a, b) => a.fetched_at.localeCompare(b.fetched_at));
  const m = new Map<string, InsightRow>();
  for (const c of sorted) {
    // A newer pull is the truth for every day it covers: drop older rows for those days first,
    // so an ad that went to zero (no row) in the restated data does not keep its old spend.
    for (const k of [...m.keys()]) { const d = k.split("|")[0]; if (d >= c.since && d <= c.until) m.delete(k); }
    for (const r of c.rows) m.set(`${r.date_start}|${r.ad_id}`, r);
  }
  return {
    rows: [...m.values()].sort((a, b) => a.date_start.localeCompare(b.date_start) || a.ad_id.localeCompare(b.ad_id)),
    fetched_at: sorted.length ? sorted[sorted.length - 1].fetched_at : null,
  };
}

export function readInsightsCache(dir: string = DEFAULT_OUT_DIR): { rows: InsightRow[]; ads: AdMeta[]; fetched_at: string | null } {
  const caches: InsightsCache[] = [];
  let names: string[] = [];
  try { names = fs.readdirSync(dir); } catch { /* no cache yet */ }
  for (const n of names) {
    if (!/^insights_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.json$/.test(n)) continue;
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")) as InsightsCache;
      if (Array.isArray(c.rows) && typeof c.fetched_at === "string") caches.push(c);
    } catch { /* torn file skipped */ }
  }
  let ads: AdMeta[] = [];
  try { const j = JSON.parse(fs.readFileSync(path.join(dir, "ads.json"), "utf8")); if (Array.isArray(j?.ads)) ads = j.ads; } catch { /* none */ }
  return { ...mergeCaches(caches), ads };
}

/** Per campaign spend (for the console summary and the Ads Manager check, PLAN 1.4 verify). */
export function spendByCampaign(rows: InsightRow[]): Array<{ campaign_id: string; campaign_name: string | null; spend: number; days: number }> {
  const m = new Map<string, { campaign_id: string; campaign_name: string | null; spend: number; d: Set<string> }>();
  for (const r of rows) {
    const c = m.get(r.campaign_id) ?? { campaign_id: r.campaign_id, campaign_name: r.campaign_name ?? null, spend: 0, d: new Set<string>() };
    c.spend += r.spend; c.d.add(r.date_start); m.set(r.campaign_id, c);
  }
  return [...m.values()].map((c) => ({ campaign_id: c.campaign_id, campaign_name: c.campaign_name, spend: Math.round(c.spend * 100) / 100, days: c.d.size }))
    .sort((a, b) => b.spend - a.spend);
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export interface CliArgs { since: string | null; until: string | null; days: number; ads: boolean; envFile: string; outDir: string; dryRun: boolean }

export function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { since: null, until: null, days: 7, ads: false, envFile: DEFAULT_META_ENV, outDir: DEFAULT_OUT_DIR, dryRun: false };
  const val = (i: number, f: string) => { const v = argv[i + 1]; if (v === undefined || v.startsWith("--")) throw new Error(`${f} needs a value`); return v; };
  const date = (v: string, f: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${f} must be YYYY-MM-DD`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    switch (f) {
      case "--since": a.since = date(val(i, f), f); i++; break;
      case "--until": a.until = date(val(i, f), f); i++; break;
      case "--days": { const n = Number(val(i, f)); i++; if (!Number.isInteger(n) || n < 1 || n > 90) throw new Error("--days is 1..90"); a.days = n; break; }
      case "--ads": a.ads = true; break;
      case "--secrets": a.envFile = val(i, f); i++; break;
      case "--out-dir": a.outDir = val(i, f); i++; break;
      case "--dry-run": a.dryRun = true; break;
      default: throw new Error(`unknown flag ${f}`);
    }
  }
  if ((a.since === null) !== (a.until === null)) throw new Error("give both --since and --until, or neither (last --days days)");
  if (a.since && a.until && a.since > a.until) throw new Error("--since is after --until");
  return a;
}

export async function run(argv: string[], deps: { fetch: FetchLike; now?: Date; log?: (s: string) => void; readFile?: (f: string) => string }): Promise<number> {
  const log = deps.log ?? ((s: string) => process.stdout.write(s + "\n"));
  const args = parseArgs(argv);
  const win = args.since && args.until ? { since: args.since, until: args.until } : defaultWindow(deps.now ?? new Date(), args.days);
  if (args.dryRun) {
    log(`dry run: would GET ${GRAPH_HOST}/${META_GRAPH_VERSION}/act_<META_AD_ACCOUNT_ID>/insights for ${win.since}..${win.until}${args.ads ? " and /ads" : ""}`);
    return 0;
  }
  const env = readSecretEnv(args.envFile, ["META_ADS_TOKEN", "META_AD_ACCOUNT_ID"], { readFile: deps.readFile });
  if (!deps.readFile) { const w = envFileModeWarning(args.envFile); if (w) log(`warning: ${w}`); }
  const token = env.META_ADS_TOKEN;
  try {
    const cache = await pullInsights({ token, account: env.META_AD_ACCOUNT_ID, ...win, fetch: deps.fetch, now: deps.now });
    const file = writeCache(args.outDir, cache);
    log(`insights ${cache.since}..${cache.until} (${cache.version}): ${cache.rows.length} ad-day rows -> ${file}`);
    for (const c of spendByCampaign(cache.rows)) log(`  campaign ${c.campaign_id} ${c.campaign_name ?? "-"}: spend ${c.spend} over ${c.days} days`);
    if (args.ads) {
      const ads = await pullAds({ token, account: env.META_AD_ACCOUNT_ID, fetch: deps.fetch });
      fs.mkdirSync(args.outDir, { recursive: true });
      const af = path.join(args.outDir, "ads.json");
      fs.writeFileSync(af, JSON.stringify({ fetched_at: (deps.now ?? new Date()).toISOString(), ads }, null, 1) + "\n");
      log(`ads: ${ads.length} -> ${af}`);
    }
    return 0;
  } catch (e) {
    log(`meta-insights: ${scrub(e instanceof Error ? e.message : String(e), token)}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  run(process.argv.slice(2), { fetch: (u) => fetch(u) })
    .then((code) => process.exit(code))
    .catch((e) => { console.error(`meta-insights: ${e instanceof Error ? e.message : String(e)}`); process.exit(2); });
}
