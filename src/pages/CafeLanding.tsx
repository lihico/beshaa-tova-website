import { useParams, Link, Navigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getCafe, type CafePartner, type CafeTheme } from "@/data/cafes";
import { trackFunnel } from "@/lib/tracking";
import { gtagEvent } from "@/lib/gtag";
import { CoupleDialoguePrompts } from "@/components/sections/CoupleDialoguePrompts";
import { cn } from "@/lib/utils";

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

type ThemeStyles = {
  page: string;
  accent: string;
  accentMuted: string;
  accentBorder: string;
  accentBg: string;
  heroOverlay: string;
  heroText: string;
  heroSubtext: string;
  heroMultiply: string;
  divider: string;
  sectionLight: string;
  sectionMuted: string;
  sectionDark: string;
  card: string;
  cardLabel: string;
  cardBody: string;
  stepBadge: string;
  topicPill: string;
  link: string;
  branchCard: string;
  faq: string;
  cta: string;
  outlineBtn: string;
};

const THEME_STYLES: Record<CafeTheme, ThemeStyles> = {
  default: {
    page: "",
    accent: "text-terracotta-500",
    accentMuted: "text-terracotta-600",
    accentBorder: "hover:border-terracotta-300",
    accentBg: "bg-terracotta-300/50",
    heroOverlay: "bg-gradient-to-b from-white/70 via-white/40 to-white/95",
    heroText: "text-foreground",
    heroSubtext: "text-foreground/80",
    heroMultiply: "text-terracotta-500",
    divider: "bg-terracotta-300/50",
    sectionLight: "bg-white",
    sectionMuted: "bg-warm-gray-50",
    sectionDark: "bg-warm-gray-50/80",
    card: "border-border/60 bg-warm-gray-50",
    cardLabel: "text-terracotta-500",
    cardBody: "text-foreground/60",
    stepBadge: "bg-gradient-to-br from-terracotta-500 to-terracotta-400",
    topicPill: "border-warm-gray-200/80 bg-white text-foreground",
    link: "text-terracotta-600 hover:text-terracotta-500",
    branchCard: "border-border/60 bg-warm-gray-50 hover:border-terracotta-300",
    faq: "border-border/60 bg-white",
    cta: "bg-gradient-to-b from-white to-terracotta-50/40",
    outlineBtn: "",
  },
  toms: {
    page: "bg-[#141414] text-[#F7F2ED]",
    accent: "text-[#E8A07A]",
    accentMuted: "text-[#E8A07A]",
    accentBorder: "hover:border-[#C4674A]",
    accentBg: "bg-[#C4674A]/40",
    heroOverlay: "bg-gradient-to-b from-[#141414]/92 via-[#141414]/72 to-[#141414]",
    heroText: "text-[#F7F2ED]",
    heroSubtext: "text-[#F7F2ED]/85",
    heroMultiply: "text-[#E8A07A]",
    divider: "bg-[#C4674A]/50",
    sectionLight: "bg-[#F7F2ED] text-[#1C1C1C]",
    sectionMuted: "bg-[#EDE6DE] text-[#1C1C1C]",
    sectionDark: "bg-[#1C1C1C] text-[#F7F2ED]",
    card: "border-[#1C1C1C]/10 bg-white",
    cardLabel: "text-[#A85638]",
    cardBody: "text-[#1C1C1C]/65",
    stepBadge: "bg-gradient-to-br from-[#1C1C1C] to-[#C4674A]",
    topicPill: "border-[#1C1C1C]/10 bg-white text-[#1C1C1C]",
    link: "text-[#A85638] hover:text-[#C4674A]",
    branchCard:
      "border-[#1C1C1C]/12 bg-white hover:border-[#C4674A] text-[#1C1C1C]",
    faq: "border-[#1C1C1C]/10 bg-white text-[#1C1C1C]",
    cta: "bg-gradient-to-b from-[#F7F2ED] to-[#EDE6DE] text-[#1C1C1C]",
    outlineBtn: "border-[#1C1C1C]/20 bg-transparent text-[#1C1C1C] hover:bg-[#1C1C1C]/5",
  },
};

function getThemeStyles(cafe: CafePartner): ThemeStyles {
  return THEME_STYLES[cafe.theme ?? "default"];
}

