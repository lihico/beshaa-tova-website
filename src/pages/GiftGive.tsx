import { Link } from "react-router-dom";
import { FadeIn } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { trackCta } from "@/lib/behavior";
import { TrackSection } from "@/components/TrackSection";
import { TierLinks } from "@/components/TierPicker";
import { PairOffer } from "@/components/PairOffer";
import { trackPriceSeen, trackTierSelect, useSeenOnce } from "@/lib/behavior";

// G4 (Lihi, 14.11.2026): two quotes about the kit as a gift, word for word (marketing/testimonials.md, mit4mit).
const GIFT_QUOTES = [
  { name: "שחר", text: "הערכה היא מתנה ענקית לכל זוג!!!" },
  { name: "אלמוג", text: "זו מתנה מצוינת לעצמנו ואנחנו ממליצים בחום!!" },
];

const steps = [
  {
    n: "1",
    title: "אתם ממלאים ומשלמים",
    text: "ממלאים את פרטי הזוג ומוסיפים ברכה אישית מכם.",
  },
  {
    n: "2",
    title: "הזוג מקבל ובוחר",
    text: "הזוג מקבל את השובר עם קוד ייחודי ובוחר מפגשים.",
  },
  {
    n: "3",
    title: "הערכה מגיעה אליהם",
    text: "ערכה מותאמת אישית עד הבית שלהם.",
  },
];

export default function GiftGive() {
  const seen = useSeenOnce<HTMLDivElement>(() => trackPriceSeen("gift_page"), 0.4);
  return (
    <main className="bg-white">
      <section className="bg-gradient-to-b from-terracotta-50/60 to-white px-5 pb-8 pt-12 text-center md:pb-10 md:pt-16">
        <div className="mx-auto max-w-2xl">
          <FadeIn>
            <p className="mb-2 text-sm font-semibold text-terracotta-600">מתנה לזוג שאוהבים</p>
            <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
              הזמנת שובר כמתנה לזוג
            </h1>
            <p className="mx-auto max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground md:text-base">
              מתאים כמתנה לחתונה, לאירוסין, ליום נישואין, או סתם לתת משהו מיוחד לזוג חברים או משפחה.
            </p>
          </FadeIn>
        </div>
      </section>

      <section className="px-5 pb-10">
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <FadeIn key={s.n}>
              <div className="h-full rounded-2xl border border-warm-gray-200/70 bg-white p-5 text-center shadow-sm">
                <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-terracotta-500 text-base font-bold text-white">
                  {s.n}
                </div>
                <h3 className="mb-1 text-base font-bold text-foreground">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            </FadeIn>
          ))}
        </div>
        <p className="mx-auto mt-5 max-w-xl px-2 text-center text-sm leading-relaxed text-muted-foreground">
          את השובר אפשר לשלוח ישירות לזוג, או שתקבלו אותו אליכם ותמסרו בעצמכם.
        </p>
      </section>

      {/* G2 (Lihi's note, 14.11.2026): the prices, the cheapest (lite) included. G3: two couples, the second 25% off.
          DRAFT he copy: awaiting Lihi. */}
      <section className="px-5 pb-10">
        <div ref={seen} className="mx-auto max-w-md text-center" data-clarity-unmask="true">
          <h2 className="mb-4 text-xl font-bold text-foreground md:text-2xl">כמה מפגשים במתנה?</h2>
          <TierLinks gift onPick={(t) => trackTierSelect("gift_page", t)} />
          <p className="mt-3 text-[0.85rem] text-muted-foreground">כולל משלוח עד הבית של הזוג</p>
          <div className="mt-6">
            <PairOffer where="gift_page" gift title="עוד זוג חברים שמתחתן בקרוב?">
              <figure className="mt-5 border-t border-terracotta-100 pt-4 text-right">
                {/* Shachar, word for word from marketing/testimonials.md, cut at the start only (Lihi, 14.11.2026). */}
                <blockquote className="text-[0.95rem] leading-relaxed text-foreground/90">&quot;ממליצה בתור מתנה לזוג שמתחתן, לתת שובר לערכות כדי שיזכרו לתת רגע לעצמם.&quot;</blockquote>
                <figcaption className="mt-1.5 text-sm font-semibold text-foreground">שחר</figcaption>
              </figure>
            </PairOffer>
          </div>
        </div>
      </section>

      <section className="bg-warm-gray-50 px-5 py-12 md:py-14">
        <div className="mx-auto max-w-lg text-center">
          <FadeIn>
            <h2 className="mb-5 text-xl font-bold text-foreground md:text-2xl">כך נראה השובר שיישלח לזוג</h2>
            <img
              src="/illustrations/gift-voucher-example.jpg"
              alt="דוגמה לשובר מתנה מעוצב של בשעה טובה"
              className="mx-auto w-full max-w-[440px] -rotate-2 rounded-2xl border border-warm-gray-200/70 shadow-xl transition-transform duration-300 hover:rotate-0"
            />
            <div className="mt-8">
              <Button size="lg" className="text-base shadow-md shadow-terracotta-200/40" asChild>
                <Link to="/order?flow=gift" onClick={() => trackCta("gift_order", "gift_voucher")}>לשליחת שובר מתנה</Link>
              </Button>
            </div>
            <TrackSection name="gift_quotes" page="gift">
              <div className="mt-8 grid gap-3 text-right sm:grid-cols-2">
                {GIFT_QUOTES.map((q) => (
                  <figure key={q.name} className="rounded-2xl border border-terracotta-200/70 bg-white px-5 py-4 shadow-sm">
                    <div className="mb-1.5 flex gap-0.5">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />)}</div>
                    <blockquote className="text-[0.98rem] font-medium leading-relaxed text-foreground/90">&quot;{q.text}&quot;</blockquote>
                    <figcaption className="mt-2 text-sm font-semibold text-foreground">{q.name}</figcaption>
                  </figure>
                ))}
              </div>
            </TrackSection>
          </FadeIn>
        </div>
      </section>
    </main>
  );
}
