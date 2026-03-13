const kitItems = [
  {
    title: "חוברת זוגית",
    description: "תרגילים, שאלות מנחות, ומשימות לשניכם.",
  },
  {
    title: "דפי עבודה אישיים",
    description:
      "לכתיבה בנפרד לפני השיתוף (כי לפעמים צריך קודם לחשוב לבד).",
  },
];

const meetingParts = [
  {
    title: "חלק אישי",
    description:
      "כל אחד ממלא לבד. זמן לחשוב, לכתוב, להתבונן פנימה - בלי לחץ לשתף מיד.",
  },
  {
    title: "חלק זוגי",
    description:
      "משתפים, מקשיבים, ועוברים ביחד תרגילים ושאלות שמנחים את השיח. עם הנחיות ברורות לשניכם - גם למי שמדבר וגם למי שמקשיב.",
  },
];

export function WhatsInTheKit() {
  return (
    <section className="bg-warm-gray-50 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        {/* מה בערכה */}
        <h2 className="mb-4 text-center text-3xl font-bold text-foreground md:text-4xl">
          מה בערכה ואיך נראה מפגש?
        </h2>
        <p className="mx-auto mb-14 max-w-2xl text-center text-muted-foreground">
          כל מה שצריך בשביל לאפשר לכם שיח על מה שחשוב באמת, בקצב ובסגנון שלכם.
          לא צריך להכין כלום מראש - פשוט לפנות ערב, לשבת ביחד, ולפתוח את
          החוברת.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          {kitItems.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border/60 bg-background p-6 transition-colors hover:border-terracotta-200"
            >
              <h3 className="mb-2 text-base font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {/* איך נראה מפגש */}
        <div className="mx-auto mt-14 max-w-3xl">
          <p className="mb-6 text-center text-sm font-medium uppercase tracking-widest text-terracotta-400">
            ובכל מפגש
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            {meetingParts.map((part) => (
              <div
                key={part.title}
                className="rounded-xl border border-terracotta-200/60 bg-background p-6"
              >
                <h4 className="mb-2 font-semibold text-terracotta-600">
                  {part.title}
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {part.description}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            כל מפגש לוקח כשעה עד שעה וחצי. בלי טלפונים, בלי הסחות דעת - עדיף
            במקום שנעים לכם (בית קפה, פארק, ערב עם נר ויין בסלון).
          </p>
        </div>
      </div>
    </section>
  );
}
