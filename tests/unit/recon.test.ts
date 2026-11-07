/**
 * PLAN.md marketing_machine_2026-11 Stage 3, reconciliation and refunds: scripts/report-lib/recon.ts,
 * scripts/reconcile-payments.ts, the refund rule in report-lib/build.ts and join.ts, and the recon item of the
 * dashboard health strip. Offline: the sheet read and the writer are injected; no network, no live sheet.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseTouch, SHEET_ATTRIBUTION_HEADERS, toSheetColumns, type OrderRecord } from "../../api/_attribution_core.ts";
import { rowToOrder } from "../../api/_store_sheet.ts";
import { buildReport, revenueOf } from "../../scripts/report-lib/build.ts";
import { joinSpend, type InsightRow } from "../../scripts/report-lib/join.ts";
import {
  dayGap, decodeText, findHeaderRow, growLinesFromRows, isRefunded, mapHeaders, netRevenueOf, normHeader, parseAmount,
  parseDelimited, parseGrowDate, parseGrowExport, parseXlsx, proposeRefund, RECON_COLUMNS, reconcile, RefundError, renderRecon,
  type GrowExport, type ReconPatch,
} from "../../scripts/report-lib/recon.ts";
import { ApplyRefused, ArgError, checkHeaders, parseArgs, run, type OrderWriter } from "../../scripts/reconcile-payments.ts";
import { buildDashboard } from "../../scripts/dashboard-data.ts";
import type { ReportData } from "../../scripts/report-lib/load.ts";

const WEBSITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FX_DIR = path.join(WEBSITE, "scripts", "report-lib", "fixtures");
const CSV_FX = path.join(FX_DIR, "grow_export_sample.csv");
const ORDERS_FX = path.join(FX_DIR, "grow_orders_sample.json");
const NOW = new Date("2026-12-01T08:00:00.000Z");
const fxOrders = (): OrderRecord[] => (JSON.parse(fs.readFileSync(ORDERS_FX, "utf8")) as { orders: OrderRecord[] }).orders;
const fxExport = (): GrowExport => parseGrowExport(fs.readFileSync(CSV_FX), CSV_FX);
const BUYER_WORDS = ["לקוחה לדוגמה", "לקוח לדוגמה"];

function order(p: Partial<OrderRecord> & { order_id: string }): OrderRecord {
  const base = fxOrders()[0];
  return { ...base, paid_amount: 349, amount_expected: 349, payment_status: "paid", paid_at: "2026-11-05T08:00:00.000Z", ...p };
}

// ---------------------------------------------------------------------------------------------
// A tiny xlsx writer (deflated entries) so the parser is tested on a real zip
// ---------------------------------------------------------------------------------------------

function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, "utf8");
    const comp = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, comp);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colName = (i: number) => String.fromCharCode(65 + i);

/** Rows to an xlsx: text as shared strings, numbers as numbers, the first column of data rows as Excel serials. */
function xlsx(rows: Array<Array<string | number>>): Buffer {
  const sst: string[] = [];
  const si = (s: string) => { let i = sst.indexOf(s); if (i < 0) { sst.push(s); i = sst.length - 1; } return i; };
  const body = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
    if (v === "") return "";
    const ref = `${colName(ci)}${ri + 1}`;
    return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${si(v)}</v></c>`;
  }).join("") + "</row>").join("");
  return zip({
    "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="עסקאות" sheetId="1" r:id="rId7"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Id="rId7" Type="worksheet" Target="worksheets/sheet3.xml"/></Relationships>`,
    "xl/worksheets/sheet3.xml": `<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>wrong sheet</t></is></c></row></sheetData></worksheet>`,
    "xl/sharedStrings.xml": `<?xml version="1.0"?><sst>${sst.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`,
  });
}

// ---------------------------------------------------------------------------------------------

