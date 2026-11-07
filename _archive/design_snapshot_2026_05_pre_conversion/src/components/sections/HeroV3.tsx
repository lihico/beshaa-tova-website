import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const ease = [0.25, 0.1, 0.25, 1] as const;

export function HeroV3() {
  return (
    <section className="relative bg-white px-5 pb-10 pt-10 md:px-16 md:pb-14 md:pt-16" style={{ overflowX: "clip" as const }}>
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-terracotta-100/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-warm-gray-100/40 blur-3xl" />

      <div className="relative mx-auto max-w-5xl">
        {/*
          Mobile: intro (hook + h1 + audience) → image → CTAs + bullets (DOM order).
          md+: 2-col grid — image spans both rows on the visual "second" column.
        */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start md:gap-x-12 md:gap-y-8">
          <div className="mx-auto flex min-w-0 w-full max-w-lg flex-col gap-4 text-center md:mx-0 md:gap-5 md:text-right">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
              className="rounded-2xl border border-warm-gray-200/90 bg-warm-gray-50/90 px-4 py-3.5 text-center shadow-sm ring-1 ring-warm-gray-100/80 md:px-5 md:py-4 md:text-right"
            >
              <p className="text-sm font-normal leading-relaxed text-muted-foreground md:text-[0.95rem]">
                בין העבודה, הלימודים, הטירוף של החיים או ההכנות לחתונה -
              </p>
              <p className="mt-2 text-[0.95rem] font-semibold leading-relaxed text-foreground/90 md:text-base">
                לעצור רגע ולדבר על מה שבאמת חשוב -{" "}
                <strong className="font-extrabold text-foreground">מה שבינכם</strong>.
              </p>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease, delay: 0.05 }}
              className="text-balance text-3xl font-extrabold leading-[1.12] tracking-tight text-foreground md:text-5xl"
            >
              ערכת שיח זוגית
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease, delay: 0.12 }}
              className="text-pretty text-[0.95rem] font-medium leading-relaxed text-foreground/85 md:max-w-lg md:text-base"
            >
              <strong className="font-bold text-foreground">לזוגות מאורסים</strong>{" "}
              שרוצים להכניס עומק להכנות,
              <br />
              <strong className="font-bold text-foreground">ולזוגות שכבר התחתנו</strong>{" "}
              ורוצים לנצל את השקט שאחרי כדי לשבת ולדבר באמת.
            </motion.p>
          </div>

          <div className="mx-auto w-full max-w-[480px] md:row-span-2 md:w-full md:max-w-[min(100%,440px)] md:justify-self-center">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease, delay: 0.08 }}
              className="relative overflow-hidden rounded-3xl bg-warm-gray-50 shadow-[0_20px_50px_rgba(0,0,0,0.07)] ring-1 ring-warm-gray-100"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-terracotta-50/60" />
              <img
                src="/illustrations/hero-cafe-real.webp"
                alt="חוברות בשעה טובה על שולחן בבית קפה"
                className="relative block h-[260px] w-full object-cover md:h-[420px]"
                style={{ objectPosition: "55% 55%" }}
                loading="eager"
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white via-white/40 to-transparent" />
            </motion.div>
          </div>

          <div className="mx-auto flex w-full max-w-lg flex-col gap-5 border-t border-warm-gray-200/70 pt-6 text-center md:mx-0 md:border-t-0 md:pt-0 md:text-right">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease, delay: 0.2 }}
              className="flex flex-col items-center gap-2.5 sm:flex-row-reverse sm:justify-center md:flex-row-reverse md:justify-start md:gap-3"
            >
              <Button size="lg" className="w-full max-w-[280px] text-base shadow-sm sm:w-auto sm:min-w-[190px]" asChild>
                <Link to="/order">להזמנת הערכה · 320 ₪</Link>
              </Button>
              <Button variant="outline" size="lg" className="w-full max-w-[280px] text-base sm:w-auto sm:min-w-[190px]" asChild>
                <Link to="/order?flow=gift">🎁 הזמנת שובר מתנה</Link>
              </Button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease, delay: 0.35 }}
              className="text-[0.88rem] leading-snug text-foreground/65 md:text-[0.9rem]"
              aria-label="יתרונות הערכה"
            >
              <span className="flex flex-col items-center gap-2 md:hidden">
                <span className="inline-flex items-center gap-2 font-medium"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-400/75" />עצמאית ומובנית</span>
                <span className="inline-flex items-center gap-2 font-medium"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-400/75" />מותאמת אישית</span>
                <span className="inline-flex items-center gap-2 font-medium"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-400/75" />מגיעה עד הבית</span>
              </span>
              <span className="hidden md:inline md:w-full md:text-right">
                עצמאית ומובנית<span className="mx-2 text-warm-gray-400">·</span>
                מותאמת אישית<span className="mx-2 text-warm-gray-400">·</span>
                מגיעה עד הבית
              </span>
            </motion.p>
          </div>
        </div>
      </div>
    </section>
  );
}

