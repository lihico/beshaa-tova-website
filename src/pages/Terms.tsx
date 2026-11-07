import { motion } from "framer-motion";
import { FadeIn } from "@/components/motion";

const ease = [0.25, 0.1, 0.25, 1] as const;

export default function Terms() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className="px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-2xl">
        <FadeIn className="mb-14 text-center">
          <h1 className="mb-2 text-3xl font-bold text-foreground md:text-4xl">
            תנאי שימוש ומדיניות פרטיות
          </h1>
        </FadeIn>

        <FadeIn className="space-y-6 leading-relaxed text-muted-foreground">
          <p>
            ערכת &quot;בשעה טובה&quot; מבוססת על מחקר אקדמי בתחום הזוגיות ומיועדת לשיח
            עצמאי בין בני הזוג.
            הערכה אינה מהווה תחליף לטיפול זוגי, לייעוץ פסיכולוגי או לכל שירות מקצועי
            אחר. במקרה של מצוקה רגשית או קושי משמעותי, מומלץ לפנות לאיש או אשת מקצוע
            מוסמכים.
          </p>

          <p>
            כל התכנים באתר ובחוברות – טקסטים, שאלות, תרגילים, מבנה, עיצוב ואיורים – הם
            קניינה הרוחני של ליהי כהן / &quot;בשעה טובה&quot;, ומוגנים לפי חוק זכות
            יוצרים, התשס&quot;ח&#8209;2007.
            אין להעתיק, לשכפל, להפיץ או לעשות שימוש מסחרי בתכנים, בשלמותם או בחלקם,
            ללא אישור מראש ובכתב. החוברות מיועדות לשימוש אישי בלבד של הזוג שרכש אותן.
          </p>

          <p>
            התשלום מתבצע באופן מאובטח. הערכות נשלחות בדואר רשום לכתובת שצוינה במועד
            ההזמנה.
            מאחר שכל ערכה מודפסת בהתאמה אישית (שמות בני הזוג ובחירת נושאי המפגשים),
            לא ניתן לבטל הזמנה לאחר אישור התשלום. שובר מתנה: אחרי מימוש השובר הערכה מודפסת במיוחד, ולכן לא ניתן לבטל אותו. עם זאת, בכל שאלה או בעיה ניתן לפנות
            ואשמח לסייע.
          </p>

          <p>
            במסגרת ההזמנה נאספים הפרטים הבאים: שמות בני הזוג, כתובת למשלוח, דוא&quot;ל,
            מספר טלפון ובחירת נושאי המפגשים. יודגש כי לא נאסף כל מידע מתוך השיח הזוגי
            עצמו.
            המידע משמש אך ורק לצורך הפקת הערכה ושילוחה. המידע אינו מועבר, נמכר או
            משותף עם צדדים שלישיים, למעט מערכת סליקת התשלומים ושירות הדואר (לצורך
            המשלוח) – ובשני המקרים מועברים אך ורק הפרטים ההכרחיים להשלמת הפעולה.
            ניתן לפנות בכל עת בבקשה לעיון, לתיקון או למחיקה של המידע בכתובת:{" "}
            <a
              href="mailto:beshaatova.il@gmail.com"
              className="font-medium text-foreground underline underline-offset-4 hover:text-terracotta-600"
            >
              beshaatova.il@gmail.com
            </a>
          </p>

          <p>
            השימוש בערכה נעשה באחריותם הבלעדית של המשתמשים. &quot;בשעה טובה&quot; אינה
            נושאת באחריות לכל נזק, ישיר או עקיף, הנובע משימוש בערכה או מהסתמכות על
            תכניה.
          </p>

          <p>
            לכל שאלה, התייעצות או בקשה, ניתן לפנות בכתובת:{" "}
            <a
              href="mailto:beshaatova.il@gmail.com"
              className="font-medium text-foreground underline underline-offset-4 hover:text-terracotta-600"
            >
              beshaatova.il@gmail.com
            </a>
          </p>

          <p>
            האתר והערכות מופעלים על ידי סייברקמפ בע&quot;מ, ח.פ 516245354, החרוב 6א, חיפה.
            טלפון: <span dir="ltr" className="whitespace-nowrap">050-2023669</span>, מייל:{" "}
            <a
              href="mailto:beshaatova.il@gmail.com"
              className="font-medium text-foreground underline underline-offset-4 hover:text-terracotta-600"
            >
              beshaatova.il@gmail.com
            </a>
          </p>
        </FadeIn>
      </div>
    </motion.div>
  );
}
