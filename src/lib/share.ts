/**
 * "לשלוח לבן או בת הזוג" (H4, approved by Lihi 14.11.2026): opens WhatsApp's share picker with a
 * ready message and the site link. The link carries utm_source=share so a partner's visit is counted.
 * DRAFT he copy: awaiting Lihi (the message wording was in the proposal she approved).
 */
export const PARTNER_SHARE_URL = "https://beshaa-tova.co.il/?utm_source=share&utm_medium=whatsapp&utm_campaign=partner_share";

export function partnerShareHref(message = "מצאתי משהו בשבילנו: מפגשים זוגיים לפני החתונה. מה דעתך?"): string {
  return `https://wa.me/?text=${encodeURIComponent(`${message} ${PARTNER_SHARE_URL}`)}`;
}
