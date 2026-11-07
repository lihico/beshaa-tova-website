import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyReleaseToken, getGiftRow, releaseGiftVoucher } from "./_gift_release.js";

// The link in Lihi's gift notification ("אישרתי תשלום, לשלוח את השובר").
// GET only shows a confirmation page, so a mail scanner that opens links can never send a voucher;
// the button on that page POSTs the same signed token, and only the POST sends.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${esc(title)} | בשעה טובה</title>
  <style>
    body{margin:0;background:#FAF7F2;color:#3D2B1F;font-family:'Noto Sans Hebrew','Segoe UI',Arial,sans-serif;line-height:1.7;}
    .card{max-width:480px;margin:40px auto;background:#fff;border:1px solid #E8D5B7;border-radius:16px;padding:28px 24px;margin-left:16px;margin-right:16px;}
    @media(min-width:520px){.card{margin-left:auto;margin-right:auto;}}
    h1{font-size:22px;margin:0 0 12px;}
    .code{direction:ltr;display:inline-block;font-weight:700;letter-spacing:1px;color:#A85638;}
    button{width:100%;margin-top:18px;background:#A85638;color:#fff;border:0;border-radius:24px;padding:14px;font-size:17px;font-weight:700;cursor:pointer;}
    button[disabled]{opacity:.6;cursor:wait;}
    .muted{color:#7A6A5C;font-size:14px;}
    .ok{background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:12px 14px;}
    .warn{background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:12px 14px;}
    .err{background:#FEE2E2;border:1px solid #FCA5A5;border-radius:10px;padding:12px 14px;}
  </style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

function send(res: VercelResponse, status: number, title: string, body: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).send(page(title, body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const token = req.method === "GET" ? req.query.t : (req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>).t : undefined);
  const claim = verifyReleaseToken(Array.isArray(token) ? token[0] : token);
  if (!claim) {
    return send(res, 403, "קישור לא תקין", `<h1>הקישור לא תקין</h1><p class="err">החתימה בקישור לא תקינה, ולכן שום שובר לא נשלח. כדאי לפתוח את הקישור מהמייל המקורי.</p>`);
  }
  const codeHtml = `<span class="code">${esc(claim.code)}</span>`;

  if (req.method === "GET") {
    let info;
    try {
      info = await getGiftRow(claim.code);
    } catch (err) {
      console.error("[gift-release] lookup failed:", err);
      return send(res, 500, "שגיאה", `<h1>לא הצלחתי לקרוא את הטבלה</h1><p class="err">אפשר לנסות שוב בעוד דקה. שום שובר לא נשלח.</p>`);
    }
    if (!info) {
      return send(res, 404, "לא נמצא", `<h1>השובר לא נמצא</h1><p class="err">אין בטבלה שורת שובר מתנה עם הקוד ${codeHtml}. ייתכן שהקוד שונה או שהשורה נמחקה.</p>`);
    }
    if (info.released) {
      return send(res, 200, "כבר נשלח", `<h1>השובר כבר נשלח</h1><p class="warn">בטבלה כבר מסומן "שובר נשלח" לשובר ${codeHtml}, ולכן הוא לא יישלח שוב.</p>`);
    }
    const tokenValue = esc(Array.isArray(token) ? String(token[0]) : String(token));
    return send(res, 200, "שליחת שובר מתנה", `
      <h1>שליחת שובר מתנה</h1>
      <p>השובר של <strong>${esc(info.coupleName1)} ו${esc(info.coupleName2)}</strong> (מאת ${esc(info.giverName)}) יישלח כקובץ PDF ל-<span style="direction:ltr;display:inline-block;">${esc(info.giverEmail)}</span>.</p>
      <p>קוד: ${codeHtml}</p>
      ${claim.delivery === "direct" ? `<p class="warn">הנותנ/ת ביקש/ה שליחה ישירה לזוג. אחרי השליחה יגיע אלייך מייל עם כפתור וואטסאפ לזוג.</p>` : ""}
      <p class="muted">ללחוץ רק אחרי שהתשלום התקבל.</p>
      <form method="POST" action="/api/gift-release" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='שולחת...';">
        <input type="hidden" name="t" value="${tokenValue}" />
        <button type="submit">אישרתי תשלום, לשלוח את השובר</button>
      </form>`);
  }

  const result = await releaseGiftVoucher({ code: claim.code, delivery: claim.delivery, couplePhone: claim.couplePhone, contactName: claim.contactName });
  switch (result.status) {
    case "sent":
      return send(res, 200, "השובר נשלח", `<h1>השובר נשלח ✓</h1><p class="ok">השובר ${codeHtml} נשלח ל-<span style="direction:ltr;display:inline-block;">${esc(result.info.giverEmail)}</span>, ובטבלה סומן "שובר נשלח". עותק עם כפתור וואטסאפ נשלח אלייך במייל.</p>`);
    case "already":
      return send(res, 200, "כבר נשלח", `<h1>השובר כבר נשלח</h1><p class="warn">בטבלה כבר מסומן "שובר נשלח" לשובר ${codeHtml}, ולכן הוא לא נשלח שוב.</p>`);
    case "not_found":
      return send(res, 404, "לא נמצא", `<h1>השובר לא נמצא</h1><p class="err">אין בטבלה שורת שובר מתנה עם הקוד ${codeHtml}. שום שובר לא נשלח.</p>`);
    case "no_email":
      return send(res, 400, "חסר מייל", `<h1>חסר מייל של הנותנ/ת</h1><p class="err">בשורה של ${codeHtml} אין כתובת מייל תקינה של הנותנ/ת. אפשר לתקן בטבלה ולנסות שוב.</p>`);
    default:
      return send(res, 500, "שגיאה", `<h1>השליחה נכשלה</h1><p class="err">${result.reason === "pdf" ? "יצירת ה-PDF נכשלה" : result.reason === "email" ? "שליחת המייל נכשלה" : "לא הצלחתי לעדכן את הטבלה"}, ולכן השובר לא נשלח ולא סומן. אפשר לנסות שוב בעוד דקה.</p>`);
  }
}
