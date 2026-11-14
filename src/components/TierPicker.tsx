import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { PRICES, quoteNow } from "@/lib/prices";
import { TIER_MEETINGS, type KitTier } from "../../api/_price_table";

/**
 * O1 (Lihi, 14.11.2026): the kit is chosen first, with big numbers and the price right away.
 * Labels from her note ("4 -> לייט, 8 -> לרציניים, 11 -> למי שלא יכול לבחור"), refined. DRAFT he copy: awaiting Lihi.
 */
export const TIER_COPY: Record<KitTier, { label: string; sub: string; giftSub: string }> = {
  lite: { label: "לייט", sub: "טעימה ראשונה: 4 ערבים על הנושאים שתבחרו", giftSub: "4 ערבים, הזוג בוחר את הנושאים" },
  base: { label: "לרציניים", sub: "8 ערבים על הנושאים שהכי מדברים אליכם", giftSub: "8 ערבים, הזוג בוחר את הנושאים" },
  all: { label: "למי שלא מצליחים לבחור", sub: "פשוט הכל: כל 10 הנושאים ומפגש הכתובה", giftSub: "כל 11 המפגשים, בלי צורך לבחור" },
};

/** The tiers the live price table sells, cheapest first (lite only when the table has it). */
export function sellableTiers(gift = false): KitTier[] {
  const lite = gift ? PRICES.gift.lite : PRICES.lite;
  const all = gift ? PRICES.gift.all : PRICES.all;
  return [...(lite !== null ? (["lite"] as KitTier[]) : []), "base", ...(all !== null ? (["all"] as KitTier[]) : [])];
}

export function TierPicker({ value, onChange, gift = false, locked = false, compact = false }: {
  value: KitTier; onChange: (t: KitTier) => void; gift?: boolean; locked?: boolean; compact?: boolean;
}) {
  const tiers = sellableTiers(gift);
  return (
    <div className={`grid gap-2.5 ${tiers.length === 3 ? "grid-cols-3" : "grid-cols-2"}`} role="radiogroup" aria-label="כמה מפגשים?">
      {tiers.map((t) => {
        const q = quoteNow({ kind: gift ? "gift" : "order", allMeetings: t === "all", tier: t });
        const n = TIER_MEETINGS[t];
        const on = value === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={locked && !on}
            data-tier={t}
            data-gift-plan={gift ? t : undefined}
            onClick={() => onChange(t)}
            className={`relative flex flex-col items-center rounded-2xl border-2 px-1.5 pb-3 pt-2.5 text-center transition-all ${
              on ? "border-terracotta-500 bg-terracotta-50 shadow-sm" : "border-border/70 bg-white hover:border-terracotta-200"
            } ${locked && !on ? "opacity-40" : ""}`}
          >
            {on && <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-terracotta-500 text-white"><Check className="h-3 w-3" /></span>}
            <span className={`font-extrabold leading-none text-terracotta-600 ${compact ? "text-4xl" : "text-5xl"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span>
            <span className="mt-0.5 text-[0.78rem] font-medium text-muted-foreground">מפגשים</span>
            <span className="mt-1.5 text-balance text-[0.92rem] font-bold leading-tight text-foreground">{TIER_COPY[t].label}</span>
            <span className="mt-1.5 text-xl font-extrabold text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>{q.amount} ₪</span>
            <span className="text-[0.72rem] text-muted-foreground">כ-{Math.round(q.amount / n)} ₪ לדייט</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * P1 / G2 (Lihi, 14.11.2026): the same three cards as links, for the home price block and the gift page:
 * each opens the order form with that kit already chosen (?tier=). Equal cards, so "להתחיל בקטן" stands out too.
 */
export function TierLinks({ gift = false, search = "", onPick }: { gift?: boolean; search?: string; onPick?: (t: KitTier) => void }) {
  const tiers = sellableTiers(gift);
  const base = gift ? "/order?flow=gift&" : `/order${search ? `${search}&` : "?"}`;
  return (
    <div className={`grid gap-2.5 ${tiers.length === 3 ? "grid-cols-3" : "grid-cols-2"}`} data-testid={gift ? "gift-tier-links" : "tier-links"}>
      {tiers.map((t) => {
        const q = quoteNow({ kind: gift ? "gift" : "order", allMeetings: t === "all", tier: t });
        const n = TIER_MEETINGS[t];
        return (
          <Link
            key={t}
            to={`${base}tier=${t}`}
            data-tier={t}
            onClick={() => onPick?.(t)}
            className="flex flex-col items-center rounded-2xl border-2 border-terracotta-200 bg-white px-1.5 pb-3 pt-2.5 text-center shadow-sm transition-all hover:border-terracotta-400 hover:shadow-md"
          >
            <span className="text-5xl font-extrabold leading-none text-terracotta-600" style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span>
            <span className="mt-0.5 text-[0.78rem] font-medium text-muted-foreground">מפגשים</span>
            <span className="mt-1.5 text-balance text-[0.92rem] font-bold leading-tight text-foreground">{TIER_COPY[t].label}</span>
            <span className="mt-1.5 text-xl font-extrabold text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>{q.amount} ₪</span>
            <span className="text-[0.72rem] text-muted-foreground">כ-{Math.round(q.amount / n)} ₪ לדייט</span>
            <span className="mt-2 rounded-full bg-terracotta-500 px-3 py-1 text-[0.78rem] font-bold text-white">{gift ? "לשובר" : "לבחירה"}</span>
          </Link>
        );
      })}
    </div>
  );
}
