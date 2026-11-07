/**
 * COGS sync (docs/attribution/marketing_machine_2026-11/PLAN.md Stage 3, cost-table part).
 *
 *   npx tsx scripts/cogs-sync.ts [--fixture <orders.json|orders.jsonl>] [--dir .test-data] [--source file|sheet]
 *        [--basis conservative|lean] [--pages <page_counts.json>] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *        [--json] [--write]
 *
 * Dry run by default: prints the per-order cost rows it would write to the tab "עלויות הזמנה", one per
 * paid, free (gift redeem) or refunded order, computed with api/_cost_table.ts. Rows carry the order id
 * and money only: no names, phones, emails, addresses or IPs are ever printed or written.
 *
 * Sources:
 *   - `--fixture <path>`: a JSON array of orders, `{ "orders": [...] }`, or an orders.jsonl (FileStore lines).
 *   - `--source file` (default): the test store in --dir (default website/.test-data), via report-lib/load.ts.
 *   - `--source sheet`: the live order sheet, only through a sheet loader exported by report-lib/load.ts
 *     (`loadSheetReportData`). Until that loader exists the script refuses. It never reads .env.local.
 *
 * `--write` upserts the rows by order_id into "עלויות הזמנה". It is allowed only with `--source sheet`
 * (never fixture or test rows into production) and refuses unless the tab already exists with the
 * header row below: this code never creates tabs or headers (api/_store_sheet.ts:4).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OrderRecord } from "../api/_attribution_core.ts";
import { costFor, type Basis, type CostBreakdown, type Meetings, type PageCounts, type Shipping, type VariantKind } from "../api/_cost_table.ts";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const COST_TAB = "עלויות הזמנה";

/** The tab's header row, in order. Lihi creates the tab with exactly these headers (PLAN.md:208). */
export const COST_HEADERS = [
  "order_id", "order_kind", "variant", "meetings", "payment_status", "paid_date", "gross_ils", "revenue_ex_vat",
  "print_ils", "single_set_ils", "blessing_card_ils", "packaging_ils", "pens_bag_ils", "shipping", "shipping_ils",
  "ran_handling_ils", "grow_fee_ils", "cogs_ils", "contribution_ils", "basis", "rate_card", "pages_source", "computed_at",
] as const;
export type CostHeader = (typeof COST_HEADERS)[number];
export type CostRow = Record<CostHeader, string | number>;

/** Only these OrderRecord fields are ever read; nothing else (buyer, couple, IP, touches) reaches a row. */
type OrderCostInput = Pick<OrderRecord, "order_id" | "order_kind" | "payment_status" | "amount_expected" | "price_rule" | "paid_amount" | "paid_at" | "created_at">
  & Partial<Pick<OrderRecord, "all_meetings" | "meetings" | "express_ils">>;

const COSTED_STATUSES = new Set(["paid", "free", "refunded"]);

export function isTestOrder(id: string, testIds: ReadonlySet<string>): boolean {
  return /TEST/i.test(id) || testIds.has(id);
}

export function meetingsOf(o: OrderCostInput): Meetings {
  if (o.all_meetings === true) return 11;
  if (Array.isArray(o.meetings) && o.meetings.length >= 11) return 11;
  return /(^|_)all(_|$)|_410\b|_390\b/.test(o.price_rule || "") ? 11 : 8;
}

export function variantKindOf(o: OrderCostInput): VariantKind {
  return o.order_kind === "gift" ? "gift_sale" : o.order_kind === "redeem" ? "gift_redeem" : "kit";
}

export function shippingOf(o: OrderCostInput): Shipping {
  // Express is sold only while prepaid vouchers last (PLAN.md:458), so an express order is costed on the voucher.
  return (o.express_ils ?? 0) > 0 ? "express_voucher" : "post";
}

export interface RowOptions {
  basis: Basis;
  pages?: Record<string, PageCounts>;
  now: Date;
}

