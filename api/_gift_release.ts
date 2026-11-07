// Release a paid gift voucher (Lihi, 21.10.2026): until payment is confirmed the giver only gets a
// "we got your order" email. Lihi's notification carries a signed link (api/gift-release.ts); her
// click, or later a Grow payment webhook, calls releaseGiftVoucher(), which renders the PDF voucher,
// emails it to the giver, sends Lihi a copy with the WhatsApp button, and ticks "שובר נשלח" in the
// sheet so a second click never sends again.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { getOrderDoc } from "./_sheets.js";
import { MAIN_TAB, CODE_HEADER, VOUCHER_SENT_HEADER, normalizeVoucherCode, invalidateVoucherCache } from "./_voucher_lookup.js";
import { buildVoucherHtml, buildRedeemUrl, waLink, coupleVoucherMessage, giverVoucherMessage } from "./_voucher.js";
import { buildVoucherQr, renderVoucherPdf } from "./_voucher-pdf.js";
import { buildGiftVoucherReadyEmail } from "./_customer_emails.js";

// The sheet's giver columns are named "נותנ/ת <dash> שם" etc.; match them by prefix and suffix.
function giverHeader(headers: string[], suffix: string): string {
  return headers.find((h) => h.startsWith("נותנ/ת") && h.endsWith(suffix)) || "";
}

// ---------- Signed release link ----------

export interface ReleaseExtras {
  /** "direct" = Lihi sends the voucher to the couple herself (her copy gets that WhatsApp button). */
  delivery?: "self" | "direct";
  couplePhone?: string | null;
  contactName?: string | null;
}

interface TokenPayload extends ReleaseExtras { v: 1; c: string }

