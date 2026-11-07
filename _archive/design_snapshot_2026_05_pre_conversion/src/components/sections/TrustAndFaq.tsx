import { Link } from "react-router-dom";
import { FadeIn } from "@/components/motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const topQuestions = [
  {
    q: "זה מתאים לכל זוג?",
    a: "כן. חילוני, דתי, כל הרכב זוגי. הערכה מותאמת אישית - השמות שלכם על הכריכה, השפה מתאימה להרכב שלכם, ויש גם אפשרות לניסוח עדין למי שמעדיפים. אתם גם בוחרים את הנושאים שמעניינים אתכם מתוך בנק של 10.",
  },
  {
    q: "מה בעצם יש בכל מפגש?",
    a: "חימום יצירתי, חלק אישי (כל אחד כותב לבד), וחלק זוגי עם שיתוף, תרגילים ושיח פתוח. כל מפגש לוקח בין שעה לשעה וחצי. כולל רקע מחקרי קצר שנותן הקשר - בלי להרגיש הרצאה.",
  },
  {
    q: "בן/בת הזוג שלי לא מהסוג של לשבת ולדבר על רגשות",
    a: "בדיוק בשביל זה התרגילים מגוונים. יש סקאלות, כרטיסיות בחירה, טבלאות, משחקי ניחוש ואפילו ציורים. לא רק כתיבה חופשית. בנוסף, בכל מפגש יש חלק אישי שנותן זמן לעבד לבד - לפני שמשתפים.",
  },
  {
    q: "זה כמו טיפול זוגי?",
    a: "ממש לא. אין כאן מנחה ולא אדם שלישי. הערכה נותנת לכם מסגרת לשיח עומק - שאלות טובות, רקע מחקרי, ומבנה ברור. אתם שמים את התוכן.",
  },
  {
    q: "מתי כדאי להתחיל?",
    a: "אם אתם לפני חתונה - כדאי לפחות חודשיים לפני, תלוי בכמות המפגשים שבוחרים. אבל אפשר גם אחרי - הנושאים לא פחות רלוונטיים. מפגש אחד בשבוע, בקצב שנוח לכם.",
  },
];

export function TrustAndFaq() {
  return (
    <section className="relative bg-gradient-to-b from-terracotta-50/50 via-white to-warm-gray-50 px-5 py-12 md:py-16" style={{ overflowX: "clip" }}>
      <div className="pointer-events-none absolute left-0 top-8 h-64 w-64 translate-x-16 rounded-full bg-terracotta-100/20 blur-3xl" />

      <div className="relative mx-auto max-w-2xl">
        {/* Meet Lihi */}
        <FadeIn>
          <div className="mb-10 flex flex-col items-center gap-5 text-center sm:flex-row sm:gap-7 sm:text-right">
            <div className="relative shrink-0">
              <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-terracotta-200/50 to-pink-200/50 blur-sm" />
              <img
                src="/illustrations/about-ketubah-signing.webp"
                alt="ליהי ונתיב חותמים על כתובה אישית"
                loading="lazy"
                className="relative h-28 w-28 rounded-full border-2 border-white object-cover shadow-lg md:h-32 md:w-32"
              />
            </div>
            <div className="max-w-md">
              <h3 className="mb-2 text-xl font-bold text-foreground md:text-2xl">מי מאחורי הערכה?</h3>
              <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
                אני <span className="font-semibold text-foreground">ליהי</span>,{" "}דוקטורנטית לפסיכולוגיה קלינית באוניברסיטת בר-אילן.
                לפני שנה התחתנתי, ובתקופה שלפני קבענו לעצמנו דייט שבועי - בכל פעם נושא אחר. השיחות צבעו את החודשים של לפני החתונה, ואת האירוע עצמו, בצבע אחר.
              </p>
              <p className="mt-2.5 text-[0.95rem] leading-relaxed text-muted-foreground">
                זה היה כל כך משמעותי עבורנו, שחיפשתי כלי שמתרגם את המחקר למשהו שזוגות יוכלו לעשות לבד - מובנה, חם, ובגובה העיניים. לא מצאתי.{" "}
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

        {/* FAQ */}
        <FadeIn delay={0.1}>
          <h2 className="mb-5 text-center text-xl font-bold text-foreground md:text-2xl">
            שאלות נפוצות
          </h2>
          <div className="rounded-2xl border border-warm-gray-200/60 bg-white/80 px-4 py-2 shadow-sm backdrop-blur-sm md:px-6">
            <Accordion type="single" collapsible defaultValue="q-0" className="w-full">
              {topQuestions.map((faq, i) => (
                <AccordionItem key={i} value={`q-${i}`}>
                  <AccordionTrigger className="text-right text-[1rem] font-medium">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-[0.9rem] leading-relaxed text-muted-foreground">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          <div className="mt-5 text-center">
            <Link
              to="/faq"
              className="inline-block rounded-full bg-warm-gray-100 px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-warm-gray-200 hover:text-foreground"
            >
              לכל השאלות הנפוצות ←
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