describe("recon: values and headers", () => {
  test("amounts in the usual Grow / Excel spellings", () => {
    assert.equal(parseAmount("349"), 349);
    assert.equal(parseAmount("₪1,234.50"), 1234.5);
    assert.equal(parseAmount("1,234.50 ₪"), 1234.5);
    assert.equal(parseAmount("-349.00"), -349);
    assert.equal(parseAmount("349-"), -349);
    assert.equal(parseAmount("(100)"), -100);
    assert.equal(parseAmount('349 ש"ח'), 349);
    assert.equal(parseAmount("349,90"), 349.9);
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount('סה"כ'), null);
  });
  test("dates: day first, 2- and 4-digit years, time column, ISO, Excel serial, Israel DST", () => {
    assert.equal(parseGrowDate("05/11/2026", "10:15"), "2026-11-05T08:15:00.000Z");     // winter, UTC+2
    assert.equal(parseGrowDate("05.11.26 10:15"), "2026-11-05T08:15:00.000Z");
    assert.equal(parseGrowDate("15/07/2026 10:00"), "2026-07-15T07:00:00.000Z");      // summer, UTC+3
    assert.equal(parseGrowDate("2026-11-05"), "2026-11-05T10:00:00.000Z");            // no time: noon Israel
    assert.equal(parseGrowDate("2026-11-05T08:15:00Z"), "2026-11-05T08:15:00.000Z");
    assert.equal(parseGrowDate("46331.4270833333"), "2026-11-05T08:15:00.000Z");     // Excel serial with time
    assert.equal(parseGrowDate("13/13/2026"), null);
    assert.equal(parseGrowDate('סה"כ'), null);
    assert.equal(dayGap("2026-11-05", "2026-11-06"), 1);
    assert.equal(dayGap("2026-11-05", ""), Infinity);
  });
  test("header synonyms: exact after normalising, so 'סכום נטו' is net and never the amount", () => {
    assert.equal(normHeader(' סכום (₪) '), "סכום");
    assert.equal(normHeader('סה"כ'), "סהכ");
    const m = mapHeaders(["סכום נטו", "Transaction ID", "סכום (₪)", "מס' מסמך", "אסמכתא", "תאריך עסקה", "שם לקוח", "טלפון", "מייל"]);
    assert.deepEqual(m, { net: 0, transaction_id: 1, amount: 2, doc_number: 3, asmachta: 4, date: 5 });
    const en = mapHeaders(["Date", "Amount", "Fee", "Order ID", "Status", "Type", "Document number"]);
    assert.deepEqual(en, { date: 0, amount: 1, fee: 2, order_id: 3, status: 4, type: 5, doc_number: 6 });
  });
  test("the header row is found below a title row; no date+amount header is an error", () => {
    assert.equal(findHeaderRow([["דוח עסקאות"], ["תאריך", "סכום"]])?.index, 1);
    assert.throws(() => growLinesFromRows([["שם", "טלפון"], ["x", "y"]]), /no header row/);
  });
  test("CSV: UTF-8 with BOM, Windows-1255, semicolons", () => {
    const he = "תאריך;סכום\n05/11/2026;349\n";
    const cp1255 = new Uint8Array([...he].map((ch) => { const c = ch.charCodeAt(0); return c >= 0x5d0 && c <= 0x5ea ? c - 0x5d0 + 0xe0 : c; }));
    assert.equal(decodeText(cp1255), he);
    assert.deepEqual(parseDelimited(decodeText(cp1255)), [["תאריך", "סכום"], ["05/11/2026", "349"]]);
    assert.deepEqual(parseDelimited('﻿a,"b,c"\r\n1,"2 ""x"""\r\n'), [["a", "b,c"], ["1", '2 "x"']]);
  });
});