export function costRow(o: OrderCostInput, opts: RowOptions): CostRow {
  const kind = variantKindOf(o);
  const meetings = meetingsOf(o);
  const gross = kind === "gift_redeem" ? 0 : (typeof o.paid_amount === "number" ? o.paid_amount : o.amount_expected);
  const pages = opts.pages?.[o.order_id] ?? null;
  const b: CostBreakdown = costFor({ kind, meetings }, {
    basis: opts.basis, gross, shipping: kind === "gift_sale" ? undefined : shippingOf(o), pages, date: o.paid_at || o.created_at,
  });
  const line = (k: string) => b.lines.find((l) => l.key === k)?.ils ?? 0;
  return {
    order_id: o.order_id,
    order_kind: o.order_kind,
    variant: `${kind}_${meetings}m`,
    meetings,
    payment_status: o.payment_status,
    paid_date: (o.paid_at || "").slice(0, 10),
    gross_ils: b.gross_ils,
    revenue_ex_vat: b.revenue_ex_vat,
    print_ils: line("print"),
    single_set_ils: line("single_set"),
    blessing_card_ils: line("blessing_card"),
    packaging_ils: line("packaging"),
    pens_bag_ils: line("pens_bag"),
    shipping: b.shipping ?? "",
    shipping_ils: line("shipping"),
    ran_handling_ils: line("ran_handling"),
    grow_fee_ils: b.fee_ils,
    cogs_ils: b.cogs_ils,
    contribution_ils: b.contribution_ils,
    basis: b.basis,
    rate_card: b.card_id + (b.card_before_first ? " (before first card)" : ""),
    pages_source: kind === "gift_sale" ? "" : pages ? "page_counts" : "default",
    computed_at: opts.now.toISOString(),
  };
}

export interface BuildOptions extends RowOptions {
  from?: string | null;
  to?: string | null;
  testIds?: ReadonlySet<string>;
}

/** Cost rows for every costed order (paid, free, refunded), tests excluded, sorted by order id. */
export function buildCostRows(orders: OrderCostInput[], opts: BuildOptions): CostRow[] {
  const testIds = opts.testIds ?? new Set<string>();
  const rows: CostRow[] = [];
  for (const o of orders) {
    if (!o || typeof o.order_id !== "string") continue;
    if (!COSTED_STATUSES.has(o.payment_status)) continue;
    if (isTestOrder(o.order_id, testIds)) continue;
    const day = (o.paid_at || o.created_at || "").slice(0, 10);
    if (opts.from && day && day < opts.from) continue;
    if (opts.to && day && day > opts.to) continue;
    rows.push(costRow(o, opts));
  }
  return rows.sort((a, b) => String(a.order_id).localeCompare(String(b.order_id)));
}

export function renderRows(rows: CostRow[]): string {
  if (!rows.length) return "cogs-sync: no costed orders (paid, free or refunded) in range.\n";
  const cols: CostHeader[] = ["order_id", "variant", "payment_status", "gross_ils", "revenue_ex_vat", "print_ils", "shipping_ils", "grow_fee_ils", "cogs_ils", "contribution_ils"];
  const out = [cols.join("\t")];
  for (const r of rows) out.push(cols.map((c) => String(r[c])).join("\t"));
  const sum = (k: CostHeader) => Math.round(rows.reduce((s, r) => s + Number(r[k] || 0), 0) * 100) / 100;
  out.push(`total\t${rows.length} orders\t\t${sum("gross_ils")}\t${sum("revenue_ex_vat")}\t${sum("print_ils")}\t${sum("shipping_ils")}\t${sum("grow_fee_ils")}\t${sum("cogs_ils")}\t${sum("contribution_ils")}`);
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------------------------
// Writing (only with --write)
// ---------------------------------------------------------------------------------------------

export interface CostTabWriter {
  /** null when the tab does not exist; otherwise its header row. */
  headers(): Promise<string[] | null>;
  /** Upsert by order_id. */
  upsert(rows: CostRow[]): Promise<{ inserted: number; updated: number }>;
}

export class WriteRefused extends Error {}

/** Refuses unless the tab exists and carries every header; never creates a tab or a header. */
export async function writeCostRows(rows: CostRow[], writer: CostTabWriter): Promise<{ inserted: number; updated: number }> {
  const headers = await writer.headers();
  if (headers === null) throw new WriteRefused(`the tab "${COST_TAB}" does not exist; Lihi creates it (with the header row) before --write`);
  const missing = COST_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) throw new WriteRefused(`the tab "${COST_TAB}" is missing headers: ${missing.join(", ")}`);
  if (!rows.length) return { inserted: 0, updated: 0 };
  return writer.upsert(rows);
}

