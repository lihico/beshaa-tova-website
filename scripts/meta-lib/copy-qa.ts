/**
 * Hebrew copy QA for ads created by meta-create-paused.ts (PLAN.md section 6.3, "Copy QA").
 *
 * Sources of the rules:
 *   - marketing/MARKETING_STANDARDS.md section 1, "Banned messaging": the old tagline, product-first
 *     framing, "לפני שמתחתנים" as a limiting frame, and the em dash anywhere.
 *   - marketing/campaigns/2026-11_meta_v3/ads.json "rules": noPrice, noEmDash, noUrgency.
 *   - MARKETING_STANDARDS.md has no explicit urgency word list. The list below is built from the
 *     examples in v3 strategy.md line 18 ("נשארו מקומות אחרונים", "מחיר מוזל עד", "וכל דחיפות") plus
 *     the common Hebrew urgency phrases. It was checked against every row of the v3 meta_upload.csv
 *     (no false positives on 7.11.2026). Edit it here if Lihi adds words to the standards file.
 * Matching is by substring, so Hebrew prefixes (ו, ה, ש, כש) are caught too.
 */

export const EM_DASH = "\u2014";

export const URGENCY_PHRASES = [
  "מהרו", "מהרי", "אל תפספסו", "אל תפספסי", "אל תחמיצו", "רק היום", "רק השבוע", "רק החודש",
  "לזמן מוגבל", "זמן מוגבל", "מבצע", "הנחה", "מחיר מוזל", "מוזל עד", "מקומות אחרונים", "יחידות אחרונות",
  "הזדמנות אחרונה", "נשארו רק", "נשארו מקומות", "נותרו", "עד גמר המלאי", "דחוף", "עכשיו או לעולם לא",
  "לפני שייגמר", "לפני שנגמר", "נגמר המלאי", "שעות אחרונות", "ימים אחרונים",
];

export const BANNED_PHRASES = [
  "ערכת שיח מותאמת אישית לזוגות לפני חתונה",
  "מה מגיע בערכה",
  "3 חוברות",
  "שלוש חוברות",
  "חוברות מודפסות",
  "לפני שמתחתנים",
];

/** A number next to a shekel sign or a shekel word, either side. */
const PRICE_PATTERNS: RegExp[] = [
  /\d[\d,.\s]*\s*₪/u,
  /₪\s*\d/u,
  /\d[\d,.]*\s*(?:ש"ח|ש״ח|שקל|שקלים|ILS|NIS)/u,
];

export interface QaIssue { field: string; rule: "em_dash" | "price" | "urgency" | "banned"; detail: string }

export function qaText(field: string, text: string): QaIssue[] {
  const out: QaIssue[] = [];
  if (text.includes(EM_DASH)) out.push({ field, rule: "em_dash", detail: "em dash (use a hyphen with spaces)" });
  for (const re of PRICE_PATTERNS) if (re.test(text)) { out.push({ field, rule: "price", detail: "a price (digits with a shekel sign or word)" }); break; }
  for (const w of URGENCY_PHRASES) if (text.includes(w)) out.push({ field, rule: "urgency", detail: `urgency phrase "${w}"` });
  for (const w of BANNED_PHRASES) if (text.includes(w)) out.push({ field, rule: "banned", detail: `banned phrase "${w}"` });
  return out;
}

export function qaCopy(fields: Record<string, string | undefined>): QaIssue[] {
  return Object.entries(fields).flatMap(([k, v]) => (v ? qaText(k, v) : []));
}
