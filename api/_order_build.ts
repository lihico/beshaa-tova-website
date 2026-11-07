/**
 * Builds the OrderRecord frozen at submit (docs/attribution/00_DESIGN.md 3.2, 5.4 steps 2-6).
 * Shared by api/order.ts and api/gift.ts. Attribution = body state (or, from an old cached bundle,
 * one touch built from `ref`/`utm`) merged with the bsh_att cookie; visitor id prefers bsh_vid.
 */
import type { VercelRequest } from "@vercel/node";
import {
  creditOrder, fbcClickId, israeliMobileE164Digits, isVisitorId, legacyState, mergeServerAttribution, parseGaClientId, sanitizePath, sanitizeValue,
  type OrderKind, type OrderRecord, type ResolvedPromo,
} from "./_attribution_core.js";
import { COOKIE_FBP, readAttCookie, readCookie, readFbc, readGaClientCookie, readVisitorCookie } from "./_cookies.js";
import { leadEventId, newVisitorId } from "./_ids.js";
import { MANUAL_LINK_REASON, preflightReason } from "./_checkout.js";
import { clientIp } from "./_store.js";

export interface OrderBuildInput {
  order_id: string; kind: OrderKind; amount: number; rule: string;
  promo: ResolvedPromo | null; promoCodeRaw: string | null;
  buyer: { name: string; phone: string; email: string | null };
  couple: { name1: string; name2: string };
  meetings?: string[] | null; all_meetings?: boolean;
  voucher_code?: string | null;
  gift_release_extras?: OrderRecord["gift_release_extras"];
  body: Record<string, unknown>;
}

function str(v: unknown, max = 500): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** The bar's choice sent with the order (00_DESIGN 15); anything else stays "unknown". */
export function consentOf(v: unknown): OrderRecord["consent_marketing"] {
  return v === "granted" || v === "denied" ? v : "unknown";
}

/** A /order?debug=true order (Lihi, 7.11.2026), or any order whose notes carry the system-test note. */
export const SYSTEM_TEST_NOTE = "בדיקת מערכת";
export function isSystemTestBody(b: { test?: unknown; freeText?: unknown; notes?: unknown }): boolean {
  if (b.test === true) return true;
  return [b.freeText, b.notes].some((v) => typeof v === "string" && v.includes(SYSTEM_TEST_NOTE));
}

function landingPathOf(url: string | null): string {
  if (!url) return "/";
  try { return sanitizePath(new URL(url).pathname); } catch { return "/"; }
}

export function buildOrderRecord(req: VercelRequest, i: OrderBuildInput): OrderRecord {
  const b = i.body;
  const event_source_url = str(b.event_source_url, 500);
  const bodyAttr = b.attribution && typeof b.attribution === "object"
    ? b.attribution
    : legacyState(b.ref, b.utm, { landing_path: landingPathOf(event_source_url) });
  const attr = mergeServerAttribution(bodyAttr, readAttCookie(req), readVisitorCookie(req));
  const visitor_id = attr.visitor_id || (isVisitorId(b.visitor_id) ? (b.visitor_id as string) : newVisitorId());
  const credit = creditOrder(attr, i.promo, str(b.referralSource, 100));

  const bodyFbc = str(b.fbc, 600);
  const fbc = bodyFbc && fbcClickId(bodyFbc) ? bodyFbc : readFbc(req);
  const bodyFbp = str(b.fbp, 200);
  const fbp = bodyFbp && /^fb\.\d\.\d+\.\d+$/.test(bodyFbp) ? bodyFbp : (readCookie(req, COOKIE_FBP) || null);
  const gaBody = str(b.ga_client_id, 100);
  const ga_client_id = gaBody && /^\d+\.\d+$/.test(gaBody) ? gaBody : parseGaClientId(gaBody) ?? parseGaClientId(readGaClientCookie(req));
  const shown = Number(b.clientDisplayedAmount);

  const record: OrderRecord = {
    order_id: i.order_id, order_kind: i.kind, created_at: new Date().toISOString(),
    payment_status: i.amount > 0 ? "pending" : "free",
    amount_expected: i.amount, currency: "ILS", price_rule: i.rule,
    client_displayed_amount: Number.isFinite(shown) && b.clientDisplayedAmount !== null && b.clientDisplayedAmount !== undefined ? shown : null,
    promo_code: i.promo?.code ?? (i.promoCodeRaw ? sanitizeValue(i.promoCodeRaw) : null),
    partner_id: i.promo?.partner_id ?? null,
    ...credit,
    first: attr.first, last: attr.last, touches: attr.touches,
    self_reported_source: str(b.referralSource, 100), not_engaged: b.notEngaged === true,
    visitor_id, session_id: str(b.session_id, 100),
    fbc, fbp, ga_client_id,
    client_ip: clientIp(req), user_agent: str(req.headers["user-agent"], 500), event_source_url,
    // Test orders never reach Meta: "denied" makes the Lead and Purchase senders skip them (_meta-capi.ts).
    consent_marketing: isSystemTestBody(b) ? "denied" : consentOf(b.consent_marketing),
    buyer: i.buyer, couple: i.couple,
    lead_event_id: leadEventId(i.order_id),
    grow_process_ids: [], grow_process_token: null,
    payment_fallback_reason: null,
    paid_at: null, paid_amount: null, grow_transaction_id: null, asmachta: null,
    payment_method: null, payer_name: null, payer_phone: null, payer_email: null, match_method: null,
    capi_purchase_event_id: null, capi_purchase_sent_at: null, capi_purchase_result: null,
    commission_ils: null, commission_status: null, invoice_number: null, invoice_url: null,
    meetings: Array.isArray(i.meetings) ? i.meetings.filter((m): m is string => typeof m === "string" && /^[0-9]{1,3}$/.test(m)) : null,
    all_meetings: i.all_meetings ?? false,
    voucher_code: i.voucher_code ?? null, gift_release_extras: i.gift_release_extras ?? null,
    fulfil_log: {},
  };
  record.payment_fallback_reason = preflightReason(record);
  if (record.client_displayed_amount !== null && record.client_displayed_amount !== record.amount_expected) {
    console.warn(`[order] ${i.order_id}: page showed ${record.client_displayed_amount}, server charges ${record.amount_expected} (${i.rule})`);
  }
  return record;
}

