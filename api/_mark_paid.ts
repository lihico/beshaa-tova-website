/**
 * Lihi's signed one-click "mark as paid" link (Flow A of Grow Light without the API, and for Bit /
 * PayBox paid to her directly). docs/attribution/GROW_LIGHT_SETUP.md.
 *
 * Served by api/pay-status.ts with ?action=mark-paid (Vercel Hobby allows 12 functions and api/ has
 * 12, so this is not a function of its own). GET shows a confirmation page (a mail scanner that
 * opens links can never mark anything); the button POSTs the same token, and only the POST acts.
 *
 * Token: "<order_id>.<amount>.<sig>", sig = HMAC-SHA256(MARK_PAID_SECRET, "mark-paid:<order_id>:<amount>")
 * in base64url (first 32 chars). One-time use: the first POST appends payment "manual_<order_id>"
 * and marks the order paid; any later use finds it paid and does nothing. Both paths (this link and
 * the Grow webhook) end in the same fulfilPaid(), which sends the Purchase once (purchase_<order_id>).
 *
 * The amount actually charged (A2, CONCLUSIONS.md 2.11.2026): the confirm page asks for it, defaulting to
 * amount_expected, and warns when it differs (an upgrade or express added after the order). It is stored
 * as the payment amount and paid_amount, so the Purchase value and any commission use what was charged.
 * The token's amount is the one in the email; if the order's amount changed since, the page warns and
 * still lets Lihi confirm (the signature already proves the order id).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { OrderRecord, PaymentRecord } from "./_attribution_core.js";
import { withLock } from "./_bg.js";
import { fulfilPaid } from "./_fulfil.js";
import { isOrderId } from "./_ids.js";
import { getStore } from "./_store.js";

const METHODS: Array<[PaymentRecord["method"], string]> = [
  // DRAFT he copy: awaiting Lihi
  ["card", "Grow (אשראי, ביט, Apple Pay וכו')"],
  ["bit", "ביט אליי ישירות"],
  ["paybox", "פייבוקס אליי ישירות"],
  ["bank", "העברה בנקאית"],
  ["other", "אחר"],
];

/** Highest charge the page accepts (a typo guard; the biggest order today is under 600). */
export const MAX_PAID_AMOUNT = 5000;

/** The charged amount typed on the confirm page: a positive number up to 2 decimals, else null. */
export function parsePaidAmount(v: unknown): number | null {
  const t = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim().replace(/[₪\s,]/g, "") : "";
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= MAX_PAID_AMOUNT ? n : null;
}

function secret(): string | null {
  const s = (process.env.MARK_PAID_SECRET ?? "").trim();
  return s.length >= 16 ? s : null;
}

function sign(order_id: string, amount: number, key: string): string {
  return createHmac("sha256", key).update(`mark-paid:${order_id}:${amount}`).digest("base64url").slice(0, 32);
}

export function createMarkPaidToken(order_id: string, amount: number): string | null {
  const key = secret();
  if (!key || !isOrderId(order_id) || !Number.isInteger(amount) || amount <= 0) return null;
  return `${order_id}.${amount}.${sign(order_id, amount, key)}`;
}

export function verifyMarkPaidToken(token: unknown): { order_id: string; amount: number } | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 200) return null;
  const [order_id, amountStr, sig] = token.split(".");
  const amount = Number(amountStr);
  if (!isOrderId(order_id) || !/^\d{1,6}$/.test(amountStr ?? "") || !sig) return null;
  const a = Buffer.from(sign(order_id, amount, key));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { order_id, amount };
}

/** The link for Lihi's order email, or null when MARK_PAID_SECRET is not set. */
export function markPaidUrl(baseUrl: string, o: Pick<OrderRecord, "order_id" | "amount_expected">): string | null {
  const t = createMarkPaidToken(o.order_id, o.amount_expected);
  return t ? `${baseUrl.replace(/\/+$/, "")}/api/pay-status?action=mark-paid&t=${encodeURIComponent(t)}` : null;
}

/** Site origin for links in emails: PUBLIC_BASE_URL, else the request's forwarded host. */
export function siteBase(req: VercelRequest): string {
  const env = (process.env.PUBLIC_BASE_URL ?? "").trim();
  if (env) return env.replace(/\/+$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "www.beshaa-tova.co.il").split(",")[0];
  return `${proto}://${host}`;
}

