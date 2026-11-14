const meetings = [
  {
    number: 1,
    title: "שפות האהבה",
    description:
      "עוצרים להבין למה לפעמים אנחנו משקיעים המון אהבה שהצד השני פשוט לא מרגיש. בודקים מה למדנו על אהבה בבית, ולומדים להראות אותה בשפה שהשני באמת מבין.",
  },
  {
    number: 2,
    title: "איך אנחנו רבים (ואיך חוזרים)",
    description:
      "מסתכלים בכנות על ה\"לופ\" הקבוע שלנו כשאנחנו כועסים, נסגרים או נפגעים. כותבים אחד לשני \"מדריך למשתמש\" - מה באמת עוזר ומה רק מחמיר כשאנחנו באמצע חיכוך, כדי לדעת איך לחזור לקרבה.",
  },
  {
    number: 3,
    title: "האינטימיות שלנו",
    description:
      "מניחים את המבוכה בצד ומדברים על אינטימיות במובן הרחב - מקרבה פיזית ועד לבדיחה פרטית או מבט. משתפים ב\"מנועים והבלמים\" שלנו, ולומדים לדבר בטבעיות על הפערים בצרכים ובקצב שלנו.",
  },
  {
    number: 4,
    title: "לדבר על כסף",
    description:
      "מבינים שמאחורי כל הוצאה מסתתרים צרכים אמיתיים כמו חופש או ביטחון. משתפים ביחס לכסף שהבאנו מהבית, ומדברים בלי לשפוט על סדרי העדיפויות שמתאימים לנו יחד.",
  },
  {
    number: 5,
    title: "המשפחות שלנו",
    description:
      "מדברים בפתיחות על ההבדלים והציפיות בין המשפחות שבהן גדלנו. בונים יחד גישה משותפת לחגים, למעורבות ולגבולות לפני שמצטברים מתחים, ומבינים איך כל אחד מאיתנו שומר על הזוגיות מול משפחת המקור שלו.",
  },
  {
    number: 6,
    title: "הבית שאנחנו בונים",
    description:
      "בודקים מה הערך שעומד מאחורי ה\"ככה ברור שצריך\" שהבאנו איתנו מהבית. בוחרים אילו מנהגים והרגלים קטנים אנחנו רוצים ליצור בעצמנו כדי שהיומיום ירגיש באמת שלנו.",
  },
  {
    number: 7,
    title: "עתיד וחלומות",
    description:
      "מורידים את הציניות, משתיקים את ה\"איך\", ונותנים מקום לחלומות - גם הגדולים וגם השקטים - שהשגרה דוחקת הצידה. משתפים בהרפתקאות שנרצה לחוות ובונים ציר זמן משותף קדימה.",
  },
  {
    number: 8,
    title: "ילדים והורות",
    description:
      "מנקים את רעשי הרקע של הסביבה, ומדברים על מה שאנחנו באמת מרגישים לגבי משפחה כשכל בחירה היא לגיטימית. משתפים איזה הורים נרצה להיות ואיך נשמור על הזוגיות בתוך השינוי.",
  },
  {
    number: 9,
    title: "כשקשה",
    description:
      "מדברים על מה שעוצר אותנו מלבקש עזרה, ומגלים דרך \"הסיפור שלך מהצד שלי\" איך הצד השני חווה את הרגעים הקשים שלנו. כותבים \"מדריך למשתמש\" שמסביר למה כל אחד מאיתנו באמת זקוק כשקשה.",
  },
  {
    number: 10,
    title: "עבודה וקריירה",
    description:
      "מכירים בכך שהעבודה מעצבת את הקשר ומשפיעה על מה שנכנס איתנו הביתה בסוף היום. בודקים איפה השאיפות המקצועיות שלנו נפגשות או מתנגשות, ואיך נאזן ביניהן.",
  },
  {
    number: 11,
    title: "מפגש סיכום (הכתובה שלנו)",
    description:
      "מסתכלים אחורה על התהליך שעברנו ומתרגמים את התובנות להבטחות קטנות ומעשים קונקרטיים ליומיום. מגלים שגם בלי מסמך פורמלי, אנחנו יוצאים מכאן עם שפה משותפת שלא הייתה לנו קודם.",
    optional: true,
  },
];

export function Meetings() {
  return (
    <section id="meetings" className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-4 text-center text-3xl font-bold text-foreground md:text-4xl">
          אתם בוחרים את המפגשים לערכה שלכם
        </h2>
        <p className="mx-auto mb-14 max-w-xl text-center text-muted-foreground">
          כל מפגש מוקדש לנושא אחר. בחרו 4, 8 או את כל 11 המפגשים, על הנושאים שמדברים אליכם
          <br />
          (כולל מפגש סיכום/כתובה שכלול תמיד).
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((meeting) => (
            <div
              key={meeting.number}
              className={`rounded-xl border p-5 transition-colors ${
                meeting.optional
                  ? "border-dashed border-terracotta-200 bg-terracotta-50/50"
                  : "border-border/60 bg-background hover:border-terracotta-200"
              }`}
            >
              <div className="mb-2.5 flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-terracotta-100 text-xs font-semibold text-terracotta-600">
                  {meeting.number}
                </span>
                <h3 className="font-semibold text-foreground">
                  {meeting.title}
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {meeting.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