function getHeroImgClass(cafe: CafePartner): string {
  if (cafe.heroUrl?.includes("cafe-hero")) {
    return "absolute inset-0 h-full w-full object-cover object-center brightness-[1.08] contrast-[1.04] saturate-[1.2] sepia-[0.22] hue-rotate-[-14deg]";
  }
  if (cafe.theme === "toms") {
    return "absolute inset-0 h-full w-full object-cover object-center brightness-[0.92] saturate-[1.05]";
  }
  return "absolute inset-0 h-full w-full object-cover object-center";
}

function getCoffeeCardClass(cafe: CafePartner): string {
  if (cafe.slug === "barcafe") return "h-40 w-full bg-white object-cover object-center";
  if (cafe.slug === "cafefiori") {
    return "h-40 w-full bg-white object-cover object-center scale-[1.22] origin-center";
  }
  if (cafe.slug === "tre") return "h-40 w-full bg-white object-cover object-[center_40%]";
  if (cafe.slug === "toms") {
    return "h-40 w-full bg-[#1C1C1C] object-cover object-[22%_58%] scale-[1.35] origin-center";
  }
  if (cafe.coffeeOfferUrl) return "h-40 w-full object-cover object-center";
  return "h-40 w-full object-cover object-center brightness-[1.3] saturate-[0.75] contrast-[0.9] sepia-[0.2]";
}

function getCoffeeAlt(cafe: CafePartner): string {
  if (cafe.slug === "cafefiori") return "קפה קר Cafe Fiori בפחיות";
  if (cafe.slug === "barcafe") return "זוג כוסות קפה";
  if (cafe.slug === "tre") return "שתי כוסות קפה קר TRE";
  if (cafe.slug === "toms") return "זוג כוסות קפה Tom's";
  return `קפה מ${cafe.name}`;
}

