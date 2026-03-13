import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

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
    const { giverName, giverPhone, giverEmail, coupleName1, coupleName2, weddingDate } = req.body;

    if (!giverName || !giverPhone || !giverEmail || !coupleName1 || !coupleName2 || !weddingDate) {
      return res.status(400).json({ error: "חסרים פרטים בטופס." });
    }
    if (!isValidPhone(giverPhone)) {
      return res.status(400).json({ error: "מספר הטלפון לא תקין." });
    }
    if (!isValidEmail(giverEmail)) {
      return res.status(400).json({ error: "כתובת המייל לא תקינה." });
    }

    const to = process.env.ORDER_NOTIFICATION_EMAIL!;

    await resend.emails.send({
      from: "בשעה טובה <orders@beshaa-tova.co.il>",
      to,
      subject: `שובר מתנה: ${coupleName1} ו${coupleName2} (מאת ${giverName})`,
      html: `
        <div dir="rtl" style="font-family: sans-serif; line-height: 1.8;">
          <h2>🎁 בקשה לשובר מתנה</h2>
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
          </table>
          <p style="color: #9B8E82; font-size: 14px; margin-top: 24px;">יש ליצור קשר עם נותנ/ת המתנה לתיאום תשלום ומשלוח השובר.</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to send gift email:", error);
    return res.status(500).json({ error: "שגיאה בשליחת הפנייה. נסו שוב." });
  }
}
