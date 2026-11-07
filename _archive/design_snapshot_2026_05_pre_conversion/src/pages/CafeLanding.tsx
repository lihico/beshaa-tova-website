import { useParams, Link, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getCafe } from "@/data/cafes";
import { trackEvent } from "@/lib/meta-pixel";
import { gtagEvent } from "@/lib/gtag";

const ease = [0.25, 0.1, 0.25, 1] as const;

const TOPICS = [
  "שפות האהבה",
  "איך אנחנו רבים",
  "האינטימיות שלנו",
  "לדבר על כסף",
  "המשפחות שלנו",
  "הבית שאנחנו בונים",
  "עתיד וחלומות",
  "ילדים והורות",
  "כשקשה",
  "עבודה וקריירה",
];

export default function CafeLanding() {
  const { cafeId } = useParams<{ cafeId: string }>();
  const cafe = cafeId ? getCafe(cafeId) : undefined;

  useEffect(() => {
    if (cafe) {
      trackEvent("ViewContent", {
        content_name: `cafe_landing_${cafe.slug}`,
        content_category: "cafe_collab",
      });
      gtagEvent("cafe_landing_view", { cafe: cafe.slug });
    }
  }, [cafe]);

  if (!cafe) return <Navigate to="/" replace />;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-12 pt-10 md:px-16 md:pb-20 md:pt-16">
        {cafe?.heroUrl && (
        <>
        <img
          src={cafe.heroUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/40 to-white/95" />
        </>
        )}
        <div className="relative z-10 mx-auto max-w-2xl text-center">
          {/* Dual logos */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="mb-6 flex items-center justify-center gap-3"
          >
            <div className="flex items-center gap-2">
              <img src="/logo-icon.png" alt="בשעה טובה" className="h-8 w-8 md:h-10 md:w-10" />
              <span className="text-sm font-bold text-foreground md:text-base">בשעה טובה</span>
            </div>
            <span className="text-sm font-bold text-terracotta-500">×</span>
            <div className="flex items-center">
              <img
                src={cafe.logoUrl}
                alt={cafe.name}
                className="h-10 w-auto object-contain md:h-12"
              />
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease }}
            className="mb-3 text-3xl font-black leading-snug text-foreground sm:text-4xl md:text-5xl"
          >
            הדייט הבא שלכם
            <br />
            מתחיל ב<span className="text-terracotta-500">{cafe.name}</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease }}
            className="mx-auto mb-6 max-w-md text-[0.95rem] font-bold leading-relaxed text-foreground/80 md:text-base"
          >
            מפגשים זוגיים מותאמים אישית, על הנושאים שחשובים לכם באמת.
            <br />
            באווירה של בית קפה, עם <span className="text-terracotta-500">זוג כוסות קפה לדייט הראשון - עלינו</span>.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4, ease }}
            className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3"
          >
            <Button size="lg" className="w-full max-w-[260px] text-base sm:w-auto sm:min-w-[180px]" asChild>
              <Link to={`/order?ref=${cafe.slug}`}>להזמנה · 320 ₪</Link>
            </Button>
            <Button variant="outline" size="lg" className="w-full max-w-[260px] text-base sm:w-auto sm:min-w-[180px]" asChild>
              <Link to="/meetings">עוד על המפגשים</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Value proposition */}
      <section className="bg-white px-5 py-12 md:px-16 md:py-16">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="mx-auto max-w-lg text-center"
        >
          <div className="mx-auto mb-5 h-px w-16 bg-terracotta-300/50" />
          <p className="text-lg font-black leading-[1.8] text-foreground md:text-xl">
            בין הלימודים, העבודה, החברים והיומיום -
            <br />
            קל לשכוח לעצור ולדבר על מה ש<span className="text-terracotta-500">באמת חשוב</span>.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-foreground/70 md:text-[0.95rem]">
            "בשעה טובה" זה הזמן שלכם להקדיש שעה לשיחה זוגית אמיתית -
            <br className="hidden sm:block" />
            על הדברים שמעצבים את החיים המשותפים שלכם.
          </p>
          <div className="mx-auto mt-5 h-px w-16 bg-terracotta-300/50" />
        </motion.div>
      </section>

      {/* What you get - dual cards */}
      <section className="bg-warm-gray-50 px-5 py-10 md:px-16 md:py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-center text-lg font-bold text-foreground md:text-xl">
            מה מקבלים?
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* From beshaatova */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease }}
              className="overflow-hidden rounded-xl border border-border/60 bg-warm-gray-50"
            >
              <img
                src="/cafes/barcafe-booklets.png"
                alt="חוברות בשעה טובה"
                className="h-40 w-full object-cover brightness-[1.3] saturate-[0.75] contrast-[0.9] sepia-[0.2]"
              />
              <div className="p-4 text-center">
                <div className="mb-1 text-xs font-bold uppercase tracking-widest text-terracotta-500">מ"בשעה טובה"</div>
                <h3 className="text-base font-bold text-foreground">ערכת מפגשים מותאמת לכם</h3>
                <p className="mt-1 text-sm text-foreground/60">5-8 נושאים לבחירה. המפגשים נעשים בקצב שלכם, באופן עצמאי.</p>
              </div>
            </motion.div>

            {/* From cafe */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1, ease }}
              className="overflow-hidden rounded-xl border border-border/60 bg-warm-gray-50"
            >
              <img
                src="/cafes/barcafe-coffee.png"
                alt={cafe.name}
                className="h-40 w-full object-cover object-center brightness-[1.3] saturate-[0.75] contrast-[0.9] sepia-[0.2]"
              />
              <div className="p-4 text-center">
                <div className="mb-1 text-xs font-bold uppercase tracking-widest text-terracotta-500">מ"{cafe.name}"</div>
                <h3 className="text-base font-bold text-foreground">זוג כוסות קפה <span className="text-terracotta-500">לדייט הראשון</span></h3>
                <p className="mt-1 text-sm text-foreground/60">מזמינים קפה, מתיישבים, פותחים את המפגש ואת הלב.</p>
              </div>
            </motion.div>
          </div>

          <div className="mt-6 text-center">
            <Button size="lg" className="text-base" asChild>
              <Link to={`/order?ref=${cafe.slug}`}>להזמנה · 320 ₪</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gradient-to-b from-white to-warm-gray-50 px-5 py-10 md:px-16 md:py-14">
        <div className="mx-auto max-w-2xl">
          {cafe.exteriorUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease }}
            className="mb-10 overflow-hidden rounded-2xl shadow-lg"
          >
            <img
              src={cafe.exteriorUrl}
              alt={`${cafe.name} מבחוץ`}
              className="h-auto max-h-[360px] w-full object-cover object-center brightness-110 saturate-[0.85]"
            />
          </motion.div>
          )}

          <h2 className="mb-8 text-center text-lg font-bold text-foreground md:text-xl">
            איך זה עובד?
          </h2>

          <div className="flex flex-col gap-6 sm:flex-row sm:gap-4">
            {[
              { num: "1", title: "בוחרים ומזמינים", desc: "בוחרים את הנושאים שחשובים לכם ומזמינים את הערכה באתר" },
              { num: "2", title: "אוספים ומתחילים", desc: `אוספים את הערכה ויושבים לדייט הראשון ב${cafe.name} - עם זוג כוסות קפה עלינו` },
              { num: "3", title: "ממשיכים בקצב שלכם", desc: "ממשיכים את המפגשים מתי שמתאים לכם. מומלץ מפגש אחד בשבוע :)" },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1, ease }}
                className="flex flex-1 flex-col items-center text-center"
              >
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-terracotta-500 to-terracotta-400 text-lg font-bold text-white shadow-md">
                  {step.num}
                </div>
                <h3 className="mb-1 text-sm font-bold text-foreground">{step.title}</h3>
                <p className="text-xs leading-relaxed text-foreground/60">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Meeting topics preview */}
      <section className="bg-warm-gray-50 px-5 py-10 md:px-16 md:py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-2 text-center text-lg font-bold text-foreground md:text-xl">
            על מה מדברים?
          </h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            בוחרים 5-8 נושאים מתוך הרשימה.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease }}
            className="flex flex-wrap justify-center gap-2.5"
          >
            {TOPICS.map((t) => (
              <span
                key={t}
                className="rounded-full border border-warm-gray-200/80 bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm"
              >
                {t}
              </span>
            ))}
          </motion.div>

          <div className="mt-5 text-center">
            <Link
              to="/meetings"
              className="text-sm font-medium text-terracotta-600 underline underline-offset-4 transition-colors hover:text-terracotta-500"
            >
              פירוט על הנושאים
            </Link>
          </div>
        </div>
      </section>

      {/* Branches */}
      {cafe.branches && cafe.branches.length > 1 && (
        <section className="bg-white px-5 py-8 md:px-16 md:py-10">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-lg font-bold text-foreground md:text-xl">
              הסניפים של {cafe.name}
            </h2>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6">
              {cafe.branches.map((b) => (
                <a
                  key={b.name}
                  href={b.mapUrl || `https://maps.google.com/?q=${encodeURIComponent(b.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-xl border border-border/60 bg-warm-gray-50 px-6 py-4 text-center transition-colors hover:border-terracotta-300"
                >
                  <p className="text-sm font-bold text-foreground">{b.name}</p>
                  <p className="mt-1 text-sm text-foreground/60 group-hover:text-terracotta-500">{b.address}</p>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Testimonial */}
      <section className="relative bg-warm-gray-50 px-5 py-10 md:px-16 md:py-12">
        <div className="mx-auto max-w-lg text-center">
          <img
            src="/illustrations/botanical-accent.png"
            alt=""
            className="mx-auto mb-4 h-6 w-auto opacity-60 md:h-8"
          />
          <div className="relative">
            <img
              src="/illustrations/enso-circle.png"
              alt=""
              className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 opacity-[0.08] md:h-52 md:w-52"
            />
            <blockquote className="relative z-10 text-[0.95rem] font-medium italic leading-relaxed text-foreground/80 md:text-base">
              "בשעה טובה אפשרה לנו לצאת לדייטים, זמן איכות עם האדם שאנחנו הכי אוהבים,
              <br />
              ולצד זאת ובאופן בונה נותנת לנו כלים להמשך הזוגיות שלנו ולחיים שלנו כזוג."
            </blockquote>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white px-5 py-10 md:px-16 md:py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-center text-lg font-bold text-foreground md:text-xl">
            שאלות ותשובות
          </h2>

          <div className="space-y-3">
            {[
              { q: "מה זה בעצם?", a: `"בשעה טובה" היא ערכה מודפסת ומותאמת אישית לזוגות - סדרה של 5-8 מפגשים על נושאים כמו כסף, משפחה, חלומות, אינטימיות, ילדים ועוד. כל מפגש הוא דייט עם שאלות, תרגילים וכלים שעוזרים לכם לדבר על הדברים החשובים באמת.` },
              { q: "למי זה מתאים?", a: "לכל זוג שרוצה לעצור רגע ולדבר באמת." },
              { q: "איך נראה מפגש?", a: `מגיעים ביחד ל${cafe.name}, פותחים מפגש ונותנים לשיחה לזרום. אין מנחה - אתם לבד, בקצב שלכם. כל מפגש לוקח בין שעה לשעה וחצי. מומלץ מפגש אחד בשבוע :).` },
              { q: `מה מקבלים מ${cafe.name} חוץ מהערכה?`, a: "זוג כוסות קפה (חם או קר, לבחירתכם) לדייט הראשון שלכם - עלינו." },
              { q: "צריך להכין משהו מראש?", a: "לא. רק להגיע בלב פתוח לאדם שאתם הכי אוהבים." },
            ].map((item) => (
              <motion.details
                key={item.q}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, ease }}
                className="group rounded-xl border border-border/60 bg-white"
              >
                <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-sm font-bold text-foreground">
                  {item.q}
                  <span className="mr-2 text-terracotta-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-foreground/70">{item.a}</p>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-b from-white to-terracotta-50/40 px-5 pb-14 pt-10 md:px-16 md:pb-20 md:pt-14">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="mb-3 text-xl font-bold text-foreground md:text-2xl">
            מוכנים לדייט הבא?
          </h2>
          <p className="mb-6 text-sm text-foreground/70 md:text-base">
            מזמינים באתר, יושבים באווירה של {cafe.name}, עם זוג כוסות קפה עלינו.
          </p>

          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <Button size="lg" className="w-full max-w-[260px] text-base sm:w-auto sm:min-w-[180px]" asChild>
              <Link to={`/order?ref=${cafe.slug}`}>להזמנה · 320 ₪</Link>
            </Button>
            <Button variant="outline" size="lg" className="w-full max-w-[260px] text-base sm:w-auto sm:min-w-[180px]" asChild>
              <Link to="/meetings">עוד על המפגשים</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            אפשר גם <Link to={`/order?flow=gift&ref=${cafe.slug}`} className="underline hover:text-foreground">להזמין כשובר מתנה</Link>
          </p>
        </div>
      </section>
    </>
  );
}
