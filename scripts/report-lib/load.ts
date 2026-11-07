/**
 * Report data loader (docs/attribution/00_DESIGN.md section 10; PLAN.md marketing_machine_2026-11 1.5).
 *
 * Source `file`: reads the test store under ATTR_DATA_DIR (default website/.test-data). No network.
 *
 * Source `sheet` (`loadSheetData`): a READ-ONLY production read of the order sheet. It authenticates
 * with its own JWT on the `spreadsheets.readonly` scope (so it cannot write even by mistake), reads
 * the tab "מעקב הזמנות" through the same row mapper the live SheetStore uses (`rowToOrder`), plus the
 * tab "תשלומים". Touches come from each row's touches_json (the touches tab is empty while TOUCH_LOG is
 * off), with the flat ft_* / lt_* columns as the fallback. Test rows are dropped (see `testReason`).
 *
 * Secrets come ONLY from an env file, default ~/.config/besha/report.env (mode 600), never .env.local
 * and never process.env. Expected variable names:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   the site's service account
 *   GOOGLE_PRIVATE_KEY             its private key (literal "\n" sequences are turned into newlines)
 *   GOOGLE_SPREADSHEET_ID          the order sheet
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OrderRecord, Partner, PaymentRecord, Touch, TrackingCode } from "../../api/_attribution_core.ts";
import type { StoredTouch } from "../../api/_store.ts";
import { ORDERS_TAB, PAYMENTS_TAB, rowToOrder } from "../../api/_store_sheet.ts";
import type { SpendData } from "./join.ts";

export interface CapiLine {
  event_name: string; event_id: string; event_time?: number; order_id?: string | null;
}

export interface ReportData {
  source: "file" | "sheet";
  dir: string;
  orders: OrderRecord[];
  touches: StoredTouch[];
  payments: PaymentRecord[];
  capi: CapiLine[];
  codes: TrackingCode[];
  partners: Partner[];
  /** null when the file does not exist (outside the harness); [] when it exists and is empty. */
  blocked_egress: unknown[] | null;
  /** Sheet source: rows dropped as tests (ids and the rule only, no buyer data). */
  excluded_tests?: Array<{ order_id: string; reason: string }>;
  /** Meta spend (scripts/meta-insights.ts cache), joined in build.ts when present. */
  meta_spend?: SpendData | null;
  /** Sheet source: columns rowToOrder does not map, reduced to flags (no free text). Keyed by order id. */
  order_extras?: Record<string, OrderExtras>;
}

export interface OrderExtras {
  /** Column "נשלח ללקוח": true when it holds a tick, TRUE, כן or a date; false when FALSE / לא; null when empty or absent. */
  kit_sent: boolean | null;
  /** Column recon_status (Stage 3), only when it is a short code; null when absent. */
  recon_status: string | null;
}

export const KIT_SENT_COLUMN = "נשלח ללקוח";

export function orderExtras(row: SheetRow): OrderExtras {
  const sent = s(row[KIT_SENT_COLUMN]);
  let kit_sent: boolean | null = null;
  if (sent) {
    if (/^(false|לא|no|0)$/i.test(sent)) kit_sent = false;
    else if (/^(true|כן|yes|v|x|1|נשלח)$/i.test(sent) || /\d{1,4}[./-]\d{1,2}([./-]\d{1,4})?/.test(sent) || /[\u2713\u2714\u2705]/.test(sent)) kit_sent = true;
  }
  const rs = s(row.recon_status);
  return { kit_sent, recon_status: /^[a-z0-9_:-]{1,30}$/i.test(rs) ? rs : null };
}

function readLines<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  const out: T[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as T); } catch { /* torn line skipped */ }
  }
  return out;
}

function readJsonArray<T>(file: string): T[] {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(j) ? (j as T[]) : [];
  } catch {
    return [];
  }
}

