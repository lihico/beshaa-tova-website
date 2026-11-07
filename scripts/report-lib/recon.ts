/**
 * Payment reconciliation and refunds (docs/attribution/marketing_machine_2026-11/PLAN.md Stage 3; decisions 12
 * and 13, approved 7.11.2026). Pure except `readGrowExportFile` (one local file read). No network, no sheet.
 *
 * Input: the Grow monthly export, CSV or XLSX, Hebrew or English headers. No real export has been seen yet
 * (PLAN.md section 8, UNVERIFIED), so the parser maps headers through the synonym lists in `GROW_FIELDS` and
 * finds the header row itself (an XLSX often has a title row above it). Expected columns, by meaning:
 *
 *   field            required  examples of accepted headers
 *   date             yes       תאריך, תאריך עסקה, תאריך תשלום, date, transaction date (may carry the time)
 *   amount           yes       סכום, סכום עסקה, סה"כ, amount, sum, total (gross, VAT included; refunds may be negative)
 *   time             no        שעה, time
 *   order_id         no        מזהה הזמנה, מספר הזמנה, cField1, שדה מותאם 1, order id
 *   description      no        תיאור, פירוט, שם מוצר, פרטים נוספים, description (scanned for a BT... order id)
 *   transaction_id   no        מזהה עסקה, מספר עסקה, קוד עסקה, transactionId, transaction code
 *   asmachta         no        אסמכתא, מספר אסמכתא, מספר אישור, approval number
 *   fee              no        עמלה, עמלות, עמלת סליקה, fee, commission
 *   net              no        נטו, סכום נטו, net
 *   type             no        סוג עסקה, סוג פעולה, type ("זיכוי" / "החזר" / refund marks a refund line)
 *   status           no        סטטוס, מצב, status (failed / declined lines are skipped)
 *   doc_number       no        מספר מסמך, מספר חשבונית, מספר קבלה, document number (on a refund line: the credit document)
 *   payment_method   no        אמצעי תשלום, סוג תשלום, payment method
 *
 * Columns with buyer data (שם, טלפון, מייל, כתובת) are never mapped and never read into a line.
 *
 * Matching (PLAN.md:205), three passes over all lines so a strong match is never taken by a weaker one:
 *   1. order id (the line's order id column or a BT id inside its description);
 *   2. transaction id = the order's grow_transaction_id, or asmachta = the order's asmachta;
 *   3. amount equal to the agora and the Grow date within 1 day of paid_at (or created_at), one candidate only.
 * Refund lines are matched by passes 1 and 2 only (a refund's date says nothing about the order).
 *
 * Money: revenue_net_ils = ex-VAT revenue after refunds, minus the Grow fee (the export's fee, else the
 * rate-card fee from api/_cost_table.ts, marked fee_est in recon_source). Decision 11: costs are ex-VAT.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import { toSheetColumns, type OrderRecord } from "../../api/_attribution_core.ts";
import { growFee, revenueExVat } from "../../api/_cost_table.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Refunds and revenue (shared with build.ts and join.ts)
// ---------------------------------------------------------------------------------------------

/** The gross amount an order was paid (paid_amount, else the expected amount). */
export const grossPaidOf = (o: Pick<OrderRecord, "paid_amount" | "amount_expected">): number =>
  Number(o.paid_amount ?? o.amount_expected) || 0;

/** Refunded total in ILS (gross), 0 when none. */
export const refundOf = (o: Pick<OrderRecord, "refund_amount">): number => Math.max(0, Number(o.refund_amount) || 0);

/** Fully refunded: the status says so, or the refunds cover the whole amount paid. */
export function isRefunded(o: Pick<OrderRecord, "payment_status" | "refund_amount" | "paid_amount" | "amount_expected">): boolean {
  if (o.payment_status === "refunded") return true;
  const r = refundOf(o);
  return r > 0 && r >= grossPaidOf(o) - 0.005;
}

/** Revenue of a paid order: paid_amount - refund_amount (never below 0); 0 when not paid or fully refunded. */
export function netRevenueOf(o: Pick<OrderRecord, "payment_status" | "refund_amount" | "paid_amount" | "amount_expected">): number {
  if (o.payment_status !== "paid" || isRefunded(o)) return 0;
  return round2(Math.max(0, grossPaidOf(o) - refundOf(o)));
}

