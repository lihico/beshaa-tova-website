const keyPoints = [
  {
    title: "מותאמת אישית",
    description:
      "כל ערכה מודפסת ומעוצבת במיוחד לפרטים שלכם ולמפגשים שבחרתם. אתם בוחרים את הנושאים, קובעים את המפגשים ומכתיבים את הקצב.",
  },
  {
    title: "מבוססת מחקר",
    description:
      "מבוססת על מחקרים מתחום הפסיכולוגיה, מדעי המוח ומחקר זוגי. המחקר משפיע גם על הנושאים שנבחרו למפגשים וגם על האופן שבו הם בנויים.",
  },
  {
    title: "בגובה העיניים",
    description:
      "מגוון תרגילים ופורמטים - שאלות, רשימות, משחקים, כתיבה ושיח פתוח - כך שכל זוג יכול למצוא את הדרך שמתאימה לו. בלי שפה מתנשאת ובלי תחושה של שיעור.",
  },
  {
    title: "עצמאי",
    description:
      "בניגוד לרוב הדברים בחתונה, כאן אין ספק, מנחה או מטפל. אתם המומחים לזוגיות שלכם - הערכה רק נותנת את המסגרת.",
  },
];

export function WhyDeepTalk() {
  return (
    <section className="bg-warm-gray-50 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            התארסתם? מזל טוב!
          </h2>
          <p className="mb-6 text-muted-foreground">
            התקופה שלפני החתונה היא זמן מיוחד ומרגש. רגע שבו, גם אם אתם כבר
            זוג, יש הסתכלות אחרת קדימה - על החיים שאתם רוצים שיהיו לכם ביחד.
          </p>
          <p className="mb-6 font-semibold leading-relaxed text-terracotta-700">
            אבל בין סידורי ההושבה, מדידת השמלה והתיאומים עם הצלם - הרבה זוגות
            מרגישים שמשהו מתפספס. שכל האנרגיה הולכת לאירוע עצמו, ולא נשאר מקום
            לעצור ולדבר על מה שבאמת חשוב.
          </p>
          <p className="mb-14 text-muted-foreground">
            &quot;בשעה טובה&quot; נולדה בשביל זוגות שלפני חתונה או מעבר לחיים
            משותפים, שמחפשים נקודת עצירה - הזדמנות לדבר על החיים עצמם ולא רק
            לתכנן אירוע.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {keyPoints.map((point) => (
            <div key={point.title} className="flex gap-4">
              <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-terracotta-400" />
              <div>
                <h3 className="mb-1.5 font-semibold text-foreground">
                  {point.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {point.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
