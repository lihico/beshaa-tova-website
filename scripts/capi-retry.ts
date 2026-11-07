/**
 * CAPI Purchase retry (PLAN.md marketing_machine_2026-11, Stage 2). Local only, never on Vercel.
 *
 *   npx tsx scripts/capi-retry.ts [--env ~/.config/besha/report.env] [--meta-env ~/.config/besha/meta.env] [--send]
 *
 * Lists paid orders whose capi_purchase_sent_at is empty and whose paid_at is under 7 days old (Meta
 * rejects website events older than that). Test rows are left out (notes "בדיקת מערכת", an id with
 * TEST, or scripts/report-lib/test_orders.json), and so are orders with consent_marketing=denied.
 * Dry run by default: prints what it would send. --send re-sends each one through the same
 * capiPurchase() the server uses (api/_meta-capi.ts, called by api/_fulfil.ts) and writes the result on the order row.
 *
 * Secrets: the sheet service account comes from --env (default report.env); the CAPI token
 * (META_CAPI_TOKEN, else META_ACCESS_TOKEN) from --env or, failing that, --meta-env. No value is ever
 * printed. Output is order ids, ages and results only, never names, phones or emails.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OrderRecord } from "../api/_attribution_core.ts";
import {
  DEFAULT_META_ENV, DEFAULT_REPORT_ENV, SHEET_ENV_NAMES, loadTestIds, parseEnvFile, readSecretEnv, testReason,
} from "./report-lib/load.ts";

export const RETRY_WINDOW_MS = 7 * 24 * 3600 * 1000;

export interface RetryRow { order: OrderRecord; notes: string | null }
export interface RetryPick { order_id: string; paid_at: string; age_hours: number }
export interface RetrySkip { order_id: string; reason: string }

/** Pure: which paid orders need their Purchase re-sent now, and why the other paid ones do not. */
export function selectRetryOrders(rows: RetryRow[], now: Date, testIds: Set<string>): { pick: RetryPick[]; skipped: RetrySkip[] } {
  const pick: RetryPick[] = [];
  const skipped: RetrySkip[] = [];
  for (const { order: o, notes } of rows) {
    if (!o.order_id || o.payment_status !== "paid") continue;   // only paid orders are candidates at all
    const test = testReason(o.order_id, notes, testIds);
    if (test) { skipped.push({ order_id: o.order_id, reason: `test:${test}` }); continue; }
    if (o.capi_purchase_sent_at) { skipped.push({ order_id: o.order_id, reason: "already_sent" }); continue; }
    if (o.consent_marketing === "denied" || o.capi_purchase_result === "skipped_consent") {
      skipped.push({ order_id: o.order_id, reason: "consent_denied" }); continue;
    }
    const paidMs = o.paid_at ? Date.parse(o.paid_at) : NaN;
    if (!Number.isFinite(paidMs)) { skipped.push({ order_id: o.order_id, reason: "no_paid_at" }); continue; }
    const age = now.getTime() - paidMs;
    if (age >= RETRY_WINDOW_MS) { skipped.push({ order_id: o.order_id, reason: "older_than_7_days" }); continue; }
    if (age < 0) { skipped.push({ order_id: o.order_id, reason: "paid_at_in_future" }); continue; }
    pick.push({ order_id: o.order_id, paid_at: o.paid_at as string, age_hours: Math.round(age / 360_000) / 10 });
  }
  return { pick, skipped };
}

export interface Args { envFile: string; metaEnvFile: string; send: boolean }

const expandHome = (p: string) => (p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);

export function parseArgs(argv: string[]): Args {
  const a: Args = { envFile: DEFAULT_REPORT_ENV, metaEnvFile: DEFAULT_META_ENV, send: false };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith("--")) throw new Error(`${f} needs a value`); return expandHome(v); };
    if (f === "--env") a.envFile = val();
    else if (f === "--meta-env") a.metaEnvFile = val();
    else if (f === "--send") a.send = true;
    else if (f === "--dry-run") a.send = false;
    else throw new Error(`unknown flag ${f}`);
  }
  return a;
}

