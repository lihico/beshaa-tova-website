/**
 * Attribution report (docs/attribution/00_DESIGN.md section 10).
 *
 *   npm run report:attr -- [--source file|sheet] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *        [--model last|first|credited] [--paid-only] [--json] [--orders] [--commissions [--dry-run]]
 *        [--hold-days N] [--dir .test-data] [--no-write] [--check]
 *        [--secrets ~/.config/besha/report.env] [--spend [--meta-dir website/.data/meta] [--ads-csv <meta_upload.csv>]]
 *
 * Source `file` (default) reads the test store in ATTR_DATA_DIR or --dir (default website/.test-data;
 * the folder name must start with ".test-data"). Writes <dir>/report.txt (text, with the per-order
 * list) unless --no-write. No env file, no network.
 *
 * Source `sheet` (PLAN.md marketing_machine_2026-11 1.5; approved production read, 00_DESIGN section
 * 10) reads the live order sheet READ ONLY (readonly scope; tabs "מעקב הזמנות" and "תשלומים"), with the
 * test rows dropped (report-lib/load.ts). Credentials come only from --secrets (default
 * ~/.config/besha/report.env, never .env.local): GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY,
 * GOOGLE_SPREADSHEET_ID. It writes no file, refuses --dir and --commissions, and prints no buyer
 * data unless --orders is given.
 *
 * --spend joins Meta spend from the scripts/meta-insights.ts cache (website/.data/meta) and shows
 * spend and CAC per campaign / ad set / ad (report-lib/join.ts). The ref fallback reads
 * marketing/campaigns/2026-11_meta_v3/meta_upload.csv when it exists, or --ads-csv.
 *
 * --commissions: the monthly close (section 8): pending commissions older than the hold (default 14
 * days, decision D5) -> approved; pending on refunded/cancelled orders -> void. Applied to the file
 * store unless --dry-run. --check: exit 3 when a health check needs attention (for the E2E suite).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeCommissions, DEFAULT_COMMISSION_HOLD_DAYS } from "../api/_affiliate.ts";
import { DEFAULT_OUT_DIR as META_CACHE_DIR, readInsightsCache } from "./meta-insights.ts";
import { refMapFromCsv, type SpendData } from "./report-lib/join.ts";
import { FileStore } from "../api/_store_file.ts";
import { buildReport, jsonView, type Model } from "./report-lib/build.ts";
import { DEFAULT_REPORT_ENV, envFileModeWarning, loadReportData, loadSheetData, type ReportData } from "./report-lib/load.ts";
import { renderCommissionClose, renderText } from "./report-lib/render.ts";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ADS_CSV = path.resolve(WEBSITE_DIR, "..", "marketing", "campaigns", "2026-11_meta_v3", "meta_upload.csv");

interface Args {
  source: "file" | "sheet"; from: string | null; to: string | null; model: Model; paidOnly: boolean;
  json: boolean; orders: boolean; commissions: boolean; dryRun: boolean; holdDays: number;
  dir: string; write: boolean; check: boolean;
  dirGiven: boolean; envFile: string; spend: boolean; metaDir: string; adsCsv: string | null;
}

function fail(msg: string, code = 2): never {
  console.error(`attribution-report: ${msg}`);
  process.exit(code);
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): Args {
  const a: Args = {
    source: "file", from: null, to: null, model: "credited", paidOnly: false, json: false, orders: false,
    commissions: false, dryRun: false, holdDays: DEFAULT_COMMISSION_HOLD_DAYS,
    dir: env.ATTR_DATA_DIR || path.join(WEBSITE_DIR, ".test-data"), write: true, check: false,
    dirGiven: false, envFile: DEFAULT_REPORT_ENV, spend: false, metaDir: META_CACHE_DIR, adsCsv: null,
  };
  const val = (i: number, flag: string) => { const v = argv[i + 1]; if (v === undefined || v.startsWith("--")) fail(`${flag} needs a value`); return v; };
  const date = (v: string, flag: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(`${flag} must be YYYY-MM-DD`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    switch (f) {
      case "--source": { const v = val(i, f); i++; if (v !== "file" && v !== "sheet") fail("--source is file or sheet"); a.source = v; break; }
      case "--from": a.from = date(val(i, f), f); i++; break;
      case "--to": a.to = date(val(i, f), f); i++; break;
      case "--model": { const v = val(i, f); i++; if (v !== "credited" && v !== "first" && v !== "last") fail("--model is last, first or credited"); a.model = v; break; }
      case "--paid-only": a.paidOnly = true; break;
      case "--json": a.json = true; break;
      case "--orders": a.orders = true; break;
      case "--commissions": a.commissions = true; break;
      case "--dry-run": a.dryRun = true; break;
      case "--hold-days": { const n = Number(val(i, f)); i++; if (!Number.isFinite(n) || n < 0) fail("--hold-days must be a number >= 0"); a.holdDays = n; break; }
      case "--dir": a.dir = val(i, f); a.dirGiven = true; i++; break;
      case "--secrets": a.envFile = val(i, f); i++; break;
      case "--spend": a.spend = true; break;
      case "--meta-dir": a.metaDir = val(i, f); a.spend = true; i++; break;
      case "--ads-csv": a.adsCsv = val(i, f); i++; break;
      case "--no-write": a.write = false; break;
      case "--check": a.check = true; break;
      default: fail(`unknown flag ${f}`);
    }
  }
  if (a.source === "sheet") {
    if (a.dirGiven) fail("--dir is for --source file only (the sheet source reads the live order sheet)");
    if (a.commissions) fail("--commissions writes to the store; it is not allowed with --source sheet (read only)");
    if (env.ATTR_TEST === "1" || env.STORE_MODE === "file") fail("--source sheet is refused in test mode (ATTR_TEST=1 or STORE_MODE=file)");
  }
  return a;
}

/** Meta spend for --spend: the merged insights cache, the ads list and the CSV ref map. */
export function loadSpend(metaDir: string, adsCsv: string | null): SpendData {
  const cache = readInsightsCache(metaDir);
  let ref_to_ad_name: Record<string, string> = {};
  const csv = adsCsv ?? (fs.existsSync(DEFAULT_ADS_CSV) ? DEFAULT_ADS_CSV : null);
  if (csv) {
    try { ref_to_ad_name = refMapFromCsv(fs.readFileSync(csv, "utf8")); }
    catch { console.error(`attribution-report: could not read ${csv}; the ref fallback is off`); }
  }
  return { rows: cache.rows, ads: cache.ads, ref_to_ad_name, fetched_at: cache.fetched_at };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const spend = args.spend ? loadSpend(path.resolve(args.metaDir), args.adsCsv) : null;
  if (spend && !spend.rows.length) console.error(`attribution-report: no Meta spend cached in ${args.metaDir} (run scripts/meta-insights.ts)`);

  if (args.source === "sheet") {
    const warn = envFileModeWarning(args.envFile);
    if (warn) console.error(`attribution-report: warning: ${warn}`);
    let data: ReportData;
    try { data = await loadSheetData({ envFile: args.envFile }); }
    catch (e) { fail(e instanceof Error ? e.message : String(e)); }
    data.meta_spend = spend;
    const report = buildReport(data, { from: args.from, to: args.to, model: args.model, paidOnly: args.paidOnly, now });
    if (args.json) process.stdout.write(JSON.stringify(jsonView(report, args.orders), null, 2) + "\n");
    else process.stdout.write(renderText(report, { withOrders: args.orders }));
    if (args.check && !report.health.ok) process.exit(3);
    return;
  }

  const dir = path.resolve(args.dir);
  if (!path.basename(dir).startsWith(".test-data")) fail(`the data folder must be a .test-data* folder (got ${dir})`);
  if (!fs.existsSync(dir)) fail(`no data folder at ${dir} (run the test harness first)`);

  let closeText = "";
  if (args.commissions) {
    const changes = closeCommissions(loadReportData(dir).orders, now, args.holdDays);
    if (!args.dryRun && changes.length) {
      const store = new FileStore(dir);
      for (const c of changes) {
        try { await store.updateOrder(c.order_id, { commission_status: c.to }); }
        catch (e) { console.error(`attribution-report: commission update for ${c.order_id} failed:`, e instanceof Error ? e.message : e); }
      }
    }
    closeText = renderCommissionClose(changes, !args.dryRun, args.holdDays);
  }

  const fileData = loadReportData(dir);
  fileData.meta_spend = spend;
  const report = buildReport(fileData, { from: args.from, to: args.to, model: args.model, paidOnly: args.paidOnly, now });
  if (args.write) fs.writeFileSync(path.join(dir, "report.txt"), closeText + renderText(report, { withOrders: true }));
  if (args.json) process.stdout.write(JSON.stringify(jsonView(report, args.orders), null, 2) + "\n");
  else process.stdout.write(closeText + renderText(report, { withOrders: args.orders }));
  if (args.check && !report.health.ok) process.exit(3);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e) => fail(e instanceof Error ? e.message : String(e), 1));
}
