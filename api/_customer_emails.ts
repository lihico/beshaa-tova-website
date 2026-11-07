// Branded HTML email templates sent to customers (couples and gift givers).
// Design tokens mirror the site brand: --sand #E8D5B7, --chocolate #3D2B1F,
// --terra #A85638, --cream #FAF7F2. Inline styles only — email clients strip <style>.

const COLOR_CREAM = "#FAF7F2";
const COLOR_SAND = "#E8D5B7";
const COLOR_CHOCOLATE = "#3D2B1F";
const COLOR_TERRA = "#A85638";
const COLOR_MUTED = "#7A6A5C";

const FONT_STACK = "'Noto Sans Hebrew','Segoe UI',Arial,sans-serif";

const SITE_URL = "https://beshaa-tova.co.il";
const LOGO_URL = "https://beshaa-tova.co.il/logo.png";
const CONTACT_EMAIL = "beshaatova.il@gmail.com";
const WHATSAPP_DISPLAY = "050-2023669";
const WHATSAPP_LINK = "https://wa.me/972502023669";

// Canonical meeting order for display: topics in program order, Ketubah always last.
// Matches the order shown in the site's order form (Order.tsx MEETINGS array).
const MEETING_DISPLAY_ORDER = ["02", "03", "04", "05", "12", "06", "07", "08", "09", "10", "13"];

