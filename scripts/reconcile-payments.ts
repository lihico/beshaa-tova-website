/**
 * Payment reconciliation and refunds (docs/attribution/marketing_machine_2026-11/PLAN.md Stage 3; decisions 12, 13).
 *
 *   npx tsx scripts/reconcile-payments.ts --grow-export <export.csv|export.xlsx> [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *        [--source sheet|file] [--dir .test-data] [--orders <orders.json>] [--secrets ~/.config/besha/report.env]
 *        [--json] [--apply]
 *   npx tsx scripts/reconcile-payments.ts --refund <order_id> --amount <ILS> [--refunded-at YYYY-MM-DD] [--credit-doc <n>] [--apply]
 *
 * Monthly close: Lihi downloads the Grow monthly export (CSV or XLSX, Hebrew headers are fine; the accepted
 * headers are listed in scripts/report-lib/recon.ts) and runs the first form. Refunds are done by hand in the
 * Grow back office; the second form records one (a partial refund keeps the order paid with lower revenue,
 * a full one sets payment_status refunded).
 *
 * DRY RUN BY DEFAULT: prints the match table (order ids, statuses, dates and amounts; never names, phones or
 * emails; the export's buyer columns are not even read) and what each order would get.
 *
 * `--apply` writes only through the site's SheetStore (api/_store_sheet.ts updateOrder) to the order row
 * columns grow_paid_at, revenue_net_ils, fee_ils, refund_amount, refunded_at, credit_doc_number, recon_status,
 * recon_source, recon_at (plus invoice_number when empty, and payment_status for a full refund). It is
 * allowed only with `--source sheet`, and it REFUSES unless every one of those headers already exists on the
 * live tab "מעקב הזמנות": this code never creates a header or a tab. Rows marked as tests are never touched.
 *
 * Orders are read READ ONLY through report-lib/load.ts (secrets from ~/.config/besha/report.env, never
 * .env.local). Nothing here calls Grow, Make, Meta or Google except that sheet read and, with --apply, the
 * row saves.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OrderRecord } from "../api/_attribution_core.ts";
import { DEFAULT_REPORT_ENV, loadReportData, loadSheetData, readSecretEnv, SHEET_ENV_NAMES } from "./report-lib/load.ts";
import {
  GrowExportError, proposeRefund, readGrowExportFile, RECON_COLUMNS, reconcile, RefundError, renderRecon,
  type GrowExport, type ReconPatch,
} from "./report-lib/recon.ts";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export class ArgError extends Error {}
export class ApplyRefused extends Error {}

export interface Args {
  growExport: string | null;
  refund: string | null; amount: number | null; refundedAt: string | null; creditDoc: string | null;
  source: "sheet" | "file"; dir: string; orders: string | null; envFile: string;
  from: string | null; to: string | null; json: boolean; apply: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ORDER_ID = /^BT\d{4}[0-9A-HJKMNP-TV-Z]{6}$/;

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): Args {
  const a: Args = {
    growExport: null, refund: null, amount: null, refundedAt: null, creditDoc: null,
    source: "sheet", dir: env.ATTR_DATA_DIR || path.join(WEBSITE_DIR, ".test-data"), orders: null, envFile: DEFAULT_REPORT_ENV,
    from: null, to: null, json: false, apply: false,
  };
  let sourceGiven = false;
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new ArgError(`${k} needs a value`);
      return v;
    };
    switch (k) {
      case "--grow-export": a.growExport = val(); break;
      case "--refund": a.refund = val().trim().toUpperCase(); break;
      case "--amount": {
        const n = Number(val());
        if (!(Number.isFinite(n) && n > 0)) throw new ArgError("--amount must be a positive number of ILS");
        a.amount = n; break;
      }
      case "--refunded-at": a.refundedAt = val(); break;
      case "--credit-doc": a.creditDoc = val(); break;
      case "--source": {
        const v = val();
        if (v !== "sheet" && v !== "file") throw new ArgError("--source is sheet or file");
        a.source = v; sourceGiven = true; break;
      }
      case "--dir": a.dir = val(); if (!sourceGiven) a.source = "file"; break;
      case "--orders": a.orders = val(); break;
      case "--secrets": a.envFile = val(); break;
      case "--from": a.from = val(); break;
      case "--to": a.to = val(); break;
      case "--json": a.json = true; break;
      case "--apply": a.apply = true; break;
      case "--dry-run": a.apply = false; break;
      default: throw new ArgError(`unknown flag ${k}`);
    }
  }
  for (const [n, v] of [["--from", a.from], ["--to", a.to], ["--refunded-at", a.refundedAt]] as const) {
    if (v && !DAY.test(v)) throw new ArgError(`${n} must be YYYY-MM-DD`);
  }
  if (a.refund !== null) {
    if (!ORDER_ID.test(a.refund)) throw new ArgError("--refund needs an order id like BT2611XXXXXX");
    if (a.amount === null) throw new ArgError("--refund needs --amount <ILS>");
    if (a.growExport) throw new ArgError("--refund and --grow-export are separate runs");
  } else {
    if (!a.growExport) throw new ArgError("pass --grow-export <path> (or --refund <order_id> --amount N)");
    if (a.amount !== null || a.creditDoc || a.refundedAt) throw new ArgError("--amount / --credit-doc / --refunded-at go with --refund");
  }
  if (a.creditDoc && !/^[A-Za-z0-9._-]{1,64}$/.test(a.creditDoc)) throw new ArgError("--credit-doc is a document number (letters, digits, - _ .)");
  if (a.apply && (a.source !== "sheet" || a.orders)) {
    throw new ArgError("--apply needs --source sheet: rows from a fixture or the test store never go to the production sheet");
  }
  return a;
}

// ---------------------------------------------------------------------------------------------
// The run, with every side effect injected
// ---------------------------------------------------------------------------------------------

export interface OrderWriter {
  /** The live header row of the orders tab (null when the tab cannot be opened). */
  headers(): Promise<string[] | null>;
  update(order_id: string, patch: ReconPatch): Promise<void>;
}

