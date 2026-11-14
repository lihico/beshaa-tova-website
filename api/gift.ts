import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterResponse } from "./_bg.js";
import { Resend } from "resend";
import { appendGiftRow, cleanAttribution } from "./_sheets.js";
import { buildGiftGiverEmail } from "./_customer_emails.js";
import { createWeddingReminders, buildReminderEmailBlock } from "./_calendar.js";
import { sendLeadRecorded } from "./_meta-capi.js";
import { buildVoucherHtml, generateVoucherCode, buildRedeemUrl, waLink, coupleVoucherMessage, giverVoucherMessage } from "./_voucher.js";
import { buildVoucherQr, renderVoucherPdf } from "./_voucher-pdf.js";
import { createReleaseToken, buildReleaseUrl } from "./_gift_release.js";
import { toSheetColumns } from "./_attribution_core.js";
import { newOrderId } from "./_ids.js";
import { activePrices, isKitTier, priceOrder, tierFor, type KitTier } from "./_pricing.js";
import { getStore } from "./_store.js";
import { startPayment } from "./_checkout.js";
import { paymentsEnabled } from "./_payments.js";
import { buildOrderRecord, lihiEmailRows, noPaymentLinkBlock } from "./_order_build.js";
import { attachRefPartner } from "./_affiliate.js";
import { markPaidEmailBlock } from "./_mark_paid.js";