describe("recon: the fixture export (CSV)", () => {
  const exp = fxExport();
  test("lines: kinds, ids, positive amounts, buyer columns not read", () => {
    assert.equal(exp.header_row, 2);
    assert.deepEqual(exp.range, { from: "2026-11-03", to: "2026-11-20" });
    assert.equal(exp.lines.filter((l) => l.kind === "charge").length, 7);
    assert.equal(exp.lines.filter((l) => l.kind === "refund").length, 2);
    assert.equal(exp.lines.filter((l) => l.kind === "failed").length, 1);
    const refund = exp.lines.find((l) => l.kind === "refund" && l.order_id === "BT2611FFFFF6");
    assert.equal(refund?.amount, 349);
    assert.equal(refund?.doc_number, "50010");
    assert.ok(!("payer_name" in exp.mapped) && !Object.keys(exp.mapped).some((k) => /name|phone|mail/.test(k)));
    for (const w of BUYER_WORDS) assert.ok(!JSON.stringify(exp).includes(w), "no buyer text in the parsed lines");
  });
  const r = reconcile(fxOrders(), exp, { now: NOW });
  const row = (id: string) => r.rows.find((x) => x.order_id === id);
  test("matching order: order id, then transaction id, then amount + date (±1 day)", () => {
    assert.equal(row("BT2611AAAAA1")?.method, "order_id");
    assert.equal(row("BT2611BBBBB2")?.method, "transaction_id");
    assert.equal(row("BT2611CCCCC3")?.method, "amount_date");
  });
  test("statuses", () => {
    assert.deepEqual(Object.fromEntries(r.rows.map((x) => [x.order_id, x.status])), {
      BT2611AAAAA1: "matched", BT2611BBBBB2: "matched", BT2611CCCCC3: "sheet_not_paid", BT2611DDDDD4: "amount_mismatch",
      BT2611EEEEE5: "not_in_export", BT2611FFFFF6: "refunded", BT2611GGGGG7: "partial_refund",
    });
    assert.ok(!row("BT2611HHHHH8"), "a free redeem is not reconciled");
    assert.deepEqual(r.unmatched.map((u) => [u.line, u.reason]), [[12, "no_order"]]);
  });
  test("patches: money, documents, refunds; only the 9 recon columns, invoice_number and payment_status", () => {
    const a = row("BT2611AAAAA1")?.patch as ReconPatch;
    assert.equal(a.grow_paid_at, "2026-11-05T08:15:00.000Z");
    assert.equal(a.fee_ils, 3.49);
    assert.equal(a.revenue_net_ils, 292.27);                 // 349 / 1.18 = 295.76, minus 3.49
    assert.equal(a.invoice_number, "50002");
    assert.equal(a.recon_source, "grow_export:order_id");
    assert.equal(a.recon_at, NOW.toISOString());
    const b = row("BT2611BBBBB2");
    assert.equal(b?.fee_estimated, true);
    assert.equal(b?.patch.fee_ils, 4.1);
    assert.equal(b?.patch.recon_source, "grow_export:transaction_id:fee_est");
    const f = row("BT2611FFFFF6")?.patch as ReconPatch;
    assert.equal(f.payment_status, "refunded");
    assert.equal(f.refund_amount, 349);
    assert.equal(f.credit_doc_number, "50010");
    assert.equal(f.refunded_at, "2026-11-15T08:00:00.000Z");
    assert.equal(f.revenue_net_ils, -3.49);
    const g = row("BT2611GGGGG7")?.patch as ReconPatch;
    assert.equal(g.payment_status, undefined, "a partial refund keeps the order paid");
    assert.equal(g.refund_amount, 100);
    assert.equal(g.revenue_net_ils, round2(290 / 1.18 - 3.9));
    const e = row("BT2611EEEEE5")?.patch as ReconPatch;
    assert.deepEqual(Object.keys(e).sort(), ["recon_at", "recon_source", "recon_status"]);
    const allowed = new Set<string>([...RECON_COLUMNS, "invoice_number", "payment_status"]);
    for (const x of r.rows) for (const k of Object.keys(x.patch)) assert.ok(allowed.has(k), k);
  });
  test("a second run over the written values changes nothing", () => {
    const after = fxOrders().map((o) => ({ ...o, ...(r.rows.find((x) => x.order_id === o.order_id)?.patch ?? {}) }) as OrderRecord);
    const again = reconcile(after, exp, { now: new Date("2026-12-02T08:00:00.000Z") });
    for (const x of again.rows) assert.deepEqual(x.patch, {}, x.order_id);
  });
  test("the printed table has order ids and no buyer data", () => {
    const text = renderRecon(r, exp);
    assert.match(text, /BT2611AAAAA1 +matched +order_id/);
    for (const w of BUYER_WORDS) assert.ok(!text.includes(w));
    assert.ok(!text.includes("@"));
  });
  test("two orders with the same amount on the same day: no guess, the line is listed as ambiguous", () => {
    const orders = [
      order({ order_id: "BT2611KKKKK1", payment_status: "pending", paid_amount: null, paid_at: null, created_at: "2026-11-08T10:00:00.000Z" }),
      order({ order_id: "BT2611KKKKK2", payment_status: "pending", paid_amount: null, paid_at: null, created_at: "2026-11-08T12:00:00.000Z" }),
    ];
    const res = reconcile(orders, growLinesFromRows([["תאריך", "סכום"], ["08/11/2026", "349"]]), { now: NOW });
    assert.equal(res.rows.length, 0);
    assert.deepEqual(res.unmatched[0].candidates, ["BT2611KKKKK1", "BT2611KKKKK2"]);
    assert.equal(res.unmatched[0].reason, "ambiguous");
  });
  test("date more than 1 day away is not an amount match; a second charge for one order is flagged", () => {
    const o = order({ order_id: "BT2611MMMMM1", paid_at: "2026-11-01T10:00:00.000Z" });
    const res = reconcile([o], growLinesFromRows([["תאריך", "סכום", "תיאור"], ["05/11/2026", "349", ""], ["01/11/2026", "349", "BT2611MMMMM1"], ["01/11/2026", "349", "BT2611MMMMM1"]]), { now: NOW });
    assert.deepEqual(res.unmatched.map((u) => u.reason).sort(), ["no_order", "second_charge_for_order"]);
    assert.equal(res.rows[0].status, "matched");
  });
});

