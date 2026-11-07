import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FadeIn } from "@/components/motion";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";

const cards = [
  {
    name: "שחר",
    text: "בדרך לחתונה לפעמים שוכחים לעצור רגע ולדבר על הדברים החשובים באמת. **חוויה מדהימה** - אפילו הייתי ממליצה בתור מתנה לזוג שמתחתן.",
  },
  {
    name: "אלמוג",
    text: "אנחנו מרגישים שאנחנו מכירים אחד את השנייה מצוין, אבל **העצירה הזו בתוך כל הבלאגן** עשתה לנו טוב ועזרה לנו לפקס את עצמנו לעתיד שלנו ביחד.",
  },
  {
    name: "חן",
    text: "גם כזוג שנמצא יחד מספר לא מבוטל של שנים, יש נושאים שלא פשוט לדבר עליהם. **ניכרת ההשקעה והמחשבה** בחוברות - היכולת להנחות אותנו לנקודות הקשות אבל גם לתת לשיחה לזרום.",
  },
  {
    name: "נתי",
    text: "זו הייתה **נקודת העצירה** שהיינו צריכים - לשים רעשי רקע בצד ולהתרכז נטו בזוגיות שלנו ובחיים שאנחנו בונים יחד.",
  },
  {
    name: "עמר",
    text: "**כלי מדהים** לזוגות שרוצים זמן איכות משותף ומשמעותי - שיחות עמוקות וכנות שלא תמיד מגיעים אליהן ביומיום, גם אם חשבתם שאתם מכירים הכי טוב בעולם!",
  },
  {
    name: "אלמוג",
    text: "הכול כתוב בצורה אישית, **בגובה העיניים**, ונוגע בדברים חשובים מאוד.",
  },
  {
    name: "חן",
    text: "אהבנו את **ההתאמה האישית** ואת האפשרות לבחור את הנושאים שרלוונטיים לנו.",
  },
  {
    name: "נתי",
    text: "בעקבות השיחות, ממש **כתבנו את הכתובה שלנו** על בסיס התובנות מהחוברות.",
  },
  {
    name: "יובל",
    text: "חוויה טובה, **פותחת שיח אישי וחשוב** בתוך תקופה שעסוקים בפרקטיקה של אירוע החתונה.",
  },
  {
    name: "ליבי",
    text: "הערכות מדהימות, אפילו זוג דברנים כמונו מצאו את הדרך למצוא נושאים חדשים ולאגד את הכל על הכתב, מה שעושה סדר **דייט קבוע כל שבת**!",
  },
];

function formatBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-foreground">{part}</strong> : part
  );
}

function Stars({ conversion }: { conversion?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      ))}
      {!conversion && (
        <span className="mr-1.5 text-xs font-medium text-muted-foreground">100/100</span>
      )}
    </div>
  );
}

const contentVariants = {
  enter: { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

/** תמונות שזוגות שלחו מהמפגשים שלהם. */
const photos = [
  { src: "/recommendations/beach.jpg", alt: "מפגש של זוג על שפת הים", position: "center 72%" },
  { src: "/recommendations/river.jpg", alt: "מפגש מול נהר והרים", position: "center 82%" },
  { src: "/recommendations/home.jpg", alt: "מפגש בבית לאור נרות", position: "center 42%" },
  { src: "/recommendations/poolside.jpg", alt: "מפגש ליד הבריכה", position: "center 45%" },
];

export function SocialProof({ conversion = false }: { conversion?: boolean }) {
  const [active, setActive] = useState(0);

  const prev = () => setActive((active - 1 + cards.length) % cards.length);
  const next = () => setActive((active + 1) % cards.length);

  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx > 0) next(); else prev();
  };

  return (
    <section className="border-t border-warm-gray-100 bg-[#faf8f5] px-5 py-5 md:py-7">
      <div className="mx-auto max-w-2xl">
        <FadeIn>
          <div className={`mb-5 flex items-center justify-center gap-2 ${conversion ? "flex-col sm:flex-row" : ""}`}>
            {!conversion && (
              <img
                src="/illustrations/mit4mit-logo.webp"
                alt="mit4mit"
                loading="lazy"
                className="h-5 w-auto"
              />
            )}
            <p className={`font-medium text-terracotta-400 ${conversion ? "text-[0.95rem] tracking-normal text-foreground/90" : "text-[0.85rem] uppercase tracking-widest"}`}>
              {conversion ? "מה אומרים הזוגות שעשו את הערכה?" : "מה אומרים זוגות שכבר עברו את זה"}
            </p>
          </div>

          <div
            className="relative overflow-hidden rounded-2xl border border-terracotta-200/70 bg-gradient-to-br from-terracotta-50/60 to-white px-6 py-6 shadow-[0_10px_30px_-12px_rgba(168,86,56,0.25)] md:px-7"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* פס טרקוטה עדין בראש הכרטיס */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-terracotta-300 via-terracotta-400 to-terracotta-300" />
            {/* גרש-פתיחה דקורטיבי */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-2 right-3 select-none font-serif text-[5rem] leading-none text-terracotta-200/80"
            >
              &rdquo;
            </span>

            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                variants={contentVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <div className="relative mb-3">
                  <Stars conversion={conversion} />
                </div>

                <p className="relative text-[1.02rem] font-medium leading-relaxed text-foreground/90 md:text-[1.08rem]">
                  {formatBold(cards[active].text)}
                </p>

                <div className="mt-5">
                  <span className="text-sm font-semibold text-foreground">{cards[active].name}</span>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-5 flex items-center justify-between border-t border-terracotta-100/70 pt-3">
              <button
                onClick={prev}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-warm-gray-100 hover:text-foreground"
                aria-label="ביקורת קודמת"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="flex gap-1.5">
                {cards.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === active ? "w-5 bg-terracotta-400" : "w-2 bg-warm-gray-300"
                    }`}
                    aria-label={`ביקורת ${i + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={next}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-warm-gray-100 hover:text-foreground"
                aria-label="ביקורת הבאה"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* תמונות אמיתיות שזוגות שלחו מהמפגשים שלהם */}
          <div className="mt-6">
            <p className="mb-3 text-center text-[0.8rem] font-medium uppercase tracking-widest text-terracotta-400">
              מהמפגשים של הזוגות
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {photos.map((photo) => (
                <div
                  key={photo.src}
                  className="overflow-hidden rounded-xl border border-terracotta-200/60 bg-white shadow-[0_6px_18px_-10px_rgba(168,86,56,0.35)]"
                >
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                    style={{ objectPosition: photo.position }}
                  />
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
