import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { PRICES } from "@/lib/prices";
import { pairOptions, TIER_MEETINGS } from "../../api/_price_table";
import { trackCta, trackPriceSeen, useSeenOnce } from "@/lib/behavior";

/**
 * P3 (Lihi, 14.11.2026): two kits, the cheaper one 25% off, shown so the reduction is visible.
 * Stage A: the button opens WhatsApp to Lihi with a ready message, and she sends a Grow link for the total
 * (the site does not charge a pair by itself yet). DRAFT he copy: awaiting Lihi.
 */
export function pairWhatsAppHref(gift: boolean): string {
  const text = gift ? "היי ליהי, אשמח להזמין שני שוברי מתנה (לשני זוגות)." : "היי ליהי, אשמח להזמין שתי ערכות.";
  return `https://wa.me/972502023669?text=${encodeURIComponent(text)}`;
}

export function PairOffer({ where, gift = false, title, children }: { where: string; gift?: boolean; title?: string; children?: ReactNode }) {
  const seen = useSeenOnce<HTMLDivElement>(() => trackPriceSeen(`pair_${where}`), 0.4);
  if (PRICES.pairPct === null) return null;
  const rows = pairOptions(PRICES);
  return (
    <div ref={seen} className="rounded-2xl border border-terracotta-200/70 bg-white px-5 py-5 text-center shadow-sm" data-testid="pair-offer" data-clarity-unmask="true">
      <h3 className="text-lg font-bold text-foreground">{title ?? "קונים גם לזוג חברים?"}</h3>
      <p className="mt-1 text-[0.92rem] text-muted-foreground">
        {gift
          ? <>שובר לשני זוגות, <strong className="text-terracotta-600">והשני ב-{PRICES.pairPct}% הנחה</strong>. כל זוג מקבל שובר משלו, עם ברכה אישית מכם. אפשר גם זוג אחד לכם, ואחד לחברים.</>
          : <>שתי ערכות, <strong className="text-terracotta-600">והשנייה ב-{PRICES.pairPct}% הנחה</strong>. למשל אחת לכם ואחת לזוג חברים.</>}
      </p>
      <ul className="mx-auto mt-3 max-w-sm divide-y divide-terracotta-100 text-[0.95rem]">
        {rows.map(({ a, b, q }) => (
          <li key={`${a}-${b}`} className="flex items-baseline justify-between gap-3 py-1.5" data-pair={`${TIER_MEETINGS[a]}+${TIER_MEETINGS[b]}`}>
            <span className="text-right text-foreground">{gift ? "שני שוברים" : "שתי ערכות"}: <bdi>{TIER_MEETINGS[a]} + {TIER_MEETINGS[b]}</bdi> מפגשים</span>
            <span className="shrink-0 whitespace-nowrap">
              <span className="me-1.5 inline-block text-sm text-muted-foreground/70 line-through" style={{ fontVariantNumeric: "tabular-nums" }}>{q.full} ₪</span>
              <span className="inline-block font-extrabold text-terracotta-600" style={{ fontVariantNumeric: "tabular-nums" }}>{q.amount} ₪</span>
            </span>
          </li>
        ))}
      </ul>
      <a
        href={pairWhatsAppHref(gift)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackCta("pair", where)}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-terracotta-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-terracotta-600"
      >
        <MessageCircle className="h-4 w-4" />
        {gift ? "לשני זוגות: כותבים לי בוואטסאפ" : "לשתי ערכות: כותבים לי בוואטסאפ"}
      </a>
      <p className="mt-2 text-xs text-muted-foreground">אשלח קישור לתשלום מאובטח על הסכום של שתיהן.</p>
      {children}
    </div>
  );
}