describe("recon: XLSX with Hebrew headers", () => {
  test("same lines as the CSV, from the workbook's first sheet (not sheet1.xml), numbers and Excel dates", () => {
    const rows: Array<Array<string | number>> = [
      ["דוח עסקאות"],
      ["תאריך", "סכום", "עמלה", "מספר עסקה", "סוג עסקה", "שם לקוח", "תיאור", "מספר מסמך"],
      [46331.4270833333, 349, 3.49, "T1001", "רגילה", "לקוחה לדוגמה א", "ערכה BT2611AAAAA1", 50002],
      ["15/11/2026 10:00", -349, "", "T1005", "זיכוי", "לקוחה לדוגמה ו", "", 50010],
    ];
    const buf = xlsx(rows);
    assert.equal(parseXlsx(buf)[1][0], "תאריך");
    const exp = parseGrowExport(buf, "export.xlsx");
    assert.equal(exp.lines.length, 2);
    assert.deepEqual(
      { ...exp.lines[0], line: 0 },
      { line: 0, kind: "charge", order_id: "BT2611AAAAA1", transaction_id: "T1001", asmachta: null, paid_at: "2026-11-05T08:15:00.000Z", date: "2026-11-05", amount: 349, fee: 3.49, net: null, doc_number: "50002", payment_method: null },
    );
    assert.equal(exp.lines[1].kind, "refund");
    for (const w of BUYER_WORDS) assert.ok(!JSON.stringify(exp).includes(w));
  });
  test("old .xls is refused with a clear message", () => {
    assert.throws(() => parseGrowExport(Buffer.from("not a zip"), "export.xls"), /\.xlsx or \.csv/);
  });
});

describe("refunds by hand (decision 13)", () => {
  test("partial: stays paid, revenue lower; full: refunded", () => {
    const o = order({ order_id: "BT2611NNNNN1", fee_ils: 3.49 });
    const p = proposeRefund(o, 100, { now: NOW, creditDoc: "50020" });
    assert.equal(p.full, false);
    assert.equal(p.patch.payment_status, undefined);
    assert.deepEqual([p.patch.refund_amount, p.patch.recon_status, p.patch.credit_doc_number], [100, "partial_refund", "50020"]);
    const full = proposeRefund({ ...o, refund_amount: 100 }, 249, { now: NOW });
    assert.equal(full.refund_total, 349);
    assert.equal(full.patch.payment_status, "refunded");
    assert.equal(full.patch.revenue_net_ils, -3.49);
  });
  test("refused: more than paid, unpaid, already refunded, no order, bad amount", () => {
    const o = order({ order_id: "BT2611NNNNN2" });
    assert.throws(() => proposeRefund(o, 400, { now: NOW }), RefundError);
    assert.throws(() => proposeRefund({ ...o, payment_status: "pending" }, 10, { now: NOW }), /not paid/);
    assert.throws(() => proposeRefund({ ...o, payment_status: "refunded" }, 10, { now: NOW }), /already/);
    assert.throws(() => proposeRefund(null, 10, { now: NOW }), /no such order/);
    assert.throws(() => proposeRefund(o, 0, { now: NOW }), /positive/);
  });
});