export interface RunDeps {
  loadOrders?: (a: Args) => Promise<OrderRecord[]>;
  readExport?: (file: string) => GrowExport;
  writer?: () => Promise<OrderWriter>;
  now?: Date;
  out?: (s: string) => void;
}

/** Throws ApplyRefused unless every column the patches touch (and all 9 recon columns) is a live header. */
export function checkHeaders(headers: string[] | null, patches: ReconPatch[]): void {
  if (headers === null) throw new ApplyRefused('could not read the header row of "מעקב הזמנות"');
  const have = new Set(headers.map((h) => h.trim()));
  const need = new Set<string>([...RECON_COLUMNS]);
  for (const p of patches) for (const k of Object.keys(p)) need.add(k);
  const missing = [...need].filter((h) => !have.has(h));
  if (missing.length) {
    throw new ApplyRefused(`the live sheet lacks the header(s) ${missing.join(", ")}; Lihi adds them at the end of "מעקב הזמנות" first (this script never creates headers)`);
  }
}

function readOrdersFixture(file: string): OrderRecord[] {
  const text = fs.readFileSync(file, "utf8");
  if (/\.jsonl$/i.test(file)) {
    const lines = text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    return lines.filter((l) => l?.op === "insert").map((l) => l.data as OrderRecord);
  }
  const j = JSON.parse(text) as unknown;
  const arr = Array.isArray(j) ? j : (j as { orders?: unknown })?.orders;
  if (!Array.isArray(arr)) throw new ArgError(`${file}: expected a JSON array of orders or {"orders": [...]}`);
  return arr as OrderRecord[];
}

async function defaultLoadOrders(a: Args): Promise<OrderRecord[]> {
  if (a.orders) return readOrdersFixture(a.orders);
  if (a.source === "file") {
    const dir = path.resolve(a.dir);
    if (!path.basename(dir).startsWith(".test-data")) throw new ArgError(`the data folder must be a .test-data* folder (got ${dir})`);
    if (!fs.existsSync(dir)) throw new ArgError(`no data folder at ${dir}`);
    return loadReportData(dir).orders;
  }
  return (await loadSheetData({ envFile: a.envFile })).orders;    // read only; test rows already dropped
}

