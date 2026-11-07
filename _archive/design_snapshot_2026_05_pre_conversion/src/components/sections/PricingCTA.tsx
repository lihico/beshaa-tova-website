import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";
import { MessageCircle } from "lucide-react";

export function PricingCTA() {
  return (
    <section className="relative bg-gradient-to-b from-terracotta-50/80 via-terracotta-50/40 to-warm-gray-50 px-5 pb-24 pt-14 md:pb-20 md:pt-20" style={{ overflowX: "clip" }}>
      <div className="pointer-events-none absolute right-0 -top-12 h-72 w-72 -translate-x-24 rounded-full bg-terracotta-100/40 blur-3xl" />
      <div className="pointer-events-none absolute left-0 bottom-0 h-56 w-56 translate-x-20 rounded-full bg-pink-100/30 blur-3xl" />

      <div className="relative mx-auto max-w-md text-center">
        <FadeIn>
          <h2 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">
            מוכנים להתחיל?
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            ערכה מותאמת אישית עד הבית - כולל משלוח
          </p>

          <div dir="rtl" className="mb-1 text-4xl font-bold text-terracotta-600">
            ₪320
          </div>
          <p className="mb-5 text-xs text-muted-foreground">
            עד 8 מפגשים · חלק זוגי + אישי בכל מפגש · מפגש כתובה כלול
            <br />
            מגיעה עד שבועיים מההזמנה
          </p>

          <div className="flex flex-col items-center gap-2.5">
            <Button size="lg" className="w-full max-w-[280px] text-base shadow-md shadow-terracotta-200/40" asChild>
              <Link to="/order">להזמנת הערכה</Link>
            </Button>
            <Button variant="outline" size="lg" className="w-full max-w-[280px] text-base" asChild>
              <Link to="/order?flow=gift">🎁 לשלוח כמתנה</Link>
            </Button>
          </div>

          <div className="mt-5">
            <a
              href="https://wa.me/972502023669"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[0.8rem] text-muted-foreground transition-colors hover:text-terracotta-600"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              שאלות? דברו איתי בוואטסאפ
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
