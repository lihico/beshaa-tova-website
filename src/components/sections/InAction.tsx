import { FadeIn } from "@/components/motion";

export function InAction() {
  return (
    <section className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-3xl">
        <FadeIn>
          <div className="relative overflow-hidden rounded-2xl" style={{ maxHeight: "420px" }}>
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-warm-gray-50/80 via-transparent to-terracotta-50/30" />
            <img
              src="/illustrations/couple-using-kit-picnic.png"
              alt="זוג יושב על שמיכת פיקניק עם חוברות בשעה טובה"
              className="w-full object-cover"
              style={{ filter: "saturate(0.85) sepia(0.08) brightness(1.02)", objectPosition: "center 65%" }}
            />
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground/70">
            מפגש אחד בשבוע, בזמן שלכם. שיחות שמכינות אתכם לחיים משותפים.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