/** Same replay rule as FileStore: insert, then shallow-merge every update in file order. */
export function replayOrders(lines: Array<{ op?: string; order_id?: string; data?: Partial<OrderRecord> }>): OrderRecord[] {
  const m = new Map<string, OrderRecord>();
  for (const l of lines) {
    if (!l || typeof l.order_id !== "string" || !l.data) continue;
    if (l.op === "insert") m.set(l.order_id, { ...(l.data as OrderRecord) });
    else if (l.op === "update" && m.has(l.order_id)) m.set(l.order_id, { ...(m.get(l.order_id) as OrderRecord), ...l.data });
  }
  return [...m.values()];
}

/** capi.jsonl lines are `{payload: {data: [event]}, would_send, at}` (api/_meta-capi.ts log mode). */
export function capiEvents(lines: unknown[]): CapiLine[] {
  const out: CapiLine[] = [];
  for (const l of lines) {
    const data = (l as { payload?: { data?: unknown[] } })?.payload?.data;
    if (!Array.isArray(data)) continue;
    for (const e of data) {
      const ev = e as { event_name?: unknown; event_id?: unknown; event_time?: unknown; custom_data?: { order_id?: unknown } };
      if (typeof ev?.event_name !== "string" || typeof ev.event_id !== "string") continue;
      out.push({
        event_name: ev.event_name, event_id: ev.event_id,
        event_time: typeof ev.event_time === "number" ? ev.event_time : undefined,
        order_id: typeof ev.custom_data?.order_id === "string" ? ev.custom_data.order_id : null,
      });
    }
  }
  return out;
}

