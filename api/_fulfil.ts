/**
 * fulfilPaid(order_id) (docs/attribution/00_DESIGN.md 5.7): the one fan-out after a verified payment.
 * Idempotent: every step checks its own marker first (capi_purchase_sent_at, commission_ils, and
 * fulfil_log for the rest; fulfil_log is FileStore-only, so on the sheet only CAPI and commission
 * are guarded, and gift release is idempotent by itself). Steps never throw past this function.
 */
import fs from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import type { OrderRecord } from "./_attribution_core.js";
import { postbackSale, computeCommission } from "./_affiliate.js";
import { withLock } from "./_bg.js";
import { ga4ServerConfigured, sendGa4Purchase } from "./_ga4.js";
// capiPurchase lives in _meta-capi.ts (no gift-release imports), so scripts/capi-retry.ts can reuse it.
import { capiPurchase } from "./_meta-capi.js";
export { capiPurchase };
import { getStore, type Store } from "./_store.js";

const FROM = "בשעה טובה <orders@beshaa-tova.co.il>";

function testLog(file: string, obj: unknown): boolean {
  const dir = process.env.ATTR_DATA_DIR;
  if (process.env.ATTR_TEST !== "1" || !dir || !fs.existsSync(dir)) return false;
  fs.appendFileSync(path.join(dir, file), JSON.stringify({ ...(obj as object), at: new Date().toISOString() }) + "\n");
  return true;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/**
 * DRAFT he copy: awaiting Lihi. Each alert kind in plain Hebrew: what happened, and the one thing to do.
 * Unknown kinds fall back to a generic text with the kind name.
 */
const GROW_CHECK = "לפתוח את Grow, למצוא את התשלום, ואם הוא שייך להזמנה פתוחה ללחוץ \"סמני כשולם\" במייל של אותה הזמנה.";
export const ALERT_TEXT: Record<string, { what: string; todo: string }> = {
  webhook_not_paid: { what: "Grow דיווחו על תשלום שלא הושלם.", todo: "אין צורך לעשות כלום. רק אם הזוג כותב שחויב, לבדוק ב-Grow." },
  make_notify_not_paid: { what: "Grow דיווחו על תשלום שלא הושלם.", todo: "אין צורך לעשות כלום. רק אם הזוג כותב שחויב, לבדוק ב-Grow." },
  order_code_not_found: { what: "שולם ב-Grow עם קוד הזמנה שלא קיים באתר (כנראה טעות הקלדה).", todo: GROW_CHECK },
  webhook_unmatched: { what: "הגיע תשלום מ-Grow ולא מצאתי לו הזמנה.", todo: GROW_CHECK },
  webhook_ambiguous_phone_sum: { what: "הגיע תשלום בלי קוד הזמנה, ויש כמה הזמנות פתוחות מאותו טלפון ובאותו סכום.", todo: GROW_CHECK },
  unknown_order: { what: "הגיעה הודעת תשלום על הזמנה שלא קיימת באתר.", todo: GROW_CHECK },
  make_notify_unknown_order: { what: "הגיעה הודעת תשלום על הזמנה שלא קיימת באתר.", todo: GROW_CHECK },
  fulfil_unknown_order: { what: "ניסיתי לסגור תשלום על הזמנה שלא נמצאה בטבלה.", todo: GROW_CHECK },
  second_payment_for_paid_order: { what: "הגיע תשלום שני על הזמנה שכבר שולמה.", todo: "לבדוק ב-Grow אם שילמו פעמיים, ואם כן לזכות את אחד התשלומים." },
  webhook_for_order_not_pending: { what: "הגיע תשלום על הזמנה שלא ממתינה לתשלום (למשל בוטלה).", todo: "לבדוק את ההזמנה בטבלה ולהחליט אם לזכות את התשלום." },
  make_notify_order_not_pending: { what: "הגיע תשלום על הזמנה שלא ממתינה לתשלום (למשל בוטלה).", todo: "לבדוק את ההזמנה בטבלה ולהחליט אם לזכות את התשלום." },
  webhook_sum_mismatch: { what: "הסכום ששולם שונה מהסכום בהזמנה, ולכן ההזמנה לא סומנה כשולמה.", todo: "אם הסכום נכון (למשל שדרוג), ללחוץ \"סמני כשולם\" במייל ההזמנה ולהקליד את הסכום שנגבה." },
  make_notify_sum_mismatch: { what: "הסכום ששולם שונה מהסכום בהזמנה, ולכן ההזמנה לא סומנה כשולמה.", todo: "אם הסכום נכון (למשל שדרוג), ללחוץ \"סמני כשולם\" במייל ההזמנה ולהקליד את הסכום שנגבה." },
  verify_unavailable_retry: { what: "לא הצלחתי לאמת תשלום מול Grow. Grow ישלחו שוב לבד.", todo: "אין צורך לעשות כלום, אלא אם ההזמנה לא סומנה כשולמה תוך שעה." },
  verify_failed: { what: "תשלום שלא אומת מול Grow, ולכן ההזמנה לא סומנה כשולמה.", todo: "לבדוק ב-Grow אם התשלום באמת עבר, ואם כן ללחוץ \"סמני כשולם\" במייל ההזמנה." },
};

/** One alert per kind and payment: Grow resends a notify up to 5 times, and each resend must not alert again. */
export function alertDedupKey(kind: string, ids: Record<string, string | null | undefined>): string {
  const ref = ids.transactionId || ids.order_id || ids.order_code || ids.processId || ids.cField1
    || Object.entries(ids).map(([k, v]) => `${k}=${v ?? ""}`).join("&");
  return `${kind}:${ref}`.slice(0, 200);
}

const sentAlerts = new Set<string>();

/**
 * Ids only, never names or card data. Test: alerts.jsonl. Prod: console + a short plain-Hebrew email to Lihi.
 * Deduped per kind and payment: in this instance (sentAlerts), across instances by Resend's idempotency
 * key (24 hours), and in test mode against alerts.jsonl.
 */
export async function alert(kind: string, ids: Record<string, string | null | undefined>): Promise<void> {
  const key = alertDedupKey(kind, ids);
  const dir = process.env.ATTR_DATA_DIR;
  if (process.env.ATTR_TEST === "1" && dir && fs.existsSync(dir)) {
    // Test mode dedups against the file only (each test starts from a fresh data dir).
    const f = path.join(dir, "alerts.jsonl");
    const seen = fs.existsSync(f) && fs.readFileSync(f, "utf8").split("\n").some((l) => {
      try { return !!l && (JSON.parse(l) as { key?: string }).key === key; } catch { return false; }
    });
    if (!seen) { console.error(`[payments] ALERT ${kind}`, JSON.stringify(ids)); testLog("alerts.jsonl", { kind, ids, key }); }
    return;
  }
  if (sentAlerts.has(key)) return;
  sentAlerts.add(key);
  console.error(`[payments] ALERT ${kind}`, JSON.stringify(ids));
  const text = ALERT_TEXT[kind] ?? { what: `התראה ממערכת התשלומים (${kind}).`, todo: GROW_CHECK };
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const rows = Object.entries(ids).map(([k, v]) => `<li>${esc(k)}: <span dir="ltr">${esc(String(v ?? ""))}</span></li>`).join("");
    const orderRef = ids.order_id ? ` (${ids.order_id})` : "";
    await resend.emails.send({
      from: FROM, to: process.env.ORDER_NOTIFICATION_EMAIL || "beshaatova.il@gmail.com",
      // DRAFT he copy: awaiting Lihi
      subject: `תשלום לבדיקה${orderRef}: ${text.what}`,
      html: `<div dir="rtl" style="font-family: sans-serif; line-height: 1.8;">
          <p style="font-size: 16px; margin: 0 0 8px;">${esc(text.what)}</p>
          <p style="font-size: 16px; margin: 0 0 16px;"><strong>מה לעשות:</strong> ${esc(text.todo)}</p>
          <p style="font-size: 12px; color: #9B8E82; margin: 0;">פרטים טכניים (${esc(kind)}):</p>
          <ul style="font-size: 12px; color: #9B8E82; margin: 0;">${rows}</ul>
        </div>`,
    }, { idempotencyKey: `alert-${key}`.replace(/[^A-Za-z0-9_:=&.-]/g, "_").slice(0, 256) });
  } catch (e) {
    console.error("[payments] alert email failed:", e instanceof Error ? e.message : e);
  }
}

