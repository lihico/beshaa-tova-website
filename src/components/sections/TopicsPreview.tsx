import { FadeIn } from "@/components/motion";
import { Link } from "react-router-dom";

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

export function TopicsPreview() {
  return (
    <section className="px-5 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <FadeIn>
          <h2 className="mb-2 text-center text-xl font-bold text-foreground md:text-2xl">
            על מה מדברים?
          </h2>
          <p className="mx-auto mb-7 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
            בוחרים עד 8 נושאים שמעניינים אתכם
          </p>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="flex flex-wrap justify-center gap-2.5">
            {topics.map((t) => (
              <span
                key={t}
                className="rounded-full border border-warm-gray-200/80 bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm"
              >
                {t}
              </span>
            ))}
            <span className="rounded-full bg-terracotta-500 px-4 py-2 text-sm font-semibold text-white shadow-sm">
              + הכתובה שלנו
            </span>
          </div>
        </FadeIn>

        <div className="mt-6 text-center">
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
