import { Link } from "react-router-dom";

const steps = [
  {
    number: "1",
    title: "ממלאים שאלון קצר",
    illustration: "/illustrations/step-questionnaire.png",
    description: "ממלאים פרטים ובוחרים את הנושאים שהכי מדברים אליכם.",
    link: { href: "/order", label: "לשאלון ←" },
  },
  {
    number: "2",
    title: "מקבלים הביתה ערכה אישית",
    illustration: "/illustrations/step-kit.png",
    description: "ערכה אישית שמגיעה אליכם עד הבית. בתוכה תמצאו חוברת זוגית מנחה, ושתי חוברות אישיות (אחת לכל אחד מכם) - בהתאמה לנושאים שמילאתם בשאלון.",
  },
  {
    number: "3",
    title: "קובעים דייטים",
    illustration: "/illustrations/step-talk.png",
    description: "בקצב שלכם, בזמן שלכם. ההמלצה שלנו היא מפגש אחד בשבוע (שעה עד שעה וחצי).",
  },
  {
    number: "4",
    title: "ואם תרצו - כותבים את הכתובה שלכם",
    illustration: "/illustrations/step-ketubah.png",
    description: 'המפגשים עומדים בפני עצמם, אבל הם גם יכולים להוביל לניסוח "כתובה אישית" - מסמך משותף שמסכם את התובנות שלכם ומהווה מצפן להמשך הדרך.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-14 text-center text-3xl font-bold text-foreground md:text-4xl">איך זה עובד?</h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div key={step.number} className="text-center">
              {step.illustration ? (
                <div className="relative mx-auto mb-5 h-28 w-28">
                  <img src={step.illustration} alt={step.title} className="absolute inset-0 h-full w-full object-contain" />
                </div>
              ) : (
                <div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-terracotta-300">
                    <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                  </svg>
                </div>
              )}
              <h3 className="mb-2.5 text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="leading-relaxed text-muted-foreground">{step.description}</p>
              {"link" in step && step.link && (
                <Link to={step.link.href} className="mt-3 inline-block rounded-lg border border-terracotta-400 px-4 py-2 text-sm font-medium text-terracotta-600 transition-colors hover:bg-terracotta-50">
                  {step.link.label}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