export interface RetryDeps {
  now: Date;
  testIds: Set<string>;
  loadRows: () => Promise<RetryRow[]>;
  /** Re-send one order (capiPurchase) and return the updated record. Only called with --send. */
  resend: (o: OrderRecord) => Promise<OrderRecord>;
  log: (line: string) => void;
}

/** The run, with every side effect injected. Returns the exit code (1 = at least one send failed). */
export async function runRetry(args: Pick<Args, "send">, deps: RetryDeps): Promise<number> {
  const rows = await deps.loadRows();
  const { pick, skipped } = selectRetryOrders(rows, deps.now, deps.testIds);
  const byId = new Map(rows.map((r) => [r.order.order_id, r.order]));
  deps.log(`capi-retry: ${pick.length} to ${args.send ? "send" : "send (dry run, pass --send)"}, ${skipped.length} paid skipped`);
  for (const s of skipped) deps.log(`  skip ${s.order_id} ${s.reason}`);
  let failed = 0;
  for (const p of pick) {
    if (!args.send) { deps.log(`  would send ${p.order_id} paid ${p.age_hours}h ago`); continue; }
    try {
      const after = await deps.resend(byId.get(p.order_id) as OrderRecord);
      const ok = !!after.capi_purchase_sent_at;
      if (!ok) failed++;
      deps.log(`  sent ${p.order_id} result=${after.capi_purchase_result ?? ""}${!ok && after.capi_last_error_code ? ` error_code=${after.capi_last_error_code}` : ""}`);
    } catch (e) {
      failed++;
      deps.log(`  failed ${p.order_id} (${e instanceof Error ? e.name : "error"})`);
    }
  }
  return failed ? 1 : 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = readSecretEnv(args.envFile, [...SHEET_ENV_NAMES]);
  for (const k of SHEET_ENV_NAMES) process.env[k] = env[k];
  delete process.env.STORE_MODE;    // the live sheet, never the file store
  if (args.send) {
    let token = env.META_CAPI_TOKEN || env.META_ACCESS_TOKEN || "";
    if (!token && fs.existsSync(args.metaEnvFile) && !path.basename(args.metaEnvFile).startsWith(".env")) {
      const meta = parseEnvFile(fs.readFileSync(args.metaEnvFile, "utf8"));
      token = meta.META_CAPI_TOKEN || meta.META_ACCESS_TOKEN || "";
    }
    if (!token) throw new Error(`--send needs META_CAPI_TOKEN in ${args.envFile} or ${args.metaEnvFile}`);
    process.env.META_CAPI_TOKEN = token;
    process.env.CAPI_MODE = "send";
    delete process.env.ATTR_TEST;   // test mode would swap the send for a log line
  }
  const { getOrderDoc } = await import("../api/_sheets.ts");
  const { SheetStore, rowToOrder, ORDERS_TAB } = await import("../api/_store_sheet.ts");
  const { capiPurchase } = await import("../api/_meta-capi.ts");
  const store = new SheetStore();
  const code = await runRetry(args, {
    now: new Date(),
    testIds: loadTestIds(),
    loadRows: async () => {
      const doc = await getOrderDoc();
      if (!doc) throw new Error("could not open the order sheet (check the service account names in the env file)");
      const tab = doc.sheetsByTitle[ORDERS_TAB] ?? doc.sheetsByIndex[0];
      const rows = await tab.getRows<Record<string, string>>();
      return rows
        .filter((r) => String(r.get("order_id") ?? "").trim())
        .map((r) => ({ order: rowToOrder(r), notes: String(r.get("הערות") ?? "") || null }));
    },
    resend: (o) => capiPurchase(store, o),
    log: (l) => console.log(l),
  });
  process.exit(code);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    // Our own messages name files and variables only; anything else is reduced to its type.
    const msg = e instanceof Error && /^(no env file|refusing|--|unknown flag|could not open|.* is missing )/.test(e.message) ? e.message : e instanceof Error ? e.name : "error";
    console.error(`capi-retry: ${msg}`);
    process.exit(2);
  });
}