function plan(o: OrderRecord): "kit" | "kit_all_meetings" | "gift" {
  return o.order_kind === "gift" ? "gift" : o.all_meetings ? "kit_all_meetings" : "kit";
}

async function step(store: Store, o: OrderRecord, name: string, fn: () => Promise<Partial<OrderRecord> | void>): Promise<OrderRecord> {
  if (o.fulfil_log?.[name]) return o;
  try {
    const patch = (await fn()) || {};
    const fulfil_log = { ...(o.fulfil_log ?? {}), [name]: new Date().toISOString() };
    await store.updateOrder(o.order_id, { ...patch, fulfil_log });
    return { ...o, ...patch, fulfil_log };
  } catch (e) {
    console.error(`[fulfil] ${name} failed for ${o.order_id}:`, e instanceof Error ? e.message : e);
    return o;
  }
}

/** DRAFT he copy: awaiting Lihi. How the payment was confirmed, for her paid email. */
export function confirmedHow(o: Pick<OrderRecord, "verify_mode" | "match_method">): string {
  const how = o.verify_mode === "unsigned_webhook" ? "הודעת שרת מ-Grow (לא חתומה)"
    : o.verify_mode === "manual_token" ? "הקישור \"סמני כשולם\" שלך"
    : o.verify_mode === "process_info" ? "אימות מול Grow"
    : "";
  const match = o.match_method === "order_code" ? "לפי קוד ההזמנה שהוקלד"
    : o.match_method === "phone_sum" ? "לפי טלפון וסכום (בלי קוד הזמנה), כדאי לבדוק"
    : o.match_method === "order_id" ? "לפי מספר ההזמנה"
    : "";
  return [how, match].filter(Boolean).join(", ");
}