/** ex-VAT revenue after refunds minus the fee, to the agora. */
export function revenueNet(gross: number, refund: number, fee: number): number {
  return round2(revenueExVat(Math.max(0, gross - refund)) - (fee || 0));
}

// ---------------------------------------------------------------------------------------------
// Text decoding and delimited text
// ---------------------------------------------------------------------------------------------

/** UTF-8 (with or without BOM), else Windows-1255 (Hebrew Excel CSV), else latin1. */
export function decodeText(buf: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); } catch { /* not UTF-8 */ }
  try { return new TextDecoder("windows-1255").decode(buf); } catch { return Buffer.from(buf).toString("latin1"); }
}

/** CSV / TSV / semicolon text to rows; the delimiter is the most common of , ; tab on the first non-empty line. */
export function parseDelimited(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const count = (ch: string) => first.split(ch).length - 1;
  const delim = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"' && field === "") q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------------------------
// XLSX (a zip of XML files), no dependency: the first worksheet as rows of strings
// ---------------------------------------------------------------------------------------------

const MAX_ENTRY_BYTES = 50 * 1024 * 1024;

/** The files of a zip archive (stored or deflated entries), by name. */
export function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip file (no end of central directory)");
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip central directory");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (size > MAX_ENTRY_BYTES) throw new Error(`zip entry too large: ${name}`);
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error("bad zip local header");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compSize);
    if (method === 0) out.set(name, Buffer.from(raw));
    else if (method === 8) out.set(name, zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }));
    // other methods are skipped
  }
  return out;
}

function xmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** All <t> texts inside a fragment, joined (rich-text runs); phonetic runs (<rPh>) are dropped. */
function joinT(fragment: string): string {
  const clean = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let s = "";
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += xmlText(m[1]);
  return s;
}

function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/i.exec(ref)?.[1]?.toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** The first worksheet (workbook order) of an .xlsx as rows of cell strings. */
export function parseXlsx(buf: Buffer): string[][] {
  const files = unzip(buf);
  const get = (n: string) => files.get(n)?.toString("utf8") ?? null;
  const shared: string[] = [];
  const sst = get("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(joinT(m[1]));

  let sheetPath: string | null = null;
  const wb = get("xl/workbook.xml"), rels = get("xl/_rels/workbook.xml.rels");
  const rid = wb ? /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1] : null;
  if (rid && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`));
    const target = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : null;
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  if (!sheetPath || !files.has(sheetPath)) {
    sheetPath = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]))[0] ?? null;
  }
  const xml = sheetPath ? get(sheetPath) : null;
  if (!xml) throw new Error("the xlsx has no worksheet");

  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    let next = 0;
    for (const cm of (rm[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1];
      const idx = ref ? colIndex(ref) : next;
      next = idx + 1;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val = "";
      if (type === "s") val = shared[Number(v)] ?? "";
      else if (type === "inlineStr") val = joinT(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? "");
      else val = v !== undefined ? xmlText(v) : "";
      while (row.length < idx) row.push("");
      row[idx] = val;
    }
    if (row.some((x) => x.trim() !== "")) rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------------------------

export type GrowField =
  | "date" | "time" | "amount" | "order_id" | "description" | "transaction_id" | "asmachta"
  | "fee" | "net" | "type" | "status" | "doc_number" | "payment_method";

/** Accepted headers per field (compared after `normHeader`). Exact matches only, so "סכום נטו" never reads as "סכום". */
export const GROW_FIELDS: Record<GrowField, string[]> = {
  date: ["תאריך", "תאריך עסקה", "תאריך העסקה", "תאריך תשלום", "תאריך ושעה", "תאריך יצירה", "מועד עסקה", "מועד", "date", "transaction date", "payment date", "created", "created at", "paymentdate", "datetime"],
  time: ["שעה", "שעת עסקה", "time"],
  amount: ["סכום", "סכום עסקה", "סכום העסקה", "סכום כולל", "סכום ברוטו", "סכום כולל מעמ", "סהכ", "סהכ לתשלום", "סכום לתשלום", "amount", "sum", "total", "gross", "transaction amount"],
  order_id: ["order id", "order_id", "orderid", "מזהה הזמנה", "מספר הזמנה", "קוד הזמנה", "cfield1", "שדה מותאם 1", "שדה מותאם אישית 1", "custom field 1", "שדה נוסף 1"],
  description: ["תיאור", "תיאור עסקה", "פירוט", "פרטים", "פרטים נוספים", "פרטי עסקה", "שם מוצר", "מוצר", "פריט", "שם פריט", "תיאור פריט", "הערות", "description", "details", "product", "product name", "item", "notes", "comments"],
  transaction_id: ["מזהה עסקה", "מספר עסקה", "קוד עסקה", "מזהה תשלום", "מספר תשלום", "transactionid", "transaction id", "transaction_id", "transaction code", "transactioncode", "payment id"],
  asmachta: ["אסמכתא", "מספר אסמכתא", "אסמכתה", "מספר אישור", "אישור", "קוד אישור", "asmachta", "approval", "approval number", "approval code", "authorization", "auth code"],
  fee: ["עמלה", "עמלות", "עמלת סליקה", "עמלת עסקה", "fee", "fees", "commission", "processing fee"],
  net: ["נטו", "סכום נטו", "net", "net amount"],
  type: ["סוג עסקה", "סוג העסקה", "סוג פעולה", "סוג תנועה", "פעולה", "type", "transaction type"],
  status: ["סטטוס", "סטטוס עסקה", "מצב", "מצב עסקה", "status"],
  doc_number: ["מספר מסמך", "מס מסמך", "מספר חשבונית", "מספר קבלה", "מספר חשבונית מס קבלה", "מסמך", "document number", "document", "invoice number", "receipt number", "doc number"],
  payment_method: ["אמצעי תשלום", "סוג תשלום", "שיטת תשלום", "payment method", "payment type", "method"],
};

/** Lower case, no quotes / geresh / gershayim / apostrophes, no parentheses part, no currency signs, single spaces. */
export function normHeader(h: string): string {
  return String(h ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/["'`׳״‘’“”]/g, "")
    .replace(/[₪$€:*.]/g, " ")
    .replace(/[_\-/]+/g, (m) => (m.includes("_") ? "_" : " "))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const SYN = new Map<string, GrowField>();