export default function CafeLanding() {
  const { cafeId } = useParams<{ cafeId: string }>();
  const cafe = cafeId ? getCafe(cafeId) : undefined;

  useEffect(() => {
    if (cafe) {
      // Pixel + /api/track CAPI mirror with one eventID (deduped by Meta).
      trackFunnel({
        event: "ViewContent",
        contentName: `cafe_landing_${cafe.slug}`,
        contentCategory: "cafe_collab",
      });
      gtagEvent("cafe_landing_view", { cafe: cafe.slug });
    }
  }, [cafe]);

  const styles = useMemo(() => (cafe ? getThemeStyles(cafe) : THEME_STYLES.default), [cafe]);
  const isToms = cafe?.theme === "toms";

  if (!cafe) return <Navigate to="/" replace />;

  const offerText = cafe.offerText ?? "זוג כוסות קפה";
  const offerTextShort = cafe.offerTextShort ?? "זוג כוסות קפה לדייט הראשון - עלינו";
  const offerFaqAnswer =
    cafe.offerFaqAnswer ??
    "זוג כוסות קפה (חם או קר, לבחירתכם) לדייט הראשון שלכם - עלינו.";

  const coffeeCardSrc = cafe.coffeeOfferUrl ?? "/cafes/barcafe-coffee.png";

  return (
    <motion.div
      key={cafe.slug}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={cn("min-h-screen", styles.page)}
    >
      {/* Hero */}
      <section className="relative overflow-hidden px-5 pb-12 pt-10 md:px-16 md:pb-20 md:pt-16">
        {cafe.heroUrl && (
          <>
            <img src={cafe.heroUrl} alt="" className={getHeroImgClass(cafe)} />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, ease }}
              className={cn("absolute inset-0", styles.heroOverlay)}
            />
          </>
        )}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          className="relative z-10 mx-auto max-w-2xl text-center"
        >
          <div className="mb-6 flex items-center justify-center gap-3">
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.05, ease }}
              className="flex items-center gap-2"
            >
              <img
                src="/logo-icon.png"
                alt="בשעה טובה"
                className={cn("h-8 w-8 md:h-10 md:w-10", isToms && "brightness-0 invert")}
              />
              <span className={cn("text-sm font-bold md:text-base", styles.heroText)}>
                בשעה טובה
              </span>
            </motion.div>
            <span className={cn("text-sm font-bold", styles.heroMultiply)}>×</span>
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.1, ease }}
              className="flex items-center"
            >
              <img
                src={cafe.logoUrl}
                alt={cafe.name}
                className={cn(
                  "h-10 w-auto object-contain md:h-14",
                  isToms && "rounded-full ring-1 ring-white/10",
                )}
              />
            </motion.div>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease }}
            className={cn(
              "mb-3 text-3xl font-black leading-snug sm:text-4xl md:text-5xl",
              styles.heroText,
            )}
          >
            הדייט הבא שלכם
            <br />
            מתחיל ב<span className={styles.heroMultiply}>{cafe.name}</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease }}
            className={cn(
              "mx-auto mb-6 max-w-md text-[0.95rem] font-bold leading-relaxed md:text-base",
              styles.heroSubtext,
            )}
          >
            מפגשים זוגיים מותאמים אישית, על הנושאים שחשובים לכם באמת.
            <br />
            באווירה של בית קפה, עם{" "}
            <span className={styles.heroMultiply}>{offerTextShort}</span>.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4, ease }}
            className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3"
          >
            <Button
              size="lg"
              className={cn(
                "w-full max-w-[260px] text-base sm:w-auto sm:min-w-[180px]",
                isToms && "bg-[#1C1C1C] text-[#F7F2ED] hover:bg-[#2a2a2a]",
              )}
              asChild
            >
              <Link to={`/order?ref=${cafe.slug}`}>להזמנה</Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className={cn(
                "w-full max-w-[260px] text-base sm:w-auto sm:min-w-[180px]",
                isToms && styles.outlineBtn,
              )}
              asChild
            >
              <Link to="/meetings">עוד על המפגשים</Link>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      <CoupleDialoguePrompts />

      {/* What you get */}
      <section className={cn("px-5 py-10 md:px-16 md:py-14", styles.sectionMuted)}>
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-center text-lg font-bold md:text-xl">מה מקבלים?</h2>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.12 } },
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, x: 20 },
                visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease } },
              }}
              className={cn("overflow-hidden rounded-xl border", styles.card)}
            >
              <img
                src="/cafes/barcafe-booklets.png"
                alt="חוברות בשעה טובה"
                className="h-40 w-full object-cover brightness-[1.3] saturate-[0.75] contrast-[0.9] sepia-[0.2]"
              />
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.15, ease }}
                className="p-4 text-center"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.2 }}
                  className={cn("mb-1 text-xs font-bold uppercase tracking-widest", styles.cardLabel)}
                >
                  מ"בשעה טובה"
                </motion.div>
                <h3 className="text-base font-bold">ערכת מפגשים מותאמת לכם</h3>
                <p className={cn("mt-1 text-sm", styles.cardBody)}>
                  5-8 נושאים לבחירה. המפגשים נעשים בקצב שלכם, באופן עצמאי.
                </p>
              </motion.div>
            </motion.div>

            <motion.div
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease } },
              }}
              className={cn("overflow-hidden rounded-xl border", styles.card)}
            >
              <img
                src={coffeeCardSrc}
                alt={getCoffeeAlt(cafe)}
                className={getCoffeeCardClass(cafe)}
              />
              <div className="p-4 text-center">
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.2 }}
                  className={cn("mb-1 text-xs font-bold uppercase tracking-widest", styles.cardLabel)}
                >
                  מ"{cafe.name}"
                </motion.div>
                <h3 className="text-base font-bold">
                  {offerText}{" "}
                  <span className={isToms ? "text-[#A85638]" : "text-terracotta-500"}>
                    לדייט הראשון
                  </span>
                </h3>
                <p className={cn("mt-1 text-sm", styles.cardBody)}>
                  מזמינים קפה, מתיישבים, פותחים את המפגש ואת הלב.
                </p>
              </div>
            </motion.div>
          </motion.div>

          <div className="mt-6 text-center">
            <Button
              size="lg"
              className={cn("text-base", isToms && "bg-[#1C1C1C] text-[#F7F2ED] hover:bg-[#2a2a2a]")}
              asChild
            >
              <Link to={`/order?ref=${cafe.slug}`}>להזמנה</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Single-branch hours */}
      {cafe.openingHours && cafe.openingHours.length > 0 && (
        <section
          className={cn(
            "border-y border-border/50 px-5 py-10 md:px-16 md:py-12",
            styles.sectionDark,
          )}
        >
          <div className="mx-auto max-w-lg text-center">
            <h2 className="mb-4 text-lg font-bold md:text-xl">שעות פעילות {cafe.name}</h2>
            {cafe.branches?.[0] && (
              <p className="mb-5">
                <a
                  href={
                    cafe.branches[0].mapUrl ||
                    `https://maps.google.com/?q=${encodeURIComponent(cafe.branches[0].address)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "text-base font-semibold underline underline-offset-4 transition-colors",
                    styles.link,
                  )}
                >
                  {cafe.branches[0].address}
                </a>
              </p>
            )}
            <ul className="mx-auto max-w-md space-y-2 text-sm leading-relaxed opacity-80 md:text-[0.95rem]">
              {cafe.openingHours.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* How it works */}
      <section
        className={cn(
          "px-5 py-10 md:px-16 md:py-14",
          isToms ? styles.sectionLight : "bg-gradient-to-b from-white to-warm-gray-50",
        )}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease }}
          className="mx-auto max-w-2xl"
        >
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

          <h2 className="mb-8 text-center text-lg font-bold md:text-xl">איך זה עובד?</h2>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.1 } },
            }}
            className="flex flex-col gap-6 sm:flex-row sm:gap-4"
          >
            {[
              {
                num: "1",
                title: "בוחרים ומזמינים",
                desc: "בוחרים את הנושאים שחשובים לכם ומזמינים את הערכה באתר",
              },
              {
                num: "2",
                title: "אוספים ומתחילים",
                desc: `אוספים את הערכה ויושבים לדייט הראשון ב${cafe.name} - עם ${offerText} עלינו`,
              },
              {
                num: "3",
                title: "ממשיכים בקצב שלכם",
                desc: "ממשיכים את המפגשים מתי שמתאים לכם. מומלץ מפגש אחד בשבוע :)",
              },
            ].map((step) => (
              <motion.div
                key={step.num}
                variants={{
                  hidden: { opacity: 0, y: 15 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease } },
                }}
                className="flex flex-1 flex-col items-center text-center"
              >
                <div
                  className={cn(
                    "mb-2 flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white shadow-md",
                    styles.stepBadge,
                  )}
                >
                  {step.num}
                </div>
                <h3 className="mb-1 text-sm font-bold">{step.title}</h3>
                <p className={cn("text-xs leading-relaxed", styles.cardBody)}>{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* Meeting topics */}
      <section className={cn("px-5 py-8 md:px-16 md:py-10", styles.sectionMuted)}>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-1 text-lg font-bold md:text-xl">על מה מדברים?</h2>
          <p className="mb-3 text-sm opacity-60">בוחרים 5-8 נושאים מתוך הרשימה.</p>
          <Link to="/meetings" className={cn("text-sm font-medium underline underline-offset-4", styles.link)}>
            פירוט על הנושאים ←
          </Link>
        </div>
      </section>

      {/* Branches */}
      {cafe.branches && cafe.branches.length > 0 && (
        <section className={cn("px-5 py-8 md:px-16 md:py-10", styles.sectionLight)}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-lg font-bold md:text-xl">
              {cafe.branches.length > 1 ? `הסניפים של ${cafe.name}` : `איפה ${cafe.name}?`}
            </h2>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.1 } },
              }}
              className={cn(
                "grid gap-3",
                cafe.branches.length > 1 ? "sm:grid-cols-2" : "max-w-md mx-auto",
              )}
            >
              {cafe.branches.map((b) => (
                <motion.div
                  key={b.name}
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease } },
                  }}
                  className={cn(
                    "rounded-xl border px-5 py-4 text-center transition-colors",
                    styles.branchCard,
                  )}
                >
                  <p className="text-sm font-bold">{b.name}</p>
                  <a
                    href={b.mapUrl || `https://maps.google.com/?q=${encodeURIComponent(b.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "mt-1 block text-sm underline underline-offset-2 transition-colors",
                      styles.cardBody,
                      "hover:opacity-100",
                      isToms && "hover:text-[#A85638]",
                    )}
                  >
                    {b.address}
                  </a>
                  {b.phone && (
                    <a
                      href={`tel:${b.phone.replace(/-/g, "")}`}
                      className={cn("mt-2 block text-sm font-semibold", styles.link)}
                    >
                      {b.phone}
                    </a>
                  )}
                  {b.hours && b.hours.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs leading-relaxed opacity-70">
                      {b.hours.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              ))}
            </motion.div>
            {cafe.instagramHandle && (
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.15, ease }}
                className="mt-5 text-sm opacity-70"
              >
                עקבו אחרי {cafe.name} ב
                <a
                  href={`https://www.instagram.com/${cafe.instagramHandle.replace("@", "")}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("mx-1 font-semibold underline underline-offset-2", styles.link)}
                >
                  {cafe.instagramHandle}
                </a>
              </motion.p>
            )}
          </div>
        </section>
      )}

      {/* Testimonial */}
      <section className={cn("relative px-5 py-10 md:px-16 md:py-12", styles.sectionMuted)}>
        <div className="mx-auto max-w-lg text-center">
          <img
            src="/illustrations/botanical-accent.png"
            alt=""
            className={cn(
              "mx-auto mb-4 h-6 w-auto opacity-60 md:h-8",
              isToms && "brightness-0 invert opacity-30",
            )}
          />
          <div className="relative">
            <img
              src="/illustrations/enso-circle.png"
              alt=""
              className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 opacity-[0.08] md:h-52 md:w-52"
            />
            <blockquote className="relative z-10 text-[0.95rem] font-medium italic leading-relaxed opacity-80 md:text-base">
              "בשעה טובה אפשרה לנו לצאת לדייטים, זמן איכות עם האדם שאנחנו הכי אוהבים,
              <br />
              ולצד זאת ובאופן בונה נותנת לנו כלים להמשך הזוגיות שלנו ולחיים שלנו כזוג."
            </blockquote>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={cn("px-5 py-10 md:px-16 md:py-14", styles.sectionLight)}>
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-center text-lg font-bold md:text-xl">שאלות ותשובות</h2>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.06 } },
            }}
            className="space-y-3"
          >
            {[
              {
                q: "איך נראה מפגש?",
                a: `מגיעים ביחד ל${cafe.name}, פותחים מפגש ונותנים לשיחה לזרום. אין מנחה - אתם לבד, בקצב שלכם. כל מפגש לוקח בין שעה לשעה וחצי. מומלץ מפגש אחד בשבוע :).`,
              },
              { q: `מה מקבלים מ${cafe.name} חוץ מהערכה?`, a: offerFaqAnswer },
              { q: "צריך להכין משהו מראש?", a: "לא. רק להגיע בלב פתוח לאדם שאתם הכי אוהבים." },
            ].map((item) => (
              <motion.details
                key={item.q}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease } },
                }}
                className={cn("group rounded-xl border", styles.faq)}
              >
                <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-sm font-bold">
                  {item.q}
                  <span
                    className={cn(
                      "mr-2 transition-transform group-open:rotate-45",
                      isToms ? "text-[#C4674A]" : "text-terracotta-400",
                    )}
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed opacity-70">{item.a}</p>
              </motion.details>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={cn("px-5 pb-14 pt-10 md:px-16 md:pb-20 md:pt-14", styles.cta)}>
        <div className="mx-auto max-w-lg text-center">
          <h2 className="mb-3 text-xl font-bold md:text-2xl">מוכנים לדייט הבא?</h2>
          <p className="mb-6 text-sm opacity-70 md:text-base">
            מזמינים באתר, יושבים באווירה של {cafe.name}, עם {offerText} עלינו.
          </p>

          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <Button
              size="lg"
              className={cn(
                "w-full max-w-[260px] text-base sm:w-auto sm:min-w-[180px]",
                isToms && "bg-[#1C1C1C] text-[#F7F2ED] hover:bg-[#2a2a2a]",
              )}
              asChild
            >
              <Link to={`/order?ref=${cafe.slug}`}>להזמנה</Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className={cn(
                "w-full max-w-[260px] text-base sm:w-auto sm:min-w-[180px]",
                isToms && styles.outlineBtn,
              )}
              asChild
            >
              <Link to="/meetings">עוד על המפגשים</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs opacity-60">
            אפשר גם{" "}
            <Link
              to={`/order?flow=gift&ref=${cafe.slug}`}
              className="underline hover:opacity-100"
            >
              להזמין כשובר מתנה
            </Link>
          </p>
        </div>
      </section>
    </motion.div>
  );
}