const resend = new Resend(process.env.RESEND_API_KEY);

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { giverName, giverPhone, giverEmail, coupleName1, coupleName2, weddingDate, blessing, couplePhoto, giftDelivery, coupleContactName, couplePhone, postWedding, notes, referralSource, wantReceipt, giftAllMeetings: giftAllRaw, giftTier: giftTierRaw, ref, utm, fbc, fbp, event_id, visitor_id, event_source_url } = req.body;
    const { refCode, utmText } = cleanAttribution(ref, utm);

    // Legacy /redeem post (src/pages/Redeem.tsx): giverEmail "redeem@voucher" never passed the email
    // check below, so it was always a 400 with no row, email or payment. Keep that explicitly, so a
    // redemption can never become a paid gift order (order_kind=gift, startPayment, Lead) even if
    // the email check is loosened. The couple's WhatsApp message to Lihi is the real redemption.
    const isRedeemPost = giverEmail === "redeem@voucher" || String(giverName ?? "").startsWith("מימוש שובר:");
    if (isRedeemPost) {
      return res.status(400).json({ error: "כתובת המייל לא תקינה." });
    }
    if (!giverName || !giverPhone || !giverEmail || !coupleName1 || !coupleName2 || !weddingDate) {
      return res.status(400).json({ error: "חסרים פרטים בטופס." });
    }
    if (!isValidPhone(giverPhone)) {
      return res.status(400).json({ error: "מספר הטלפון לא תקין." });
    }
    if (!isValidEmail(giverEmail)) {
      return res.status(400).json({ error: "כתובת המייל לא תקינה." });
    }

    const to = process.env.ORDER_NOTIFICATION_EMAIL || "beshaatova.il@gmail.com";

    // The voucher code is made now and saved in the sheet, but the voucher itself goes out only
    // after Lihi confirms payment (21.10.2026): her email carries a signed release link
    // (api/gift-release.ts), which renders the PDF and emails it to the giver. Without
    // GIFT_RELEASE_SECRET the old behaviour stays: the PDF comes to Lihi and she sends it by hand.
    const voucherCode = generateVoucherCode(weddingDate);
    const redeemUrl = buildRedeemUrl(voucherCode);
    const releaseToken = createReleaseToken(voucherCode, {
      delivery: giftDelivery === "direct" ? "direct" : "self",
      couplePhone: giftDelivery === "direct" ? couplePhone : null,
      contactName: giftDelivery === "direct" ? coupleContactName : null,
    });

    // docs/attribution 5.4 (gift): server price, order id, attribution frozen on the order (the gift
    // row now carries fbc/fbp/event_id/visitor_id/session_id too), saved BEFORE any email, then the
    // payment link. The voucher is released on payment (api/_fulfil.ts) or by Lihi's link below.
    const store = getStore();
    // The gift form offers the full kit only when the price table has a full-kit voucher price.
    const prices = activePrices();
    // giftTier (14.11.2026): lite (4) / base (8) / all (11); an old bundle sends only giftAllMeetings.
    const askedTier: KitTier = isKitTier(giftTierRaw) ? giftTierRaw : giftAllRaw === true ? "all" : "base";
    const giftTier = tierFor(prices, { kind: "gift", allMeetings: askedTier === "all", tier: askedTier });
    const giftAllMeetings = giftTier === "all";
    const giftLite = giftTier === "lite";
    const { amount, rule } = priceOrder({ kind: "gift", allMeetings: giftAllMeetings, tier: giftTier, promo: null, freeVoucher: false }, prices);
    const order_id = await newOrderId({ getOrder: (id) => store.getOrder(id).catch(() => null) });
    const record = buildOrderRecord(req, {
      order_id, kind: "gift", amount, rule, promo: null, promoCodeRaw: null,
      buyer: { name: String(giverName).trim(), phone: giverPhone, email: giverEmail },
      couple: { name1: coupleName1, name2: coupleName2 },
      all_meetings: giftAllMeetings,
      voucher_code: voucherCode,
      gift_release_extras: {
        delivery: giftDelivery === "direct" ? "direct" : "self",
        couplePhone: giftDelivery === "direct" ? couplePhone ?? null : null,
        contactName: giftDelivery === "direct" ? coupleContactName ?? null : null,
      },
      body: req.body,
    });
    await attachRefPartner(record, store);   // section 8: an aff-<id> ref credits a partner when no code was typed
    let storeFailed = false;
    try {
      await store.appendOrder(record, () => appendGiftRow({
        giverName, giverPhone, giverEmail,
        coupleName1, coupleName2, weddingDate,
        blessing, postWedding, notes, referralSource,
        voucherCode,
        wantReceipt: Boolean(wantReceipt), refCode,
        giftAllMeetings, giftLite, giftPrice: amount,
        attr: toSheetColumns(record),
      }));
    } catch (err) {
      storeFailed = true;
      console.error("Failed to save the gift order:", err);
    }
    const payment = storeFailed ? { payment_url: null, reason: "store_failed", mode: null } : await startPayment(store, record);
    if (payment.reason) record.payment_fallback_reason = payment.reason;
    // Review gate (requirement 6): with PAYMENTS_ENABLED unset a store failure looks to the giver
    // exactly as before (success screen + confirmation email); Lihi's email is still flagged.
    const failHard = storeFailed && paymentsEnabled();

    // Emails (with the voucher PDF), the Meta Lead and the reminders run after the answer, so the giver
    // reaches the payment screen at once (Lihi, 4.11.2026).
    const notifyJob = afterResponse(async () => {
      // Meta CAPI Lead only: lead_<order_id>. The Purchase is sent after a verified payment.
      if (!storeFailed) {
        await sendLeadRecorded(store, record, {
          // result -> capi_lead_result / capi_lead_sent_at / capi_last_error_code; denied consent is skipped
          event_id: record.lead_event_id, event_source_url: record.event_source_url ?? undefined,
          user_data: {
            em: giverEmail || null, ph: giverPhone || null, fn: giverName || null,
            fbc: record.fbc, fbp: record.fbp, client_ip: record.client_ip, client_user_agent: record.user_agent,
            external_id: record.visitor_id,
          },
          custom_data: { value: amount, currency: "ILS", content_name: "couple_kit_gift", content_category: "gift", order_id },
          test_event_code: process.env.META_TEST_EVENT_CODE || undefined,
        });
      }

      // Create Google Calendar reminders for the couple's wedding. Only
      // possible when we actually have the couple's phone (direct delivery);
      // otherwise Lihi will need to contact the giver first.
      let reminderBlock = "";
      const icsAttachments: { filename: string; content: string }[] = [];
      if (weddingDate && couplePhone) {
        try {
          const outcome = await createWeddingReminders({
            partner1: coupleName1,
            partner2: coupleName2,
            phone: couplePhone,
            weddingDate,
          });
          reminderBlock = buildReminderEmailBlock({
            outcome,
            partner1: coupleName1,
            partner2: coupleName2,
            phone: couplePhone,
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

      // Combine calendar ICS + the couple photo (if provided) as email attachments.
      const attachments: { filename: string; content: string }[] = [...icsAttachments];
      if (couplePhoto && typeof couplePhoto === "string") {
        const photoMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(couplePhoto);
        if (photoMatch && photoMatch[2].length < 8_000_000) {
          const ext = photoMatch[1] === "image/png" ? "png" : photoMatch[1] === "image/webp" ? "webp" : "jpg";
          attachments.push({ filename: `couple-photo.${ext}`, content: photoMatch[2] });
        } else {
          console.error("Couple photo rejected: invalid data URL or too large");
        }
      }

      let voucherBlock = "";
      if (releaseToken) {
        const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
        const host = String(req.headers["x-forwarded-host"] || req.headers.host || "www.beshaa-tova.co.il").split(",")[0];
        const releaseUrl = buildReleaseUrl(`${proto}://${host}`, releaseToken);
        voucherBlock = `
            <div style="margin-top:16px;padding:12px 16px;border-radius:8px;background:#FDF8F5;border:1px solid #E8D1C4;">
              <p style="font-weight:bold;color:#A85638;margin-bottom:6px;">🎟️ קוד השובר נשמר בטבלה. השובר עצמו עוד לא נשלח ל${giverName}.</p>
              <p style="margin:2px 0;">קוד מימוש: <strong style="direction:ltr;display:inline-block;">${voucherCode}</strong></p>
              <p style="margin:8px 0 4px;">אחרי שהתשלום מתקבל, לוחצים כאן: השובר נוצר כ-PDF ונשלח ל${giverName} במייל, ועותק עם כפתור וואטסאפ מגיע אלייך.</p>
              <p style="margin:8px 0 0;"><a href="${releaseUrl}" style="display:inline-block;background:#A85638;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:22px;">אישרתי תשלום, לשלוח את השובר</a></p>
            </div>`;
      } else {
        console.error("GIFT_RELEASE_SECRET is not set: falling back to attaching the voucher for Lihi");
        const qrDataUri = await buildVoucherQr(voucherCode);
        const voucherHtml = buildVoucherHtml({ coupleName1, coupleName2, giverName, blessing, code: voucherCode, qrDataUri, meetings: giftAllMeetings ? 11 : giftLite ? 4 : 8 });
        const voucherPdf = await renderVoucherPdf(voucherHtml);
        if (voucherPdf) {
          attachments.push({ filename: `שובר מתנה - ${coupleName1} ו${coupleName2} - ${voucherCode}.pdf`, content: voucherPdf.toString("base64") });
        } else {
          attachments.push({ filename: `voucher-${voucherCode}.html`, content: Buffer.from(voucherHtml, "utf8").toString("base64") });
        }
        const waBtnStyle = "display:inline-block;margin-top:6px;background:#25D366;color:#fff;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:22px;";
        let waButton = "";
        if (giftDelivery === "direct" && couplePhone) {
          const link = waLink(couplePhone, coupleVoucherMessage({ contact: coupleContactName || coupleName1, giver: giverName, code: voucherCode }));
          waButton = `<a href="${link}" style="${waBtnStyle}">📲 שליחת השובר לזוג בוואטסאפ (${coupleContactName || coupleName1})</a>`;
        } else {
          const link = waLink(giverPhone, giverVoucherMessage({ giver: giverName, coupleName1, coupleName2, code: voucherCode }));
          waButton = `<a href="${link}" style="${waBtnStyle}">📲 שליחת השובר ל${giverName} בוואטסאפ</a>`;
        }
        voucherBlock = `
            <div style="margin-top:16px;padding:12px 16px;border-radius:8px;background:#FDF8F5;border:1px solid #E8D1C4;">
              <p style="font-weight:bold;color:#A85638;margin-bottom:6px;">${voucherPdf ? "🎟️ השובר נוצר אוטומטית - מצורף למייל כקובץ PDF, מוכן לשליחה" : "🎟️ השובר נוצר אוטומטית - מצורף כקובץ HTML (יצירת ה-PDF נכשלה: פותחים בדפדפן ומדפיסים ל-PDF)"}</p>
              <p style="margin:2px 0;">קוד מימוש: <strong style="direction:ltr;display:inline-block;">${voucherCode}</strong></p>
              <p style="margin:2px 0;">קישור מימוש: <a href="${redeemUrl}">${redeemUrl}</a></p>
              <p style="margin:8px 0 0;">${waButton}</p>
              <p style="margin:8px 0 0;font-size:13px;color:#9B8E82;">(כפתור השליחה האוטומטית לא פעיל: חסר GIFT_RELEASE_SECRET ב-Vercel.)</p>
            </div>`;
      }

      // Lihi's email: the order is already saved, so a failed email no longer fails the request.
      // DRAFT he copy: awaiting Lihi (the "not saved" line above)
      try {
        await resend.emails.send({
          from: "בשעה טובה <orders@beshaa-tova.co.il>",
          to,
          subject: `שובר מתנה: ${coupleName1} ו${coupleName2} (מאת ${giverName})`,
          attachments: attachments.length > 0 ? attachments : undefined,
          html: `
            <div dir="rtl" style="font-family: sans-serif; line-height: 1.8;">
              <h2>🎁 בקשה לשובר מתנה</h2>
              ${storeFailed ? `<p style="background: #FEE2E2; border: 1px solid #F87171; border-radius: 8px; padding: 12px 16px; font-size: 15px;"><strong>ההזמנה לא נשמרה בטבלה</strong> (${order_id}).</p>` : ""}
              ${noPaymentLinkBlock(record, payment.payment_url)}
              ${storeFailed ? "" : markPaidEmailBlock(req, record, { gift: true })}
              ${prices.gift.all !== null ? `<p style="background: #FDF2E9; border: 1px solid #E8A87C; border-radius: 8px; padding: 12px 16px; font-size: 16px; text-align: center;"><strong>${giftAllMeetings ? "שובר לערכה מלאה (11 מפגשים)" : giftLite ? "שובר לערכת לייט (4 מפגשים)" : "שובר לערכה (8 מפגשים)"}</strong> &nbsp;|&nbsp; <strong>מחיר:</strong> ${amount} ₪</p>` : ""}
              <table style="border-collapse: collapse; margin: 8px 0;">${lihiEmailRows(record)}
              </table>
              <h3 style="margin-top: 24px; color: #A85638;">נותנ/ת המתנה</h3>
              <table style="border-collapse: collapse; margin: 8px 0;">
                <tr><td style="padding: 4px 16px 4px 0; font-weight: bold;">שם:</td><td style="padding: 4px 0;">${giverName}</td></tr>
                <tr><td style="padding: 4px 16px 4px 0; font-weight: bold;">טלפון:</td><td style="padding: 4px 0; direction: ltr;">${giverPhone}</td></tr>
                <tr><td style="padding: 4px 16px 4px 0; font-weight: bold;">מייל:</td><td style="padding: 4px 0; direction: ltr;">${giverEmail}</td></tr>
              </table>
              <h3 style="margin-top: 24px; color: #A85638;">הזוג</h3>
              <table style="border-collapse: collapse; margin: 8px 0;">
                <tr><td style="padding: 4px 16px 4px 0; font-weight: bold;">שמות:</td><td style="padding: 4px 0;">${coupleName1} ו${coupleName2}</td></tr>
                <tr><td style="padding: 4px 16px 4px 0; font-weight: bold;">מועד חתונה:</td><td style="padding: 4px 0;">${weddingDate}</td></tr>
                ${couplePhone ? `<tr><td style="padding: 4px 16px 4px 0; font-weight: bold;">איש קשר:</td><td style="padding: 4px 0;">${coupleContactName || ""}</td></tr>` : ""}
                ${couplePhone ? `<tr><td style="padding: 4px 16px 4px 0; font-weight: bold;">טלפון:</td><td style="padding: 4px 0; direction: ltr;">${couplePhone}</td></tr>` : ""}
              </table>
              ${blessing ? `<p style="margin-top: 16px;"><strong>ברכה:</strong> ${blessing}</p>` : ""}
              ${couplePhoto ? `<p style="margin-top: 8px;"><strong>📷 תמונת הזוג:</strong> מצורפת למייל למטה.</p>` : ""}
              ${postWedding ? `<p style="margin-top: 8px; padding: 8px 12px; border-radius: 8px; background-color: #EDE9FE;"><strong>⏰ אחרי החתונה:</strong> הזוג כבר התחתן / מתכננים מפגשים אחרי החתונה</p>` : ""}
              ${notes ? `<p style="margin-top: 8px;"><strong>הערות:</strong> ${notes}</p>` : ""}
              ${referralSource ? `<p style="margin-top: 8px; font-size: 14px; color: #9B8E82;"><strong>איך שמעו עלינו:</strong> ${referralSource}</p>` : ""}
              ${refCode ? `<p style="margin-top: 8px; font-size: 14px; color: #9B8E82;"><strong>קוד הפניה (ref):</strong> <span style="direction: ltr; display: inline-block;">${refCode}</span></p>` : ""}
              ${utmText ? `<p style="margin-top: 8px; font-size: 14px; color: #9B8E82;"><strong>UTM:</strong> <span style="direction: ltr; display: inline-block;">${utmText}</span></p>` : ""}
              ${wantReceipt ? `<p style="margin-top: 8px;"><strong>קבלה:</strong> ✅ ביקשו קבלה למייל</p>` : ""}
              <p style="margin-top: 16px; padding: 12px; border-radius: 8px; background-color: ${giftDelivery === "direct" ? "#fef3c7" : "#f0fdf4"};">
                <strong>העברת השובר:</strong> ${giftDelivery === "direct" ? "🔔 הקונה ביקש/ה לשלוח ישירות לזוג" : "הקונה יעביר בעצמו/ה"}
              </p>
              <p style="color: #9B8E82; font-size: 14px; margin-top: 24px;">${giftDelivery === "direct"
                ? "יש ליצור קשר עם נותנ/ת המתנה לתיאום תשלום, ולשלוח את השובר ישירות לזוג."
                : "יש ליצור קשר עם נותנ/ת המתנה לתיאום תשלום ומשלוח השובר."}</p>
              ${voucherBlock}
              ${reminderBlock}
            </div>
          `,
        });
      } catch (err) {
        console.error("Failed to send the gift email to Lihi:", err);
      }

      // Send confirmation email to the gift giver. Failures here are logged but
      // never fail the request: the request is already saved.
      if (!failHard) try {
        const { subject: giverSubject, html: giverHtml } = buildGiftGiverEmail({
          giverName,
          coupleName1,
          coupleName2,
          weddingDate,
          giftDelivery: giftDelivery === "direct" ? "direct" : "self",
          blessing: blessing || null,
        });
        await resend.emails.send({
          from: "בשעה טובה <orders@beshaa-tova.co.il>",
          to: giverEmail,
          replyTo: "beshaatova.il@gmail.com",
          subject: giverSubject,
          html: giverHtml,
        });
      } catch (err) {
        console.error("Failed to send gift giver confirmation email:", err);
      }
    });
    if (!notifyJob.deferred || failHard) await notifyJob.done;

    if (failHard) return res.status(500).json({ error: "שגיאה בשליחת הפנייה. נסו שוב." });
    // Same response shape as api/order.ts: per-order (hosted) links in payment_url, fixed pages in pay_url.
    const hosted = !storeFailed && payment.mode === "hosted" ? payment.payment_url : null;
    const fixed = !storeFailed && payment.mode === "fixed_page" ? payment.payment_url : null;
    return res.status(200).json({ success: true, order_id, amount, currency: "ILS", payment_url: hosted, pay_url: fixed, pay_mode: fixed ? "fixed_page" : hosted ? "hosted" : !storeFailed && payment.mode === "manual" ? "manual" : null, lead_event_id: record.lead_event_id });
  } catch (error) {
    console.error("Failed to send gift email:", error);
    return res.status(500).json({ error: "שגיאה בשליחת הפנייה. נסו שוב." });
  }
}
