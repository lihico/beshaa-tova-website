import { FadeIn, Stagger, StaggerItem } from "@/components/motion";

const keyPoints = [
  {
    title: "מותאמת אישית",
    description:
      "אתם בוחרים את הנושאים, קובעים את הקצב, והערכה מודפסת במיוחד עם הפרטים שלכם.",
  },
  {
    title: "מבוססת מחקר",
    description:
      "מבוססת על מחקרים מפסיכולוגיה, מדעי המוח ומחקר זוגי - גם בבחירת הנושאים וגם באופן שהם בנויים.",
  },
  {
    title: "בגובה העיניים",
    description:
      "שאלות, רשימות, משחקים, כתיבה ושיח פתוח - בלי שפה מתנשאת ובלי תחושה של שיעור.",
  },
  {
    title: "עצמאי",
    description:
      "בלי מנחה, מטפל או אדם שלישי. אתם המומחים לזוגיות שלכם - הערכה רק נותנת את המסגרת.",
  },
];

export function WhyDeepTalk() {
  return (
    <section className="bg-warm-gray-50 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            התארסתם? מזל טוב!
          </h2>
          <p className="mb-5 text-lg leading-relaxed text-muted-foreground">
            בין סידורי ההושבה, מדידת השמלה והצלם - הרבה זוגות מרגישים שמשהו
            מתפספס. שכל האנרגיה הולכת לארגון האירוע, ולא נשאר מקום לדבר על מה שבאמת
            חשוב.
          </p>
          <p className="mb-10 text-lg leading-relaxed text-muted-foreground">
            &quot;בשעה טובה&quot; היא נקודת עצירה לזוגות - הזדמנות
            לדבר על החיים עצמם, לא רק לתכנן אירוע.
          </p>
        </FadeIn>

        <FadeIn flat>
          <img
            src="/illustrations/brush-divider-2.png"
            alt=""
            className="mx-auto mb-10 h-3 w-40 object-contain opacity-50"
          />
        </FadeIn>

        <Stagger className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {keyPoints.map((point) => (
            <StaggerItem key={point.title}>
              <div className="flex gap-4">
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
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
