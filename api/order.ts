import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

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
    const { partner1, partner2, gender1, gender2, phone, email, weddingDate, address, meetings, desiredCount, freeText, voucherCode, isVoucherRedeem } = req.body;

    if (!partner1 || !partner2 || !gender1 || !gender2 || !phone || !meetings?.length) {
      return res.status(400).json({ error: "חסרים פרטים בטופס." });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: "מספר הטלפון לא תקין." });
    }

    const genderLabel = (g: string) => g === "F" ? "נ" : "ז";
    const weddingStr = weddingDate ? new Date(weddingDate).toLocaleDateString("he-IL") : "לא צוין";
    const addressStr = address
      ? [address.street, address.apartment ? `דירה ${address.apartment}` : "", address.city].filter(Boolean).join(", ")
      : "לא צוין";

    const to = process.env.ORDER_NOTIFICATION_EMAIL || "beshaatova.il@gmail.com";

    const subjectPrefix = isVoucherRedeem ? "מימוש שובר" : "הזמנה חדשה";

    await resend.emails.send({
      from: "בשעה טובה <orders@beshaa-tova.co.il>",
      to,
      subject: `${subjectPrefix}: ${partner1} (${genderLabel(gender1)}) ו${partner2} (${genderLabel(gender2)})`,
      html: `
        <div dir="rtl" style="font-family: sans-serif; line-height: 1.8;">
          <h2>${isVoucherRedeem ? "🎁 מימוש שובר מתנה" : "הזמנה חדשה התקבלה!"}</h2>
          ${isVoucherRedeem && voucherCode ? `<p style="background: #FDF8F5; border: 1px dashed #E8D1C4; border-radius: 8px; padding: 12px 16px; font-size: 16px; text-align: center;"><strong>קוד שובר:</strong> <span style="direction: ltr; display: inline-block; letter-spacing: 1px;">${voucherCode}</span></p>` : ""}
          <table style="border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">בן/בת זוג 1:</td><td style="padding: 6px 0;">${partner1} (${genderLabel(gender1)})</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">בן/בת זוג 2:</td><td style="padding: 6px 0;">${partner2} (${genderLabel(gender2)})</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">טלפון:</td><td style="padding: 6px 0; direction: ltr;">${phone}</td></tr>
            ${email ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">מייל:</td><td style="padding: 6px 0; direction: ltr;">${email}</td></tr>` : ""}
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">תאריך חתונה:</td><td style="padding: 6px 0;">${weddingStr}</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">כתובת למשלוח:</td><td style="padding: 6px 0;">${addressStr}${address?.zipCode ? `, מיקוד ${address.zipCode}` : ""}</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold; vertical-align: top;">מפגשים (${meetings.length}):</td><td style="padding: 6px 0;"><ul style="margin: 0; padding-right: 20px;">${meetings.map((id: string) => `<li>${ALL_MEETINGS[id] || id}</li>`).join("")}<li><strong>הכתובה שלנו (תמיד כלול)</strong></li></ul></td></tr>
            ${!isVoucherRedeem ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">כמות מפגשים רצויה:</td><td style="padding: 6px 0;">${desiredCount || "לא צוין"}</td></tr>` : ""}
            ${voucherCode && !isVoucherRedeem ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">קוד שובר:</td><td style="padding: 6px 0;">${voucherCode}</td></tr>` : ""}
            ${freeText ? `<tr><td style="padding: 6px 16px 6px 0; font-weight: bold; vertical-align: top;">הערות:</td><td style="padding: 6px 0;">${freeText}</td></tr>` : ""}
          </table>
          <p style="color: #9B8E82; font-size: 14px;">יש ליצור קשר עם הזוג בוואטסאפ למספר שלמעלה.</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to send order email:", error);
    return res.status(500).json({ error: "שגיאה בשליחת הפנייה. נסו שוב." });
  }
}
