import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { WeddingChecklistIntro } from "@/components/sections/WeddingChecklistIntro";

type HeroV2Props = {
  /** מסלול שיפור המרה + `/preview` */
  conversion?: boolean;
  /** לדוגמה `?preview=conversion` - מתווסף ל־`/order` */
  orderSearch?: string;
  /** האם להציג את סקשן הצ׳קליסט (למשל בדפי פלאייר לא רוצים) */
  showChecklistIntro?: boolean;
};

export function HeroV2({ conversion = false, orderSearch = "", showChecklistIntro = true }: HeroV2Props) {
  const orderHref = `/order${orderSearch}`;
  const giftHref = orderSearch ? `/order${orderSearch.startsWith("?") ? `${orderSearch}&` : "?"}flow=gift` : "/order?flow=gift";

  return (
    <>
      {showChecklistIntro && <WeddingChecklistIntro />}

      <section className={`bg-white px-5 pb-4 md:px-16 md:pb-10 ${showChecklistIntro ? "pt-2 md:pt-6" : "pt-8 md:pt-14"}`} style={{ overflowX: "clip" as const }}>
        <div className="mx-auto w-full max-w-lg text-center md:max-w-2xl">
          <p className="mx-auto mb-4 max-w-md text-[0.95rem] font-medium leading-relaxed text-muted-foreground md:mb-6 md:text-base">
            בטירוף של החיים, בין העבודה, הלימודים, הבית, המשפחה -{" "}
            <strong className="whitespace-nowrap text-lg font-extrabold text-terracotta-600 md:text-xl">עוצרים.</strong>
          </p>

          <h1 className="mb-3 text-balance text-2xl font-extrabold leading-[1.15] tracking-tight text-foreground sm:text-[2rem] md:mb-5 md:text-5xl">
            {conversion ? (
              <>
                דייט זוגי מודרך, בקצב שלכם,{" "}
                <span className="text-terracotta-600">על הדברים החשובים באמת</span>
              </>
            ) : (
              "ערכת שיח זוגית"
            )}
          </h1>

          <p className="mx-auto mb-4 text-pretty text-[0.95rem] font-medium leading-relaxed text-foreground md:mb-8 md:max-w-lg md:text-base">
            <strong className="font-bold text-foreground">לזוגות לפני אירוסין או חתונה</strong>, שרוצים להכניס עומק להכנות,
            <br />
            <strong className="font-bold text-foreground">ולזוגות שחיים ביחד</strong> (לפני או אחרי חתונה) ורוצים להשקיע זמן במה שהכי חשוב.
          </p>

          <div className="relative mx-auto mb-4 max-w-[min(100%,480px)] overflow-hidden rounded-3xl bg-terracotta-50/50 shadow-[0_20px_50px_rgba(168,86,56,0.09)] ring-1 ring-terracotta-100/80 md:mb-8">
            <div className="absolute inset-0 z-10 bg-gradient-to-tr from-white/10 via-transparent to-terracotta-50/60" />
            <div className="absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-white via-white/40 to-transparent" />
            <img
              src="/illustrations/hero-writing.jpg"
              alt="זוג כותב יחד בחוברות של בשעה טובה בבית קפה, מבט מלמעלה"
              className="relative block h-[240px] w-full object-cover sm:h-[280px] md:h-[380px]"
              style={{ objectPosition: "center 50%" }}
            />
          </div>

          <div className="mx-auto flex w-full max-w-lg flex-col gap-3 border-t border-warm-gray-200/70 pt-4 text-center md:gap-5 md:border-t-0 md:pt-0">
            <div className="flex flex-col items-center gap-2 sm:flex-row-reverse sm:justify-center sm:gap-3">
              <Button size="lg" className="w-full max-w-[280px] text-base shadow-sm sm:w-auto sm:min-w-[190px]" asChild>
                <Link to={orderHref}>להזמנת הערכה</Link>
              </Button>
              <Button variant="outline" size="lg" className="w-full max-w-[280px] text-base sm:w-auto sm:min-w-[190px]" asChild>
                <Link to={giftHref}>
                  {conversion ? "הזמנה כשובר מתנה לזוג" : "הזמנת שובר מתנה"}
                </Link>
              </Button>
            </div>

            <p className="text-[0.88rem] leading-snug text-terracotta-700 md:text-[0.9rem]" aria-label="יתרונות הערכה">
              <span className="flex flex-col items-center gap-1 md:hidden">
                <span className="inline-flex items-center gap-2 font-medium"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-400/75" />עצמאית ומובנית</span>
                <span className="inline-flex items-center gap-2 font-medium"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-400/75" />מותאמת אישית</span>
                <span className="inline-flex items-center gap-2 font-medium"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-400/75" />מגיעה עד הבית</span>
              </span>
              <span className="hidden md:block md:w-full md:text-center">
                עצמאית ומובנית<span className="mx-2 text-warm-gray-400">·</span>
                מותאמת אישית<span className="mx-2 text-warm-gray-400">·</span>
                מגיעה עד הבית
              </span>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
