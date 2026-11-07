import { useState, useEffect, useCallback, useRef } from "react";
import { FadeIn } from "@/components/motion";

const pages = [
  {
    src: "/booklet-preview/page-conflict-loop.jpg",
    alt: "הלופ שלנו - דפוס המריבה הזוגי",
    label: "איך אנחנו רבים",
    description: "ממפים יחד את דפוס החיכוך החוזר - מה מתחת לפני השטח?",
  },
  {
    src: "/booklet-preview/page-money-speech.jpg",
    alt: "מה אמרו על כסף בבית",
    label: "לדבר על כסף",
    description: "\"בבית שלי כסף היה...\" - בועות דיבור שפותחות שיחה אמיתית.",
  },
  {
    src: "/booklet-preview/page-engines-brakes.jpg",
    alt: "מנועים וברקסים",
    label: "האינטימיות שלנו",
    description: "מנועים וברקסים - מה מדליק ומה מכבה? מבוסס על מחקר של נגוסקי.",
  },
  {
    src: "/booklet-preview/page-iceberg.jpg",
    alt: "הקרחון",
    label: "כשקשה",
    description: "הקרחון: מעל המים - \"הכל בסדר\". מתחת? מה שבאמת כואב.",
  },
  {
    src: "/booklet-preview/page-ketubah.jpg",
    alt: "מרגשות למעשים",
    label: "הכתובה שלנו",
    description: "כותבים יחד כתובה אישית - מרגשות ותובנות למילים שלכם.",
  },
];

const FADE_MS = 500;

export function BookletPreviewV2() {
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
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
    const timer = setInterval(() => {
      goToPage((current + 1) % pages.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [current, goToPage]);

  return (
    <section className="relative bg-gradient-to-b from-warm-gray-50 to-terracotta-50/30 px-5 py-12 md:py-16" style={{ overflowX: "clip" }}>
      <div className="pointer-events-none absolute right-0 top-8 h-48 w-48 -translate-x-16 rounded-full bg-terracotta-100/25 blur-3xl" />
      <div className="mx-auto max-w-2xl text-center">
        <FadeIn>
          <h2 className="mb-1 text-xl font-bold text-foreground md:text-2xl">הצצה לחוברות</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            שאלות, רשימות, משחקים, כתיבה ושיח פתוח - טעימה ממה שמחכה בפנים
          </p>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="relative mx-auto w-[260px] md:w-[340px]">
            <div className="relative overflow-hidden rounded-lg bg-white shadow-xl shadow-terracotta-200/30 ring-1 ring-warm-gray-100">
              {prev !== null && (
                <img
                  key={`prev-${prev}`}
                  src={pages[prev].src}
                  alt={pages[prev].alt}
                  className="absolute inset-0 block w-full"
                  style={{
                    opacity: 0,
                    transition: `opacity ${FADE_MS}ms ease-in-out`,
                  }}
                />
              )}
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
            <p className="mt-3 text-sm font-semibold text-terracotta-600">
              {pages[current].label}
            </p>
            <p className="mt-1 text-[0.8rem] leading-relaxed text-muted-foreground">
              {pages[current].description}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            {pages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToPage(idx)}
                aria-label={`עמוד ${idx + 1}`}
                className="flex h-11 w-11 items-center justify-center"
              >
                <span className={`block rounded-full transition-all duration-300 ${
                  idx === current
                    ? "h-2.5 w-6 bg-terracotta-400"
                    : "h-2.5 w-2.5 bg-warm-gray-300"
                }`} />
              </button>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
