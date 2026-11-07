import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { PRICES } from "@/lib/prices";

const faqCategories = [
  {
    title: "על הערכה",
    questions: [
      {
        q: 'מה זה "בשעה טובה"?',
        a: 'ערכה פיזית של דייטים מובנים לזוגות. בכל מפגש - נושא אחר (כסף, אינטימיות, משפחות, חלומות, קונפליקטים). אתם בוחרים מה רלוונטי, קובעים ערב, ומקבלים מסגרת מובנית לשיחות עומק.',
      },
      {
        q: "למי זה מתאים?",
        a: "לכל זוג שלפני חתונה או מעבר לחיים משותפים: חילונים, מסורתיים או דתיים; סטרייטים או זוגות מהקהילה הגאה; בין אם אתם ביחד שנה או יותר מעשור. לכל זוג שרוצה לעצור רגע ולהעמיק את השיח והקשר. בטופס ההזמנה אפשר לסמן אם תרצו התאמת תכנים נוספת (למשל לזוגות מעורבים).",
      },
      {
        q: "למי זה לא מתאים?",
        a: "הערכה היא לא סיוע זוגי טיפולי. היא מיועדת לזוגות שרוצים להעמיק את השיח ביניהם, לא לזוגות שנמצאים במצוקה שדורשת ליווי מקצועי.",
      },
      {
        q: "החתונה כבר ממש בקרוב / כבר הייתה - זה עדיין מתאים?",
        a: "בהחלט. הערכה מתאימה לכל שלב לפני או אחרי החתונה. אם תאריך החתונה קרוב, אפשר להתחיל בקצב אינטנסיבי יותר או לסיים את המפגשים אחרי החתונה, לבחירתכם. ואם כבר התחתנתם? הנושאים של השיחות לא פחות רלוונטיים אחרי החתונה, כמובן. אם אתם לא בטוחים - כתבו לי ונחשוב יחד מה מתאים לכם.",
      },
      {
        q: "זה כמו טיפול זוגי?",
        a: "ממש לא. הערכה היא לא טיפול ולא מחליפה טיפול. כאן יש לכם הזדמנות לגעת בנושאים חשובים לא מתוך משבר - אלא מתוך הסתכלות משותפת על החיים שלכם כזוג. זה לגמרי שלכם, בקצב שלכם וללא הנחיה. אבל מספיק מובנה ומבוסס מחקר בשביל ליצור שיחה טובה.",
      },
    ],
  },
  {
    title: "איך זה עובד",
    questions: [
      {
        q: "כמה מפגשים יש?",
        a: "אפשר לבחור מתוך עשרה נושאים, ובנוסף יש מפגש סיכום (שכלול תמיד).",
      },
      {
        q: "איך בוחרים את המפגשים הנכונים בשבילנו?",
        a: "המפגשים מכסים נושאים רחבים - חלומות, כסף, אינטימיות, שגרה, משפחות מקור - שמתאימים לכל זוג. מי שמכתיב את התוכן עצמו זה אתם, אתם מקבלים רק את המבנה. מומלץ להחליט ביחד, ואפשר כמובן להתייעץ איתי.",
      },
      {
        q: "איך נראה מפגש?",
        a: "כל מפגש בנוי משני חלקים: חלק אישי שכל אחד ממלא לבד, וחלק זוגי שעוברים ביחד. מתחילים בחימום קל, ממשיכים לעומק, ומסיימים ביחד עם סיכום.",
      },
      {
        q: "מה בעצם נדרש מאיתנו?",
        a: "לפנות שעה וחצי לכל מפגש, בלי טלפונים ובלי הסחות דעת. עדיף במקום כיפי מחוץ לבית - בית קפה, פארק, או סתם ערב עם נר ויין. בכל מפגש פותחים את החוברות במפגש הנוכחי - ומשם הכל כבר מובנה וברור.",
      },
      {
        q: "כמה זמן כל מפגש?",
        a: "שעה עד שעה וחצי, תלוי בכם.",
      },
      {
        q: "כמה זמן כל התהליך לוקח?",
        a: "תלוי בכמה מפגשים בחרתם ובקצב שלכם. רוב הזוגות מתקדמים בערך במפגש אחד בשבוע, אבל אין חובה - אפשר לאט יותר או מהר יותר לפי זמן פנוי. לפני חתונה או אחריה, מה שמתאים לכם.",
      },
      {
        q: 'מה זו "כתובה אישית"?',
        a: "מפגש סיכום שזוגות לקראת חתונה יכולים לכתוב יחד בסוף התהליך, בשפה שלכם. יש זוגות שמשתמשים בהסכם הזה לצד או במקום הכתובה המסורתית בחתונה. זה לא חובה, ואפשר גם פשוט לסכם ביחד את התהליך.",
      },
    ],
  },
  {
    title: "רגע, אבל...",
    questions: [
      {
        q: "אנחנו ביחד כבר הרבה שנים. זה עדיין רלוונטי לנו?",
        a: "דווקא כן. זוגות שביחד הרבה זמן מכירים אחד את השני טוב - דווקא הזדמנות להסתכל על מה השתנה.",
      },
      {
        q: "ואם אנחנו זוג חדש יחסית?",
        a: 'גם. אין "זמן מינימלי" לדבר על הדברים החשובים. המפגשים לא מניחים שאתם מכירים אחד את השני בעל פה - הם עוזרים לכם להכיר ברמה אחרת, עמוקה יותר.',
      },
      {
        q: "בן/בת הזוג שלי פחות מהסוג של להביע את עצמו/ה במילים. הם יתחברו לזה?",
        a: "תכני המפגשים עוצבו עם הרבה מחשבה ומגוון של משימות שמותאמות לסוגים שונים של אנשים. יש סקאלות, כרטיסיות בחירה, טבלאות, ואפילו ציורים - לא רק כתיבה חופשית. בנוסף, החלק האישי נותן זמן לעבד לפני שמשתפים.",
      },
    ],
  },
  {
    title: "הזמנה ומשלוח",
    questions: [
      {
        q: "כמה עולה?",
        // Amounts from the price table; the express sentence only with the new table. DRAFT he copy (express): awaiting Lihi
        a: `${PRICES.base} \u20AA לערכה מותאמת אישית, כולל חוברת זוגית, שתי חוברות אישיות ומשלוח עד הבית. או ${PRICES.all} \u20AA לערכה המלאה עם כל המפגשים.${PRICES.express ? ` אפשר להוסיף משלוח מהיר ב-${PRICES.express} \u20AA.` : ""}`,
      },
      {
        q: "איך מזמינים?",
        a: "ממלאים שאלון התאמה קצר באתר, בוחרים נושאים, משלמים - ומקבלים ערכה מותאמת אישית עד הבית.",
      },
      {
        q: "כמה זמן עד שהערכה מגיעה?",
        a: `עד 14 ימי עסקים מקבלת ההזמנה.${PRICES.express ? ` עם משלוח מהיר (בתוספת ${PRICES.express} \u20AA) עד 7 ימי עסקים.` : " אם יש דחיפות, כתבו בהערות בטופס ההזמנה."}`, // DRAFT he copy: awaiting Lihi
      },
      {
        q: "אפשר לשלוח כמתנה?",
        a: (
          <>
            בהחלט! אתם רוכשים שובר מתנה דיגיטלי עם קוד אישי, ושולחים אותו לזוג. הזוג נכנס לאתר, ממלא שאלון התאמה קצר - בוחר שמות, נושאים ופרטי משלוח - ומקבל ערכה מותאמת אישית עד הבית.{" "}
            <Link to="/give-a-gift" className="font-medium text-terracotta-600 underline underline-offset-2">איך זה עובד ואיך נראה השובר</Link>.
          </>
        ),
      },
      {
        q: "שמענו שאפשר לקבל את הערכה שלנו בבית קפה",
        a: (
          <>
            נכון! הערכה יכולה לחכות לכם באחד{" "}
            <Link to="/cafes" className="font-medium text-terracotta-600 underline underline-offset-2">מבתי הקפה השותפים</Link>.
            זוג כוסות הקפה לדייט הראשון עלינו!
          </>
        ),
      },
    ],
  },
];