for (const [field, list] of Object.entries(GROW_FIELDS) as Array<[GrowField, string[]]>) {
  for (const h of list) if (!SYN.has(normHeader(h))) SYN.set(normHeader(h), field);
}

export type HeaderMap = Partial<Record<GrowField, number>>;

/** Maps one header row (first column wins for a field seen twice). */
export function mapHeaders(row: string[]): HeaderMap {
  const m: HeaderMap = {};
  row.forEach((h, i) => {
    const f = SYN.get(normHeader(h));
    if (f && m[f] === undefined) m[f] = i;
  });
  return m;
}

/** The header row: the first of the first 15 rows that maps both date and amount. */
export function findHeaderRow(rows: string[][]): { index: number; map: HeaderMap } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const map = mapHeaders(rows[i]);
    if (map.date !== undefined && map.amount !== undefined) return { index: i, map };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

/** "₪1,234.50", "1,234.50 ₪", "-349", "349-", "(349)", "349.00 ש"ח" -> number; null when not a number. */
export function parseAmount(v: unknown): number | null {
  let s = String(v ?? "").replace(/[‎‏‪-‮\s]/g, "").replace(/₪|ש"ח|ש״ח|שח|ils|nis/gi, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

function israelOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(utcMs / 1000) * 1000;
}

/** Israel wall-clock time to an ISO instant (DST handled). */
export function israelLocalToIso(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let ms = guess - israelOffsetMs(guess);
  const off2 = israelOffsetMs(ms);
  ms = guess - off2;
  return new Date(ms).toISOString();
}

/**
 * A Grow date cell (+ optional time cell) to an ISO instant, Israel time. Accepts DD/MM/YYYY, DD.MM.YY,
 * DD-MM-YYYY, YYYY-MM-DD, each with an optional HH:MM[:SS], an ISO string with a zone, and an Excel serial.
 * Day first: Israeli exports never use month first.
 */
export function parseGrowDate(v: unknown, time?: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const tm = (src: string) => /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(src);
  const withTime = (y: number, mo: number, d: number, rest: string): string | null => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
    const t = tm(rest) ?? tm(String(time ?? ""));
    return israelLocalToIso(y, mo, d, t ? Number(t[1]) : 12, t ? Number(t[2]) : 0, t && t[3] ? Number(t[3]) : 0);
  };
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/.exec(s);
  if (m) return withTime(Number(m[1]), Number(m[2]), Number(m[3]), m[4]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)(.*)$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return withTime(y, Number(m[2]), Number(m[1]), m[4]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial < 36526 || serial > 73051) return null;                 // 2000-01-01 .. 2100-01-01
    const whole = Math.floor(serial), frac = serial - whole;
    const day = new Date(Date.UTC(1899, 11, 30) + whole * 86_400_000);
    let secs = Math.round(frac * 86_400);
    if (!frac) { const t = tm(String(time ?? "")); secs = t ? Number(t[1]) * 3600 + Number(t[2]) * 60 + (t[3] ? Number(t[3]) : 0) : 12 * 3600; }
    return israelLocalToIso(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60);
  }
  return null;
}

