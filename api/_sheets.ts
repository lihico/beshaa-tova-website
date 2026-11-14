import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { sheetSafe } from "./_attribution_core.js";

// The order form sends English slugs; the sheet is read in Hebrew.
const REFERRAL_LABELS: Record<string, string> = {
  facebook: "פייסבוק",
  instagram: "אינסטגרם",
  friend: "חבר/ה",
  whatsapp: "קבוצת ווטסאפ",
  print: "מודעה מודפסת",
  newsletter: "ניוזלטר",
  event: "ערב או הרצאה",
};

// Columns Lihi may or may not have in the live sheet. addRow silently drops keys
// that have no header, so check first and fall back to the notes column.
const RECEIPT_HEADER = "צריך קבלה?";
/** DRAFT he copy: awaiting Lihi. Marks a full-kit gift voucher in the notes; read by api/_voucher_lookup.ts. */
export const GIFT_ALL_MEETINGS_NOTE = "שובר לערכה מלאה (11 מפגשים)";
/** A lite voucher (4 meetings); read back by api/_voucher_lookup.ts like the full-kit note. */
export const GIFT_LITE_NOTE = "שובר לערכת לייט (4 מפגשים)";
const PARTNER_PHONE_HEADER = "טלפון בן/בת הזוג";

async function getHeaders(sheet: NonNullable<Awaited<ReturnType<typeof getSheet>>>): Promise<string[]> {
  try {
    await sheet.loadHeaderRow();
    return sheet.headerValues;
  } catch {
    return [];
  }
}

/** Sanitise ?ref= / utm_* values from the client (they reach the sheet and the email HTML). */
export function cleanAttribution(ref: unknown, utm: unknown): { refCode: string | null; utmText: string | null } {
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N}_.\-]/gu, "").slice(0, 64) : "");
  const refCode = clean(ref) || null;
  const u = (utm && typeof utm === "object" ? utm : {}) as Record<string, unknown>;
  const utmText = [u.utm_source, u.utm_medium, u.utm_campaign, u.utm_content].map(clean).filter(Boolean).join(" / ") || null;
  return { refCode, utmText };
}

function withRef(source: string, refCode?: string | null): string {
  return refCode ? `${source} | ref:${refCode}` : source;
}

function translateReferral(value?: string | null): string | null {
  if (!value) return null;
  return REFERRAL_LABELS[value] || value;
}

let _doc: GoogleSpreadsheet | null = null;
let _docLoadedAt = 0;
/** The tab list and sheet sizes change rarely; reloading them on every call cost ~0.5 s each time. */
const DOC_INFO_TTL_MS = 60_000;

/** The order-tracking spreadsheet, loaded (null when the Google env vars are missing). Shared with _voucher_lookup.ts. */
export async function getOrderDoc(): Promise<GoogleSpreadsheet | null> {
  // Test mode (docs/attribution 5.2): no code path (voucher lookup, gift release, lead) may reach Google.
  if (process.env.STORE_MODE === "file") return null;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_SPREADSHEET_ID) {
    return null;
  }

  if (!_doc) {
    const jwt = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    _doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, jwt);
  }

  if (Date.now() - _docLoadedAt > DOC_INFO_TTL_MS) {
    await _doc.loadInfo();
    _docLoadedAt = Date.now();
  }
  return _doc;
}

async function getSheet() {
  const doc = await getOrderDoc();
  return doc ? doc.sheetsByIndex[0] : null;
}

