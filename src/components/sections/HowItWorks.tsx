import { Link } from "react-router-dom";
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

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground md:text-4xl">איך זה עובד?</h2>
          <p className="mx-auto mb-6 max-w-md text-center leading-relaxed text-muted-foreground">שלושה שלבים פשוטים - והערכה בדרך אליכם</p>
          <img
            src="/illustrations/divider-brush.png"
            alt=""
            className="mx-auto mb-14 h-3 w-48 object-contain opacity-50"
          />
        </FadeIn>

        <Stagger className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <StaggerItem>
            <div className="flex flex-col items-center text-center">
              <div className="mb-5">
                <div className="h-28 w-28">
                  <img src="/illustrations/step-questionnaire.png" alt="ממלאים שאלון קצר" className="h-full w-full object-contain illustration-fade-soft" />
                </div>
              </div>
              <h3 className="mb-2.5 text-lg font-semibold text-foreground">ממלאים שאלון קצר</h3>
              <p className="max-w-[240px] leading-relaxed text-muted-foreground">מזינים שמות, בוחרים את הנושאים שהכי מדברים אליכם מתוך הבנק.</p>
            </div>
          </StaggerItem>
          <StepConnector />
          <StaggerItem>
            <div className="flex flex-col items-center text-center">
              <div className="mb-5">
                <div className="h-28 w-28">
                  <img src="/illustrations/step-kit.png" alt="מקבלים ערכה עד הבית" className="h-full w-full object-contain illustration-fade-soft" />
                </div>
              </div>
              <h3 className="mb-2.5 text-lg font-semibold text-foreground">מקבלים ערכה עד הבית</h3>
              <p className="max-w-[240px] leading-relaxed text-muted-foreground">ערכה מותאמת אישית - חוברת זוגית ושתי חוברות אישיות, מותאמות אישית אליכם ולנושאים שבחרתם.</p>
            </div>
          </StaggerItem>
          <StepConnector />
          <StaggerItem>
            <div className="flex flex-col items-center text-center">
              <div className="mb-5">
                <div className="h-28 w-28">
                  <img src="/illustrations/step-talk.png" alt="מתחילים לדבר" className="h-full w-full object-contain illustration-fade-soft" />
                </div>
              </div>
              <h3 className="mb-2.5 text-lg font-semibold text-foreground">מתחילים לדבר</h3>
              <p className="max-w-[240px] leading-relaxed text-muted-foreground">מפגש אחד בשבוע, בזמן שלכם. שיחות מעמיקות שמכינות אתכם לחיים משותפים.</p>
            </div>
          </StaggerItem>
        </Stagger>

        <FadeIn className="mt-14 text-center">
          <Link
            to="/order"
            className="inline-flex items-center gap-2 rounded-xl bg-terracotta-500 px-8 py-3.5 text-base font-semibold text-white shadow-md shadow-terracotta-300/30 transition-all duration-200 hover:bg-terracotta-600 hover:shadow-lg"
          >
            להזמנת הערכה
          </Link>
        </FadeIn>
      </div>
    </section>
  );
}
