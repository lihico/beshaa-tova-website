import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { appendLeadRow } from "./_sheets.js";

const resend = new Resend(process.env.RESEND_API_KEY);

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

  const { name1, name2, phone, intent } = req.body || {};

  if (!name1?.trim()) {
    return res.status(400).json({ error: "Missing name" });
  }
  if (!phone?.trim() || !isValidPhone(phone)) {
    return res.status(400).json({ error: "Invalid phone" });
  }

  const intentLabel = intent === "gift" ? "מתנה" : intent === "self" ? "מאורס/ת" : "";

  try {
    await appendLeadRow({
      name1: name1.trim(),
      name2: name2?.trim() || "",
      phone: phone.trim(),
      intent: intentLabel,
    });
  } catch (err) {
    console.error("Sheet append failed:", err);
  }

  try {
    const displayName = name2?.trim()
      ? `${name1} ו${name2}`
      : name1;

    await resend.emails.send({
      from: "בשעה טובה <noreply@beshaa-tova.co.il>",
      to: "beshaatova.il@gmail.com",
      subject: `ליד חדש: ${displayName}`,
      html: `
        <div dir="rtl" style="font-family:sans-serif">
          <h2>ליד חדש מהאתר</h2>
          <p><strong>שם:</strong> ${displayName}</p>
          <p><strong>טלפון:</strong> <a href="https://wa.me/972${phone.replace(/\D/g, "").replace(/^0/, "")}">${phone}</a></p>
          <p><strong>סוג:</strong> ${intentLabel || "לא צוין"}</p>
          <p style="margin-top:16px;color:#888">ליד מטופס דף הבית</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Email send failed:", err);
  }

  return res.status(200).json({ ok: true });
}
