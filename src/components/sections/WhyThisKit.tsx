import { FadeIn, Stagger, StaggerItem } from "@/components/motion";

const points = [
  {
    img: "/illustrations/why-personalized.png",
    title: "מותאמת אישית",
    text: "הנושאים שבחרתם, השמות שלכם. ניתן לבחור התאמה למגזר הדתי.",
  },
  {
    img: "/illustrations/why-research.png",
    title: "מבוססת מחקר",
    text: "שאלות ותרגילים שנבנו על בסיס מחקר - בשפה פשוטה ובגובה העיניים.",
  },
  {
    img: "/illustrations/why-guided.png",
    title: "עצמאית ומובנית",
    text: "אתם מדברים לבד, בקצב שלכם. הערכה דואגת למסגרת, לשאלות, ולכיוון.",
  },
];

export function WhyThisKit() {
  return (
    <section className="bg-warm-gray-50 px-5 py-12 md:py-16">
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <h2 className="mb-3 text-center text-2xl font-bold text-foreground md:text-3xl">
            מה מיוחד בערכה?
          </h2>
        </FadeIn>
        <Stagger className="mt-8 grid grid-cols-3 gap-3 md:mt-10 md:gap-6">
          {points.map((p) => (
            <StaggerItem key={p.title}>
              <div className="flex flex-col items-center rounded-xl bg-white px-3 py-4 text-center shadow-sm md:px-5 md:py-6">
                <div className="mb-3 h-14 w-14 md:mb-4 md:h-20 md:w-20">
                  <img
                    src={p.img}
                    alt={p.title}
                    className="h-full w-full object-contain"
                  />
                </div>
                <h3 className="mb-1.5 text-[0.8rem] font-semibold leading-tight text-foreground md:mb-2 md:text-[0.95rem]">{p.title}</h3>
                <p className="text-[0.7rem] leading-relaxed text-muted-foreground md:text-[0.8rem]">{p.text}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
