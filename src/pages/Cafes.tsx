import { Link } from "react-router-dom";
import { FadeIn } from "@/components/motion";
import { CAFE_PARTNERS } from "@/data/cafes";

export default function Cafes() {
  const partners = Object.values(CAFE_PARTNERS);

  return (
    <main className="bg-white">
      <section className="bg-gradient-to-b from-terracotta-50/60 to-white px-5 pb-8 pt-12 text-center md:pb-12 md:pt-16">
        <div className="mx-auto max-w-2xl">
          <FadeIn>
            <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
              בשעה טובה בבית קפה
            </h1>
            <p className="mx-auto max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground md:text-base">
              במקום מהבית, אוספים את הערכה באחד מבתי הקפה השותפים, יושבים לדייט הראשון - וזוג כוסות קפה ראשון עלינו.
            </p>
          </FadeIn>
        </div>
      </section>

      <section className="px-5 pb-16 md:pb-20">
        <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {partners.map((c) => (
            <FadeIn key={c.slug}>
              <Link
                to={`/cafe/${c.slug}`}
                className="group flex h-full flex-col items-center rounded-2xl border border-warm-gray-200/70 bg-white p-6 text-center shadow-sm transition hover:-translate-y-1 hover:border-terracotta-300 hover:shadow-md"
              >
                <div className="flex h-24 items-center justify-center">
                  <img
                    src={c.logoUrl}
                    alt={c.name}
                    loading="lazy"
                    className={`w-auto object-contain ${c.slug === "barcafe" ? "max-h-24" : "max-h-16"}`}
                  />
                </div>
                <div className="mt-3 text-lg font-bold text-foreground">{c.name}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{c.city}</div>
              </Link>
            </FadeIn>
          ))}
        </div>
      </section>
    </main>
  );
}
