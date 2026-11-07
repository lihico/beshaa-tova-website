import { Link } from "react-router-dom";
import { FadeIn } from "@/components/motion";
import { Button } from "@/components/ui/button";

/** באנר בעמוד הבית: הזמנה לאסוף את הערכה בבית קפה שותף עם זוג קפה מתנה. מוביל לעמוד בתי הקפה. */
export function CafeCollab() {
  return (
    <section className="bg-warm-gray-50 px-5 py-10 md:py-14" style={{ overflowX: "clip" }}>
      <FadeIn>
        <Link
          to="/cafes"
          className="group mx-auto flex max-w-3xl flex-col overflow-hidden rounded-3xl border border-warm-gray-200/70 bg-white shadow-sm transition hover:shadow-md sm:flex-row"
        >
          <div className="relative h-44 w-full shrink-0 sm:h-auto sm:w-2/5">
            <img
              src="/illustrations/hero-cafe-real.webp"
              alt="ערכת בשעה טובה על שולחן בבית קפה לצד זוג קפה"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center sm:p-8">
            <h2 className="text-xl font-bold leading-snug text-foreground md:text-2xl">
              לקבל את הערכה שלנו בבית קפה, עם זוג קפה מתנה
            </h2>
            <span className="inline-flex">
              <Button size="lg" className="text-base shadow-sm" tabIndex={-1} asChild>
                <span>לבתי הקפה השותפים ←</span>
              </Button>
            </span>
          </div>
        </Link>
      </FadeIn>
    </section>
  );
}
