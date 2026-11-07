/**
 * GA4 Data API puller (PLAN.md marketing_machine_2026-11, Stage 6). Read-only.
 *
 *   npx tsx scripts/ga4-report.ts [--since YYYY-MM-DD --until YYYY-MM-DD] [--days 3]
 *        [--secrets ~/.config/besha/report.env] [--property 532271181] [--out-dir website/.data/ga4] [--dry-run]
 *
 * POST https://analyticsdata.googleapis.com/v1beta/properties/<property>:batchRunReports with 5 reports
 * (acquisition, landing, funnel, purchases by transactionId, device), each by date and with
 * returnPropertyQuota. With no dates it re-pulls the last 3 Israel days (today included), because GA4
 * keeps processing recent days. The result lands in website/.data/ga4/ga4_<since>_<until>.json (gitignored),
 * and the console shows row counts and the property quota left.
 *
 * Credentials come ONLY from ~/.config/besha/report.env (mode 600): the service account that reads the
 * order sheet (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY). It needs Viewer on the GA4 property and
 * the Analytics Data API enabled in its GCP project (Lihi, by hand). The key and the access token are
 * never printed. GA4 reports are aggregates; transactionId is our order id, never buyer data.
 *
 * Offline-testable: run() takes fetch and getAccessToken; the unit tests inject both.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_REPORT_ENV, envFileModeWarning, readSecretEnv } from "./report-lib/load.ts";
import { defaultWindow } from "./meta-insights.ts";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_OUT_DIR = path.join(WEBSITE_DIR, ".data", "ga4");
export const GA4_PROPERTY_ID = "532271181";
export const DATA_API_HOST = "https://analyticsdata.googleapis.com";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
/** The site's funnel events, in order (gtagEvent calls in src/pages; purchase from /order/thanks or the server). */
export const FUNNEL_EVENTS = ["page_view", "begin_order", "select_flow", "generate_lead", "begin_checkout", "purchase"];

export type ReportName = "acquisition" | "landing" | "funnel" | "purchases" | "device";
export const REPORT_NAMES: ReportName[] = ["acquisition", "landing", "funnel", "purchases", "device"];

interface RunReportRequest {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  dimensionFilter?: unknown;
  limit: number;
  keepEmptyRows?: boolean;
  returnPropertyQuota: boolean;
}

const dims = (...n: string[]) => n.map((name) => ({ name }));

/** The 5 requests of one batchRunReports call (the API allows at most 5), in REPORT_NAMES order. */
export function buildRequests(since: string, until: string): RunReportRequest[] {
  const base = { dateRanges: [{ startDate: since, endDate: until }], limit: 10000, returnPropertyQuota: true };
  return [
    // acquisition: sessions and sales per source / medium / campaign (the custom group "Beshaa" is UI-only for now)
    { ...base, dimensions: dims("date", "sessionSourceMedium", "sessionCampaignName"),
      metrics: dims("sessions", "engagedSessions", "totalUsers", "newUsers", "keyEvents", "ecommercePurchases", "purchaseRevenue") },
    // landing: which page a session started on
    { ...base, dimensions: dims("date", "landingPage"), metrics: dims("sessions", "engagedSessions", "keyEvents", "ecommercePurchases") },
    // funnel: counts of each funnel event
    { ...base, dimensions: dims("date", "eventName"), metrics: dims("eventCount", "totalUsers"),
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: FUNNEL_EVENTS } } } },
    // purchases by transactionId (= order id), with the session source, to join to the order sheet
    { ...base, dimensions: dims("date", "transactionId", "sessionSourceMedium", "sessionCampaignName"),
      metrics: dims("ecommercePurchases", "purchaseRevenue") },
    // device
    { ...base, dimensions: dims("date", "deviceCategory"), metrics: dims("sessions", "engagedSessions", "totalUsers", "keyEvents") },
  ];
}