export async function appendOrderRow(data: {
  partner1: string;
  gender1: string;
  partner2: string;
  gender2: string;
  phone: string;
  email?: string | null;
  weddingDate?: string | null;
  address?: { city: string; street: string; apartment?: string | null; zipCode?: string; lastName?: string };
  meetings: string[];
  allMeetings?: boolean;
  /** The full-kit price from the live price table (api/_price_table.ts), for the notes column. */
  allMeetingsPrice?: number;
  /** The lite kit (4 meetings) and its price, for the notes column (14.11.2026). */
  lite?: boolean;
  litePrice?: number;
  /** Express shipping surcharge (0 / undefined = regular shipping). */
  expressIls?: number;
  freeText?: string | null;
  modestLanguage?: boolean;
  /** Religious couple who want to do the meetings on Shabbat (Lihi, 4.11.2026). */
  shabbat?: boolean;
  postWedding?: boolean;
  referralSource?: string | null;
  voucherCode?: string | null;
  isVoucherRedeem?: boolean;
  promoCode?: string | null;
  partnerPhone?: string | null;
  wantReceipt?: boolean;
  refCode?: string | null;
  voucherNote?: string | null;
  // Tracking fields (for Meta CAPI late attribution + funnel analysis)
  fbc?: string | null;
  fbp?: string | null;
  event_id?: string | null;
  visitor_id?: string | null;
  session_id?: string | null;
  // Attribution columns (docs/attribution 3.6), header-keyed; spread last into the row.
  attr?: Record<string, string>;
}) {
  const sheet = await getSheet();
  if (!sheet) return;

  const addressStr = data.address
    ? [data.address.lastName ? `משפחת ${data.address.lastName}` : "", data.address.street, data.address.apartment ? `דירה ${data.address.apartment}` : "", data.address.city, data.address.zipCode].filter(Boolean).join(", ")
    : "";

  const today = new Date().toLocaleDateString("he-IL");

  let status = "הזמנה חדשה";
  const referral = translateReferral(data.referralSource);
  let source = referral || "טופס באתר";
  if (data.isVoucherRedeem) {
    status = "מימוש שובר";
    source = "מימוש שובר";
  } else if (data.promoCode) {
    source = `${referral || "טופס באתר"} (פרומו ${data.promoCode})`;
  } else if (data.allMeetings) {
    source = `${referral || "טופס באתר"} (כל המפגשים)`;
  } else if (data.lite) {
    source = `${referral || "טופס באתר"} (לייט)`;
  }

  const notesParts: string[] = [];
  if (data.allMeetings) notesParts.push(`כל 11 המפגשים${data.allMeetingsPrice ? ` - ${data.allMeetingsPrice} ₪` : ""}`);
  if (data.lite) notesParts.push(`ערכת לייט, 4 מפגשים${data.litePrice ? ` - ${data.litePrice} ₪` : ""}`);
  if (data.expressIls) notesParts.push(`משלוח מהיר (+${data.expressIls} ₪)`);
  if (data.postWedding) notesParts.push("אחרי החתונה");
  if (data.shabbat) notesParts.push("מפגשים בשבת (שומרי שבת)");
  if (data.freeText) notesParts.push(data.freeText);
  if (data.voucherNote) notesParts.push(data.voucherNote);

  const headers = await getHeaders(sheet);
  const extra: Record<string, string> = {};
  if (data.wantReceipt) {
    if (headers.includes(RECEIPT_HEADER)) extra[RECEIPT_HEADER] = "V";
    else notesParts.push("ביקשו קבלה למייל");
  }
  if (data.partnerPhone) {
    if (headers.includes(PARTNER_PHONE_HEADER)) extra[PARTNER_PHONE_HEADER] = data.partnerPhone;
    else notesParts.push(`טלפון בן/בת הזוג: ${data.partnerPhone}`);
  }

  await sheet.addRow({
    "שם 1 (ממלא/ת)": data.partner1,
    "מגדר 1": data.gender1,
    "שם 2": data.partner2,
    "מגדר 2": data.gender2,
    "שם משפחה": data.address?.lastName || "",
    "שמות תצוגה": `${data.partner1} ו${data.partner2}`,
    "טלפון": data.phone,
    "מייל": data.email || "",
    "תאריך חתונה": data.weddingDate || "לא צוין",
    "כתובת מלאה": addressStr,
    "מפגשים": (data.meetings.includes("13") ? data.meetings : [...data.meetings, "13"]).join(","),
    "מס׳": data.meetings.includes("13") ? data.meetings.length : data.meetings.length + 1,
    "הערות": notesParts.join(" | "),
    "modest": data.modestLanguage ? "כן" : "לא",
    "סטטוס": status,
    "מקור": withRef(source, data.refCode),
    "תאריך הזמנה": today,
    "קוד שובר": data.isVoucherRedeem ? (data.voucherCode || "") : "",
    "fbc": sheetSafe(data.fbc),
    "fbp": sheetSafe(data.fbp),
    "event_id": sheetSafe(data.event_id),
    "visitor_id": sheetSafe(data.visitor_id),
    "session_id": sheetSafe(data.session_id),
    ...extra,
    ...(data.attr ?? {}),
  });
}