export function loadReportData(dir: string): ReportData {
  const abs = path.resolve(dir);
  const f = (n: string) => path.join(abs, n);
  return {
    source: "file",
    dir: abs,
    orders: replayOrders(readLines(f("orders.jsonl"))),
    touches: readLines<StoredTouch>(f("touches.jsonl")),
    payments: readLines<PaymentRecord>(f("payments.jsonl")),
    capi: capiEvents(readLines(f("capi.jsonl"))),
    codes: readJsonArray<TrackingCode>(f("codes.json")),
    partners: readJsonArray<Partner>(f("partners.json")).filter((p) => p && typeof p.partner_id === "string"),
    blocked_egress: fs.existsSync(f("blocked_egress.jsonl")) ? readLines(f("blocked_egress.jsonl")) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Env files (secrets): never .env.local, never process.env
// ---------------------------------------------------------------------------------------------

export const BESHA_CONFIG_DIR = path.join(os.homedir(), ".config", "besha");
export const DEFAULT_REPORT_ENV = path.join(BESHA_CONFIG_DIR, "report.env");
export const DEFAULT_META_ENV = path.join(BESHA_CONFIG_DIR, "meta.env");

/** KEY=VALUE lines; `#` comments, optional `export `, single or double quotes. Values are never logged. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/**
 * Reads a secrets file and checks the required names are set. Refuses any `.env*` file (the site's
 * .env.local holds Vercel values and must never feed a local script). Throws with names only.
 */
export function readSecretEnv(file: string, required: string[], deps: { readFile?: (f: string) => string } = {}): Record<string, string> {
  const base = path.basename(file);
  if (base.startsWith(".env")) throw new Error(`refusing ${base}: secrets come only from ${BESHA_CONFIG_DIR}/*.env`);
  let text: string;
  try { text = (deps.readFile ?? ((f) => fs.readFileSync(f, "utf8")))(file); }
  catch { throw new Error(`no env file at ${file} (expected: ${required.join(", ")})`); }
  const env = parseEnvFile(text);
  const missing = required.filter((k) => !env[k]);
  if (missing.length) throw new Error(`${file} is missing ${missing.join(", ")}`);
  return env;
}

/** A warning (no value) when the secrets file can be read by group or others. */
export function envFileModeWarning(file: string): string | null {
  try {
    const mode = fs.statSync(file).mode & 0o777;
    return mode & 0o077 ? `${file} is mode ${mode.toString(8)}; run chmod 600 ${file}` : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------------------------
// Test rows (PLAN 1.5)
// ---------------------------------------------------------------------------------------------

export const TEST_ORDERS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "test_orders.json");
export const TEST_NOTE = "בדיקת מערכת";

/** Ids from test_orders.json (`{"ids": [...]}` or a bare array), upper-cased. Missing file = none. */
export function loadTestIds(file: string = TEST_ORDERS_FILE): Set<string> {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    const arr = Array.isArray(j) ? j : (j as { ids?: unknown })?.ids;
    return new Set((Array.isArray(arr) ? arr : []).filter((x): x is string => typeof x === "string").map((x) => x.trim().toUpperCase()));
  } catch {
    return new Set();
  }
}

/** Why a row is a test (null = a real order): the notes say "בדיקת מערכת", the id has TEST, or it is listed. */
export function testReason(orderId: string, notes: string | null | undefined, ids: Set<string>): string | null {
  const id = orderId.trim().toUpperCase();
  if ((notes ?? "").includes(TEST_NOTE)) return "notes";
  if (/TEST/.test(id)) return "id_has_TEST";
  if (ids.has(id)) return "test_orders.json";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Sheet rows -> ReportData (pure; the live read is below)
// ---------------------------------------------------------------------------------------------

export type SheetRow = Record<string, string | undefined>;
type MapperRow = Parameters<typeof rowToOrder>[0];

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const orNull = (v: unknown): string | null => s(v) || null;

/** "7.11.2026" / "07/11/2026" (he-IL "תאריך הזמנה") -> an ISO time at noon Israel time, or null. */
export function heDateToIso(v: string | null | undefined): string | null {
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s(v));
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T10:00:00.000Z`;
}

/** First or last touch rebuilt from the flat ft_* / lt_* columns (used when touches_json lacks it). */
export function flatTouch(row: SheetRow, prefix: "ft" | "lt"): Touch | null {
  const g = (k: string) => orNull(row[`${prefix}_${k}`]);
  const ts = g("ts");
  if (!ts || !Number.isFinite(Date.parse(ts))) return null;
  return {
    touch_id: `t_flat_${prefix}`, ts, kind: "landing", landing_path: g("landing") ?? "/", referrer_host: g("referrer"),
    ref: g("ref"), utm_source: g("utm_source"), utm_medium: g("utm_medium"), utm_campaign: g("utm_campaign"),
    utm_content: g("utm_content"), utm_term: g("utm_term"), utm_id: prefix === "lt" ? g("utm_id") : null,
    meta_campaign_id: g("meta_campaign_id"), meta_adset_id: g("meta_adset_id"), meta_ad_id: g("meta_ad_id"),
    placement: prefix === "lt" ? g("placement") : null,
    fbclid: null, gclid: null, gbraid: null, wbraid: null, ttclid: null, promo: null, q_code: g("q_code"),
    channel: (g("channel") ?? "direct") as Touch["channel"],
  };
}

export function sheetRowToOrder(row: SheetRow): OrderRecord {
  const o = rowToOrder({ get: (k: string) => row[k] ?? "" } as unknown as MapperRow);
  if (!o.first) o.first = flatTouch(row, "ft");
  if (!o.last) o.last = flatTouch(row, "lt");
  o.created_at = heDateToIso(row["תאריך הזמנה"]) ?? o.last?.ts ?? o.first?.ts ?? o.paid_at ?? "";
  return o;
}

function rowToPayment(r: SheetRow): PaymentRecord | null {
  const order_id = s(r.order_id);
  if (!order_id) return null;
  const amount = Number(s(r.amount));
  return {
    payment_id: s(r.payment_id), order_id, provider: (s(r.provider) || "manual") as PaymentRecord["provider"],
    amount: Number.isFinite(amount) ? amount : 0, currency: "ILS", paid_at: s(r.paid_at), asmachta: orNull(r.asmachta),
    method: (s(r.method) || "other") as PaymentRecord["method"], card_suffix: orNull(r.card_suffix),
    installments: Number(s(r.installments)) || null, verified: /^true$/i.test(s(r.verified)),
    verification: (s(r.verification) || "manual_token") as PaymentRecord["verification"], raw_notify_digest: s(r.raw_notify_digest),
  };
}

/** Pure: sheet rows (as plain objects) to ReportData, tests excluded. `payments` null = tab missing. */
export function sheetDataFromRows(orderRows: SheetRow[], paymentRows: SheetRow[] | null, testIds: Set<string>): ReportData {
  const excluded: Array<{ order_id: string; reason: string }> = [];
  const orders: OrderRecord[] = [];
  const extras: Record<string, OrderExtras> = {};
  for (const row of orderRows) {
    const id = s(row.order_id);
    if (!id) continue;                                   // legacy rows from before the BT ids
    const why = testReason(id, row["הערות"], testIds);
    if (why) { excluded.push({ order_id: id, reason: why }); continue; }
    orders.push(sheetRowToOrder(row));
    extras[id] = orderExtras(row);
  }
  const testSet = new Set(excluded.map((e) => e.order_id));
  const payments = (paymentRows ?? []).map(rowToPayment)
    .filter((p): p is PaymentRecord => !!p && !testSet.has(p.order_id) && !testReason(p.order_id, null, testIds));
  const seen = new Set<string>();
  const touches: StoredTouch[] = [];
  for (const o of orders) {
    for (const t of [...o.touches, o.first, o.last]) {
      if (!t || seen.has(t.touch_id + "|" + o.order_id)) continue;
      seen.add(t.touch_id + "|" + o.order_id);
      touches.push({ ...t, visitor_id: o.visitor_id });
    }
  }
  return {
    source: "sheet", dir: ORDERS_TAB, orders, touches, payments, capi: [], codes: [], partners: [],
    blocked_egress: null, excluded_tests: excluded, order_extras: extras,
  };
}

export interface SheetCreds { GOOGLE_SERVICE_ACCOUNT_EMAIL: string; GOOGLE_PRIVATE_KEY: string; GOOGLE_SPREADSHEET_ID: string }
export type ReadTabs = (creds: SheetCreds) => Promise<{ orders: SheetRow[]; payments: SheetRow[] | null }>;

/** The live read: readonly scope, getRows only. Never called by the unit tests (they inject readTabs). */
export const readTabsLive: ReadTabs = async (c) => {
  const { GoogleSpreadsheet } = await import("google-spreadsheet");
  const { JWT } = await import("google-auth-library");
  const jwt = new JWT({
    email: c.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: c.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const doc = new GoogleSpreadsheet(c.GOOGLE_SPREADSHEET_ID, jwt);
  await doc.loadInfo();
  const ordersTab = doc.sheetsByTitle[ORDERS_TAB] ?? doc.sheetsByIndex[0];
  const payTab = doc.sheetsByTitle[PAYMENTS_TAB] ?? null;
  const rows = async (t: typeof ordersTab) => (await t.getRows<Record<string, string>>()).map((r) => r.toObject() as SheetRow);
  return { orders: ordersTab ? await rows(ordersTab) : [], payments: payTab ? await rows(payTab) : null };
};

export const SHEET_ENV_NAMES = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_SPREADSHEET_ID"] as const;

export async function loadSheetData(opts: { envFile?: string; testIds?: Set<string>; readTabs?: ReadTabs; readFile?: (f: string) => string } = {}): Promise<ReportData> {
  const env = readSecretEnv(opts.envFile ?? DEFAULT_REPORT_ENV, [...SHEET_ENV_NAMES], { readFile: opts.readFile });
  const creds: SheetCreds = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY: env.GOOGLE_PRIVATE_KEY,
    GOOGLE_SPREADSHEET_ID: env.GOOGLE_SPREADSHEET_ID,
  };
  const tabs = await (opts.readTabs ?? readTabsLive)(creds);
  return sheetDataFromRows(tabs.orders, tabs.payments, opts.testIds ?? loadTestIds());
}
