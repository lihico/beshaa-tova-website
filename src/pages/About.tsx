import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";

const ease = [0.25, 0.1, 0.25, 1] as const;

export default function About() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className="px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-2xl">
        {/* Header + hero illustration */}
        <FadeIn className="mb-14 text-center">
          <img
            src="/illustrations/about-wedding-garden-path.jpg"
            alt="חתן וכלה הולכים יד ביד בשביל בין צמחייה ירוקה, מצולמים מלמעלה ומאחור"
            width={1200}
            height={799}
            className="mx-auto mb-10 aspect-[3/2] h-auto w-full rounded-2xl object-cover shadow-sm"
          />
          <h1 className="mb-2 text-3xl font-bold text-foreground md:text-4xl">
            הסיפור של &quot;בשעה טובה&quot;
          </h1>
          <p className="text-lg text-muted-foreground">
            איך הדייטים שלנו הפכו לערכת שיח לזוגות
          </p>
        </FadeIn>

        {/* --- איך זה התחיל --- */}
        <FadeIn className="mb-14 space-y-5 leading-relaxed text-muted-foreground">
          <p className="border-r-2 border-terracotta-300 pr-4 text-lg font-medium text-foreground">
            לפני שנה התחתנו.
          </p>
          <div className="grid gap-6 md:grid-cols-[1fr_13rem] md:items-start">
          <div className="space-y-5">
          <p className="text-[0.95rem]">
            אנחנו ביחד כבר למעלה מעשור. בתוך כל הטירוף הלוגיסטי של החתונה הרגשנו
            שאנחנו רוצים לצקת לתקופה הזאת קצת יותר משמעות - לא רק לתכנן אירוע,
            אלא באמת לעצור ולדבר על החיים המשותפים שלנו.
          </p>
          <p className="text-[0.95rem]">
            אז קבענו לעצמנו דייט שבועי - בכל פעם נושא אחר. כסף, חלומות, חיכוכים,
            הבית שלנו. ולמרות שיש לנו תקשורת טובה - משהו בשיח הזה היה אחר.
            לקראת החתונה הפכנו את התובנות לכתובה אישית, שתלויה אצלנו בבית עד היום.
          </p>
          </div>
          <img
            src="/illustrations/about-wedding-window.jpg"
            alt="כלה יושבת עם הגב למצלמה מול חלון, השיער אסוף בצמה עדינה, בבוקר החתונה"
            width={824}
            height={1100}
            loading="lazy"
            className="mx-auto aspect-[3/4] h-auto w-full max-w-[13rem] rounded-2xl object-cover shadow-sm md:mt-1"
          />
          </div>

          <p className="font-medium text-foreground">
            השיחות האלה נשארו איתנו גם הרבה אחרי:
          </p>
          <ul className="space-y-2 pr-4">
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-terracotta-400" />
              <span>
                <strong className="text-foreground">הצעת עבודה</strong> - היה
                לנו בסיס לדבר על סדרי עדיפויות.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-terracotta-400" />
              <span>
                <strong className="text-foreground">חיכוך</strong> - הצלחנו
                לדבר על מה שמתחת לפני השטח במקום להיסגר.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-terracotta-400" />
              <span>
                <strong className="text-foreground">ארוחת שישי</strong> - הבנו
                למה ביקור מסוים מרגיש מורכב לצד השני.
              </span>
            </li>
          </ul>
        </FadeIn>

        {/* --- מהדייטים שלנו – אליכם --- */}
        <FadeIn>
          <div className="mx-auto mb-5 h-1 w-14 rounded-full bg-terracotta-200" />
        </FadeIn>
        <FadeIn>
          <h2 className="mb-6 text-xl font-bold text-foreground md:text-2xl">
            מהדייטים שלנו - אליכם
          </h2>
        </FadeIn>

        <FadeIn className="mb-14 space-y-5 leading-relaxed text-muted-foreground">
          <div className="grid gap-6 md:grid-cols-[1fr_15rem] md:items-center">
          <p className="text-[0.95rem]">
            יום אחד עברתי ליד הכתובה בסלון וחשבתי על חברים שטובעים בים של ספקים
            והחלטות. אמרתי לעצמי: מה שעשינו היה כל כך משמעותי - אני חייבת לאפשר
            את זה לזוגות אחרים.
          </p>
          <img
            src="/illustrations/about-wedding-ketubah.jpg"
            alt="יד חותמת בעט על כתובה אישית, על שולחן עם כוסות ונרות"
            width={1100}
            height={962}
            loading="lazy"
            className="mx-auto h-auto w-full max-w-[15rem] rounded-2xl object-cover shadow-sm"
          />
          </div>

          <div className="rounded-xl bg-terracotta-50/50 px-5 py-4">
            <p className="mb-3 text-[0.9rem] font-medium text-foreground">מה שקראתי במחקרים חיזק בדיוק את מה שחווינו:</p>
            <ul className="space-y-2.5">
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-terracotta-400" />
                <span>
                  זוגות שמקדישים זמן קבוע לשיח - מתמודדים טוב יותר עם קונפליקטים.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-terracotta-400" />
                <span>
                  מה שבונה חיבור עמוק הוא החוויה שמישהו באמת שומע אותך.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-terracotta-400" />
                <span>
                  כתיבה לפני שיתוף - עוזרת לנסח דברים שקשה להגיד.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-terracotta-400" />
                <span>
                  שאלות ספציפיות מייצרות שיח עמוק יותר מ&quot;מה היה היום?&quot;
                </span>
              </li>
            </ul>
          </div>

          <p className="text-[0.95rem]">
            חיפשתי כלי שיאפשר לתרגם את הידע הזה למשהו שזוגות יוכלו לעשות בעצמם -
            מובנה, פשוט, ובלי צורך באדם חיצוני. לא מצאתי. אז בניתי את זה בעצמי.
          </p>
        </FadeIn>

        {/* --- אתם המומחים לזוגיות שלכם --- */}
        <FadeIn>
          <div className="mx-auto mb-5 h-1 w-14 rounded-full bg-terracotta-200" />
        </FadeIn>
        <FadeIn>
          <h2 className="mb-6 text-xl font-bold text-foreground md:text-2xl">
            אתם המומחים לזוגיות שלכם
          </h2>
        </FadeIn>

        <FadeIn className="mb-14 space-y-5 leading-relaxed text-muted-foreground">
          <p className="text-center text-[0.9rem] font-medium leading-relaxed text-foreground">
            אתם בוחרים את הנושאים · אתם קובעים את הקצב · השיח הוא אישי ושלכם
          </p>
          <p className="rounded-lg bg-warm-gray-50 px-5 py-4 text-center font-medium text-foreground">
            כל מה שצריך זה לפנות זמן, קשב ותשומת לב לעצמכם ולאדם היקר שהוא השותף לחייכם.
          </p>
        </FadeIn>

        <FadeIn className="mb-6">
          <div className="mx-auto h-1 w-14 rounded-full bg-terracotta-200" />
        </FadeIn>

        {/* CTA button */}
        <FadeIn className="mb-10 text-center">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link to="/order">להזמנת הערכה</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/order?flow=gift">🎁 לשלוח כמתנה</Link>
            </Button>
          </div>
        </FadeIn>

        {/* Contact card */}
        <FadeIn as="section" className="rounded-2xl border border-border/60 bg-warm-gray-50 p-8 text-center">
          <h2 className="mb-3 text-xl font-semibold text-foreground">
            בואו נדבר
          </h2>
          <p className="mb-4 text-muted-foreground">
            <strong className="text-foreground">ליהי.</strong> דוקטורנטית
            לפסיכולוגיה ובוגרת תואר שני בפסיכולוגיה שיקומית. אוהבת שיחות מהלב.
          </p>
          <p className="mb-6 text-muted-foreground">
            מזמינה אתכם להתייעץ ולהיות בקשר.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:beshaatova.il@gmail.com"
              className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-terracotta-600"
            >
              beshaatova.il@gmail.com
            </a>
            <a
              href="https://wa.me/972502023669"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-terracotta-600"
            >
              וואטסאפ
            </a>
          </div>
        </FadeIn>
      </div>
    </motion.div>
  );
}
