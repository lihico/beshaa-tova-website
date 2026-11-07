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
    q: "בן/בת הזוג שלי לא מהסוג של לשבת ולדבר על רגשות",
    a: "בדיוק בשביל זה התרגילים מגוונים. יש סקאלות, כרטיסיות בחירה, טבלאות, משחקי ניחוש ואפילו ציורים. לא רק כתיבה חופשית. בנוסף, בכל מפגש יש חלק אישי שנותן זמן לעבד לבד - לפני שמשתפים.",
  },
  {
    q: "זה כמו טיפול זוגי?",
    a: "ממש לא. אין כאן מנחה ולא אדם שלישי. הערכה נותנת לכם מסגרת לשיח עומק - שאלות טובות, רקע מחקרי, ומבנה ברור. אתם שמים את התוכן.",
  },
  {
    q: "מה בעצם יש בכל מפגש?",
    a: "חימום יצירתי, חלק אישי (כל אחד כותב לבד), וחלק זוגי עם שיתוף, תרגילים ושיח פתוח. כל מפגש לוקח בין שעה לשעה וחצי. כולל רקע מחקרי קצר שנותן הקשר - בלי להרגיש הרצאה.",
  },
  {
    q: "מתי כדאי להתחיל?",
    a: "אין תאריך אחד נכון לכולם - כל זמן שמתאים לכם הוא זמן טוב להתחיל. לפני חתונה, אחריה או בלי קשר לאירוע. מה שחשוב הוא למצוא קצב קבוע שנוח לכם (למשל דייט אחד בשבוע). אם הלוח צפוף אפשר לבחור פחות מפגשים או לזרז את הקצב - ותמיד אפשר לכתוב ולבחור יחד.",
  },
];

export function FaqPreview() {
  return (
    <section className="relative bg-gradient-to-b from-warm-gray-50 to-white px-5 py-12 md:py-16" style={{ overflowX: "clip" }}>
      <div className="pointer-events-none absolute left-0 top-1/2 h-56 w-56 -translate-y-1/2 translate-x-24 rounded-full bg-terracotta-100/20 blur-3xl" />

      <div className="relative mx-auto max-w-2xl">
        <FadeIn>
          <h2 className="mb-6 text-center text-xl font-bold text-foreground md:text-2xl">
            שאלות נפוצות
          </h2>
          <div className="rounded-2xl border border-warm-gray-200/60 bg-white/80 px-4 py-2 shadow-sm backdrop-blur-sm md:px-6">
            <Accordion type="single" collapsible defaultValue="q-0" className="w-full">
              {topQuestions.map((faq, i) => (
                <AccordionItem key={i} value={`q-${i}`}>
                  <AccordionTrigger className="text-right text-[0.95rem] font-medium">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-[0.85rem] leading-relaxed text-muted-foreground">
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
