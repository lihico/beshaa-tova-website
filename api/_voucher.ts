import { LOGO, STEP1, STEP2, STEP3 } from "./_voucher_assets.js";

// Escape user-provided text before it enters the voucher HTML.
function esc(s: string | null | undefined): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Latin-free redeem code: BST-DDMM-XXXX (DDMM from the wedding date when parseable).
// Works with the `?voucher=` order link, which needs no registration/deploy.
export function generateVoucherCode(weddingDate?: string | null): string {
  let ddmm = "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((weddingDate || "").trim());
  if (m) ddmm = m[3] + m[2];
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(4, "X");
  return ["BST", ddmm, rand].filter(Boolean).join("-");
}

export function buildRedeemUrl(code: string): string {
  return `https://www.beshaa-tova.co.il/order?voucher=${encodeURIComponent(code)}`;
}

// Normalize an Israeli phone to international digits for wa.me.
export function toIntlPhone(phone: string): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  return d;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${toIntlPhone(phone)}?text=${encodeURIComponent(text)}`;
}

// Approved "הודעה G" template — sent to the couple when the giver asked Lihi to deliver directly.
export function coupleVoucherMessage(d: { contact: string; giver: string; code: string }): string {
  return `היי ${d.contact}, זו ליהי מ"בשעה טובה", נעים להכיר! 🌿

${d.giver} בחר/ה להעניק לכם מתנה - שובר לערכת "בשעה טובה":
סדרת מפגשים זוגיים מותאמים אישית, לשיח על הדברים החשובים באמת,
לקראת החתונה ולחיים שאחריה. אתם בוחרים את הנושאים, מקבלים ערכה
אישית עד הבית, ויוצאים לדייטים - https://www.beshaa-tova.co.il/

מצורף השובר האישי שלכם, עם ברכה מ${d.giver} 💛

למימוש (המתנה כבר שולמה):
📲 סרקו את ה-QR בשובר, או היכנסו לקישור: https://beshaa-tova.co.il/order?voucher=${encodeURIComponent(d.code)}
🔑 קוד מימוש: ${d.code}

מזל טוב על החתונה, ושיהיה בשעה טובה! ✨`;
}

// Sent to the giver when they chose to deliver the voucher themselves.
export function giverVoucherMessage(d: { giver: string; coupleName1: string; coupleName2: string; code: string }): string {
  return `היי ${d.giver} 💛
השובר של ${d.coupleName1} ו${d.coupleName2} מוכן, ומצורף כאן.
אפשר לשלוח להם מתי שנוח לך - בסריקת ה-QR או בקוד המימוש.