function sortMeetings(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ia = MEETING_DISPLAY_ORDER.indexOf(a);
    const ib = MEETING_DISPLAY_ORDER.indexOf(b);
    // Unknown ids go to the end, Ketubah (13) always last via its position in the array.
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function shell(innerHtml: string, previewText: string): string {
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <!--[if !mso]><!-->
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;500;600;700&display=swap');
      </style>
      <!--<![endif]-->
    </head>
    <body style="margin:0;padding:0;background-color:${COLOR_CREAM};">
    <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLOR_CREAM};opacity:0;">${previewText}</div>
    <div dir="rtl" lang="he" style="background-color:${COLOR_CREAM};padding:32px 16px;font-family:${FONT_STACK};color:${COLOR_CHOCOLATE};line-height:1.7;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${COLOR_SAND};font-family:${FONT_STACK};">
        <tr>
          <td style="background-color:${COLOR_SAND};padding:28px 32px;text-align:center;">
            <img src="${LOGO_URL}" alt="בשעה טובה" width="180" style="display:block;margin:0 auto;width:180px;height:auto;" />
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-family:${FONT_STACK};">
            ${innerHtml}
          </td>
        </tr>
        <tr>
          <td style="background-color:${COLOR_CREAM};padding:20px 32px;text-align:center;font-size:12px;color:${COLOR_MUTED};border-top:1px solid ${COLOR_SAND};font-family:${FONT_STACK};">
            <div>לכל שאלה אפשר להשיב למייל הזה, לכתוב בוואטסאפ ל<a href="${WHATSAPP_LINK}" style="color:${COLOR_TERRA};text-decoration:none;">${WHATSAPP_DISPLAY}</a>, או <a href="mailto:${CONTACT_EMAIL}" style="color:${COLOR_TERRA};text-decoration:none;">במייל</a>.</div>
            <div style="margin-top:8px;"><a href="${SITE_URL}" style="color:${COLOR_MUTED};text-decoration:none;">beshaa-tova.co.il</a></div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 0 6px 16px;font-weight:600;color:${COLOR_CHOCOLATE};white-space:nowrap;vertical-align:top;font-family:${FONT_STACK};">${label}</td>
      <td style="padding:6px 0;color:${COLOR_CHOCOLATE};vertical-align:top;font-family:${FONT_STACK};">${value}</td>
    </tr>
  `;
}

// ---------- Couple order confirmation ----------

export interface CoupleOrderEmailInput {
  partner1: string;
  partner2: string;
  email: string;
  meetings: string[];
  meetingTitles: Record<string, string>;
  weddingDate?: string | null;
  address?: { street?: string; apartment?: string; city?: string; zipCode?: string; lastName?: string } | null;
  isVoucherRedeem?: boolean;
  promoCode?: string | null;
}

export function buildCoupleOrderEmail(input: CoupleOrderEmailInput): {
  subject: string;
  html: string;
} {
  const { partner1, partner2, meetings, meetingTitles, weddingDate, address, isVoucherRedeem, promoCode } = input;

  const weddingStr = weddingDate ? new Date(weddingDate).toLocaleDateString("he-IL") : null;
  const addressStr = address
    ? [address.lastName ? `משפחת ${address.lastName}` : "", address.street, address.apartment ? `דירה ${address.apartment}` : "", address.city].filter(Boolean).join(", ")
    : null;

  const orderedMeetings = sortMeetings(meetings);
  const meetingsList = orderedMeetings
    .map((id) => `<li style="margin:4px 0;">${id === "13" ? "<strong>הכתובה שלנו</strong>" : (meetingTitles[id] || id)}</li>`)
    .join("");

  const opening = isVoucherRedeem
    ? `איזה כיף שבחרתם לממש את השובר שלכם. קיבלתי את הפרטים, וכל מה שצריך כבר אצלי.`
    : `קיבלתי את ההזמנה שלכם, והיא בהכנה!`;

  const innerHtml = `
    <h1 style="font-size:22px;font-weight:700;color:${COLOR_CHOCOLATE};margin:0 0 16px 0;font-family:${FONT_STACK};">${partner1} ו${partner2}, ההזמנה התקבלה</h1>
    <p style="margin:0 0 16px 0;color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">${opening}</p>
    ${promoCode ? `<p style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:10px 14px;font-size:14px;margin:0 0 16px 0;font-family:${FONT_STACK};">קוד הפרומו <strong>${promoCode}</strong> הופעל בהצלחה.</p>` : ""}

    <div style="font-weight:700;color:${COLOR_CHOCOLATE};margin:20px 0 8px 0;font-family:${FONT_STACK};">סיכום ההזמנה</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:15px;font-family:${FONT_STACK};">
      ${detailRow("שמות:", `${partner1} ו${partner2}`)}
      ${weddingStr ? detailRow("תאריך חתונה:", weddingStr) : ""}
      ${addressStr ? detailRow("כתובת למשלוח:", `${addressStr}${address?.zipCode ? `, מיקוד ${address.zipCode}` : ""}`) : ""}
      ${detailRow(`מפגשים (${orderedMeetings.length}):`, `<ul style="margin:0;padding-right:20px;font-family:${FONT_STACK};">${meetingsList}</ul>`)}
    </table>

    <div style="background-color:${COLOR_CREAM};border-right:4px solid ${COLOR_TERRA};border-radius:8px;padding:16px 20px;margin:24px 0;font-family:${FONT_STACK};">
      <div style="font-weight:700;color:${COLOR_CHOCOLATE};margin-bottom:6px;font-family:${FONT_STACK};">מה קורה עכשיו?</div>
      <div style="color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">הערכות שלכן נוצרות בהתאמה אישית אליכם, אצור אתכם קשר ב-48 שעות הקרובות :)</div>
    </div>

    <p style="margin:16px 0 0 0;color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">אם יש משהו חשוב נוסף או טעות בהזמנה - השיבו למייל או צרו קשר בוואטסאפ.</p>
    <p style="margin:16px 0 0 0;color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">בשעה טובה,<br/>ליהי</p>
  `;

  const subject = `${partner1} ו${partner2}, קיבלתי את ההזמנה`;
  return { subject, html: shell(innerHtml, `קיבלתי את ההזמנה שלכם. אצור אתכם קשר ב-48 שעות הקרובות.`) };
}

// ---------- Gift voucher confirmation (to giver) ----------

export interface GiftGiverEmailInput {
  giverName: string;
  coupleName1: string;
  coupleName2: string;
  weddingDate: string;
  giftDelivery: "self" | "direct";
  blessing?: string | null;
}

export function buildGiftGiverEmail(input: GiftGiverEmailInput): {
  subject: string;
  html: string;
} {
  const { giverName, coupleName1, coupleName2, weddingDate, giftDelivery, blessing } = input;

  const innerHtml = `
    <h1 style="font-size:22px;font-weight:700;color:${COLOR_CHOCOLATE};margin:0 0 16px 0;font-family:${FONT_STACK};">${giverName}, קיבלתי את ההזמנה</h1>
    <p style="margin:0 0 16px 0;color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">איזו מתנה מקסימה רכשת ל${coupleName1} ו${coupleName2}.</p>

    <div style="font-weight:700;color:${COLOR_CHOCOLATE};margin:20px 0 8px 0;font-family:${FONT_STACK};">פרטי ההזמנה</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:15px;font-family:${FONT_STACK};">
      ${detailRow("הזוג:", `${coupleName1} ו${coupleName2}`)}
      ${detailRow("תאריך חתונה:", weddingDate)}
      ${detailRow("אופן העברה:", giftDelivery === "direct" ? "שליחה ישירה לזוג" : "אעביר בעצמי")}
      ${blessing ? detailRow("ברכה:", blessing) : ""}
    </table>

    <div style="background-color:${COLOR_CREAM};border-right:4px solid ${COLOR_TERRA};border-radius:8px;padding:16px 20px;margin:24px 0;font-family:${FONT_STACK};">
      <div style="font-weight:700;color:${COLOR_CHOCOLATE};margin-bottom:6px;font-family:${FONT_STACK};">מה קורה עכשיו?</div>
      <div style="color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">${giftDelivery === "direct"
        ? `מיד אחרי שהתשלום יאושר, אשלח את השובר ל${coupleName1} ו${coupleName2}, ועותק יגיע גם למייל הזה.`
        : `מיד אחרי שהתשלום יאושר, השובר יגיע למייל הזה כקובץ PDF, מוכן להעברה ל${coupleName1} ו${coupleName2}.`}</div>
    </div>

    <p style="margin:16px 0 0 0;color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">אם יש משהו חשוב נוסף או טעות בהזמנה - בבקשה להשיב למייל הזה או ליצור קשר בוואטסאפ.</p>
    <p style="margin:16px 0 0 0;color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">בשעה טובה,<br/>ליהי</p>
  `;

  const subject = `${giverName}, קיבלתי את ההזמנה - שובר ל${coupleName1} ו${coupleName2}`;
  return { subject, html: shell(innerHtml, `קיבלתי את ההזמנה. השובר יישלח אחרי אישור התשלום.`) };
}

// ---------- Gift voucher released after payment (to giver, PDF attached) ----------

export interface GiftVoucherReadyEmailInput {
  giverName: string;
  coupleName1: string;
  coupleName2: string;
  code: string;
  redeemUrl: string;
  giftDelivery: "self" | "direct";
  contactName?: string | null;
}

export function buildGiftVoucherReadyEmail(input: GiftVoucherReadyEmailInput): {
  subject: string;
  html: string;
} {
  const { giverName, coupleName1, coupleName2, code, redeemUrl, giftDelivery, contactName } = input;

  const howTo = giftDelivery === "direct"
    ? `כמו שביקשת, אשלח את השובר גם ישירות ל${contactName || coupleName1}. העותק הזה בשבילך.`
    : `אפשר להעביר אותו לזוג מתי שנוח - בוואטסאפ, במייל או מודפס. הם יממשו אותו בסריקת ה-QR שבשובר, או עם קוד המימוש.`;

  const innerHtml = `
    <h1 style="font-size:22px;font-weight:700;color:${COLOR_CHOCOLATE};margin:0 0 16px 0;font-family:${FONT_STACK};">${giverName}, התשלום התקבל והשובר מוכן</h1>
    <p style="margin:0 0 16px 0;color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">תודה! שובר המתנה ל${coupleName1} ו${coupleName2} מצורף למייל הזה כקובץ PDF.</p>
    <p style="margin:0 0 16px 0;color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">${howTo}</p>

    <div style="background-color:${COLOR_CREAM};border-right:4px solid ${COLOR_TERRA};border-radius:8px;padding:16px 20px;margin:24px 0;font-family:${FONT_STACK};">
      <div style="color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">קוד מימוש: <strong style="direction:ltr;display:inline-block;letter-spacing:1px;">${code}</strong></div>
      <div style="color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">קישור מימוש: <a href="${redeemUrl}" style="color:${COLOR_TERRA};">${redeemUrl.replace(/^https:\/\//, "")}</a></div>
    </div>

    <p style="margin:16px 0 0 0;color:${COLOR_CHOCOLATE};font-family:${FONT_STACK};">בשעה טובה,<br/>ליהי</p>
  `;

  const subject = `${giverName}, השובר ל${coupleName1} ו${coupleName2} מוכן`;
  return { subject, html: shell(innerHtml, `התשלום התקבל, והשובר מצורף כקובץ PDF.`) };
}
