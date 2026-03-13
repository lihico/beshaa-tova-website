const meetings = [
  {
    number: 1,
    title: "שפות האהבה",
    description:
      "מה באמת גורם לכל אחד מכם להרגיש אהוב? (רמז: זה לא תמיד מה שחשבתם).",
  },
  {
    number: 2,
    title: "איך אנחנו רבים (ואיך משלימים)",
    description:
      "על דפוסי המריבה שלכם, ומה באמת עוזר לכם לעשות \"ריסטארט\" ולחזור לקרבה.",
  },
  {
    number: 3,
    title: "האינטימיות שלנו",
    description:
      "רצונות, פערים וציפיות - במרחב הכי בטוח שיש, ונטול מבוכה.",
  },
  {
    number: 4,
    title: "לדבר על כסף",
    description:
      "ההרגלים שספגנו, הפחדים שמסתתרים מאחורי המספרים, ואיך בונים הסכמות כלכליות.",
  },
  {
    number: 5,
    title: "המשפחות שלנו",
    description:
      "מה לוקחים ממשפחת המקור, מה משאירים מאחור, ואיך שומרים על הגבולות של הזוגיות.",
  },
  {
    number: 6,
    title: "הבית שאנחנו בונים",
    description:
      "חלוקת אחריות, בניית שגרה, ואיך ייראה היומיום שאתם רוצים ליצור יחד.",
  },
  {
    number: 7,
    title: "עתיד וחלומות",
    description:
      "איפה אנחנו רואים את עצמנו בעוד 5, 10 או 20 שנה - ואיפה החזונות שלנו נפגשים.",
  },
  {
    number: 8,
    title: "ילדים והורות",
    description:
      "אם, מתי, איך - ומה עושים כשיש פערים בציפיות.",
  },
  {
    number: 9,
    title: "כשקשה",
    description:
      "איך מתמודדים כצוות מול משברים, שינויים לא צפויים ותקופות של עומס.",
  },
  {
    number: 10,
    title: "עבודה וקריירה",
    description:
      "שאיפות, ויתורים, איזון בית-עבודה - ומה עושים כשלצד אחד יש הזדמנות שמשנה הכל.",
  },
  {
    number: 11,
    title: "מפגש סיכום (הכתובה שלנו)",
    description:
      "אוספים את כל מה שלמדתם על עצמכם בתהליך, ומנסחים יחד את \"הכתובה האישית\" שלכם להמשך הדרך.",
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
          כל מפגש מוקדש לנושא אחר. בחרו את מה שמדבר אליכם - אין מינימום ואין
          מקסימום.
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