/** Three rows for the top of Lihi's order email (5.4 step 10). Values are ids and numbers only. */
export function lihiEmailRows(o: OrderRecord): string {
  const td = 'style="padding: 6px 16px 6px 0; font-weight: bold;"';
  const channel = [o.credited_channel, o.credited_detail].filter(Boolean).join(" / ");
  // DRAFT he copy: awaiting Lihi
  return `
            <tr><td ${td}>מספר הזמנה:</td><td style="padding: 6px 0; direction: ltr;">${o.order_id}</td></tr>
            <tr><td ${td}>סכום לתשלום:</td><td style="padding: 6px 0;">${o.amount_expected} ₪ <span style="direction: ltr; display: inline-block; color: #9B8E82;">(${o.price_rule})</span></td></tr>
            <tr><td ${td}>מקור (מיוחס):</td><td style="padding: 6px 0; direction: ltr;">${channel.replace(/[<>&"]/g, "")}</td></tr>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** DRAFT he copy: awaiting Lihi. The ready WhatsApp text for the payer; Lihi pastes Grow's link at the end. */
export function manualPayMessage(o: Pick<OrderRecord, "order_id" | "amount_expected" | "order_kind" | "buyer">): string {
  const first = o.buyer.name.replace(/\s+/g, " ").trim().split(" ")[0] || "";
  const what = o.order_kind === "gift" ? "השובר" : "הערכה";
  return `היי ${first}, תודה על ההזמנה! הנה הקישור לתשלום על ${what} (${o.amount_expected} ₪, הזמנה ${o.order_id}): `;
}

/**
 * PAYMENT_PROVIDER=manual (Stage 1): a calm box with everything Lihi needs to send a one-time Grow link
 * ("לינק חד-פעמי"): amount, the order code for "עבור מה", the payer phone, and a wa.me link with a
 * ready message. DRAFT he copy: awaiting Lihi.
 */
export function manualPaymentBlock(o: OrderRecord): string {
  const phone = israeliMobileE164Digits(o.buyer.phone);
  const wa = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(manualPayMessage(o))}` : null;
  const cell = 'style="padding: 4px 12px 4px 0; font-weight: bold;"';
  const val = 'style="padding: 4px 0; direction: ltr; text-align: right; font-family: monospace; font-size: 16px;"';
  return `
          <div style="margin:16px 0;padding:12px 16px;border-radius:8px;background:#F5F0E8;border:1px solid #E8D5B7;">
            <p style="margin:0 0 6px;font-weight:bold;">לשלוח בקשת תשלום ב-Grow</p>
            <p style="margin:0 0 8px;">באפליקציה של Grow: לינק חד-פעמי, עם הסכום והקוד מכאן. אחר כך לשלוח את הלינק לזוג בוואטסאפ.</p>
            <table style="border-collapse: collapse; margin: 0 0 8px;">
              <tr><td ${cell}>סכום:</td><td ${val}>${o.amount_expected}</td></tr>
              <tr><td ${cell}>עבור מה:</td><td ${val}>${esc(o.order_id)}</td></tr>
              <tr><td ${cell}>טלפון:</td><td ${val}>${esc(o.buyer.phone)}</td></tr>
            </table>
            ${wa
              ? `<a href="${wa}" style="display:inline-block;background:#3D2B1F;color:#fff;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:22px;">וואטסאפ עם הודעה מוכנה</a>
            <p style="margin:6px 0 0;font-size:13px;color:#7A6A5C;">ההודעה נפתחת מוכנה, ורק צריך להדביק בסופה את הלינק מ-Grow.</p>`
              : `<p style="margin:0;font-size:13px;color:#7A6A5C;">הטלפון לא נראה כמו נייד ישראלי, אז אין קישור וואטסאפ מוכן. כדאי לבדוק את המספר.</p>`}
          </div>`;
}

/** No automatic link (5.4 step 8): the manual box under PAYMENT_PROVIDER=manual, else a red line. */
export function noPaymentLinkBlock(o: OrderRecord, payment_url: string | null): string {
  if (process.env.PAYMENTS_ENABLED !== "1" || o.amount_expected <= 0 || payment_url) return "";
  if (o.payment_fallback_reason === MANUAL_LINK_REASON) return manualPaymentBlock(o);
  // DRAFT he copy: awaiting Lihi
  return `<p style="background: #FEE2E2; border: 1px solid #F87171; border-radius: 8px; padding: 12px 16px; font-size: 15px;"><strong>לא נוצר קישור תשלום אוטומטי</strong> (${(o.payment_fallback_reason ?? "").replace(/[<>&"]/g, "")}). צריך לשלוח קישור תשלום בוואטסאפ.</p>`;
}