/** DRAFT he copy: awaiting Lihi. The block in Lihi's order / gift email (payments on, amount > 0). */
export function markPaidEmailBlock(req: VercelRequest, o: OrderRecord, opts: { gift?: boolean } = {}): string {
  if (process.env.PAYMENTS_ENABLED !== "1" || o.amount_expected <= 0 || o.payment_status !== "pending") return "";
  const url = markPaidUrl(siteBase(req), o);
  if (!url) return "";
  const giftLine = opts.gift
    ? (process.env.FULFIL_GIFT_RELEASE === "1" ? " השובר יישלח אוטומטית לנותנ/ת." : " השובר לא נשלח מהכפתור הזה, רק מהכפתור של השובר למטה.")
    : "";
  return `
          <div style="margin:16px 0;padding:12px 16px;border-radius:8px;background:#ECFDF5;border:1px solid #A7F3D0;">
            <p style="margin:0 0 6px;font-weight:bold;">תשלום: ${o.amount_expected} ₪, קוד הזמנה <span style="direction:ltr;display:inline-block;">${o.order_id}</span></p>
            <p style="margin:0 0 8px;">כשהתשלום מופיע ב-Grow (או הגיע בביט / פייבוקס), לוחצים כאן. ההזמנה תסומן כשולמה.${giftLine} אם Grow כבר עדכן את האתר בעצמו, הכפתור רק יראה שהכל כבר מסומן.</p>
            <a href="${url}" style="display:inline-block;background:#047857;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:22px;">סמני כשולם</a>
          </div>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function page(res: VercelResponse, status: number, title: string, body: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  return res.status(status).send(`<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" /><title>${esc(title)} | בשעה טובה</title>
<style>
body{margin:0;background:#FAF7F2;color:#3D2B1F;font-family:'Noto Sans Hebrew','Segoe UI',Arial,sans-serif;line-height:1.7;}
.card{max-width:480px;margin:40px 16px;background:#fff;border:1px solid #E8D5B7;border-radius:16px;padding:28px 24px;}
@media(min-width:520px){.card{margin:40px auto;}}
h1{font-size:22px;margin:0 0 12px;} .ltr{direction:ltr;display:inline-block;font-weight:700;color:#A85638;}
label{display:block;margin:14px 0 6px;font-weight:600;} input[type=text]{width:100%;padding:10px;border:1px solid #E8D5B7;border-radius:10px;font-size:18px;direction:ltr;text-align:right;}
#diff{display:none;margin-top:8px;} select{width:100%;padding:10px;border:1px solid #E8D5B7;border-radius:10px;font-size:16px;background:#fff;}
button{width:100%;margin-top:18px;background:#047857;color:#fff;border:0;border-radius:24px;padding:14px;font-size:17px;font-weight:700;cursor:pointer;}
button[disabled]{opacity:.6;cursor:wait;} .muted{color:#7A6A5C;font-size:14px;}
.ok{background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:12px 14px;}
.warn{background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:12px 14px;}
.err{background:#FEE2E2;border:1px solid #FCA5A5;border-radius:10px;padding:12px 14px;}
</style></head><body><div class="card">${body}</div></body></html>`);
}

function who(o: OrderRecord): string {
  return o.order_kind === "gift"
    ? `${esc(o.buyer.name)} (שובר מתנה ל${esc(o.couple.name1)} ו${esc(o.couple.name2)})`
    : `${esc(o.couple.name1)} ו${esc(o.couple.name2)}`;
}

/** GET: confirmation page. POST: mark paid once, then fulfilPaid. All Hebrew here is a DRAFT for Lihi. */
export async function handleMarkPaid(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const rawToken = req.method === "GET" ? req.query.t : body.t;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const claim = verifyMarkPaidToken(token);
  if (!claim) {
    return page(res, 403, "קישור לא תקין", `<h1>הקישור לא תקין</h1><p class="err">החתימה בקישור לא תקינה, ולכן שום דבר לא סומן. כדאי לפתוח את הקישור מהמייל המקורי.</p>`);
  }
  const store = getStore();
  const idHtml = `<span class="ltr">${esc(claim.order_id)}</span>`;
  let order: OrderRecord | null;
  try { order = await store.getOrder(claim.order_id, { fresh: true }); } catch (e) {
    console.error("[mark-paid] store read failed:", e instanceof Error ? e.message : e);
    return page(res, 503, "שגיאה", `<h1>לא הצלחתי לקרוא את הטבלה</h1><p class="err">אפשר לנסות שוב בעוד דקה. שום דבר לא סומן.</p>`);
  }
  if (!order) return page(res, 404, "לא נמצא", `<h1>ההזמנה לא נמצאה</h1><p class="err">אין בטבלה הזמנה ${idHtml}.</p>`);
  if (order.payment_status === "paid") {
    return page(res, 200, "כבר שולם", `<h1>ההזמנה כבר מסומנת כשולמה</h1><p class="warn">${who(order)}, ${idHtml}: כבר מסומנת כשולמה, ולכן לא סומנה שוב ושום הודעה לא נשלחה שוב.</p>`);
  }
  if (order.payment_status !== "pending") {
    return page(res, 409, "לא ממתינה לתשלום", `<h1>ההזמנה לא ממתינה לתשלום</h1><p class="warn">ההזמנה ${idHtml} במצב "${esc(order.payment_status)}", ולכן לא סומנה.</p>`);
  }
  // The order's amount changed since the email (e.g. edited in the sheet): warn, do not block.
  const changedNote = order.amount_expected !== claim.amount
    ? `<p class="warn">הסכום בהזמנה השתנה מאז המייל: במייל ${claim.amount} ₪, עכשיו ${order.amount_expected} ₪. כדאי לוודא כמה נגבה בפועל.</p>`
    : "";

  if (req.method === "GET") {
    const options = METHODS.map(([v, label]) => `<option value="${v}">${esc(label)}</option>`).join("");
    return page(res, 200, "סימון כשולם", `
      <h1>סימון הזמנה כשולמה</h1>
      <p><strong>${who(order)}</strong></p>
      <p>קוד הזמנה: ${idHtml}<br/>סכום בהזמנה: <strong>${order.amount_expected} ₪</strong></p>
      ${changedNote}
      <p class="muted">ללחוץ רק אחרי שראית את התשלום ב-Grow (או בביט / פייבוקס). הסימון שולח את אירוע הרכישה למטא ומייל "שולם" אלייך${order.order_kind === "gift" && process.env.FULFIL_GIFT_RELEASE === "1" ? ", ושולח את השובר לנותנ/ת" : ""}.</p>
      <form method="POST" action="/api/pay-status?action=mark-paid" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='מסמנת...';">
        <input type="hidden" name="t" value="${esc(String(token))}" />
        <label for="paid_amount">כמה נגבה בפועל (₪)?</label>
        <input type="text" inputmode="decimal" id="paid_amount" name="paid_amount" value="${order.amount_expected}" autocomplete="off"
          oninput="var v=parseFloat(this.value.replace(/[^0-9.]/g,''));document.getElementById('diff').style.display=(v&&v!==${order.amount_expected})?'block':'none';" />
        <p class="warn" id="diff">זה שונה מהסכום בהזמנה (${order.amount_expected} ₪). זה בסדר אם ההזמנה השתנתה (שדרוג, משלוח מהיר). יירשם הסכום שהקלדת.</p>
        <label for="method">איך שולם?</label>
        <select id="method" name="method">${options}</select>
        <button type="submit" id="confirm">כן, התשלום התקבל</button>
      </form>`);
  }

  const method = (METHODS.find(([v]) => v === body.method)?.[0] ?? "card") as PaymentRecord["method"];
  // An old open page has no amount field: then the order's amount. A typed value that is not a valid
  // amount marks nothing.
  const typed = body.paid_amount;
  const paidAmount = typed === undefined || typed === null || typed === "" ? order.amount_expected : parsePaidAmount(typed);
  if (paidAmount === null) {
    return page(res, 400, "סכום לא תקין", `<h1>הסכום לא תקין</h1><p class="err">"${esc(String(typed).slice(0, 20))}" הוא לא סכום (מספר חיובי עד ${MAX_PAID_AMOUNT} ₪). שום דבר לא סומן. אפשר לחזור אחורה ולתקן.</p>`);
  }
  const o = order;
  const marked = await withLock(`mark-paid:${o.order_id}`, async () => {
    const fresh = await store.getOrder(o.order_id, { fresh: true });
    if (!fresh || fresh.payment_status !== "pending") return false;
    const paid_at = new Date().toISOString();
    const r = await store.appendPayment({
      payment_id: `manual_${o.order_id}`, order_id: o.order_id, provider: "manual", amount: paidAmount, currency: "ILS",
      paid_at, asmachta: null, method, card_suffix: null, installments: null,
      verified: true, verification: "manual_token", raw_notify_digest: "",
    });
    if (r === "duplicate") return false;
    await store.updateOrder(o.order_id, {
      payment_status: "paid", paid_at, paid_amount: paidAmount, payment_method: method,
      match_method: "manual", verify_mode: "manual_token", payment_fallback_reason: null,
    });
    return true;
  });
  if (!marked) {
    return page(res, 200, "כבר שולם", `<h1>ההזמנה כבר מסומנת כשולמה</h1><p class="warn">${who(o)}, ${idHtml}: לא סומנה שוב ושום הודעה לא נשלחה שוב.</p>`);
  }
  await fulfilPaid(o.order_id, { provider: "manual" });
  const diffNote = paidAmount !== o.amount_expected ? ` (בהזמנה ${o.amount_expected} ₪, נרשם מה שנגבה)` : "";
  return page(res, 200, "סומן כשולם", `<h1>סומן כשולם ✓</h1><p class="ok">${who(o)}, ${idHtml}, ${paidAmount} ₪${diffNote}. מייל "שולם" בדרך אלייך.</p>`);
}
