import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { WeddingChecklistIntro } from "@/components/sections/WeddingChecklistIntro";

export function HeroV2() {
  return (
    <>
      <WeddingChecklistIntro />

      <section className="bg-white px-5 pb-10 pt-4 md:px-16 md:pb-14 md:pt-8" style={{ overflowX: "clip" as const }}>
        <div className="mx-auto w-full max-w-lg text-center md:max-w-2xl">
          <div className="mx-auto mb-6 w-full rounded-2xl border border-warm-gray-200/90 bg-warm-gray-50/90 px-4 py-4 shadow-sm ring-1 ring-warm-gray-100/80 md:max-w-lg md:px-5 md:py-4">
            <p className="text-sm font-normal leading-relaxed text-muted-foreground md:text-[0.95rem]">
              בין העבודה, הלימודים, הטירוף של החיים או ההכנות לחתונה -
            </p>
            <p className="mt-2 text-[0.95rem] font-semibold leading-relaxed text-foreground/90 md:text-base">
              לעצור רגע ולדבר על מה שבאמת חשוב -{" "}
              <strong className="font-extrabold text-foreground">מה שבינכם</strong>.
            </p>
          </div>

          <h1 className="mb-4 text-balance text-3xl font-extrabold leading-[1.12] tracking-tight text-foreground sm:text-[2rem] md:mb-5 md:text-5xl">
            ערכת שיח זוגית
          </h1>

          <p className="mx-auto mb-6 text-pretty text-[0.95rem] font-medium leading-relaxed text-foreground/85 md:mb-8 md:max-w-lg md:text-base">
            <strong className="font-bold text-foreground">לזוגות מאורסים</strong>{" "}
            שרוצים להכניס עומק להכנות,
            <br />
            <strong className="font-bold text-foreground">ולזוגות שכבר התחתנו</strong>{" "}
            ורוצים לנצל את השקט שאחרי כדי לשבת ולדבר באמת.
          </p>

          <div className="relative mx-auto mb-6 max-w-[min(100%,480px)] overflow-hidden rounded-3xl bg-warm-gray-50 shadow-[0_20px_50px_rgba(0,0,0,0.07)] ring-1 ring-warm-gray-100 md:mb-8">
            <div className="absolute inset-0 z-10 bg-gradient-to-tr from-white/10 via-transparent to-terracotta-50/60" />
            <div className="absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-white via-white/40 to-transparent" />
            <img
              src="/illustrations/hero-cafe-real.webp"
              alt="חוברות בשעה טובה על שולחן בבית קפה"
              className="relative block h-[240px] w-full object-cover sm:h-[280px] md:h-[380px]"
              style={{ objectPosition: "55% 55%" }}
            />
          </div>

          <div className="mx-auto flex w-full max-w-lg flex-col gap-5 border-t border-warm-gray-200/70 pt-6 text-center md:border-t-0 md:pt-0">
            <div className="flex flex-col items-center gap-2.5 sm:flex-row-reverse sm:justify-center sm:gap-3">
              <Button size="lg" className="w-full max-w-[280px] text-base shadow-sm sm:w-auto sm:min-w-[190px]" asChild>
                <Link to="/order">להזמנת הערכה · 320 ₪</Link>
              </Button>
              <Button variant="outline" size="lg" className="w-full max-w-[280px] text-base sm:w-auto sm:min-w-[190px]" asChild>
                <Link to="/order?flow=gift">🎁 הזמנת שובר מתנה</Link>
              </Button>
            </div>

            <p className="text-[0.88rem] leading-snug text-foreground/65 md:text-[0.9rem]" aria-label="יתרונות הערכה">
              <span className="flex flex-col items-center gap-2 md:hidden">
                <span className="inline-flex items-center gap-2 font-medium"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-400/75" />עצמאית ומובנית</span>
                <span className="inline-flex items-center gap-2 font-medium"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-400/75" />מותאמת אישית</span>
                <span className="inline-flex items-center gap-2 font-medium"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-400/75" />מגיעה עד הבית</span>
              </span>
              <span className="hidden md:block md:w-full md:text-center">
                עצמאית ומובנית<span className="mx-2 text-warm-gray-400">·</span>
                מותאמת אישית<span className="mx-2 text-warm-gray-400">·</span>
                מגיעה עד הבית
              </span>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