describe("revenue = paid_amount - refund_amount; refunded orders out of CAC and ROAS", () => {
  const t = parseTouch("https://beshaa-tova.co.il/?utm_source=ig&utm_medium=paid_social&cid=111&asid=222&aid=333", null, "beshaa-tova.co.il", { ts: "2026-11-10T08:00:00Z" });
  assert.ok(t);
  const mk = (id: string, p: Partial<OrderRecord> = {}) =>
    order({ order_id: id, last: t, first: t, touches: [t], credited_channel: "paid_meta", credit_rule: "last_touch", created_at: "2026-11-10T09:00:00Z", paid_at: "2026-11-10T09:05:00Z", ...p });
  const plain = mk("BT2611PPPPP1");
  const partial = mk("BT2611PPPPP2", { refund_amount: 100 });
  const fullByAmount = mk("BT2611PPPPP3", { refund_amount: 349 });
  const refunded = mk("BT2611PPPPP4", { payment_status: "refunded" });
  test("revenueOf / isRefunded", () => {
    assert.equal(revenueOf(plain), 349);
    assert.equal(revenueOf(partial), 249);
    assert.equal(revenueOf(fullByAmount), 0);
    assert.equal(isRefunded(fullByAmount), true);
    assert.equal(isRefunded(partial), false);
    assert.equal(netRevenueOf(refunded), 0);
  });
  test("CAC counts the plain and the partial order; ROAS uses 349 + 249", () => {
    const rows: InsightRow[] = [{ date_start: "2026-11-10", date_stop: "2026-11-10", campaign_id: "111", adset_id: "222", ad_id: "333", spend: 100, impressions: 1000, clicks: 10, inline_link_clicks: 10 }];
    const cac = joinSpend([plain, partial, fullByAmount, refunded], { rows, ads: [], ref_to_ad_name: {} });
    assert.equal(cac.totals.paid, 2);
    assert.equal(cac.totals.revenue, 598);
    assert.equal(cac.totals.cac, 50);
    assert.equal(cac.totals.roas_ex_vat, round2(598 / 1.18 / 100));
  });
  test("the report summary: revenue net of refunds, fully refunded counted as refunded", () => {
    const data: ReportData = { source: "file", dir: "x", orders: [plain, partial, fullByAmount, refunded], touches: [], payments: [], capi: [], codes: [], partners: [], blocked_egress: null };
    const rep = buildReport(data, { model: "credited", paidOnly: false, now: NOW });
    assert.equal(rep.summary.revenue, 598);
    assert.equal(rep.summary.refunded, 2);
  });
});

describe("sheet columns (Stage 3)", () => {
  test("the 9 columns are appended at the end, after ga_session_id, and round-trip through the row mapper", () => {
    const h = [...SHEET_ATTRIBUTION_HEADERS];
    assert.deepEqual(h.slice(-10), ["ga_session_id", ...RECON_COLUMNS]);
    const o = order({ order_id: "BT2611QQQQQ1", grow_paid_at: "2026-11-05T08:15:00.000Z", revenue_net_ils: 292.27, fee_ils: 3.49, refund_amount: 50, refunded_at: "2026-11-15T08:00:00.000Z", credit_doc_number: "50010", recon_status: "partial_refund", recon_source: "grow_export:order_id", recon_at: NOW.toISOString() });
    const cols = toSheetColumns(o) as Record<string, string>;
    assert.equal(cols.revenue_net_ils, "292.27");
    const back = rowToOrder({ get: (k: string) => cols[k] ?? "" } as unknown as Parameters<typeof rowToOrder>[0]);
    for (const k of RECON_COLUMNS) assert.equal(back[k], o[k], k);
  });
});