export async function appendLeadRow(data: {
  name1: string;
  name2: string;
  phone: string;
  intent?: string;
}) {
  const sheet = await getSheet();
  if (!sheet) return;

  const today = new Date().toLocaleDateString("he-IL");

  const displayName = data.name2
    ? `${data.name1} ו${data.name2}`
    : data.name1;

  await sheet.addRow({
    "שם 1 (ממלא/ת)": data.name1,
    "שם 2": data.name2 || "",
    "שמות תצוגה": displayName,
    "טלפון": data.phone,
    "הערות": data.intent || "",
    "סטטוס": "ליד",
    "מקור": "טופס ליד באתר",
    "תאריך הזמנה": today,
  });
}

export async function appendGiftRow(data: {
  giverName: string;
  giverPhone: string;
  giverEmail: string;
  coupleName1: string;
  coupleName2: string;
  weddingDate: string;
  blessing?: string | null;
  postWedding?: boolean;
  notes?: string | null;
  referralSource?: string | null;
  voucherCode?: string | null;
  wantReceipt?: boolean;
  refCode?: string | null;
  /** A full-kit voucher (all 11 meetings): written to the notes, read back by api/_voucher_lookup.ts. */
  giftAllMeetings?: boolean;
  /** A lite voucher (4 meetings): written to the notes, read back like the full-kit note. */
  giftLite?: boolean;
  giftPrice?: number;
  // Attribution columns (docs/attribution 3.6) incl. fbc, fbp, event_id, visitor_id, session_id.
  attr?: Record<string, string>;
}) {
  const sheet = await getSheet();
  if (!sheet) return;

  const today = new Date().toLocaleDateString("he-IL");

  const notesParts: string[] = [];
  if (data.giftAllMeetings) notesParts.push(`${GIFT_ALL_MEETINGS_NOTE}${data.giftPrice ? ` - ${data.giftPrice} ₪` : ""}`);
  if (data.giftLite) notesParts.push(`${GIFT_LITE_NOTE}${data.giftPrice ? ` - ${data.giftPrice} ₪` : ""}`);
  if (data.postWedding) notesParts.push("אחרי החתונה");
  if (data.notes) notesParts.push(data.notes);

  const headers = await getHeaders(sheet);
  const extra: Record<string, string> = {};
  if (data.wantReceipt) {
    if (headers.includes(RECEIPT_HEADER)) extra[RECEIPT_HEADER] = "V";
    else notesParts.push("ביקשו קבלה למייל");
  }

  await sheet.addRow({
    "שם 1 (ממלא/ת)": data.coupleName1,
    "שם 2": data.coupleName2,
    "שמות תצוגה": `${data.coupleName1} ו${data.coupleName2}`,
    "תאריך חתונה": data.weddingDate,
    "הערות": notesParts.join(" | "),
    "סטטוס": "שובר מתנה",
    "מקור": withRef(translateReferral(data.referralSource) || "שובר מתנה", data.refCode),
    "תאריך הזמנה": today,
    "נותנ/ת — שם": data.giverName,
    "נותנ/ת — טלפון": data.giverPhone,
    "נותנ/ת — מייל": data.giverEmail,
    "ברכה": data.blessing || "",
    "קוד שובר": data.voucherCode || "",
    ...extra,
    ...(data.attr ?? {}),
  });
}
