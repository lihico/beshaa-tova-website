import { useState, useEffect, useCallback, useRef } from "react";
import { FadeIn } from "@/components/motion";

const pages = [
  { src: "/booklet-preview/page-conflict-loop.jpg", alt: "הלופ שלנו - דפוס המריבה הזוגי" },
  { src: "/booklet-preview/page-career-chart.jpg", alt: "מה העבודה נותנת ולוקחת - תרגיל סימון" },
  { src: "/booklet-preview/page-money-speech.jpg", alt: "מה אמרו על כסף בבית - בועות דיבור" },
  { src: "/booklet-preview/page-engines-brakes.jpg", alt: "מנועים וברקסים - האינטימיות שלנו" },
  { src: "/booklet-preview/page-adventures.jpg", alt: "כיף והרפתקאות ביחד - כרטיסי רעיונות" },
  { src: "/booklet-preview/page-iceberg.jpg", alt: "הקרחון - מה מתחת למים בזמן מריבה" },
  { src: "/booklet-preview/page-career.jpg", alt: "מה גילינו - שיתוף ניחושים על הצד השני" },
  { src: "/booklet-preview/page-ketubah.jpg", alt: "מרגשות למעשים - הכתובה שלנו" },
];

const FADE_MS = 600;

export function BookletPreview() {
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const transitioning = useRef(false);

  const goToPage = useCallback(
    (next: number) => {
      if (transitioning.current || next === current) return;
      transitioning.current = true;
      setPrev(current);
      setCurrent(next);
      setTimeout(() => {
        setPrev(null);
        transitioning.current = false;
      }, FADE_MS);
    },
    [current]
  );

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      goToPage((current + 1) % pages.length);
    }, 3800);
    return () => clearInterval(timer);
  }, [current, isPaused, goToPage]);

  const goTo = (idx: number) => {
    if (idx === current) return;
    setIsPaused(true);
    goToPage(idx);
    setTimeout(() => setIsPaused(false), 6000);
  };

  return (
    <section className="px-6 py-16 md:py-24">
      <FadeIn className="mx-auto max-w-4xl text-center">
        <h2 className="mb-3 text-2xl font-bold text-foreground md:text-3xl">
          הצצה לחוברת
        </h2>
        <p className="mb-10 text-muted-foreground">
          כל ערכה כוללת חוברת זוגית מנחה ושתי חוברות אישיות - בהתאמה אישית
          לפרטים שלכם ולמפגשים שבחרתם.
        </p>

        <div className="relative mx-auto w-[280px] md:w-[380px]">
          <div className="relative overflow-hidden rounded-sm bg-white shadow-xl shadow-warm-gray-200/50">
            <div className="relative">
              {/* Outgoing page - fades out and slides left (RTL reading direction) */}
              {prev !== null && (
                <img
                  key={`prev-${prev}`}
                  src={pages[prev].src}
                  alt={pages[prev].alt}
                  className="absolute inset-0 block w-full"
                  style={{
                    opacity: 0,
                    transform: "translateX(-8px)",
                    transition: `opacity ${FADE_MS}ms ease-in-out, transform ${FADE_MS}ms ease-in-out`,
                  }}
                />
              )}

              {/* Current page - fades in */}
              <img
                key={`cur-${current}`}
                src={pages[current].src}
                alt={pages[current].alt}
                className="block w-full"
                style={{
                  animation: prev !== null ? `fadeSlideIn ${FADE_MS}ms ease-in-out` : undefined,
                }}
              />
            </div>

            <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-r from-warm-gray-200/40 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[2px] bg-gradient-to-l from-warm-gray-200/30 to-transparent" />
          </div>

          <div className="mx-auto mt-1 h-2 w-[92%] rounded-full bg-warm-gray-200/30 blur-sm" />
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          {pages.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              aria-label={`עמוד ${idx + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === current
                  ? "w-6 bg-terracotta-400"
                  : "w-2 bg-warm-gray-300 hover:bg-terracotta-300"
              }`}
            />
          ))}
        </div>
      </FadeIn>
    </section>
  );
}
