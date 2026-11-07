import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FadeIn } from "@/components/motion";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";

const cards = [
  {
    name: "אלמוג",
    text: "אנחנו מרגישים שאנחנו מכירים אחד את השנייה מצוין, אבל **העצירה הזו בתוך כל הבלאגן** עשתה לנו טוב ועזרה לנו לפקס את עצמנו לעתיד שלנו ביחד.",
  },
  {
    name: "אלמוג",
    text: "הכול כתוב בצורה אישית, **בגובה העיניים**, ונוגע בדברים חשובים מאוד.",
  },
  {
    name: "חן",
    text: "גם כזוג שנמצא יחד מספר לא מבוטל של שנים, יש נושאים שלא פשוט לדבר עליהם. **ניכרת ההשקעה והמחשבה** בחוברות - היכולת להנחות אותנו לנקודות הקשות אבל גם לתת לשיחה לזרום.",
  },
  {
    name: "חן",
    text: "אהבנו את **ההתאמה האישית** ואת האפשרות לבחור את הנושאים שרלוונטיים לנו.",
  },
  {
    name: "נתי",
    text: "זו הייתה **נקודת העצירה** שהיינו צריכים - לשים רעשי רקע בצד ולהתרכז נטו בזוגיות שלנו ובחיים שאנחנו בונים יחד.",
  },
  {
    name: "נתי",
    text: "בעקבות השיחות, ממש **כתבנו את הכתובה שלנו** על בסיס התובנות מהחוברות.",
  },
];

function formatBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-foreground">{part}</strong> : part
  );
}

function Stars() {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      ))}
      <span className="mr-1.5 text-xs font-medium text-muted-foreground">100/100</span>
    </div>
  );
}

const contentVariants = {
  enter: { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export function SocialProof() {
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
    <section className="border-t border-warm-gray-100 bg-[#faf8f5] px-5 py-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <FadeIn>
          <div className="mb-5 flex items-center justify-center gap-2">
            <img
              src="/illustrations/mit4mit-logo.webp"
              alt="mit4mit"
              loading="lazy"
              className="h-5 w-auto"
            />
            <p className="text-[0.85rem] font-medium uppercase tracking-widest text-terracotta-400">
              מה אומרים זוגות שכבר עברו את זה
            </p>
          </div>

          <div
            className="rounded-2xl border border-terracotta-100/80 bg-gradient-to-br from-terracotta-50/40 to-white px-5 py-5 shadow-sm"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                variants={contentVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <Stars />
                  <span className="text-xs font-medium text-foreground">{cards[active].name}</span>
                </div>

                <p className="text-[0.95rem] leading-relaxed text-foreground/80">
                  &ldquo;{formatBold(cards[active].text)}&rdquo;
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-4 flex items-center justify-between border-t border-warm-gray-100 pt-3">
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
        </FadeIn>
      </div>
    </section>
  );
}
