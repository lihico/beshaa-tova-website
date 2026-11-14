import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { WeddingChecklistIntro } from "@/components/sections/WeddingChecklistIntro";
import { trackCta } from "@/lib/behavior";
import { partnerShareHref } from "@/lib/share";

type HeroV2Props = {
  /** מסלול שיפור המרה + `/preview` */
  conversion?: boolean;
  /** לדוגמה `?preview=conversion` - מתווסף ל־`/order` */
  orderSearch?: string;
  /** האם להציג את סקשן הצ׳קליסט (למשל בדפי פלאייר לא רוצים) */
  showChecklistIntro?: boolean;
  /** שורה קטנה מתחת לכפתורים (למשל קוד הסטודנטים בעמוד הפלאייר, P4) */
  note?: ReactNode;
};

export function HeroV2({ conversion = false, orderSearch = "", showChecklistIntro = true, note }: HeroV2Props) {
  const orderHref = `/order${orderSearch}`;
  // H5 (Lihi, 14.11.2026): the gift button goes to the gift page (prices, the voucher, quotes), like the one at the bottom.
  const giftHref = "/give-a-gift";

  return (
    <>
      {showChecklistIntro && <WeddingChecklistIntro />}

      <section className={`bg-white px-5 pb-4 md:px-16 md:pb-10 ${showChecklistIntro ? "pt-2 md:pt-6" : "pt-8 md:pt-14"}`} style={{ overflowX: "clip" as const }}>
        <div className="mx-auto w-full max-w-lg text-center md:max-w-2xl">
          {/* H1 (Lihi, 14.11.2026): the new message. DRAFT he copy approved as proposed; the "בטירוף של החיים" line was dropped to shorten the first screen. */}
          {conversion && (
            <p className="mb-2 text-sm font-bold text-terracotta-600 md:mb-3 md:text-base">מסע זוגי עצמאי לפני החתונה</p>
          )}
          <h1 className="mb-3 text-balance text-2xl font-extrabold leading-[1.15] tracking-tight text-foreground sm:text-[2rem] md:mb-5 md:text-5xl">
            {conversion ? (
              <>
                מפגשים זוגיים{" "}
                <span className="text-terracotta-600">על הדברים החשובים באמת</span>
              </>
            ) : (
              "ערכת שיח זוגית"
            )}
          </h1>

          {conversion ? (
            <p className="mx-auto mb-4 text-pretty text-[0.95rem] font-medium leading-relaxed text-foreground md:mb-8 md:max-w-lg md:text-base">
              לחתונה יש אולם, צלם ומפיק. <strong className="font-bold text-foreground">לשיחות על החיים שאתם בונים, צריך רק את שניכם.</strong>{" "}
              מפגשים מובנים, שמבוססים על מחקר ועל ידע בפסיכולוגיה של זוגיות, ואתם עושים לבד, בקצב שלכם.
            </p>
          ) : (
            <p className="mx-auto mb-4 text-pretty text-[0.95rem] font-medium leading-relaxed text-foreground md:mb-8 md:max-w-lg md:text-base">
              <strong className="font-bold text-foreground">לזוגות לפני אירוסין או חתונה</strong>, שרוצים להכניס עומק להכנות,
              <br />
              <strong className="font-bold text-foreground">ולזוגות שחיים ביחד</strong> (לפני או אחרי חתונה) ורוצים להשקיע זמן במה שהכי חשוב.
            </p>
          )}

          <div className="relative mx-auto mb-4 max-w-[min(100%,480px)] overflow-hidden rounded-3xl bg-terracotta-50/50 shadow-[0_20px_50px_rgba(168,86,56,0.09)] ring-1 ring-terracotta-100/80 md:mb-8">
            <div className="absolute inset-0 z-10 bg-gradient-to-tr from-white/10 via-transparent to-terracotta-50/60" />
            <div className="absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-white via-white/40 to-transparent" />
            <img
              src="/illustrations/hero-writing.jpg"
              alt="זוג כותב יחד בחוברות של בשעה טובה בבית קפה, מבט מלמעלה"
              className="relative block h-[170px] w-full object-cover sm:h-[280px] md:h-[380px]"
              style={{ objectPosition: "center 50%" }}
            />
          </div>

          <div className="mx-auto flex w-full max-w-lg flex-col gap-3 border-t border-warm-gray-200/70 pt-4 text-center md:gap-5 md:border-t-0 md:pt-0">
            <div className="flex flex-col items-center gap-2 sm:flex-row-reverse sm:justify-center sm:gap-3">
              <Button size="lg" className="w-full max-w-[280px] text-base shadow-sm sm:w-auto sm:min-w-[190px]" asChild>
                <Link to={orderHref} onClick={() => trackCta("order", "hero")}>להזמנת הערכה</Link>
              </Button>
              <Button variant="outline" size="lg" className="w-full max-w-[280px] text-base sm:w-auto sm:min-w-[190px]" asChild>
                <Link to={giftHref} onClick={() => trackCta("gift", "hero")}>
                  {conversion ? "הזמנה כשובר מתנה לזוג" : "הזמנת שובר מתנה"}
                </Link>
              </Button>
            </div>
            {/* H4 (Lihi, 14.11.2026) */}
            <a
              href={partnerShareHref()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackCta("share_partner", "hero")}
              className="mx-auto -mt-1 text-sm font-medium text-terracotta-600 underline underline-offset-4 hover:text-terracotta-500"
            >
              לשלוח לבן או בת הזוג
            </a>

            {/* H3 (Lihi, 14.11.2026): "מבוססת מחקר" added; one line on the phone too, so the buttons fit higher (U6). */}
            <p className="text-[0.88rem] leading-snug text-terracotta-700 md:text-[0.9rem]" aria-label="יתרונות הערכה">
              <span className="block w-full text-center">
                עצמאית ומובנית<span className="mx-1.5 text-warm-gray-400 md:mx-2">·</span>
                מבוססת מחקר<span className="mx-1.5 text-warm-gray-400 md:mx-2">·</span>
                מותאמת אישית<span className="mx-1.5 text-warm-gray-400 md:mx-2">·</span>
                עד הבית
              </span>
            </p>
            {conversion && (
              <p className="text-[0.85rem] leading-snug text-muted-foreground">
                <strong className="font-semibold text-foreground">כבר נשואים?</strong> גם בשבילכם: ערב רק לשניכם, על הדברים החשובים באמת.
              </p>
            )}
            {note}
          </div>
        </div>
      </section>
    </>
  );
}
