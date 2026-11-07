import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { WhyDeepTalk } from "@/components/sections/WhyDeepTalk";
import { BookletPreview } from "@/components/sections/BookletPreview";
import { MeetLihi } from "@/components/sections/MeetLihi";
import { GiftSection } from "@/components/sections/GiftSection";
import { FadeIn } from "@/components/motion";

export default function Home() {
  return (
    <>
      <Hero />
      <WhyDeepTalk />
      <HowItWorks />

      <section className="px-6 pb-6">
        <FadeIn>
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl">
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-white/60 via-transparent to-white/30" />
            <img
              src="/illustrations/hero-cafe-real.png"
              alt="חוברות בשעה טובה על שולחן בבית קפה"
              className="w-full object-cover"
              style={{ maxHeight: "420px", objectPosition: "center 40%" }}
            />
          </div>
        </FadeIn>
      </section>

      <FadeIn className="py-4">
        <img src="/illustrations/brush-divider-2.png" alt="" className="mx-auto h-3 w-40 object-contain opacity-45" />
      </FadeIn>

      <BookletPreview />

      <FadeIn className="py-4">
        <img src="/illustrations/divider-brush.png" alt="" className="mx-auto h-3 w-48 object-contain opacity-45" />
      </FadeIn>

      <MeetLihi />
      <GiftSection />
    </>
  );
}