export function israelDay(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(ms));
}

/** Whole days between two YYYY-MM-DD dates (absolute); Infinity when either is missing. */
export function dayGap(a: string, b: string): number {
  if (!a || !b) return Infinity;
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

const ORDER_ID_IN_TEXT = /BT\d{4}[0-9A-HJKMNP-TV-Z]{6}/;
const ORDER_ID_EXACT = /^BT\d{4}[0-9A-HJKMNP-TV-Z]{6}$/;
const REFUND_RE = /זיכוי|החזר|ביטול עסקה|בוטל|\brefund|\bcredit\b(?!\s*card)|chargeback|reversal/i;
const FAILED_RE = /נכשל|נדח|שגיא|לא אושר|failed|declin|error|rejected/i;

/** A short code-like id (transaction id, asmachta, document number): letters, digits, - _ . only, at most 64. */
function idCell(v: unknown): string | null {
  let s = String(v ?? "").trim().replace(/^'/, "");
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");              // XLSX numbers come back as "12345.0"
  return /^[A-Za-z0-9._-]{1,64}$/.test(s) ? s : null;
}
function shortCode(v: unknown, max = 30): string | null {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
}

// ---------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------

export interface GrowLine {
  line: number;                      // 1-based row number in the file (the header row counts)
  kind: "charge" | "refund" | "failed";
  order_id: string | null;
  transaction_id: string | null;
  asmachta: string | null;
  paid_at: string | null;            // ISO instant
  date: string;                      // YYYY-MM-DD, Israel
  amount: number;                    // gross ILS, always positive (refund lines too)
  fee: number | null;                // positive
  net: number | null;
  doc_number: string | null;
  payment_method: string | null;
}

export interface GrowExport {
  lines: GrowLine[];
  header_row: number;                // 1-based
  mapped: Partial<Record<GrowField, string>>;     // field -> the header as written
  skipped: Array<{ line: number; reason: string }>;
  range: { from: string | null; to: string | null };
}

export class GrowExportError extends Error {}

/** Rows (from CSV or XLSX) to Grow lines. Throws GrowExportError when no header row maps date and amount. */
export function growLinesFromRows(rows: string[][]): GrowExport {
  const head = findHeaderRow(rows);
  if (!head) {
    throw new GrowExportError(
      "no header row with a date and an amount column in the first 15 rows; expected headers like תאריך and סכום (see GROW_FIELDS in scripts/report-lib/recon.ts)",
    );
  }
  const { index, map } = head;
  const cell = (r: string[], f: GrowField) => (map[f] === undefined ? "" : String(r[map[f] as number] ?? ""));
  const mapped: GrowExport["mapped"] = {};
  for (const [f, i] of Object.entries(map) as Array<[GrowField, number]>) mapped[f] = rows[index][i];
  const lines: GrowLine[] = [];
  const skipped: GrowExport["skipped"] = [];
  for (let i = index + 1; i < rows.length; i++) {
    const r = rows[i], line = i + 1;
    const amt = parseAmount(cell(r, "amount"));
    const paid_at = parseGrowDate(cell(r, "date"), cell(r, "time"));
    if (amt === null || !paid_at) {
      // totals rows ("סה"כ") and blank tails are expected; they carry no date
      skipped.push({ line, reason: amt === null ? "no_amount" : "no_date" });
      continue;
    }
    if (amt === 0) { skipped.push({ line, reason: "zero_amount" }); continue; }
    const typeText = `${cell(r, "type")} ${cell(r, "status")}`;
    const kind: GrowLine["kind"] = FAILED_RE.test(cell(r, "status")) ? "failed" : amt < 0 || REFUND_RE.test(typeText) ? "refund" : "charge";
    const direct = idCell(cell(r, "order_id"));
    const fromText = ORDER_ID_IN_TEXT.exec(`${cell(r, "order_id")} ${cell(r, "description")}`)?.[0] ?? null;
    const fee = parseAmount(cell(r, "fee"));
    const net = parseAmount(cell(r, "net"));
    lines.push({
      line, kind,
      order_id: direct && ORDER_ID_EXACT.test(direct.toUpperCase()) ? direct.toUpperCase() : fromText,
      transaction_id: idCell(cell(r, "transaction_id")), asmachta: idCell(cell(r, "asmachta")),
      paid_at, date: israelDay(paid_at), amount: round2(Math.abs(amt)),
      fee: fee === null ? null : round2(Math.abs(fee)), net: net === null ? null : round2(net),
      doc_number: idCell(cell(r, "doc_number")), payment_method: shortCode(cell(r, "payment_method")),
    });
  }
  const days = lines.map((l) => l.date).filter(Boolean).sort();
  return { lines, header_row: index + 1, mapped, skipped, range: { from: days[0] ?? null, to: days[days.length - 1] ?? null } };
}

export function parseGrowExport(buf: Buffer, fileName: string): GrowExport {
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (/\.xls$/i.test(fileName) && !isZip) throw new GrowExportError("old .xls files are not read; save the export as .xlsx or .csv");
  const rows = isZip ? parseXlsx(buf) : parseDelimited(decodeText(buf));
  return growLinesFromRows(rows);
}

export function readGrowExportFile(file: string): GrowExport {
  return parseGrowExport(fs.readFileSync(file), file);
}

// ---------------------------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------------------------

export type ReconStatus =
  | "matched"            // Grow charge found, same amount, the sheet says paid
  | "amount_mismatch"    // Grow charge found, another amount
  | "sheet_not_paid"     // Grow charge found, the sheet still says pending / cancelled
  | "not_in_export"      // the sheet says paid inside the export's dates, no Grow charge found
  | "refunded"           // refunds cover the whole amount
  | "partial_refund";    // part refunded; revenue is lower (decision 13)

/** Statuses that need no action (the dashboard health strip shows the others in red). */
export const RECON_OK = new Set<string>(["matched", "refunded", "partial_refund"]);

export type LineMatch = "order_id" | "transaction_id" | "asmachta" | "amount_date";

/** The order columns reconcile-payments writes (all appended to the sheet headers in Stage 3). */
export const RECON_COLUMNS = [
  "grow_paid_at", "revenue_net_ils", "fee_ils", "refund_amount", "refunded_at", "credit_doc_number",
  "recon_status", "recon_source", "recon_at",
] as const;

export type ReconPatch = Partial<Pick<OrderRecord,
  "grow_paid_at" | "revenue_net_ils" | "fee_ils" | "refund_amount" | "refunded_at" | "credit_doc_number" |
  "recon_status" | "recon_source" | "recon_at" | "invoice_number" | "payment_status">>;

export interface ReconRow {
  order_id: string;
  status: ReconStatus;
  method: LineMatch | null;
  line: number | null;
  refund_lines: number[];
  sheet_status: string;
  sheet_amount: number;
  grow_amount: number | null;
  grow_date: string | null;
  fee: number | null;
  fee_estimated: boolean;
  refund_total: number;
  notes: string[];
  /** Only the columns whose value changes (empty = nothing to write). */
  patch: ReconPatch;
}

export interface UnmatchedLine { line: number; kind: GrowLine["kind"]; date: string; amount: number; reason: string; candidates: string[] }

export interface ReconResult {
  range: { from: string | null; to: string | null };
  rows: ReconRow[];
  unmatched: UnmatchedLine[];
  counts: Record<string, number>;
  lines: { charges: number; refunds: number; failed: number; skipped: number };
}

type ReconOrder = OrderRecord;

/** The columns of `patch` whose sheet value differs from the order's (recon_at alone never counts). */
export function changedPatch(o: ReconOrder, patch: ReconPatch): ReconPatch {
  const before = toSheetColumns(o) as Record<string, string>;
  const after = toSheetColumns({ ...o, ...patch } as OrderRecord) as Record<string, string>;
  const out: ReconPatch = {};
  for (const k of Object.keys(patch) as Array<keyof ReconPatch>) {
    if (before[k] !== after[k]) (out as Record<string, unknown>)[k] = patch[k];
  }
  const keys = Object.keys(out);
  if (keys.length === 1 && keys[0] === "recon_at") return {};
  return out;
}

export interface ReconOptions { now: Date; source?: string; from?: string | null; to?: string | null }

/**
 * Matches the export to the orders and proposes the column values per order. Orders that are free
 * (redeem) or 0 ILS are left out. Pure.
 */
export function reconcile(orders: ReconOrder[], exp: GrowExport, opt: ReconOptions): ReconResult {
  const nowIso = opt.now.toISOString();
  const src = opt.source ?? "grow_export";
  const range = { from: opt.from ?? exp.range.from, to: opt.to ?? exp.range.to };
  const inRange = (d: string) => !!d && (!range.from || d >= range.from) && (!range.to || d <= range.to);
  const payable = orders.filter((o) => o.payment_status !== "free" && grossPaidOf(o) > 0);
  const byId = new Map(payable.map((o) => [o.order_id.toUpperCase(), o]));
  const charges = exp.lines.filter((l) => l.kind === "charge" && inRange(l.date));
  const refunds = exp.lines.filter((l) => l.kind === "refund");
  const charged = new Map<string, { line: GrowLine; method: LineMatch }>();
  const used = new Set<number>();
  const unmatched: UnmatchedLine[] = [];

  const byTxn = (l: GrowLine): { o: ReconOrder; method: LineMatch } | null => {
    if (l.transaction_id) {
      const o = payable.find((x) => x.grow_transaction_id && x.grow_transaction_id === l.transaction_id);
      if (o) return { o, method: "transaction_id" };
    }
    if (l.asmachta) {
      const o = payable.find((x) => x.asmachta && x.asmachta === l.asmachta);
      if (o) return { o, method: "asmachta" };
    }
    return null;
  };
  const take = (l: GrowLine, o: ReconOrder, method: LineMatch) => {
    if (charged.has(o.order_id)) {
      unmatched.push({ line: l.line, kind: l.kind, date: l.date, amount: l.amount, reason: "second_charge_for_order", candidates: [o.order_id] });
    } else charged.set(o.order_id, { line: l, method });
    used.add(l.line);
  };

  // Pass 1: order id
  for (const l of charges) {
    const o = l.order_id ? byId.get(l.order_id) : undefined;
    if (o) take(l, o, "order_id");
  }
  // Pass 2: transaction id, asmachta
  for (const l of charges) {
    if (used.has(l.line)) continue;
    const hit = byTxn(l);
    if (hit) take(l, hit.o, hit.method);
  }
  // Pass 3: amount + date within 1 day, a single candidate
  for (const l of charges) {
    if (used.has(l.line)) continue;
    const cands = payable.filter((o) =>
      !charged.has(o.order_id) &&
      Math.abs(grossPaidOf(o) - l.amount) < 0.005 &&
      dayGap(israelDay(o.paid_at || o.created_at), l.date) <= 1 &&
      !(o.grow_transaction_id && l.transaction_id && o.grow_transaction_id !== l.transaction_id));
    if (cands.length === 1) take(l, cands[0], "amount_date");
    else {
      used.add(l.line);
      const reason = l.order_id ? "order_id_not_in_sheet" : cands.length > 1 ? "ambiguous" : "no_order";
      unmatched.push({ line: l.line, kind: l.kind, date: l.date, amount: l.amount, reason, candidates: cands.map((c) => c.order_id).sort() });
    }
  }

  // Refund lines: order id, then transaction id / asmachta (also the line of the original charge).
  const refundsBy = new Map<string, GrowLine[]>();
  for (const l of refunds) {
    let o = l.order_id ? byId.get(l.order_id) : undefined;
    if (!o) o = byTxn(l)?.o;
    if (!o && (l.transaction_id || l.asmachta)) {
      const ch = exp.lines.find((c) => c.kind === "charge" && ((l.transaction_id && c.transaction_id === l.transaction_id) || (l.asmachta && c.asmachta === l.asmachta)));
      const owner = ch ? [...charged.entries()].find(([, v]) => v.line.line === ch.line)?.[0] : undefined;
      if (owner) o = byId.get(owner.toUpperCase());
    }
    if (!o) { unmatched.push({ line: l.line, kind: l.kind, date: l.date, amount: l.amount, reason: "refund_no_order", candidates: [] }); continue; }
    refundsBy.set(o.order_id, [...(refundsBy.get(o.order_id) ?? []), l]);
  }

  const rows: ReconRow[] = [];
  const ids = new Set<string>([...charged.keys(), ...refundsBy.keys()]);
  for (const o of payable) {
    if (o.payment_status === "paid" && !ids.has(o.order_id) && inRange(israelDay(o.paid_at || o.created_at))) ids.add(o.order_id);
  }
  for (const id of [...ids].sort()) {
    const o = payable.find((x) => x.order_id === id) as ReconOrder;
    const hit = charged.get(id) ?? null;
    const rl = refundsBy.get(id) ?? [];
    const sheetAmount = grossPaidOf(o);
    const gross = hit ? hit.line.amount : sheetAmount;
    const notes: string[] = [];
    const patch: ReconPatch = { recon_at: nowIso };
    let status: ReconStatus;
    let fee: number | null = null, feeEst = false;

    if (hit) {
      fee = hit.line.fee ?? null;
      if (fee === null) { fee = growFee(gross); feeEst = true; }
      patch.grow_paid_at = hit.line.paid_at;
      patch.fee_ils = fee;
      if (hit.line.doc_number) {
        if (!o.invoice_number) patch.invoice_number = hit.line.doc_number;
        else if (o.invoice_number !== hit.line.doc_number) notes.push("invoice_number_differs");
      }
      if (o.payment_status === "pending" || o.payment_status === "cancelled") status = "sheet_not_paid";
      else if (Math.abs(gross - sheetAmount) >= 0.005) status = "amount_mismatch";
      else status = "matched";
      if (o.grow_transaction_id && hit.line.transaction_id && o.grow_transaction_id !== hit.line.transaction_id) notes.push("transaction_id_differs");
    } else if (rl.length) {
      status = "matched";                // refund only (the charge is in another month's export)
      fee = o.fee_ils ?? null;
    } else {
      status = "not_in_export";
      if (o.match_method === "manual") notes.push("marked_paid_by_hand");
    }

    let refundTotal = refundOf(o);
    if (rl.length) {
      refundTotal = round2(rl.reduce((s, l) => s + l.amount, 0));
      const last = [...rl].sort((a, b) => (a.paid_at ?? "").localeCompare(b.paid_at ?? "")).pop() as GrowLine;
      patch.refund_amount = refundTotal;
      patch.refunded_at = last.paid_at;
      const doc = rl.map((l) => l.doc_number).filter(Boolean).join(",");
      if (doc) patch.credit_doc_number = doc.slice(0, 64);
      if (refundTotal >= gross - 0.005) {
        status = "refunded";
        if (o.payment_status === "paid") patch.payment_status = "refunded";
      } else if (status === "matched") status = "partial_refund";
      if (refundTotal > gross + 0.005) notes.push("refund_above_amount");
    }
    if (hit || rl.length) {
      const f = fee ?? 0;
      patch.revenue_net_ils = status === "refunded" ? round2(-f) : revenueNet(gross, refundTotal, f);
    }
    patch.recon_status = status;
    patch.recon_source = `${src}:${hit ? hit.method : rl.length ? "refund" : "none"}${feeEst ? ":fee_est" : ""}`;
    rows.push({
      order_id: id, status, method: hit?.method ?? null, line: hit?.line.line ?? null, refund_lines: rl.map((l) => l.line),
      sheet_status: o.payment_status, sheet_amount: sheetAmount, grow_amount: hit ? hit.line.amount : null,
      grow_date: hit ? hit.line.date : null, fee, fee_estimated: feeEst, refund_total: refundTotal, notes,
      patch: changedPatch(o, patch),
    });
  }

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  if (unmatched.length) counts.unmatched_lines = unmatched.length;
  return {
    range, rows, unmatched: unmatched.sort((a, b) => a.line - b.line), counts,
    lines: {
      charges: exp.lines.filter((l) => l.kind === "charge").length, refunds: refunds.length,
      failed: exp.lines.filter((l) => l.kind === "failed").length, skipped: exp.skipped.length,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// A refund by hand (decision 13): the script proposes, --apply writes
// ---------------------------------------------------------------------------------------------

export class RefundError extends Error {}

export interface RefundProposal { order_id: string; paid: number; refund_total: number; full: boolean; status_after: string; patch: ReconPatch }

/**
 * `amount` is the refund being recorded now; it adds to any refund already on the order. A full refund
 * sets payment_status refunded; a partial one keeps paid with a lower revenue.
 */
export function proposeRefund(o: ReconOrder | null, amount: number, opt: { now: Date; at?: string | null; creditDoc?: string | null }): RefundProposal {
  if (!o) throw new RefundError("no such order (tests are never refunded here)");
  if (!(Number.isFinite(amount) && amount > 0)) throw new RefundError("--amount must be a positive number of ILS");
  if (o.payment_status !== "paid" && o.payment_status !== "refunded") throw new RefundError(`order ${o.order_id} is ${o.payment_status}, not paid`);
  if (o.payment_status === "refunded") throw new RefundError(`order ${o.order_id} is already fully refunded`);
  const paid = grossPaidOf(o);
  const total = round2(refundOf(o) + amount);
  if (total > paid + 0.005) throw new RefundError(`refunds would total ${total}, more than the ${paid} paid`);
  const full = total >= paid - 0.005;
  const fee = o.fee_ils ?? growFee(paid);
  const patch: ReconPatch = {
    refund_amount: total, refunded_at: opt.at ?? opt.now.toISOString(),
    recon_status: full ? "refunded" : "partial_refund", recon_source: "manual_refund", recon_at: opt.now.toISOString(),
    revenue_net_ils: full ? round2(-fee) : revenueNet(paid, total, fee),
  };
  if (opt.creditDoc) patch.credit_doc_number = opt.creditDoc;
  if (full) patch.payment_status = "refunded";
  return { order_id: o.order_id, paid, refund_total: total, full, status_after: full ? "refunded" : "paid", patch };
}

// ---------------------------------------------------------------------------------------------
// Printing (order ids, dates and amounts only)
// ---------------------------------------------------------------------------------------------

const pad = (s: unknown, n: number) => String(s ?? "").padEnd(n).slice(0, Math.max(n, String(s ?? "").length));

export function renderRecon(r: ReconResult, exp: GrowExport): string {
  const out: string[] = [];
  out.push(`export dates ${r.range.from ?? "?"} .. ${r.range.to ?? "?"}; header row ${exp.header_row}; columns: ${Object.keys(exp.mapped).join(", ")}`);
  out.push(`lines: ${r.lines.charges} charges, ${r.lines.refunds} refunds, ${r.lines.failed} failed, ${r.lines.skipped} skipped`);
  out.push("");
  out.push([pad("order_id", 14), pad("status", 16), pad("match", 15), pad("line", 5), pad("sheet", 9), pad("sheet_ils", 9), pad("grow_ils", 9), pad("grow_date", 11), pad("fee", 7), pad("refund", 7), "writes"].join(" "));
  for (const x of r.rows) {
    const writes = Object.keys(x.patch).filter((k) => k !== "recon_at");
    out.push([
      pad(x.order_id, 14), pad(x.status, 16), pad(x.method ?? "-", 15), pad(x.line ?? "-", 5), pad(x.sheet_status, 9),
      pad(x.sheet_amount, 9), pad(x.grow_amount ?? "-", 9), pad(x.grow_date ?? "-", 11),
      pad(x.fee === null ? "-" : `${x.fee}${x.fee_estimated ? "*" : ""}`, 7), pad(x.refund_total || "-", 7),
      writes.length ? writes.join(",") : "(no change)",
    ].join(" ") + (x.notes.length ? `  [${x.notes.join(",")}]` : ""));
  }
  if (!r.rows.length) out.push("(no orders in range)");
  if (r.unmatched.length) {
    out.push("");
    out.push("Grow lines with no order:");
    for (const u of r.unmatched) out.push(`  line ${u.line} ${u.kind} ${u.date} ${u.amount} ${u.reason}${u.candidates.length ? ` (${u.candidates.join(",")})` : ""}`);
  }
  out.push("");
  out.push(`counts: ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}   (* = fee from the rate card, not the export)`);
  return out.join("\n") + "\n";
}
