// Sends preview versions of the customer confirmation emails to Lihi
// (beshaatova.il@gmail.com) so she can review them visually before launch.
// Run from the `website/` directory with env vars loaded from .env.local + Vercel RESEND_API_KEY.

import "dotenv/config";
import { Resend } from "resend";
import { buildCoupleOrderEmail, buildGiftGiverEmail } from "./api/_customer_emails.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const TO = "beshaatova.il@gmail.com";

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

async function sendAll() {
  // 1. Couple order confirmation
  const order = buildCoupleOrderEmail({
    partner1: "דניאל",
    partner2: "שירה",
    email: TO,
    meetings: ["13", "07", "02", "12", "05", "04"],
    meetingTitles: ALL_MEETINGS,
    weddingDate: "2026-08-15",
    address: { street: "הרצל 23", apartment: "5", city: "תל אביב", zipCode: "6423109" },
    isVoucherRedeem: false,
    promoCode: null,
  });
  await resend.emails.send({
    from: "בשעה טובה <orders@beshaa-tova.co.il>",
    to: TO,
    replyTo: TO,
    subject: `[תצוגה 1/3 - הזמנה רגילה] ${order.subject}`,
    html: order.html,
  });
  console.log("Sent 1/3: couple order confirmation");

  // 2. Gift voucher - giver will deliver themselves
  const giftSelf = buildGiftGiverEmail({
    giverName: "מיכל",
    coupleName1: "דניאל",
    coupleName2: "שירה",
    weddingDate: "15.08.2026",
    giftDelivery: "self",
    blessing: "מאחלת לכם חיים מלאים של שיחות עומק ואהבה גדולה",
  });
  await resend.emails.send({
    from: "בשעה טובה <orders@beshaa-tova.co.il>",
    to: TO,
    replyTo: TO,
    subject: `[תצוגה 2/3 - שובר, אעביר בעצמי] ${giftSelf.subject}`,
    html: giftSelf.html,
  });
  console.log("Sent 2/3: gift voucher (self-deliver)");

  // 3. Gift voucher - direct delivery to couple
  const giftDirect = buildGiftGiverEmail({
    giverName: "מיכל",
    coupleName1: "דניאל",
    coupleName2: "שירה",
    weddingDate: "15.08.2026",
    giftDelivery: "direct",
    blessing: null,
  });
  await resend.emails.send({
    from: "בשעה טובה <orders@beshaa-tova.co.il>",
    to: TO,
    replyTo: TO,
    subject: `[תצוגה 3/3 - שובר, שליחה ישירה] ${giftDirect.subject}`,
    html: giftDirect.html,
  });
  console.log("Sent 3/3: gift voucher (direct to couple)");
}

sendAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