const ease = [0.25, 0.1, 0.25, 1] as const;

export default function Faq() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className="px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-3xl">
        <FadeIn>
          <h1 className="mb-4 text-center text-3xl font-bold text-foreground md:text-4xl">
            שאלות נפוצות
          </h1>
          <div className="mx-auto mb-14 h-1 w-16 rounded-full bg-terracotta-200" />
        </FadeIn>

        <Stagger className="space-y-12">
          {faqCategories.map((category) => (
            <StaggerItem key={category.title}>
              <section>
                <h2 className="mb-4 text-xl font-semibold text-foreground">
                  {category.title}
                </h2>
                <Accordion type="single" collapsible defaultValue={category.title === "על הערכה" ? `${category.title}-0` : undefined} className="w-full">
                  {category.questions.map((faq, i) => (
                    <AccordionItem key={i} value={`${category.title}-${i}`}>
                      <AccordionTrigger className="text-right text-[1rem] font-medium">
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-[0.9rem] leading-relaxed text-muted-foreground">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            </StaggerItem>
          ))}
        </Stagger>

        {/* CTA */}
        <FadeIn className="mt-14 text-center">
          <p className="mb-4 text-lg font-medium text-foreground">מוכנים להתחיל?</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link to="/order">להזמנת הערכה</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/give-a-gift">לשלוח כמתנה</Link>
            </Button>
          </div>
        </FadeIn>

        <FadeIn className="mt-10 rounded-xl border border-border/60 bg-warm-gray-50 p-8 text-center">
          <p className="mb-5 text-[0.9rem] font-medium text-foreground">
            רוצים להתייעץ?
          </p>
          <a
            href="https://wa.me/972502023669"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1fb855]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            שלחו הודעה בוואטסאפ
          </a>
          <p className="mt-3">
            <a
              href="mailto:beshaatova.il@gmail.com"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-terracotta-600"
            >
              או במייל: beshaatova.il@gmail.com
            </a>
          </p>
        </FadeIn>
      </div>
    </motion.div>
  );
}
