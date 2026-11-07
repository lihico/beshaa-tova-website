import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { FadeIn } from "@/components/motion";

const topics = [
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

const pages = [
  {
    src: "/booklet-preview/page-conflict-loop.jpg",
    alt: "הלופ שלנו - דפוס המריבה הזוגי",
    label: "איך אנחנו רבים",
    description: "מה קורה כשיש ביננו חיכוך, ואיך חוזרים זה לזה.",
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
    description: "משתפים ומקשיבים מעמדה סקרנית על הצרכים של כל אחד, ולומדים לדבר על זה בטבעיות.",
  },
  {
    src: "/booklet-preview/page-iceberg.jpg",
    alt: "הקרחון",
    label: "כשקשה",
    description: "לומדים מה כל אחד מאיתנו באמת צריך בתקופות קשות - ולומדים לבקש את זה.",
  },
  {
    src: "/booklet-preview/page-ketubah.jpg",
    alt: "מרגשות למעשים",
    label: "הכתובה שלנו",
    description: "כותבים יחד כתובה אישית - מרגשות ותובנות למילים שלכם.",
  },
];

const FADE_MS = 500;

export function WhatsInside() {
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

  const goToNext = useCallback(() => {
    goToPage((current + 1) % pages.length);
  }, [current, goToPage]);

  const goToPrev = useCallback(() => {
    goToPage((current - 1 + pages.length) % pages.length);
  }, [current, goToPage]);

  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx > 0) goToNext(); else goToPrev();
  };

  useEffect(() => {
    const timer = setInterval(() => {
      goToPage((current + 1) % pages.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [current, goToPage]);

  return (
    <section className="relative bg-gradient-to-b from-warm-gray-50 to-terracotta-50/30 px-5 py-12 md:py-16" style={{ overflowX: "clip" }}>
      <div className="pointer-events-none absolute right-0 top-8 h-48 w-48 -translate-x-16 rounded-full bg-terracotta-100/25 blur-3xl" />
      <div className="mx-auto max-w-2xl">
        <FadeIn>
          <h2 className="mb-2 text-center text-xl font-bold text-foreground md:text-2xl">
            על מה מדברים בכל דייט?
          </h2>
          <p className="mx-auto mb-5 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
            בוחרים עד 8 נושאים שמעניינים אתכם
          </p>
        </FadeIn>

        <FadeIn delay={0.05}>
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            {topics.map((t) => (
              <span
                key={t}
                className="rounded-full border border-warm-gray-200/80 bg-white px-3.5 py-1.5 text-[0.85rem] font-medium text-foreground shadow-sm"
              >
                {t}
              </span>
            ))}
            <span className="rounded-full bg-terracotta-500 px-3.5 py-1.5 text-[0.85rem] font-semibold text-white shadow-sm">
              + הכתובה שלנו
            </span>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <p className="mb-4 text-center text-sm font-medium text-muted-foreground">
            הצצה לחוברות
          </p>
          <div
            className="relative mx-auto w-[260px] md:w-[340px]"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-white shadow-xl shadow-terracotta-200/30 ring-1 ring-warm-gray-100">
              {prev !== null && (
                <img
                  key={`prev-${prev}`}
                  src={pages[prev].src}
                  alt={pages[prev].alt}
                  loading="lazy"
                  className="absolute inset-0 block h-full w-full object-cover"
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
                loading="lazy"
                className="absolute inset-0 block h-full w-full object-cover"
                style={{
                  animation: prev !== null ? `fadeSlideIn ${FADE_MS}ms ease-in-out` : undefined,
                }}
              />
            </div>
            <div className="min-h-[3.5rem]">
              <p className="mt-3 text-sm font-semibold text-terracotta-600">
                {pages[current].label}
              </p>
              <p className="mt-1 text-[0.85rem] leading-relaxed text-muted-foreground">
                {pages[current].description}
              </p>
            </div>
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
  );
}