/** KEY=VALUE lines (optional `export`, optional quotes). Values are never printed. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** The live sheet writer. Credentials from ~/.config/besha/report.env (PLAN.md:131), never .env.local. */
async function sheetWriter(): Promise<CostTabWriter> {
  const envFile = path.join(os.homedir(), ".config", "besha", "report.env");
  const env = fs.existsSync(envFile) ? parseEnvFile(fs.readFileSync(envFile, "utf8")) : {};
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key = env.GOOGLE_PRIVATE_KEY, id = env.GOOGLE_SPREADSHEET_ID;
  if (!email || !key || !id) throw new WriteRefused(`missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SPREADSHEET_ID in ${envFile}`);
  const { GoogleSpreadsheet } = await import("google-spreadsheet");
  const { JWT } = await import("google-auth-library");
  const doc = new GoogleSpreadsheet(id, new JWT({ email, key: key.replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets"] }));
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle[COST_TAB] || null;
  return {
    async headers() {
      if (!sheet) return null;
      try { await sheet.loadHeaderRow(); return sheet.headerValues; } catch { return []; }
    },
    async upsert(rows) {
      if (!sheet) throw new WriteRefused(`the tab "${COST_TAB}" does not exist`);
      const existing = await sheet.getRows<Record<string, string>>();
      const byId = new Map(existing.map((r) => [r.get("order_id"), r]));
      let inserted = 0, updated = 0;
      const fresh: Record<string, string>[] = [];
      for (const row of rows) {
        const values = Object.fromEntries(COST_HEADERS.map((h) => [h, String(row[h])]));
        const hit = byId.get(String(row.order_id));
        if (hit) { hit.assign(values); await hit.save(); updated++; }
        else { fresh.push(values); inserted++; }
      }
      if (fresh.length) await sheet.addRows(fresh);
      return { inserted, updated };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------

/** A fixture: JSON array, `{orders: [...]}`, or FileStore orders.jsonl lines (insert + update replay). */
export function loadFixture(file: string): OrderCostInput[] {
  const text = fs.readFileSync(file, "utf8");
  if (file.endsWith(".jsonl")) {
    const m = new Map<string, OrderCostInput>();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let l: { op?: string; order_id?: string; data?: Partial<OrderCostInput> };
      try { l = JSON.parse(line); } catch { continue; }
      if (!l || typeof l.order_id !== "string" || !l.data) continue;
      if (l.op === "insert") m.set(l.order_id, { ...(l.data as OrderCostInput) });
      else if (l.op === "update" && m.has(l.order_id)) m.set(l.order_id, { ...(m.get(l.order_id) as OrderCostInput), ...l.data });
    }
    return [...m.values()];
  }
  const j = JSON.parse(text);
  const arr = Array.isArray(j) ? j : Array.isArray(j?.orders) ? j.orders : null;
  if (!arr) throw new Error("fixture must be a JSON array of orders or {\"orders\": [...]}");
  return arr as OrderCostInput[];
}

/** page_counts.json: `{ "<order_id>": {couple, personal1, personal2} }` (or `personal`); personal = mean of the two. */
export function loadPages(file: string): Record<string, PageCounts> {
  const j = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, { couple?: number; personal?: number; personal1?: number; personal2?: number }>;
  const out: Record<string, PageCounts> = {};
  for (const [id, v] of Object.entries(j || {})) {
    if (!v || typeof v.couple !== "number") continue;
    const p = typeof v.personal === "number" ? v.personal
      : typeof v.personal1 === "number" && typeof v.personal2 === "number" ? (v.personal1 + v.personal2) / 2
      : typeof v.personal1 === "number" ? v.personal1 : null;
    if (p === null) continue;
    out[id] = { couple: v.couple, personal: p };
  }
  return out;
}

function loadTestIds(): Set<string> {
  const f = path.join(WEBSITE_DIR, "scripts", "report-lib", "test_orders.json");
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    const ids = Array.isArray(j) ? j : Array.isArray(j?.ids) ? j.ids : [];
    return new Set(ids.filter((x: unknown): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export interface Args {
  source: "file" | "sheet"; fixture: string | null; dir: string; basis: Basis; pages: string | null;
  from: string | null; to: string | null; json: boolean; write: boolean;
}

export class ArgError extends Error {}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): Args {
  const a: Args = {
    source: "file", fixture: null, dir: env.ATTR_DATA_DIR || path.join(WEBSITE_DIR, ".test-data"), basis: "conservative",
    pages: null, from: null, to: null, json: false, write: false,
  };
  const val = (i: number, flag: string) => { const v = argv[i + 1]; if (v === undefined || v.startsWith("--")) throw new ArgError(`${flag} needs a value`); return v; };
  const date = (v: string, flag: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ArgError(`${flag} must be YYYY-MM-DD`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    switch (f) {
      case "--source": { const v = val(i, f); i++; if (v !== "file" && v !== "sheet") throw new ArgError("--source is file or sheet"); a.source = v; break; }
      case "--fixture": a.fixture = val(i, f); i++; break;
      case "--dir": a.dir = val(i, f); i++; break;
      case "--basis": { const v = val(i, f); i++; if (v !== "conservative" && v !== "lean") throw new ArgError("--basis is conservative or lean"); a.basis = v; break; }
      case "--pages": a.pages = val(i, f); i++; break;
      case "--from": a.from = date(val(i, f), f); i++; break;
      case "--to": a.to = date(val(i, f), f); i++; break;
      case "--json": a.json = true; break;
      case "--write": a.write = true; break;
      case "--dry-run": a.write = false; break;
      default: throw new ArgError(`unknown flag ${f}`);
    }
  }
  if (a.fixture && a.source === "sheet") throw new ArgError("--fixture and --source sheet are exclusive");
  if (a.write && (a.source !== "sheet" || a.fixture)) {
    throw new ArgError("--write needs --source sheet: rows from a fixture or the test store never go to the production sheet");
  }
  return a;
}

async function loadOrders(a: Args): Promise<OrderCostInput[]> {
  if (a.fixture) return loadFixture(a.fixture);
  if (a.source === "sheet") {
    const mod = (await import("./report-lib/load.ts")) as Record<string, unknown>;
    const loader = mod.loadSheetReportData;
    if (typeof loader !== "function") {
      throw new ArgError("--source sheet needs the sheet loader (report-lib/load.ts loadSheetReportData, PLAN Stage 1.5), which is not built yet");
    }
    const data = (await (loader as () => Promise<{ orders: OrderCostInput[] }>)()) || { orders: [] };
    if (!Array.isArray(data.orders) || data.orders.length === 0) {
      // An empty read is treated as a failed read (CLAUDE.md section 6: credential failures return empty).
      throw new ArgError("the sheet loader returned no orders; refusing to act on an empty read");
    }
    return data.orders;
  }
  const dir = path.resolve(a.dir);
  if (!path.basename(dir).startsWith(".test-data")) throw new ArgError(`the data folder must be a .test-data* folder (got ${dir})`);
  if (!fs.existsSync(dir)) throw new ArgError(`no data folder at ${dir} (pass --fixture <file> or run the test harness first)`);
  const { loadReportData } = await import("./report-lib/load.ts");
  return loadReportData(dir).orders;
}

export async function run(argv: string[], deps: { writer?: () => Promise<CostTabWriter>; now?: Date; out?: (s: string) => void } = {}): Promise<number> {
  const out = deps.out ?? ((s: string) => process.stdout.write(s));
  const a = parseArgs(argv);
  const orders = await loadOrders(a);
  const rows = buildCostRows(orders, {
    basis: a.basis, pages: a.pages ? loadPages(a.pages) : undefined, now: deps.now ?? new Date(),
    from: a.from, to: a.to, testIds: loadTestIds(),
  });
  if (a.json) out(JSON.stringify({ tab: COST_TAB, dry_run: !a.write, rows }, null, 2) + "\n");
  else out(`cogs-sync: ${a.write ? "WRITE" : "dry run"}, basis ${a.basis}, ${rows.length} rows for tab "${COST_TAB}"\n` + renderRows(rows));
  if (!a.write) return 0;
  const writer = await (deps.writer ?? sheetWriter)();
  const res = await writeCostRows(rows, writer);
  out(`cogs-sync: wrote "${COST_TAB}": ${res.inserted} inserted, ${res.updated} updated\n`);
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  run(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => {
    const refused = e instanceof ArgError || e instanceof WriteRefused;
    console.error(`cogs-sync: ${refused ? "refused: " : ""}${e instanceof Error ? e.message : String(e)}`);
    process.exit(refused ? 2 : 1);
  });
}
