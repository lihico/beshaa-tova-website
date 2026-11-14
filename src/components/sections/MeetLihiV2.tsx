import { FadeIn } from "@/components/motion";
import { Link } from "react-router-dom";

export function MeetLihiV2() {
  return (
    <section className="relative bg-gradient-to-br from-terracotta-50/70 via-white to-terracotta-50/40 px-5 py-12 md:py-16" style={{ overflowX: "clip" }}>
      <div className="pointer-events-none absolute left-0 top-8 h-64 w-64 translate-x-16 rounded-full bg-terracotta-100/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 -translate-x-12 rounded-full bg-pink-100/30 blur-3xl" />

      <div className="relative mx-auto max-w-2xl">
        <FadeIn>
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:gap-7 sm:text-right">
            <div className="relative shrink-0">
              <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-terracotta-200/50 to-pink-200/50 blur-sm" />
              <img
                src="/illustrations/about-ketubah-signing.png"
                alt="ליהי ובן הזוג שלה חותמים על הכתובה האישית שלהם"
                className="relative h-28 w-28 rounded-full border-2 border-white object-cover shadow-lg md:h-32 md:w-32"
              />
            </div>
            <div className="max-w-md">
              <h3 className="mb-2 text-xl font-bold text-foreground md:text-2xl">מי מאחורי הערכה?</h3>
              <p className="text-[0.9rem] leading-relaxed text-muted-foreground">
                אני <span className="font-semibold text-foreground">ליהי</span>, דוקטורנטית לפסיכולוגיה קלינית באוניברסיטת בר-אילן.
                לפני שנה התחתנתי, ובתקופה שלפני קבענו לעצמנו דייט שבועי - בכל פעם נושא אחר.
              </p>
              <p className="mt-2 text-[0.9rem] leading-relaxed text-muted-foreground">
                חיפשתי כלי שמתרגם את המחקר למשהו שזוגות יוכלו לעשות לבד - מובנה, חם, ובגובה העיניים. לא מצאתי.{" "}
                <span className="font-bold text-terracotta-600">אז בניתי אחד.</span>
              </p>
              <Link
                to="/about"
                className="mt-3 inline-block rounded-full bg-white px-4 py-1.5 text-sm font-medium text-terracotta-600 shadow-sm transition-all hover:shadow-md hover:text-terracotta-500"
              >
                הסיפור המלא ←
              </Link>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