export async function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  const out = deps.out ?? ((s: string) => process.stdout.write(s));
  const now = deps.now ?? new Date();
  const a = parseArgs(argv);
  const orders = await (deps.loadOrders ?? defaultLoadOrders)(a);
  const mode = a.apply ? "APPLY" : "dry run";

  let patches: Array<{ order_id: string; patch: ReconPatch }>;
  if (a.refund !== null) {
    const o = orders.find((x) => x.order_id.toUpperCase() === a.refund) ?? null;
    const atIso = a.refundedAt ? `${a.refundedAt}T10:00:00.000Z` : null;
    const p = proposeRefund(o, a.amount as number, { now, at: atIso, creditDoc: a.creditDoc });
    if (a.json) out(JSON.stringify({ dry_run: !a.apply, refund: p }, null, 2) + "\n");
    else {
      out(`reconcile-payments: ${mode}, refund for ${p.order_id}: paid ${p.paid}, refunds total ${p.refund_total} (${p.full ? "full" : "partial"}); payment_status after: ${p.status_after}\n`);
      out(`  writes: ${Object.entries(p.patch).map(([k, v]) => `${k}=${v}`).join(", ")}\n`);
    }
    patches = [{ order_id: p.order_id, patch: p.patch }];
  } else {
    const exp = (deps.readExport ?? readGrowExportFile)(a.growExport as string);
    const r = reconcile(orders, exp, { now, from: a.from, to: a.to });
    if (a.json) {
      out(JSON.stringify({
        dry_run: !a.apply, range: r.range, header_row: exp.header_row, columns: Object.keys(exp.mapped), lines: r.lines,
        counts: r.counts, rows: r.rows, unmatched: r.unmatched,
      }, null, 2) + "\n");
    } else out(`reconcile-payments: ${mode}\n` + renderRecon(r, exp));
    patches = r.rows.filter((x) => Object.keys(x.patch).length).map((x) => ({ order_id: x.order_id, patch: x.patch }));
  }

  if (!a.apply) {
    if (!a.json) out(`${patches.length} order row(s) would change; nothing written (pass --apply to write)\n`);
    return 0;
  }
  const writer = await (deps.writer ?? sheetWriter(a))();
  checkHeaders(await writer.headers(), patches.map((p) => p.patch));
  let n = 0;
  for (const p of patches) {
    await writer.update(p.order_id, p.patch);
    n++;
  }
  out(`reconcile-payments: wrote ${n} order row(s)\n`);
  return 0;
}

/** The live writer: the site's SheetStore, credentials from the report env file. */
function sheetWriter(a: Args): () => Promise<OrderWriter> {
  return async () => {
    const env = readSecretEnv(a.envFile, [...SHEET_ENV_NAMES]);
    for (const k of SHEET_ENV_NAMES) process.env[k] = env[k];
    delete process.env.STORE_MODE;                 // the live sheet, never the file store
    const { getOrderDoc } = await import("../api/_sheets.ts");
    const { SheetStore, ORDERS_TAB } = await import("../api/_store_sheet.ts");
    const store = new SheetStore();
    return {
      headers: async () => {
        const doc = await getOrderDoc();
        const tab = doc ? doc.sheetsByTitle[ORDERS_TAB] ?? doc.sheetsByIndex[0] : null;
        if (!tab) return null;
        try { await tab.loadHeaderRow(); return tab.headerValues; } catch { return null; }
      },
      update: (id, patch) => store.updateOrder(id, patch as Partial<OrderRecord>),
    };
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  run(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => {
    const ours = e instanceof ArgError || e instanceof ApplyRefused || e instanceof GrowExportError || e instanceof RefundError;
    const safe = ours || (e instanceof Error && /^(no env file|refusing|.* is missing )/.test(e.message));
    console.error(`reconcile-payments: ${ours && !(e instanceof GrowExportError) ? "refused: " : ""}${safe ? (e as Error).message : e instanceof Error ? e.name : "error"}`);
    process.exit(ours || safe ? 2 : 1);
  });
}