function secret(): string | null {
  const s = process.env.GIFT_RELEASE_SECRET;
  return s && s.length >= 16 ? s : null;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(data: string, key: string): string {
  return b64url(createHmac("sha256", key).update(data).digest());
}

export function releaseSecretConfigured(): boolean {
  return !!secret();
}

/** Token for the release link, or null when GIFT_RELEASE_SECRET is not set. */
export function createReleaseToken(code: string, extras: ReleaseExtras = {}): string | null {
  const key = secret();
  if (!key) return null;
  const payload: TokenPayload = { v: 1, c: normalizeVoucherCode(code) };
  if (extras.delivery === "direct") {
    payload.delivery = "direct";
    if (extras.couplePhone) payload.couplePhone = String(extras.couplePhone).replace(/[^\d+]/g, "").slice(0, 20);
    if (extras.contactName) payload.contactName = String(extras.contactName).slice(0, 60);
  }
  const data = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${data}.${sign(data, key)}`;
}

/** Returns the payload when the signature is valid, else null. */
export function verifyReleaseToken(token: unknown): (ReleaseExtras & { code: string }) | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 2000) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as TokenPayload;
    if (p.v !== 1 || !p.c) return null;
    return { code: normalizeVoucherCode(p.c), delivery: p.delivery, couplePhone: p.couplePhone, contactName: p.contactName };
  } catch {
    return null;
  }
}

export function buildReleaseUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/gift-release?t=${encodeURIComponent(token)}`;
}

// ---------- Sheet row ----------

export interface GiftRowInfo {
  code: string;
  rowNumber: number;
  giverName: string;
  giverEmail: string;
  giverPhone: string;
  coupleName1: string;
  coupleName2: string;
  blessing: string;
  released: boolean;
}

async function findGiftRow(code: string) {
  const doc = await getOrderDoc();
  if (!doc) throw new Error("sheet not configured");
  const sheet = doc.sheetsByTitle[MAIN_TAB] || doc.sheetsByIndex[0];
  const rows = await sheet.getRows();
  const headers = sheet.headerValues;
  const row = rows.find((r) => normalizeVoucherCode(r.get(CODE_HEADER)) === code && !String(r.get("מקור") || "").startsWith("מימוש שובר"));
  return { sheet, row, headers };
}

function rowInfo(code: string, found: Awaited<ReturnType<typeof findGiftRow>>): GiftRowInfo {
  const row = found.row!;
  const get = (h: string) => (h ? String(row.get(h) || "").trim() : "");
  return {
    code,
    rowNumber: row.rowNumber,
    giverName: get(giverHeader(found.headers, "שם")),
    giverEmail: get(giverHeader(found.headers, "מייל")),
    giverPhone: get(giverHeader(found.headers, "טלפון")),
    coupleName1: get("שם 1 (ממלא/ת)"),
    coupleName2: get("שם 2"),
    blessing: get("ברכה"),
    released: get(VOUCHER_SENT_HEADER).toUpperCase() === "TRUE",
  };
}

/** Read-only lookup for the confirmation page. */
export async function getGiftRow(rawCode: string): Promise<GiftRowInfo | null> {
  const code = normalizeVoucherCode(rawCode);
  const found = await findGiftRow(code);
  return found.row ? rowInfo(code, found) : null;
}

// Write single cells only: saving a whole row would overwrite any formulas in it.
async function setCells(sheet: Awaited<ReturnType<typeof findGiftRow>>["sheet"], rowNumber: number, values: Record<string, string | boolean>, onlyIfEmpty: string[] = []) {
  await sheet.loadHeaderRow();
  const headers = sheet.headerValues;
  const rowIndex = rowNumber - 1;
  const cols = Object.keys(values).map((h) => headers.indexOf(h)).filter((i) => i >= 0);
  if (!cols.length) return;
  await sheet.loadCells({ startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: Math.min(...cols), endColumnIndex: Math.max(...cols) + 1 });
  for (const [h, v] of Object.entries(values)) {
    const c = headers.indexOf(h);
    if (c < 0) continue;
    const cell = sheet.getCell(rowIndex, c);
    if (onlyIfEmpty.includes(h) && cell.formattedValue) continue;
    cell.value = v;
  }
  await sheet.saveUpdatedCells();
}

async function readCell(sheet: Awaited<ReturnType<typeof findGiftRow>>["sheet"], rowNumber: number, header: string): Promise<string> {
  await sheet.loadHeaderRow();
  const c = sheet.headerValues.indexOf(header);
  if (c < 0) return "";
  await sheet.loadCells({ startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: c, endColumnIndex: c + 1 });
  return String(sheet.getCell(rowNumber - 1, c).formattedValue || "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NOTES_HEADER = "הערות";
const inFlight = new Set<string>();

// ---------- Release ----------

export type ReleaseResult =
  | { status: "sent"; info: GiftRowInfo }
  | { status: "already"; info: GiftRowInfo }
  | { status: "not_found"; code: string }
  | { status: "no_email"; info: GiftRowInfo }
  | { status: "error"; code: string; reason: string };

const FROM = "בשעה טובה <orders@beshaa-tova.co.il>";

export async function releaseGiftVoucher(input: { code: string } & ReleaseExtras): Promise<ReleaseResult> {
  const code = normalizeVoucherCode(input.code);
  if (inFlight.has(code)) {
    const info = await getGiftRow(code).catch(() => null);
    return info ? { status: "already", info } : { status: "error", code, reason: "busy" };
  }
  inFlight.add(code);
  try {
    return await releaseOnce(code, input);
  } finally {
    inFlight.delete(code);
  }
}

async function releaseOnce(code: string, input: ReleaseExtras): Promise<ReleaseResult> {
  let found: Awaited<ReturnType<typeof findGiftRow>>;
  try {
    found = await findGiftRow(code);
  } catch (err) {
    console.error("[gift-release] sheet read failed:", err);
    return { status: "error", code, reason: "sheet" };
  }
  const { sheet, row } = found;
  if (!row) return { status: "not_found", code };
  const info = rowInfo(code, found);
  if (info.released) return { status: "already", info };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.giverEmail)) return { status: "no_email", info };

  // Lock against two clicks landing at once (even on two server instances): tick "שובר נשלח" and
  // append a unique marker to the notes, wait, and read the notes back. Both writers overwrite the
  // whole cell, so only the last one still finds its own marker; the other stops. Undone on failure.
  const today = new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
  let originalNotes = "";
  const marker = `[שליחת שובר ${randomBytes(4).toString("hex")}]`;
  try {
    originalNotes = await readCell(sheet, info.rowNumber, NOTES_HEADER);
    await setCells(sheet, info.rowNumber, { [VOUCHER_SENT_HEADER]: true, [NOTES_HEADER]: [originalNotes, marker].filter(Boolean).join(" | ") });
    await sleep(1500);
    if (!(await readCell(sheet, info.rowNumber, NOTES_HEADER)).includes(marker)) {
      return { status: "already", info: { ...info, released: true } };
    }
  } catch (err) {
    console.error("[gift-release] lock failed:", err);
    return { status: "error", code, reason: "sheet" };
  }
  const unlock = async () => {
    try { await setCells(sheet, info.rowNumber, { [VOUCHER_SENT_HEADER]: false, [NOTES_HEADER]: originalNotes }); } catch (e) { console.error("[gift-release] unlock failed:", e); }
  };

  const qrDataUri = await buildVoucherQr(code);
  const voucherHtml = buildVoucherHtml({ coupleName1: info.coupleName1, coupleName2: info.coupleName2, giverName: info.giverName, blessing: info.blessing, code, qrDataUri });
  const pdf = await renderVoucherPdf(voucherHtml);
  if (!pdf) {
    await unlock();
    return { status: "error", code, reason: "pdf" };
  }
  const pdfAttachment = { filename: `שובר מתנה - ${info.coupleName1} ו${info.coupleName2} - ${code}.pdf`, content: pdf.toString("base64") };

  const resend = new Resend(process.env.RESEND_API_KEY);
  const direct = input.delivery === "direct";
  try {
    const { subject, html } = buildGiftVoucherReadyEmail({
      giverName: info.giverName, coupleName1: info.coupleName1, coupleName2: info.coupleName2,
      code, redeemUrl: buildRedeemUrl(code), giftDelivery: direct ? "direct" : "self",
      contactName: input.contactName || null,
    });
    const sent = await resend.emails.send({ from: FROM, to: info.giverEmail, replyTo: "beshaatova.il@gmail.com", subject, html, attachments: [pdfAttachment] });
    if (sent.error) throw new Error(sent.error.message);
  } catch (err) {
    console.error("[gift-release] giver email failed:", err);
    await unlock();
    return { status: "error", code, reason: "email" };
  }

  // From here the voucher is out: never untick. Copy for Lihi + payment date are best effort.
  try {
    const waBtnStyle = "display:inline-block;margin-top:6px;background:#25D366;color:#fff;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:22px;";
    let waButton = "";
    if (direct && input.couplePhone) {
      const contact = input.contactName || info.coupleName1;
      const link = waLink(input.couplePhone, coupleVoucherMessage({ contact, giver: info.giverName, code }));
      waButton = `<a href="${link}" style="${waBtnStyle}">📲 שליחת השובר לזוג בוואטסאפ (${contact})</a>`;
    } else if (info.giverPhone) {
      const link = waLink(info.giverPhone, giverVoucherMessage({ giver: info.giverName, coupleName1: info.coupleName1, coupleName2: info.coupleName2, code }));
      waButton = `<a href="${link}" style="${waBtnStyle}">📲 הודעת וואטסאפ ל${info.giverName}</a>`;
    }
    await resend.emails.send({
      from: FROM,
      to: process.env.ORDER_NOTIFICATION_EMAIL || "beshaatova.il@gmail.com",
      subject: `השובר נשלח: ${info.coupleName1} ו${info.coupleName2} (מאת ${info.giverName})`,
      attachments: [pdfAttachment],
      html: `
        <div dir="rtl" style="font-family: sans-serif; line-height: 1.8;">
          <h2>🎟️ השובר נשלח ל${info.giverName}</h2>
          <p>השובר נשלח במייל ל-<span style="direction:ltr;display:inline-block;">${info.giverEmail}</span>, ובטבלה סומן "שובר נשלח". עותק מצורף כאן.</p>
          <p style="margin:2px 0;">קוד מימוש: <strong style="direction:ltr;display:inline-block;">${code}</strong></p>
          <p style="margin:2px 0;">קישור מימוש: <a href="${buildRedeemUrl(code)}">${buildRedeemUrl(code)}</a></p>
          ${direct ? `<p style="margin-top:12px;padding:12px;border-radius:8px;background:#fef3c7;">🔔 הנותנ/ת ביקש/ה שהשובר יישלח ישירות לזוג.</p>` : ""}
          ${waButton ? `<p style="margin:8px 0 0;">${waButton}</p>` : ""}
        </div>`,
    });
  } catch (err) {
    console.error("[gift-release] copy to Lihi failed:", err);
  }
  try {
    const paidHeader = giverHeader(found.headers, "תאריך תשלום");
    const doneNote = [originalNotes, `השובר נשלח אוטומטית לנותנ/ת ${today}`].filter(Boolean).join(" | ");
    await setCells(sheet, info.rowNumber, { [NOTES_HEADER]: doneNote, ...(paidHeader ? { [paidHeader]: today } : {}) }, paidHeader ? [paidHeader] : []);
  } catch (err) {
    console.error("[gift-release] payment date / note write failed:", err);
  }
  invalidateVoucherCache();
  return { status: "sent", info: { ...info, released: true } };
}
