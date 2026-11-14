import { FadeIn, Stagger, StaggerItem } from "@/components/motion";

function StepConnector() {
  return (
    <div className="hidden items-center justify-center self-center lg:flex" aria-hidden="true">
      <svg width="48" height="24" viewBox="0 0 48 24" fill="none" className="rotate-180">
        <path d="M2 12h40m0 0-6-6m6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-terracotta-300" />
      </svg>
    </div>
  );
}

const steps = [
  {
    img: "/illustrations/step-questionnaire.webp",
    title: "ממלאים שאלון קצר",
    // W1 (Lihi, 14.11.2026): the real numbers of the form (8 or all 11).
    text: "בוחרים 8 מפגשים או את כל 11, ואת הנושאים שמדברים אליכם.",
  },
  {
    img: "/illustrations/step-kit.webp",
    title: "מקבלים ערכה עד הבית",
    text: "חוברות לכל מפגש - חלק זוגי וחלק אישי, מותאמות אליכם.",
  },
  {
    img: "/illustrations/step-talk.webp",
    title: "מתחילים לדבר",
    text: "דייט אחד בשבוע, בזמן שלכם. בבית הקפה, בפארק או בסלון.",
  },
];

export function HowItWorksV2() {
  return (
    <section id="how-it-works" className="scroll-mt-24 px-5 py-6 md:px-6 md:py-11">
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <h2 className="mb-2 text-center text-2xl font-bold text-foreground md:mb-4 md:text-4xl">איך זה עובד?</h2>
        </FadeIn>

        {/* Mobile: compact horizontal row */}
        <Stagger className="grid grid-cols-3 gap-3 md:hidden">
          {steps.map((s) => (
            <StaggerItem key={s.title}>
              <div className="flex flex-col items-center text-center">
                <div className="mb-2 h-16 w-16">
                  <img src={s.img} alt={s.title} loading="lazy" className="h-full w-full object-contain illustration-fade-soft" />
                </div>
                <h3 className="mb-1 text-[0.85rem] font-semibold leading-tight text-foreground">{s.title}</h3>
                <p className="text-[0.78rem] leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        {/* Desktop: full layout with connectors */}
        <div className="hidden md:block">
          <FadeIn>
            <img
              src="/illustrations/divider-brush.png"
              alt=""
              loading="lazy"
              className="mx-auto mb-7 h-3 w-48 object-contain opacity-50"
            />
          </FadeIn>
          <Stagger className="grid items-center lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
            {steps.map((s, i) => (
              <>
                {i > 0 && <StepConnector key={`conn-${i}`} />}
                <StaggerItem key={s.title}>
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-5 h-28 w-28">
                      <img src={s.img} alt={s.title} loading="lazy" className="h-full w-full object-contain illustration-fade-soft" />
                    </div>
                    <h3 className="mb-2.5 text-lg font-semibold text-foreground">{s.title}</h3>
                    <p className="max-w-[240px] leading-relaxed text-muted-foreground">{s.text}</p>
                  </div>
                </StaggerItem>
              </>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
