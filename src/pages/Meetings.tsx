import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FadeIn } from "@/components/motion";

const meetings = [
  { title: "שפות האהבה", description: "עוצרים להבין למה לפעמים אנחנו משקיעים המון אהבה שהצד השני פשוט לא מרגיש. בודקים מה למדנו על אהבה בבית, ולומדים להראות אותה בשפה שהשני באמת מבין." },
  { title: "איך אנחנו רבים (ואיך חוזרים)", description: "מסתכלים בכנות על ה\"לופ\" הקבוע שלנו כשאנחנו כועסים, נסגרים או נפגעים. כותבים אחד לשני \"מדריך למשתמש\" - מה באמת עוזר ומה רק מחמיר כשאנחנו באמצע חיכוך, כדי לדעת איך לחזור לקרבה." },
  { title: "האינטימיות שלנו", description: "מניחים את המבוכה בצד ומדברים על אינטימיות במובן הרחב - מקרבה פיזית ועד לבדיחה פרטית או מבט. משתפים ב\"מנועים והבלמים\" שלנו, ולומדים לדבר בטבעיות על הפערים בצרכים ובקצב שלנו." },
  { title: "לדבר על כסף", description: "מבינים שמאחורי כל הוצאה מסתתרים צרכים אמיתיים כמו חופש או ביטחון. משתפים ביחס לכסף שהבאנו מהבית, ומדברים בלי לשפוט על סדרי העדיפויות שמתאימים לנו יחד." },
  { title: "עבודה וקריירה", description: "מכירים בכך שהעבודה מעצבת את הקשר ומשפיעה על מה שנכנס איתנו הביתה בסוף היום. בודקים איפה השאיפות המקצועיות שלנו נפגשות או מתנגשות, ואיך נאזן ביניהן." },
  { title: "המשפחות שלנו", description: "מדברים בפתיחות על ההבדלים והציפיות בין המשפחות שבהן גדלנו. בונים יחד גישה משותפת לחגים, למעורבות ולגבולות לפני שמצטברים מתחים, ומבינים איך כל אחד מאיתנו שומר על הזוגיות מול משפחת המקור שלו." },
  { title: "הבית שאנחנו בונים", description: "בודקים מה הערך שעומד מאחורי ה\"ככה ברור שצריך\" שהבאנו איתנו מהבית. בוחרים אילו מנהגים והרגלים קטנים אנחנו רוצים ליצור בעצמנו כדי שהיומיום ירגיש באמת שלנו." },
  { title: "עתיד וחלומות", description: "מורידים את הציניות, משתיקים את ה\"איך\", ונותנים מקום לחלומות - גם הגדולים וגם השקטים - שהשגרה דוחקת הצידה. משתפים בהרפתקאות שנרצה לחוות ובונים ציר זמן משותף קדימה." },
  { title: "ילדים והורות", description: "מנקים את רעשי הרקע של הסביבה, ומדברים על מה שאנחנו באמת מרגישים לגבי משפחה כשכל בחירה היא לגיטימית. משתפים איזה הורים נרצה להיות ואיך נשמור על הזוגיות בתוך השינוי." },
  { title: "כשקשה", description: "מדברים על מה שעוצר אותנו מלבקש עזרה, ומגלים דרך \"הסיפור שלך מהצד שלי\" איך הצד השני חווה את הרגעים הקשים שלנו. כותבים \"מדריך למשתמש\" שמסביר למה כל אחד מאיתנו באמת זקוק כשקשה." },
  { title: "מפגש סיכום (הכתובה שלנו)", description: "מסתכלים אחורה על התהליך שעברנו ומתרגמים את התובנות להבטחות קטנות ומעשים קונקרטיים ליומיום. מגלים שגם בלי מסמך פורמלי, אנחנו יוצאים מכאן עם שפה משותפת שלא הייתה לנו קודם.", alwaysIncluded: true },
];

const ease = [0.25, 0.1, 0.25, 1] as const;

export default function Meetings() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className="px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-3xl">
        <FadeIn className="mb-12 text-center">
          <h1 className="mb-4 text-2xl font-bold text-foreground md:text-4xl">
            אתם בוחרים את המפגשים לערכה שלכם
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            כל מפגש מוקדש לנושא אחר. בחרו 5-8 נושאים שמדברים אליכם
            <br />
            (כולל מפגש סיכום/כתובה שכלול תמיד).
          </p>
          <img
            src="/illustrations/meetings-writing-1.jpg"
            alt="יד כותבת בחוברת של בשעה טובה בבית קפה"
            className="mx-auto mt-8 h-56 w-full max-w-md rounded-2xl object-cover shadow-md md:h-64"
          />
        </FadeIn>

        <FadeIn>
          <Accordion type="multiple" className="space-y-3">
            {meetings.map((meeting, index) => {
              const isKetubah = "alwaysIncluded" in meeting && meeting.alwaysIncluded;
              const number = index + 1;
              return (
                <AccordionItem
                  key={meeting.title}
                  value={`meeting-${index}`}
                  className={`rounded-2xl border px-5 transition-colors last:border-b md:px-6 ${
                    isKetubah
                      ? "border-terracotta-300 bg-terracotta-50/70"
                      : "border-[#F0D9C8] bg-[#FDF8F5]"
                  } hover:shadow-sm`}
                >
                  <AccordionTrigger className="gap-3 py-4 text-right hover:no-underline sm:py-5 [&>svg]:mt-1 [&>svg]:size-5 [&>svg]:text-terracotta-400">
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-terracotta-100 text-sm font-bold text-terracotta-700 sm:text-base">
                        {number}
                      </span>
                      <span className="text-base font-semibold text-foreground sm:text-lg">
                        {meeting.title}
                      </span>
                      {isKetubah && (
                        <span className="rounded-full bg-terracotta-200 px-2.5 py-0.5 text-xs font-medium text-terracotta-700">
                          תמיד כלול
                        </span>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5">
                    <p className="pr-12 text-[0.9rem] leading-relaxed text-muted-foreground sm:text-base">
                      {meeting.description}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </FadeIn>

        <FadeIn className="mt-10">
          <div className="mx-auto h-1 w-14 rounded-full bg-terracotta-200" />
        </FadeIn>

        <FadeIn className="mt-10 text-center">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" className="min-w-[200px] text-base" asChild>
              <Link to="/order">להזמנת הערכה</Link>
            </Button>
            <Button variant="outline" size="lg" className="text-base" asChild>
              <Link to="/order?flow=gift">🎁 הזמנת שובר מתנה</Link>
            </Button>
          </div>
        </FadeIn>
      </div>
    </motion.div>
  );
}