async function paidEmail(o: OrderRecord): Promise<void> {
  const names = o.order_kind === "gift"
    ? `${o.buyer.name} (מתנה ל${o.couple.name1} ו${o.couple.name2})`
    : `${o.couple.name1} ו${o.couple.name2}`;
  const amount = o.paid_amount ?? o.amount_expected;
  const channel = [o.credited_channel, o.credited_detail].filter(Boolean).join(" / ");
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: FROM,
    to: process.env.ORDER_NOTIFICATION_EMAIL || "beshaatova.il@gmail.com",
    // DRAFT he copy: awaiting Lihi
    subject: `שולם: ${names} (${o.order_id}), ${amount} ₪, ${channel}`,
    html: `
        <div dir="rtl" style="font-family: sans-serif; line-height: 1.8;">
          <h2>התשלום התקבל</h2>
          <table style="border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">מספר הזמנה:</td><td style="padding: 6px 0; direction: ltr;">${esc(o.order_id)}</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">שמות:</td><td style="padding: 6px 0;">${esc(names)}</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">סכום:</td><td style="padding: 6px 0;">${amount} ₪</td></tr>
            ${amount !== o.amount_expected ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">סכום בהזמנה:</td><td style="padding: 6px 0;">${o.amount_expected} ₪ (נגבה סכום אחר)</td></tr>` : ""}
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">אמצעי תשלום:</td><td style="padding: 6px 0;">${esc(o.payment_method ?? "")}</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">אסמכתא:</td><td style="padding: 6px 0; direction: ltr;">${esc(o.asmachta ?? "")}</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">מקור:</td><td style="padding: 6px 0; direction: ltr;">${esc(channel)}</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">איך אושר:</td><td style="padding: 6px 0;">${esc(confirmedHow(o))}</td></tr>
            ${o.match_method === "phone_sum" ? `<tr><td colspan="2" style="padding: 8px 0; color: #92400E;">שולם בלי קוד הזמנה, וההתאמה נעשתה לפי הטלפון והסכום. כדאי להציץ ב-Grow שזה אכן הזוג הזה.</td></tr>` : ""}
            ${o.commission_ils ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">עמלה לשותף:</td><td style="padding: 6px 0;">${o.commission_ils} ₪ (${esc(o.partner_id ?? "")})</td></tr>` : ""}
          </table>
        </div>`,
  });
}

/** fulfilPaid(order_id): run every downstream copy of a verified payment once. */
export async function fulfilPaid(order_id: string, opts: { provider?: "grow" | "grow_mock" | "grow_pages" | "grow_make" | "manual" } = {}): Promise<void> {
  return withLock(`fulfil:${order_id}`, async () => {
    const store = getStore();
    let o = await store.getOrder(order_id, { fresh: true });
    if (!o) { await alert("fulfil_unknown_order", { order_id }); return; }
    if (o.payment_status !== "paid") { console.warn(`[fulfil] ${order_id} is ${o.payment_status}, not paid: skipped`); return; }

    // 2. Meta CAPI Purchase (the only Purchase; event_id purchase_<order_id>)
    try { o = await capiPurchase(store, o); } catch (e) { console.error("[fulfil] capi failed:", e instanceof Error ? e.message : e); }

    // 3. GA4 Measurement Protocol (only when configured; else the thank-you page sends it)
    if (ga4ServerConfigured(o.ga_client_id)) {
      const cur = o;
      o = await step(store, o, "ga4", async () => {
        const r = await sendGa4Purchase({
          client_id: cur.ga_client_id as string, order_id: cur.order_id, value: cur.paid_amount ?? cur.amount_expected, currency: "ILS",
          items: [{ item_id: plan(cur), item_name: plan(cur), price: cur.paid_amount ?? cur.amount_expected, quantity: 1 }],
          timestamp_micros: cur.paid_at ? Date.parse(cur.paid_at) * 1000 : undefined,
        });
        if (!r.ok) throw new Error(`ga4 ${r.detail}`);
      });
    }

    // 4. Commission (code or aff- ref credit only; paid ads and QR never pay a creator)
    if (o.partner_id && o.commission_ils === null) {
      const partner = await store.getPartnerById(o.partner_id).catch(() => null);
      const c = computeCommission(partner, o.paid_amount ?? o.amount_expected, o.buyer);
      if (c.commission_status) {
        await store.updateOrder(o.order_id, { commission_ils: c.commission_ils, commission_status: c.commission_status });
        o = { ...o, commission_ils: c.commission_ils, commission_status: c.commission_status };
      }
    }

    // 5. Affiliate postback (never blocking; ids and amount only)
    if (o.partner_id && o.commission_status === "pending") {
      const cur = o;
      const partner = await store.getPartnerById(cur.partner_id as string).catch(() => null);
      o = await step(store, o, "affiliate", async () => {
        const r = await postbackSale({
          order_id: cur.order_id, partner_id: cur.partner_id as string, fp_ref_id: partner?.fp_ref_id ?? null,
          code: cur.promo_code, amount_ils: cur.paid_amount ?? cur.amount_expected, plan: plan(cur),
        });
        if (!r.ok) throw new Error(`postback ${r.detail}`);
      });
    }

    // 6. Gift: release the voucher (prod, FULFIL_GIFT_RELEASE=1) or log it (test, =log)
    if (o.order_kind === "gift" && o.voucher_code) {
      const cur = o;
      const mode = process.env.FULFIL_GIFT_RELEASE;
      if (mode === "log") {
        o = await step(store, o, "gift_release", async () => { testLog("fulfil.jsonl", { would_release: cur.voucher_code, order_id: cur.order_id }); });
      } else if (mode === "1") {
        o = await step(store, o, "gift_release", async () => {
          const { releaseGiftVoucher } = await import("./_gift_release.js");
          const r = await releaseGiftVoucher({ code: cur.voucher_code as string, ...(cur.gift_release_extras ?? {}) });
          if (r.status !== "sent" && r.status !== "already") throw new Error(`gift release ${r.status}`);
        });
      }
    }

    // 7. Lihi's "paid" email
    const cur = o;
    o = await step(store, o, "paid_email", () => paidEmail(cur));
    void opts;
  });
}