describe("reconcile-payments CLI", () => {
  const loadOrders = async () => fxOrders();
  const readExport = () => fxExport();
  const liveHeaders = [...SHEET_ATTRIBUTION_HEADERS] as string[];
  const fakeWriter = (headers: string[] | null) => {
    const writes: Array<{ id: string; patch: ReconPatch }> = [];
    const w: OrderWriter = { headers: async () => headers, update: async (id, patch) => { writes.push({ id, patch }); } };
    return { w, writes };
  };
  test("args", () => {
    assert.throws(() => parseArgs([]), ArgError);
    assert.throws(() => parseArgs(["--grow-export", "x.csv", "--orders", "o.json", "--apply"]), /--source sheet/);
    assert.throws(() => parseArgs(["--grow-export", "x.csv", "--dir", ".test-data", "--apply"]), /--source sheet/);
    assert.throws(() => parseArgs(["--refund", "BT2611AAAAA1"]), /--amount/);
    assert.throws(() => parseArgs(["--refund", "nope", "--amount", "5"]), /order id/);
    assert.throws(() => parseArgs(["--grow-export", "x.csv", "--from", "1.11.2026"]), /YYYY-MM-DD/);
    const a = parseArgs(["--grow-export", "x.csv"]);
    assert.equal(a.apply, false, "dry run by default");
    assert.equal(a.source, "sheet");
  });
  test("dry run never opens the writer", async () => {
    let opened = false;
    const out: string[] = [];
    const code = await run(["--grow-export", "x.csv"], { loadOrders, readExport, now: NOW, out: (s) => out.push(s), writer: async () => { opened = true; throw new Error("no"); } });
    assert.equal(code, 0);
    assert.equal(opened, false);
    assert.match(out.join(""), /7 order row\(s\) would change; nothing written/);
  });
  test("--apply refuses when the live sheet lacks the new headers, and writes nothing", async () => {
    const { w, writes } = fakeWriter(liveHeaders.slice(0, liveHeaders.indexOf("grow_paid_at")));
    await assert.rejects(run(["--grow-export", "x.csv", "--apply"], { loadOrders, readExport, now: NOW, out: () => {}, writer: async () => w }), (e: unknown) => {
      assert.ok(e instanceof ApplyRefused);
      assert.match((e as Error).message, /grow_paid_at, revenue_net_ils, fee_ils, refund_amount, refunded_at, credit_doc_number, recon_status, recon_source, recon_at/);
      return true;
    });
    assert.equal(writes.length, 0);
    const { w: w2, writes: writes2 } = fakeWriter(null);
    await assert.rejects(run(["--grow-export", "x.csv", "--apply"], { loadOrders, readExport, now: NOW, out: () => {}, writer: async () => w2 }), ApplyRefused);
    assert.equal(writes2.length, 0);
  });
  test("--apply with the headers present writes one patch per changed order through the writer", async () => {
    const { w, writes } = fakeWriter(liveHeaders);
    const code = await run(["--grow-export", "x.csv", "--apply"], { loadOrders, readExport, now: NOW, out: () => {}, writer: async () => w });
    assert.equal(code, 0);
    assert.deepEqual(writes.map((x) => x.id).sort(), ["BT2611AAAAA1", "BT2611BBBBB2", "BT2611CCCCC3", "BT2611DDDDD4", "BT2611EEEEE5", "BT2611FFFFF6", "BT2611GGGGG7"]);
  });
  test("--refund proposes, and writes only with --apply", async () => {
    const out: string[] = [];
    const { w, writes } = fakeWriter(liveHeaders);
    await run(["--refund", "BT2611AAAAA1", "--amount", "349", "--credit-doc", "50030"], { loadOrders, now: NOW, out: (s) => out.push(s), writer: async () => w });
    assert.equal(writes.length, 0);
    assert.match(out.join(""), /full\); payment_status after: refunded/);
    await run(["--refund", "BT2611AAAAA1", "--amount", "349", "--apply"], { loadOrders, now: NOW, out: () => {}, writer: async () => w });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].patch.payment_status, "refunded");
  });
  test("checkHeaders also needs every column a patch touches", () => {
    assert.throws(() => checkHeaders([...RECON_COLUMNS], [{ invoice_number: "1" }]), /invoice_number/);
    assert.doesNotThrow(() => checkHeaders([...RECON_COLUMNS, "invoice_number"], [{ invoice_number: "1" }]));
  });
});

describe("dashboard health strip: recon_status", () => {
  const data = (orders: OrderRecord[]): ReportData => ({ source: "file", dir: "x", orders, touches: [], payments: [], capi: [], codes: [], partners: [], blocked_egress: null });
  test("unknown until a recon_status exists; then red for statuses that need action, with the counts", () => {
    const none = buildDashboard(data([order({ order_id: "BT2611RRRRR1" })]), { now: NOW, seed: 1 }).health.find((h) => h.key === "recon_not_matched");
    assert.equal(none?.status, "unknown");
    const d = buildDashboard(data([
      order({ order_id: "BT2611RRRRR1", recon_status: "matched" }),
      order({ order_id: "BT2611RRRRR2", recon_status: "partial_refund", refund_amount: 100 }),
      order({ order_id: "BT2611RRRRR3", recon_status: "amount_mismatch" }),
      order({ order_id: "BT2611RRRRR4", recon_status: "not_in_export" }),
    ]), { now: NOW, seed: 1 });
    const h = d.health.find((x) => x.key === "recon_not_matched");
    assert.equal(h?.status, "red");
    assert.deepEqual(h?.ids, ["BT2611RRRRR3", "BT2611RRRRR4"]);
    assert.equal(h?.note, "amount_mismatch:1,matched:1,not_in_export:1,partial_refund:1");
    assert.equal(d.orders.BT2611RRRRR3.recon_status, "amount_mismatch");
    assert.equal(d.money.all.refunds, 100);
  });
});

function round2(n: number) { return Math.round(n * 100) / 100; }
