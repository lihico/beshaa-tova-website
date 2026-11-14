import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { afterResponse } from "./_bg.js";
import { appendOrderRow, cleanAttribution } from "./_sheets.js";
import { buildCoupleOrderEmail } from "./_customer_emails.js";
import { createWeddingReminders, buildReminderEmailBlock } from "./_calendar.js";
import { sendLeadRecorded } from "./_meta-capi.js";
import { resolveOrderVoucher, invalidateVoucherCache } from "./_voucher_lookup.js";
import { toSheetColumns } from "./_attribution_core.js";
import { newOrderId } from "./_ids.js";
import { activePrices, isKitTier, priceOrder, resolvePromo, tierFor, type KitTier } from "./_pricing.js";
import { getStore } from "./_store.js";
import { startPayment } from "./_checkout.js";
import { paymentsEnabled } from "./_payments.js";
import { buildOrderRecord, lihiEmailRows, noPaymentLinkBlock } from "./_order_build.js";
import { attachRefPartner } from "./_affiliate.js";
import { markPaidEmailBlock } from "./_mark_paid.js";

const resend = new Resend(process.env.RESEND_API_KEY);

const ALL_MEETINGS: Record<string, string> = {
  "02": "שפות האהבה",
  "03": "איך אנחנו רבים (ואיך חוזרים)",
  "04": "האינטימיות שלנו",
  "05": "לדבר על כסף",
  "06": "המשפחות שלנו",
  "07": "הבית שאנחנו בונים",
  "08": "עתיד וחלומות",
  "09": "ילדים והורות",
  "10": "כשקשה",
  "12": "עבודה וקריירה",
  "13": "הכתובה שלנו",
};

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits.length === 12;
  if (digits.startsWith("0")) return digits.length === 10;
  return digits.length >= 9 && digits.length <= 15;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { partner1, partner2, gender1, gender2, phone, email, weddingDate, address, meetings, allMeetings: allMeetingsRaw, tier: tierRaw, express: expressRaw, modestLanguage, shabbat: shabbatRaw, postWedding, freeText, referralSource, voucherCode: rawVoucherCode, isVoucherRedeem: claimedFromLink, promoCode, partnerPhone: rawPartnerPhone, wantReceipt, ref, utm, fbc, fbp, event_id, visitor_id, session_id, event_source_url } = req.body;
    const shabbat = Boolean(modestLanguage) && shabbatRaw === true;
    const { refCode, utmText } = cleanAttribution(ref, utm);
    const partnerPhone = typeof rawPartnerPhone === "string" ? rawPartnerPhone.replace(/[^\d\s\-+()]/g, "").slice(0, 20).trim() : "";

    if (!partner1 || !partner2 || !gender1 || !gender2 || !phone || !meetings?.length) {
      return res.status(400).json({ error: "חסרים פרטים בטופס." });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: "מספר הטלפון לא תקין." });
    }

    // Never trust the browser on a free kit: re-check the voucher against the sheet (21.10.2026).
    const voucher = await resolveOrderVoucher({ code: rawVoucherCode, fromLink: Boolean(claimedFromLink), isPromo: Boolean(promoCode) });
    const isVoucherRedeem = voucher.redeem;
    const voucherCode = promoCode ? null : voucher.code;
    const prices = activePrices();
    // The kit (14.11.2026): lite (4) / base (8) / all (11). An old bundle sends only allMeetings.
    // A redemption gets the kit the voucher paid for: all 11 only for a full-kit voucher, 4 for a lite one.
    const asked: KitTier = isKitTier(tierRaw) ? tierRaw : allMeetingsRaw ? "all" : "base";
    const tier: KitTier = isVoucherRedeem
      ? (voucher.verdict?.allMeetings && asked === "all" ? "all" : voucher.verdict?.lite ? "lite" : "base")
      : tierFor(prices, { kind: "order", allMeetings: asked === "all", tier: asked });
    const allMeetings = tier === "all";
    const lite = tier === "lite";
    // Express shipping: only a paid, shipped order (never a voucher or a cafe pickup), only when the table has it.
    const isCafePickup = typeof address?.city === "string" && address.city.startsWith("איסוף:");
    const express = expressRaw === true && !isVoucherRedeem && !isCafePickup && prices.express !== null;
    const voucherWarningBlock = voucher.warning
      ? `<p style="background: #FEE2E2; border: 1px solid #F87171; border-radius: 8px; padding: 12px 16px; font-size: 15px;"><strong>⚠️ שובר:</strong> ${voucher.warning} (<span style="direction: ltr; display: inline-block;">${voucher.code}</span>)</p>`
      : "";

    const genderLabel = (g: string) => g === "F" ? "נ" : "ז";
    const weddingStr = weddingDate ? new Date(weddingDate).toLocaleDateString("he-IL") : "לא צוין";
    const addressStr = address
      ? [address.lastName ? `משפחת ${address.lastName}` : "", address.street, address.apartment ? `דירה ${address.apartment}` : "", address.city].filter(Boolean).join(", ")
      : "לא צוין";

    const to = process.env.ORDER_NOTIFICATION_EMAIL || "beshaatova.il@gmail.com";

    const subjectPrefix = (voucher.warning ? "⚠️ " : "") + (promoCode ? `קוד פרומו (${promoCode})` : isVoucherRedeem ? "מימוש שובר" : allMeetings ? "הזמנה - כל המפגשים" : lite ? "הזמנה - לייט (4 מפגשים)" : "הזמנה חדשה");

    // docs/attribution 5.4 steps 2-8: server price, order id, attribution frozen on the order,
    // the record saved BEFORE any email (a failed email can never lose it), then the payment link.
    const store = getStore();
    const promo = promoCode ? await resolvePromo(String(promoCode), { getPartnerByCode: (c) => store.getPartnerByCode(c) }) : null;
    const { amount, rule, express: expressIls } = priceOrder({ kind: "order", allMeetings, tier, promo, freeVoucher: isVoucherRedeem, express }, prices);
    const order_id = await newOrderId({ getOrder: (id) => store.getOrder(id).catch(() => null) });
    const record = buildOrderRecord(req, {
      order_id, kind: isVoucherRedeem ? "redeem" : "order", amount, rule,
      promo, promoCodeRaw: promoCode ? String(promoCode) : null,
      buyer: { name: [partner1, address?.lastName].filter(Boolean).join(" "), phone, email: email || null },
      couple: { name1: partner1, name2: partner2 },
      meetings, all_meetings: allMeetings,
      voucher_code: isVoucherRedeem ? voucherCode : null,
      body: req.body,
    });
    record.express_ils = expressIls || null;
    await attachRefPartner(record, store);   // section 8: an aff-<id> ref credits a partner when no code was typed
    let storeFailed = false;
    try {
      await store.appendOrder(record, () => appendOrderRow({
        partner1, partner2, gender1, gender2,
        phone, email, weddingDate, address, meetings,
        allMeetings, allMeetingsPrice: prices.all, lite, litePrice: prices.lite ?? undefined, expressIls,
        freeText, modestLanguage, shabbat, postWedding, referralSource,
        voucherCode, isVoucherRedeem, promoCode,
        partnerPhone: partnerPhone || null, wantReceipt: Boolean(wantReceipt), refCode,
        voucherNote: voucher.warning ? `שובר ${voucher.code}: ${voucher.warning}` : null,
        attr: toSheetColumns(record),
      }));
      if (isVoucherRedeem) invalidateVoucherCache();
    } catch (err) {
      // The page shows an error and the couple can retry; Lihi still gets the email below (flagged).
      storeFailed = true;
      console.error("Failed to save the order:", err);
    }
    const payment = storeFailed ? { payment_url: null, reason: "store_failed", mode: null } : await startPayment(store, record);
    if (payment.reason) record.payment_fallback_reason = payment.reason;
    // Review gate (requirement 6): with PAYMENTS_ENABLED unset a store failure looks to the customer
    // exactly as before (success screen + confirmation email); only with payments on do we stop,
    // because there is no saved order to pay against.
    const failHard = storeFailed && paymentsEnabled();
    const promoWarningBlock = promoCode && !promo
      // DRAFT he copy: awaiting Lihi
      ? `<p style="background: #FEE2E2; border: 1px solid #F87171; border-radius: 8px; padding: 12px 16px; font-size: 15px;"><strong>קוד פרומו לא מוכר בשרת</strong> (${String(promoCode).replace(/[<>&"]/g, "")}): נרשם מחיר מלא, ${amount} ₪.</p>`
      : "";
    const storeFailedBlock = storeFailed
      // DRAFT he copy: awaiting Lihi
      ? `<p style="background: #FEE2E2; border: 1px solid #F87171; border-radius: 8px; padding: 12px 16px; font-size: 15px;"><strong>ההזמנה לא נשמרה בטבלה</strong> (${order_id}). ${failHard ? "הזוג ראה הודעת שגיאה ואולי ינסה שוב." : "הזוג ראה מסך הצלחה כרגיל."}</p>`
      : "";

    // The emails, the Meta Lead and the calendar reminders run after the answer, so the couple reaches
    // the payment screen without waiting for them (Lihi, 4.11.2026: "אפשר להאיץ את המעבר לדף של גרואו?").
    const notifyJob = afterResponse(async () => {
      // Meta CAPI Lead only (5.4 step 9): event_id lead_<order_id>, value = the server amount.
      // Purchase is sent once, server side, after a verified payment (api/_fulfil.ts).
      if (!storeFailed) {
        await sendLeadRecorded(store, record, {
          // result -> capi_lead_result / capi_lead_sent_at / capi_last_error_code; denied consent is skipped
          event_id: record.lead_event_id,
          event_source_url: record.event_source_url ?? undefined,
          user_data: {
            em: record.buyer.email, ph: record.buyer.phone, fn: partner1 || null, ln: address?.lastName || null,
            fbc: record.fbc, fbp: record.fbp, client_ip: record.client_ip, client_user_agent: record.user_agent,
            external_id: record.visitor_id,
          },
          custom_data: {
            value: amount, currency: "ILS", content_name: "couple_kit",
            content_category: promoCode ? "promo" : isVoucherRedeem ? "voucher_redeem" : "order",
            num_items: meetings.length, order_id,
          },
          test_event_code: process.env.META_TEST_EVENT_CODE || undefined,
        });
      }


      // Create Google Calendar reminders (preweek + wedding day) if we have a
      // wedding date. Falls back to attaching an .ics file if the calendar
      // write fails. Never blocks or fails the order.
      let reminderBlock = "";
      const icsAttachments: { filename: string; content: string }[] = [];
      if (weddingDate) {
        try {
          const outcome = await createWeddingReminders({
            partner1, partner2, phone, weddingDate,
          });
          reminderBlock = buildReminderEmailBlock({
            outcome, partner1, partner2, phone,
          });
          if (!outcome.addedToCalendar && outcome.icsContent) {
            icsAttachments.push({
              filename: "reminders.ics",
              content: Buffer.from(outcome.icsContent, "utf8").toString("base64"),
            });
          }
        } catch (err) {
          console.error("Failed to create wedding reminders:", err);
        }
      }

      // Lihi's email: the order is already saved, so a failed email no longer fails the request.
      try {
        await resend.emails.send({
          from: "בשעה טובה <orders@beshaa-tova.co.il>",
          to,
          subject: `${subjectPrefix}: ${partner1} (${genderLabel(gender1)}) ו${partner2} (${genderLabel(gender2)})`,
          attachments: icsAttachments.length > 0 ? icsAttachments : undefined,
          html: `
            <div dir="rtl" style="font-family: sans-serif; line-height: 1.8;">
              <h2>${promoCode ? `🏷️ הזמנה עם קוד פרומו` : isVoucherRedeem ? "🎁 מימוש שובר מתנה" : "הזמנה חדשה התקבלה!"}</h2>
              ${promoCode ? `<p style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px 16px; font-size: 16px; text-align: center;"><strong>קוד פרומו:</strong> ${promoCode}${promo ? ` &nbsp;|&nbsp; <strong>הנחה:</strong> ${promo.discount_pct}% (${promo.source === "friend" ? "קוד חבר מערכה" : promo.source === "partner" ? "קוד שותף" : "קוד הנחה"})` : ""} &nbsp;|&nbsp; <strong>מחיר:</strong> ${promo ? `${amount - expressIls} ₪ (במקום ${allMeetings ? prices.all : lite && prices.lite !== null ? prices.lite : prices.base} ₪)` : `${amount - expressIls} ₪ (הקוד לא מוכר, מחיר מלא)`}${allMeetings ? " - כל המפגשים" : lite ? " - לייט, 4 מפגשים" : ""}</p>` : ""}
              ${allMeetings && !isVoucherRedeem ? `<p style="background: #FDF2E9; border: 1px solid #E8A87C; border-radius: 8px; padding: 12px 16px; font-size: 16px; text-align: center;"><strong>כל 11 המפגשים</strong> &nbsp;|&nbsp; <strong>מחיר:</strong> ${prices.all} ₪ (במקום ${prices.base} ₪)</p>` : ""}
              ${lite ? `<p style="background: #FDF2E9; border: 1px solid #E8A87C; border-radius: 8px; padding: 12px 16px; font-size: 16px; text-align: center;"><strong>ערכת לייט, 4 מפגשים</strong>${isVoucherRedeem ? " (שובר לייט)" : ` &nbsp;|&nbsp; <strong>מחיר:</strong> ${amount - expressIls} ₪`}</p>` : ""}
              ${expressIls ? `<p style="background: #EFF6FF; border: 1px solid #93C5FD; border-radius: 8px; padding: 12px 16px; font-size: 16px; text-align: center;"><strong>🚚 משלוח מהיר</strong> &nbsp;|&nbsp; +${expressIls} ₪ (כלול בסכום לתשלום)</p>` : ""}
              ${storeFailedBlock}
              ${noPaymentLinkBlock(record, payment.payment_url)}
              ${storeFailed ? "" : markPaidEmailBlock(req, record)}
              ${promoWarningBlock}
              ${voucherWarningBlock}
              ${isVoucherRedeem && voucherCode ? `<p style="background: #FDF8F5; border: 1px dashed #E8D1C4; border-radius: 8px; padding: 12px 16px; font-size: 16px; text-align: center;"><strong>קוד שובר:</strong> <span style="direction: ltr; display: inline-block; letter-spacing: 1px;">${voucherCode}</span></p>` : ""}
              <table style="border-collapse: collapse; margin: 16px 0;">${lihiEmailRows(record)}
                <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">בן/בת זוג 1:</td><td style="padding: 6px 0;">${partner1} (${genderLabel(gender1)})</td></tr>
                <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">בן/בת זוג 2:</td><td style="padding: 6px 0;">${partner2} (${genderLabel(gender2)})</td></tr>
                <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">טלפון:</td><td style="padding: 6px 0; direction: ltr;">${phone}</td></tr>
                ${partnerPhone ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">טלפון בן/בת הזוג:</td><td style="padding: 6px 0; direction: ltr;">${partnerPhone}</td></tr>` : ""}
                ${email ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">מייל:</td><td style="padding: 6px 0; direction: ltr;">${email}</td></tr>` : ""}
                <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">תאריך חתונה:</td><td style="padding: 6px 0;">${weddingStr}</td></tr>
                <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">כתובת למשלוח:</td><td style="padding: 6px 0;">${addressStr}${address?.zipCode ? `, מיקוד ${address.zipCode}` : ""}</td></tr>
                <tr><td style="padding: 6px 16px 6px 0; font-weight: bold; vertical-align: top;">מפגשים (${meetings.length}):</td><td style="padding: 6px 0;"><ul style="margin: 0; padding-right: 20px;">${meetings.map((id: string) => `<li>${id === "13" ? "<strong>הכתובה שלנו (תמיד כלול)</strong>" : (ALL_MEETINGS[id] || id)}</li>`).join("")}</ul></td></tr>
                ${voucherCode && !isVoucherRedeem ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">קוד שובר:</td><td style="padding: 6px 0;">${voucherCode}</td></tr>` : ""}
                ${freeText ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold; vertical-align: top;">הערות:</td><td style="padding: 6px 0;">${freeText}</td></tr>` : ""}
                ${modestLanguage ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">התאמה לדתיים:</td><td style="padding: 6px 0;">✅ כן</td></tr>` : ""}
                ${shabbat ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">מפגשים בשבת:</td><td style="padding: 6px 0;">✅ החלק האישי בכתיבה מראש, החלק הזוגי בשבת בלי כתיבה (לחזור לזוג ולהתאים)</td></tr>` : ""}
                ${postWedding ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">אחרי החתונה:</td><td style="padding: 6px 0;">✅ כבר התחתנו / מתכננים מפגשים אחרי החתונה</td></tr>` : ""}
                ${referralSource ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">איך שמעו עלינו:</td><td style="padding: 6px 0;">${referralSource}</td></tr>` : ""}
                ${refCode ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">קוד הפניה (ref):</td><td style="padding: 6px 0; direction: ltr;">${refCode}</td></tr>` : ""}
                ${utmText ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">UTM:</td><td style="padding: 6px 0; direction: ltr;">${utmText}</td></tr>` : ""}
                ${wantReceipt ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">קבלה:</td><td style="padding: 6px 0;">✅ ביקשו קבלה למייל${email ? "" : " (לא הוזן מייל)"}</td></tr>` : ""}
              </table>
              ${reminderBlock}
              <p style="color: #9B8E82; font-size: 14px;">יש ליצור קשר עם הזוג בוואטסאפ למספר שלמעלה.</p>
            </div>
          `,
        });
      } catch (err) {
        console.error("Failed to send the order email to Lihi:", err);
      }

      // Send confirmation email to the couple (if they provided an email).
      // Failures here are logged but never fail the request: the order is already saved.
      if (!failHard && email && typeof email === "string" && email.includes("@")) {
        try {
          const { subject: coupleSubject, html: coupleHtml } = buildCoupleOrderEmail({
            partner1,
            partner2,
            email,
            meetings,
            meetingTitles: ALL_MEETINGS,
            weddingDate,
            address,
            isVoucherRedeem: Boolean(isVoucherRedeem),
            promoCode: promoCode || null,
          });
          await resend.emails.send({
            from: "בשעה טובה <orders@beshaa-tova.co.il>",
            to: email,
            replyTo: "beshaatova.il@gmail.com",
            subject: coupleSubject,
            html: coupleHtml,
          });
        } catch (err) {
          console.error("Failed to send couple confirmation email:", err);
        }
      }
    });
    if (!notifyJob.deferred || failHard) await notifyJob.done;

    if (failHard) return res.status(500).json({ error: "שגיאה בשליחת הפנייה. נסו שוב." });
    // Fixed Grow pages go in `pay_url` (the page shows the order code first); `payment_url` is only the
    // per-order hosted page (API). An old cached bundle that knows only payment_url then shows
    // today's WhatsApp screen instead of a Grow page without the code.
    const hosted = !storeFailed && payment.mode === "hosted" ? payment.payment_url : null;
    const fixed = !storeFailed && payment.mode === "fixed_page" ? payment.payment_url : null;
    return res.status(200).json({ success: true, order_id, amount, currency: "ILS", payment_url: hosted, pay_url: fixed, pay_mode: fixed ? "fixed_page" : hosted ? "hosted" : !storeFailed && payment.mode === "manual" ? "manual" : null, lead_event_id: record.lead_event_id });
  } catch (error) {
    console.error("Failed to send order email:", error);
    return res.status(500).json({ error: "שגיאה בשליחת הפנייה. נסו שוב." });
  }
}