export function batchUrl(property: string): string {
  if (!/^\d+$/.test(property)) throw new Error("--property must be digits");
  return `${DATA_API_HOST}/v1beta/properties/${property}:batchRunReports`;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export type GetAccessToken = (creds: { email: string; key: string }) => Promise<string>;

/** The live token: a service-account JWT with the analytics.readonly scope. Never called by unit tests. */
export const getAccessTokenLive: GetAccessToken = async ({ email, key }) => {
  const { JWT } = await import("google-auth-library");
  const jwt = new JWT({ email, key: key.replace(/\\n/g, "\n"), scopes: [GA4_SCOPE] });
  const t = await jwt.authorize();
  if (!t.access_token) throw new Error("no access token from the service account");
  return t.access_token;
};

export type Row = Record<string, string | number>;
export interface QuotaStatus { consumed?: number; remaining?: number }
export interface PropertyQuota {
  tokensPerDay?: QuotaStatus; tokensPerHour?: QuotaStatus; concurrentRequests?: QuotaStatus;
  serverErrorsPerProjectPerHour?: QuotaStatus; potentiallyThresholdedRequestsPerHour?: QuotaStatus;
  tokensPerProjectPerHour?: QuotaStatus;
}
export interface Ga4Cache {
  fetched_at: string; property: string; since: string; until: string;
  reports: Record<ReportName, Row[]>;
  row_counts: Record<ReportName, number>;
  quota: PropertyQuota | null;
}

/** API row -> flat object; metric values become numbers, "(not set)" stays as text. */
export function flattenReport(r: unknown): Row[] {
  const rep = r as {
    dimensionHeaders?: Array<{ name: string }>; metricHeaders?: Array<{ name: string }>;
    rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  } | null;
  const dh = rep?.dimensionHeaders ?? [], mh = rep?.metricHeaders ?? [];
  return (rep?.rows ?? []).map((row) => {
    const o: Row = {};
    dh.forEach((h, i) => { o[h.name] = row.dimensionValues?.[i]?.value ?? ""; });
    mh.forEach((h, i) => { const n = Number(row.metricValues?.[i]?.value); o[h.name] = Number.isFinite(n) ? n : 0; });
    // GA4 dates are YYYYMMDD; the other caches use YYYY-MM-DD.
    if (typeof o.date === "string" && /^\d{8}$/.test(o.date)) o.date = `${o.date.slice(0, 4)}-${o.date.slice(4, 6)}-${o.date.slice(6)}`;
    return o;
  });
}

/** Removes the token from any text that may be printed. */
export function scrub(text: string, token: string): string {
  return token ? text.split(token).join("<token>") : text;
}

export async function pullGa4(o: {
  token: string; property: string; since: string; until: string; fetch: FetchLike; now?: Date;
}): Promise<Ga4Cache> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.since) || !/^\d{4}-\d{2}-\d{2}$/.test(o.until) || o.since > o.until) throw new Error("bad date window");
  const res = await o.fetch(batchUrl(o.property), {
    method: "POST",
    headers: { Authorization: `Bearer ${o.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: buildRequests(o.since, o.until) }),
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const err = (body as { error?: { code?: unknown; status?: unknown; message?: unknown } } | null)?.error;
  if (!res.ok || err) {
    const msg = scrub(String(err?.message ?? `HTTP ${res.status}`), o.token).slice(0, 300);
    throw new Error(`Data API error ${res.status} ${String(err?.status ?? "")}: ${msg}`.replace(/\s+/g, " ").trim());
  }
  const reps = (body as { reports?: unknown[] } | null)?.reports ?? [];
  const reports = {} as Record<ReportName, Row[]>;
  const row_counts = {} as Record<ReportName, number>;
  let quota: PropertyQuota | null = null;
  REPORT_NAMES.forEach((n, i) => {
    reports[n] = flattenReport(reps[i]);
    row_counts[n] = reports[n].length;
    const q = (reps[i] as { propertyQuota?: PropertyQuota } | undefined)?.propertyQuota;
    if (q) quota = q;   // every report carries the property's quota; the last one is the most current
  });
  return { fetched_at: (o.now ?? new Date()).toISOString(), property: o.property, since: o.since, until: o.until, reports, row_counts, quota };
}

export const cachePath = (dir: string, since: string, until: string) => path.join(dir, `ga4_${since}_${until}.json`);

export function writeCache(dir: string, c: Ga4Cache): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = cachePath(dir, c.since, c.until);
  fs.writeFileSync(file, JSON.stringify(c, null, 1) + "\n");
  return file;
}

export function quotaLine(q: PropertyQuota | null): string {
  if (!q) return "quota: not returned";
  const f = (s?: QuotaStatus) => (s ? `${s.consumed ?? "?"} used, ${s.remaining ?? "?"} left` : "-");
  return `quota: tokens/day ${f(q.tokensPerDay)}; tokens/hour ${f(q.tokensPerHour)}; thresholded req/hour ${f(q.potentiallyThresholdedRequestsPerHour)}`;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export interface CliArgs { since: string | null; until: string | null; days: number; envFile: string; property: string; outDir: string; dryRun: boolean }

export function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { since: null, until: null, days: 3, envFile: DEFAULT_REPORT_ENV, property: GA4_PROPERTY_ID, outDir: DEFAULT_OUT_DIR, dryRun: false };
  const val = (i: number, f: string) => { const v = argv[i + 1]; if (v === undefined || v.startsWith("--")) throw new Error(`${f} needs a value`); return v; };
  const date = (v: string, f: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${f} must be YYYY-MM-DD`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    switch (f) {
      case "--since": a.since = date(val(i, f), f); i++; break;
      case "--until": a.until = date(val(i, f), f); i++; break;
      case "--days": { const n = Number(val(i, f)); i++; if (!Number.isInteger(n) || n < 1 || n > 90) throw new Error("--days is 1..90"); a.days = n; break; }
      case "--secrets": a.envFile = val(i, f); i++; break;
      case "--property": { const p = val(i, f); i++; if (!/^\d+$/.test(p)) throw new Error("--property must be digits"); a.property = p; break; }
      case "--out-dir": a.outDir = val(i, f); i++; break;
      case "--dry-run": a.dryRun = true; break;
      default: throw new Error(`unknown flag ${f}`);
    }
  }
  if ((a.since === null) !== (a.until === null)) throw new Error("give both --since and --until, or neither (last --days days)");
  if (a.since && a.until && a.since > a.until) throw new Error("--since is after --until");
  return a;
}

export async function run(argv: string[], deps: {
  fetch: FetchLike; getAccessToken?: GetAccessToken; now?: Date; log?: (s: string) => void; readFile?: (f: string) => string;
}): Promise<number> {
  const log = deps.log ?? ((s: string) => process.stdout.write(s + "\n"));
  const args = parseArgs(argv);
  const win = args.since && args.until ? { since: args.since, until: args.until } : defaultWindow(deps.now ?? new Date(), args.days);
  if (args.dryRun) {
    log(`dry run: would POST ${batchUrl(args.property)} with ${REPORT_NAMES.join(", ")} for ${win.since}..${win.until}`);
    return 0;
  }
  const env = readSecretEnv(args.envFile, ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"], { readFile: deps.readFile });
  if (!deps.readFile) { const w = envFileModeWarning(args.envFile); if (w) log(`warning: ${w}`); }
  let token = "";
  try {
    token = await (deps.getAccessToken ?? getAccessTokenLive)({ email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: env.GOOGLE_PRIVATE_KEY });
    const cache = await pullGa4({ token, property: args.property, ...win, fetch: deps.fetch, now: deps.now });
    const file = writeCache(args.outDir, cache);
    log(`ga4 ${cache.since}..${cache.until} (property ${cache.property}) -> ${file}`);
    for (const n of REPORT_NAMES) log(`  ${n}: ${cache.row_counts[n]} rows`);
    log(`  ${quotaLine(cache.quota)}`);
    return 0;
  } catch (e) {
    // Never the key; the token is scrubbed.
    log(`ga4-report: ${scrub(e instanceof Error ? e.message : String(e), token).split(env.GOOGLE_PRIVATE_KEY).join("<key>")}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  run(process.argv.slice(2), { fetch: (u, init) => fetch(u, init) })
    .then((code) => process.exit(code))
    .catch((e) => { console.error(`ga4-report: ${e instanceof Error ? e.message : String(e)}`); process.exit(2); });
}
