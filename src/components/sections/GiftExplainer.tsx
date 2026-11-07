import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";
import { PRICES } from "@/lib/prices";

export function GiftExplainer() {
  return (
    <section className="relative px-5 py-12 md:py-16" style={{ overflowX: "clip" }}>
      <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 -translate-x-20 rounded-full bg-pink-100/40 blur-3xl" />
      <div className="pointer-events-none absolute left-0 bottom-0 h-48 w-48 translate-x-16 rounded-full bg-amber-100/30 blur-3xl" />

      <div className="relative mx-auto max-w-md">
        <FadeIn>
          <div className="overflow-hidden rounded-2xl border border-pink-200/60 bg-gradient-to-br from-pink-50/60 via-white to-amber-50/40 shadow-sm">
            <div className="px-6 py-7 text-center">
              <img
                src="/illustrations/gift-envelope.png"
                alt="שובר מתנה"
                className="mx-auto mb-4 h-20 w-auto drop-shadow-sm"
              />
              <h3 className="mb-1.5 text-xl font-bold text-foreground">מכירים זוג שישמח לקבל את הערכה?</h3>
              <p className="mb-2 text-base font-medium text-terracotta-600">
                מתנה לזוגות שאוהבים באמת
              </p>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                אתם משלמים ומקבלים שובר דיגיטלי.
                <br />
                הזוג בוחר נושאים, מקבל ערכה מותאמת עד הבית, ויוצא לדייטים.
              </p>

              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm shadow-sm">
                <span className="text-lg font-bold text-terracotta-600">{PRICES.gift.all !== null ? `מ-${PRICES.gift.base} ₪` : `${PRICES.gift.base} ₪`}</span>
                <span className="text-muted-foreground">כולל משלוח</span>
              </div>

              <div>
                <Button variant="outline" size="lg" className="w-full max-w-[260px] border-pink-200 text-base hover:bg-pink-50" asChild>
                  <Link to="/order?flow=gift">לשלוח כמתנה</Link>
                </Button>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
