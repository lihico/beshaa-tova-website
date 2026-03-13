import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function About() {
  return (
    <div className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-3xl">
        {/* Hero */}
        <div className="mb-20 text-center">
          <img
            src="/illustrations/ketubah-story.png"
            alt=""
            className="mx-auto mb-6 h-28 w-28 object-contain md:h-36 md:w-36"
          />
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-5xl">
            הסיפור של &quot;בשעה טובה&quot;
          </h1>
          <p className="text-lg text-muted-foreground">
            איך הדייטים שלנו הפכו לערכת שיח לזוגות
          </p>
        </div>

        {/* --- Section 1: איך זה התחיל --- */}
        <section className="mb-16">
          <div className="mb-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-terracotta-200/60" />
            <h2 className="whitespace-nowrap text-xl font-bold text-terracotta-600 md:text-2xl">
              איך זה התחיל
            </h2>
            <div className="h-px flex-1 bg-terracotta-200/60" />
          </div>

          <div className="mb-8 rounded-2xl border border-terracotta-200/40 bg-terracotta-50/40 px-8 py-6 text-center">
            <p className="text-2xl font-bold leading-relaxed text-terracotta-600 md:text-3xl">
              &ldquo;לפני שנה התחתנתי.&rdquo;
            </p>
          </div>

          <div className="space-y-4 leading-relaxed text-muted-foreground">
            <p>
              בתוך כל הטירוף הלוגיסטי - האולם, הצלם, הרבנות, ומי יושב ליד מי -
              הרגשנו שאנחנו רוצים לצקת לתקופה הזאת קצת יותר משמעות. לא רק לתכנן
              את האירוע, אלא באמת לעצור ולדבר על החיים עצמם שמתחילים עכשיו.
            </p>
            <p>
              כי כל אחד מאיתנו הגיע מבית שבו דברים מסוימים היו &quot;ברור
              שככה&quot; - ארוחת שישי, רמת הסדר, האיזון בין זמן יחד לזמן לבד,
              וכמה חשוב לצאת לטבע. ואחרי עשור ביחד כבר היה לנו בית משותף, אבל לא
              תמיד עצרנו לבדוק אם ההרגלים ש&quot;התקבעו&quot; לנו באמת עובדים
              לשנינו.
            </p>
          </div>

          {/* Illustration + highlight */}
          <div className="my-10 flex flex-col items-center gap-6 md:flex-row">
            <img
              src="/illustrations/about-dates.png"
              alt=""
              className="h-40 w-40 flex-shrink-0 object-contain"
            />
            <div className="rounded-xl border-r-4 border-terracotta-300 bg-warm-gray-50 px-6 py-5">
              <p className="font-medium leading-relaxed text-foreground">
                אז קבענו לעצמנו דייט קבוע - פעם בשבוע, נושא אחר בכל פעם.
                לפעמים התלבשנו יפה ויצאנו, לפעמים פשוט הלכנו לפארק. דיברנו על
                כסף, על חלומות, על פחדים, ועל איך הבית שלנו ייראה.
              </p>
            </div>
          </div>

          <div className="space-y-4 leading-relaxed text-muted-foreground">
            <p>
              ולמרות שיש לנו תקשורת טובה שאנחנו גאים בה - משהו בשיח הזה היה
              אחר. היציאה מהשגרה, ההתמקדות בנושא אחד בכל פעם, והקשב המלא -
              אפשרו לנו להעמיק למקומות שביומיום פשוט אין זמן להגיע אליהם.
            </p>
          </div>

          {/* What changed - visual list */}
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              "כשעלתה על הפרק הצעת עבודה - פתאום היה לנו בסיס משותף לדבר על סדרי העדיפויות שלנו",
              "כשהיה חיכוך - במקום להסתגר, הצלחנו לדבר על מה שבאמת קורה מתחת לפני השטח",
              "כשנסענו להורים - הבנו הרבה יותר טוב למה הביקור מורכב לצד השני",
              "כשאחד מאיתנו שיתף משהו פגיע - השני ידע בדיוק מאיפה זה מגיע",
            ].map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/60 bg-background px-5 py-4"
              >
                <p className="text-sm leading-relaxed text-foreground">{item}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-4 leading-relaxed text-muted-foreground">
            <p>
              התהליך הזה היה כל כך משמעותי עבורנו, שהפכנו את התובנות שלנו למסמך
              &quot;כתובה אישית&quot;. כתבנו אותה ביחד, חתמנו עליה בחתונה
              בנוכחות הקרובים אלינו, ותלינו אותה בבית -{" "}
              <strong className="text-foreground">
                תזכורת יומיומית למה שחשוב באמת.
              </strong>
            </p>
          </div>
        </section>

        {/* --- Section 2: מהדייטים שלנו - אליכם --- */}
        <section className="mb-16">
          <div className="mb-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-terracotta-200/60" />
            <h2 className="whitespace-nowrap text-xl font-bold text-terracotta-600 md:text-2xl">
              מהדייטים שלנו - אליכם
            </h2>
            <div className="h-px flex-1 bg-terracotta-200/60" />
          </div>

          <div className="space-y-4 leading-relaxed text-muted-foreground">
            <p>הרעיון להקים את &quot;בשעה טובה&quot; התבשל לאט.</p>
            <p>
              ביומיום שלי, אני בוגרת תואר שני בפסיכולוגיה שיקומית ודוקטורנטית
              לפסיכולוגיה (באוניברסיטת בר-אילן), ופתאום קלטתי שמה שאני קוראת עליו
              במחקרים - חופף בדיוק למה שחווינו בעצמנו:
            </p>
          </div>

          {/* Research highlights */}
          <div className="my-8 flex flex-col items-center gap-6 md:flex-row-reverse">
            <img
              src="/illustrations/about-research.png"
              alt=""
              className="h-36 w-36 flex-shrink-0 object-contain"
            />
            <div className="flex-1 space-y-3">
              {[
                "האנשים המאושרים ביותר מנהלים פי שניים שיחות עמוקות",
                'כשנותנים שם לרגש ("אני כועס", "אני מפחדת") - מערכת העצבים ממש נרגעת',
                "מה שבונה חיבור הוא לא עצם השיתוף - אלא ההרגשה שמישהו באמת שומע אותך",
              ].map((text, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg bg-terracotta-50/60 px-4 py-3"
                >
                  <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-terracotta-400" />
                  <p className="text-sm font-medium leading-relaxed text-foreground">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 leading-relaxed text-muted-foreground">
            <p>
              ומה שהכי מרגש:{" "}
              <strong className="text-foreground">
                למחקר יש כלים פרקטיים שמראים איך לייצר שיחות כאלה.
              </strong>{" "}
              לא סתם המלצה כללית של &quot;תדברו יותר&quot;, אלא ידע ספציפי על מה
              פותח חסמים ומה באמת עוזר.
            </p>
            <p>
              ואז הסתכלתי סביב. קבוצות החתונות בפייסבוק מלאות בספקים (וזה
              חשוב!), אבל לפעמים העיסוק בכל מה שמסביב לא משאיר מקום לעיסוק בלב
              העניין - הזוגיות. חיפשתי כלי שיעזור לזוגות לעשות את מה שאנחנו
              עשינו: מובנה, מבוסס מחקר, בעברית, ובלי צורך באדם חיצוני. לא מצאתי.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-terracotta-200/40 bg-terracotta-50/40 px-8 py-5 text-center">
            <p className="text-xl font-bold text-terracotta-600">
              אז בניתי את זה בעצמי.
            </p>
          </div>
        </section>

        {/* --- Section 3: אתם המומחים לזוגיות שלכם --- */}
        <section className="mb-16">
          <div className="mb-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-terracotta-200/60" />
            <h2 className="whitespace-nowrap text-xl font-bold text-terracotta-600 md:text-2xl">
              אתם המומחים לזוגיות שלכם
            </h2>
            <div className="h-px flex-1 bg-terracotta-200/60" />
          </div>

          <div className="flex flex-col items-center gap-8 md:flex-row">
            <img
              src="/illustrations/about-values.png"
              alt=""
              className="h-36 w-36 flex-shrink-0 object-contain"
            />
            <div className="flex-1">
              <p className="mb-4 text-lg font-semibold leading-relaxed text-foreground">
                העיקרון שהכי חשוב לי ב&quot;בשעה טובה&quot; הוא שהכוח נשאר
                אצלכם.
              </p>
              <div className="space-y-4 leading-relaxed text-muted-foreground">
                <p>
                  יש הרבה ספקים בחתונה, אבל &quot;בשעה טובה&quot; היא לא עוד וי
                  ברשימה. אין פה אדם שלישי בחדר. אין מנחה, אין מטפל, ואין מישהו
                  חיצוני שיגיד לכם מה נכון ומה לא.
                </p>
                <p>
                  כל מה שהערכה עושה הוא לפנות לכם זמן, לייצר אווירה בטוחה,
                  ולתת מסגרת מובנית כדי שהשיח יזרום - אבל עם המון חופש:
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-terracotta-200/40 bg-terracotta-200/40 sm:grid-cols-3">
            {[
              "אתם מכתיבים במה מתעסקים",
              "אתם מחליטים על הקצב",
              "התשובות הן אך ורק שלכם",
            ].map((text, i) => (
              <div key={i} className="bg-terracotta-50/60 px-5 py-4 text-center">
                <p className="text-sm font-semibold text-terracotta-600">
                  {text}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center leading-relaxed text-muted-foreground">
            אתם לא צריכים אף אחד כדי לנהל את השיחות החשובות של החיים שלכם -{" "}
            <strong className="text-foreground">
              אתם רק צריכים נקודת פתיחה טובה.
            </strong>
          </p>
        </section>

        {/* --- קצת עליי --- */}
        <section className="mb-16 flex flex-col items-center gap-3 text-center">
          <div className="mb-2 h-8 w-px bg-terracotta-200" />
          <p className="text-lg text-muted-foreground">
            <strong className="text-foreground">ליהי.</strong> בוגרת תואר שני
            בפסיכולוגיה שיקומית ודוקטורנטית לפסיכולוגיה (באוניברסיטת בר-אילן).
            אוהבת
            שיחות טובות, מהלב ובגובה העיניים.
          </p>
          <div className="h-8 w-px bg-terracotta-200" />
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-border/60 bg-warm-gray-50 p-8 text-center">
          <h2 className="mb-3 text-xl font-semibold text-foreground">
            רוצים לשמוע עוד?
          </h2>
          <p className="mb-6 text-muted-foreground">
            מזמינה אתכם להתייעץ, לשאול שאלות או לקבל עוד פרטים על הערכה.
          </p>
          <div className="mb-6 flex flex-wrap items-center justify-center gap-4">
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
          <Button size="lg" asChild>
            <Link to="/order">להזמנת הערכה</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
