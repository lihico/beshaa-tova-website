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
  return digits.length >= 7 && digits.length <= 15;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { partner1, partner2, gender1, gender2, phone, weddingDate, address, meetings, desiredCount, freeText } = req.body;

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

    const to = process.env.ORDER_NOTIFICATION_EMAIL!;

    await resend.emails.send({
      from: "בשעה טובה <orders@beshaa-tova.co.il>",
      to,
      subject: `הזמנה חדשה: ${partner1} (${genderLabel(gender1)}) ו${partner2} (${genderLabel(gender2)})`,
      html: `
        <div dir="rtl" style="font-family: sans-serif; line-height: 1.8;">
          <h2>הזמנה חדשה התקבלה!</h2>
          <table style="border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">בן/בת זוג 1:</td><td style="padding: 6px 0;">${partner1} (${genderLabel(gender1)})</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">בן/בת זוג 2:</td><td style="padding: 6px 0;">${partner2} (${genderLabel(gender2)})</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">טלפון:</td><td style="padding: 6px 0; direction: ltr;">${phone}</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">תאריך חתונה:</td><td style="padding: 6px 0;">${weddingStr}</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">כתובת למשלוח:</td><td style="padding: 6px 0;">${addressStr}</td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold; vertical-align: top;">מפגשים (${meetings.length}):</td><td style="padding: 6px 0;"><ul style="margin: 0; padding-right: 20px;">${meetings.map((id: string) => `<li>${ALL_MEETINGS[id] || id}</li>`).join("")}<li><strong>הכתובה שלנו (תמיד כלול)</strong></li></ul></td></tr>
            <tr><td style="padding: 6px 16px 6px 0; font-weight: bold;">כמות מפגשים רצויה:</td><td style="padding: 6px 0;">${desiredCount || "לא צוין"}</td></tr>
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