קוד מימוש: ${d.code}
קישור ישיר למימוש: https://beshaa-tova.co.il/order?voucher=${encodeURIComponent(d.code)}
שיהיה בשעה טובה! ✨`;
}

// Full A4 gift voucher — clean variant (no "ערכה מלאה" badge, no kit photo),
// self-contained (base64 logo + step icons). Pass qrDataUri (see buildVoucherQr) so the QR is
// embedded; without it the QR falls back to a remote image that needs a network to show.
export function buildVoucherHtml(d: {
  coupleName1: string;
  coupleName2: string;
  giverName: string;
  blessing?: string | null;
  code: string;
  qrDataUri?: string | null;
}): string {
  const qrData = encodeURIComponent(buildRedeemUrl(d.code));
  const qrSrc = d.qrDataUri || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&amp;data=${qrData}&amp;color=3D2B1F&amp;bgcolor=FFFFFF`;
  const blessing = d.blessing && d.blessing.trim()
    ? esc(d.blessing.trim())
    : "מזל טוב! שתמשיכו תמיד לדבר על מה שחשוב, ולצחוק הרבה בדרך.";
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>שובר מתנה | בשעה טובה - ${esc(d.coupleName1)} ו${esc(d.coupleName2)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@300;400;500;600;700;800;900&family=Noto+Color+Emoji&display=swap" rel="stylesheet" />
  <style>
    :root{--cream:#FAF7F2;--cream-card:#fffdf9;--chocolate:#3D2B1F;--ink:#241810;--terra:#A85638;--terra-pale:#F4E8E1;--terra-bg:#FDF8F5;--muted:#9B8E82;--border:#E8D1C4;}
    *{margin:0;padding:0;box-sizing:border-box;}
    @page{size:A4 portrait;margin:0;}
    body{font-family:'Noto Sans Hebrew','Noto Color Emoji',sans-serif;background:#eee;color:var(--chocolate);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .page{width:210mm;height:297mm;background:var(--cream);overflow:hidden;padding:8mm;display:flex;flex-direction:column;}
    .card{flex:1;background:#fff;border:2.5px solid var(--border);border-radius:18px;padding:16px 20px;display:flex;flex-direction:column;overflow:hidden;}
    .header{background:var(--terra-bg);padding:10px 24px 14px;text-align:center;border-radius:14px;margin-bottom:4px;}
    .logos{display:flex;align-items:center;justify-content:center;margin-bottom:2px;}
    .logo-bst{height:100px;width:auto;}
    .gift-label{font-size:32px;font-weight:900;color:var(--terra);letter-spacing:1px;}
    .couple-section{text-align:center;padding:6px 20px 0;}
    .couple-names{font-size:24px;font-weight:900;color:var(--ink);}
    .couple-sub{font-size:13px;font-weight:500;color:var(--muted);margin-top:2px;}
    .tagline{text-align:center;padding:2px 28px;font-size:13px;font-weight:600;color:var(--chocolate);line-height:1.6;}
    .tagline em{font-style:normal;color:var(--terra);font-weight:800;font-size:18px;display:block;}
    .tagline .sub{letter-spacing:1.5px;font-size:12px;color:var(--muted);font-weight:500;}
    .hero-row{display:flex;align-items:stretch;gap:14px;margin:6px 0 4px;padding:0 4px;min-height:255px;}
    .blessing{flex:1;min-width:0;background:var(--terra-bg);border:2px solid var(--border);border-radius:14px;padding:22px 26px;display:flex;flex-direction:column;justify-content:center;position:relative;}
    .blessing-quote{position:absolute;top:8px;right:18px;font-size:54px;line-height:1;color:var(--terra-pale);font-family:Georgia,serif;font-weight:700;}
    .blessing-body{font-size:15.5px;line-height:1.85;color:var(--chocolate);font-weight:500;position:relative;z-index:1;white-space:pre-line;}
    .blessing-sign{margin-top:16px;text-align:left;font-size:13px;font-weight:800;color:var(--terra);letter-spacing:0.5px;}
    .qr-box{flex-shrink:0;width:165px;background:#fff;border:2px solid var(--border);border-radius:14px;padding:16px 12px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:9px;}
    .qr-img{width:150px;height:150px;display:block;background:#fff;border-radius:8px;padding:4px;border:1px solid var(--border);}
    .code-block{text-align:center;}
    .code-label{font-size:11px;color:var(--muted);font-weight:600;display:block;}
    .code-val{font-size:15px;font-weight:800;color:var(--terra);direction:ltr;display:inline-block;letter-spacing:1px;margin-top:1px;}
    .how-it-works{padding:12px 18px 10px;background:var(--cream-card);border:1.5px solid var(--border);border-radius:14px;margin:4px 0;}
    .how-title{font-size:15px;font-weight:800;text-align:center;margin-bottom:8px;color:var(--terra);}
    .vstep{display:flex;gap:12px;align-items:center;margin-bottom:6px;}
    .vstep:last-of-type{margin-bottom:0;}
    .vstep-icon{flex-shrink:0;width:52px;height:52px;object-fit:contain;}
    .vstep-body{flex:1;}
    .vstep-n{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--terra);color:#fff;font-size:10px;font-weight:700;margin-left:6px;vertical-align:middle;}
    .vstep-title{font-size:12.5px;font-weight:700;color:var(--ink);display:inline;vertical-align:middle;}
    .vstep-desc{font-size:11px;color:var(--chocolate);line-height:1.45;margin-top:1px;}
    .vstep-note{font-size:10px;color:var(--muted);margin-top:6px;padding-top:5px;border-top:1px dashed var(--border);line-height:1.4;text-align:center;}
    .quote{text-align:center;padding:16px 36px 12px;margin:10px 8px 6px;border-top:1.5px solid var(--border);border-bottom:1.5px solid var(--border);}
    .quote-text{font-size:13px;font-weight:500;color:var(--chocolate);line-height:1.75;font-style:italic;letter-spacing:0.2px;}
    .quote-author{margin-top:10px;font-size:10.5px;font-weight:700;color:var(--terra);letter-spacing:2px;}
    .quote-author::before,.quote-author::after{content:"־";color:var(--border);margin:0 8px;font-weight:400;}
    .contact{display:flex;align-items:center;justify-content:center;gap:10px;font-size:11px;color:var(--muted);padding:4px 10px;flex-wrap:nowrap;}
    .contact-q{font-weight:700;color:var(--chocolate);font-size:12px;}
    .contact-item{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;}
    .contact-item .ico{width:13px;height:13px;display:inline-block;fill:var(--terra);flex-shrink:0;vertical-align:middle;}
    .contact-item span{color:var(--chocolate);font-weight:600;font-size:11px;}
    .contact-sep{color:var(--border);font-weight:300;font-size:10px;}
    .footer{background:var(--terra-bg);border-radius:12px;padding:10px 20px 12px;text-align:center;margin-top:auto;}
    .footer-tag{font-size:13px;font-weight:700;color:var(--terra);}
    .footer-sub{font-size:10px;color:var(--muted);margin-top:3px;padding-bottom:2px;}
  </style>
</head>
<body>
  <div class="page"><div class="card">
    <div class="header">
      <div class="logos"><img src="${LOGO}" alt="בשעה טובה" class="logo-bst" /></div>
      <div class="gift-label">שובר מתנה</div>
    </div>
    <div class="couple-section">
      <div class="couple-names">${esc(d.coupleName1)} ו${esc(d.coupleName2)}, מזל טוב!</div>
      <div class="couple-sub">מתנה מ${esc(d.giverName)} · באהבה גדולה</div>
    </div>
    <div class="tagline"><em>ערכה לזוגות מתחתנים</em><span class="sub">לשיח על הדברים החשובים באמת</span></div>
    <div class="hero-row">
      <div class="blessing">
        <div class="blessing-quote">&ldquo;</div>
        <div class="blessing-body">${blessing}</div>
        <div class="blessing-sign">באהבה, ${esc(d.giverName)}</div>
      </div>
      <div class="qr-box">
        <img src="${qrSrc}" alt="QR code" class="qr-img" />
        <div class="code-block"><span class="code-label">קוד מימוש</span><span class="code-val">${esc(d.code)}</span></div>
      </div>
    </div>
    <div class="how-it-works">
      <div class="how-title">איך זה עובד?</div>
      <div class="vstep"><img src="${STEP1}" alt="" class="vstep-icon" /><div class="vstep-body"><span class="vstep-n">1</span><span class="vstep-title">מזמינים</span><div class="vstep-desc">בוחרים את הנושאים שחשובים לכם</div></div></div>
      <div class="vstep"><img src="${STEP2}" alt="" class="vstep-icon" /><div class="vstep-body"><span class="vstep-n">2</span><span class="vstep-title">מקבלים ערכה מותאמת אישית עד הבית</span><div class="vstep-desc">5-8 מפגשים עם בסיס לשיח בנושאים שבחרתם, מבוסס מחקר ובגובה העיניים</div></div></div>
      <div class="vstep"><img src="${STEP3}" alt="" class="vstep-icon" /><div class="vstep-body"><span class="vstep-n">3</span><span class="vstep-title">יוצאים לדייטים</span><div class="vstep-desc">ערב אחד בשבוע יוצאים לקפה, לים או לפארק ומחזקים את יסודות הקשר</div></div></div>
      <div class="vstep-note">* אפשרות לליווי מקצועי בכתיבת מסמך זוגיות או כתובה אישית על בסיס המפגשים</div>
    </div>
    <div class="quote">
      <div class="quote-text">&ldquo;אהבה, הנחווית בדרך זו, היא אתגר מתמיד;<br />אין היא מקלט-נופש, אלא תנועה, צמיחה, פעולה בצוותא.&rdquo;</div>
      <div class="quote-author">אריך פרום · אומנות האהבה</div>
    </div>
    <div class="contact">
      <span class="contact-q">שאלות?</span>
      <span class="contact-item"><span>050-202-3669</span></span>
      <span class="contact-sep">|</span>
      <span class="contact-item"><span>beshaatova.il@gmail.com</span></span>
      <span class="contact-sep">|</span>
      <span class="contact-item"><span>beshaa-tova.co.il</span></span>
    </div>
    <div class="footer">
      <div class="footer-tag">מארגנים חתונה &middot; לא שוכחים את הדברים החשובים באמת</div>
      <div class="footer-sub">בשעה טובה &middot; מפגשים זוגיים מותאמים אישית, לקראת החתונה ולחיים שאחריה</div>
    </div>
  </div></div>
</body>
</html>`;
}
