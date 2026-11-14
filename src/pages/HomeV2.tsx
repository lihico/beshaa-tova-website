import { HeroV2 } from "@/components/sections/HeroV2";
import { CoupleDialoguePrompts } from "@/components/sections/CoupleDialoguePrompts";
import { SocialProof } from "@/components/sections/SocialProof";
import { HowItWorksV2 } from "@/components/sections/HowItWorksV2";
import { WhatsInside } from "@/components/sections/WhatsInside";
import { CafeCollab } from "@/components/sections/CafeCollab";
import { TrustAndFaq } from "@/components/sections/TrustAndFaq";
import { PricingCTA } from "@/components/sections/PricingCTA";
import { FadeIn } from "@/components/motion";
import { TrackSection } from "@/components/TrackSection";

/** מועבר לקישורי הזמנה (טופס הזמנה עם התאמות המרה). */
const ORDER_CONVERSION = "?preview=conversion";

/**
 * דף נחיתה: פתיחה → איך זה עובד → טעימה מהשיח → ציטוטים → מי מאחורי הערכה → מה בתוך הערכה → בתי קפה → שאלות → CTA.
 * H2 (Lihi, 14.11.2026): the headline and the buttons open the page; the rotating prompts move under "איך זה עובד".
 * U2: "מי מאחורי הערכה?" right after the quotes. M2: every block reports once when it is on screen (TrackSection).
 */
export default function HomeV2() {
  return (
    <div className="bg-white">
      <TrackSection name="hero">
        <FadeIn delay={0}>
          <HeroV2 conversion orderSearch={ORDER_CONVERSION} showChecklistIntro={false} />
        </FadeIn>
      </TrackSection>
      <TrackSection name="how">
        <FadeIn delay={0.1}>
          <HowItWorksV2 />
        </FadeIn>
      </TrackSection>
      <TrackSection name="prompts">
        <FadeIn>
          <CoupleDialoguePrompts />
        </FadeIn>
      </TrackSection>
      <TrackSection name="quotes">
        <FadeIn>
          <SocialProof conversion />
        </FadeIn>
      </TrackSection>
      <TrackSection name="story">
        <FadeIn>
          <TrustAndFaq part="lihi" />
        </FadeIn>
      </TrackSection>
      <TrackSection name="inside">
        <FadeIn>
          <WhatsInside conversion />
        </FadeIn>
      </TrackSection>
      <TrackSection name="cafe">
        <FadeIn>
          <CafeCollab />
        </FadeIn>
      </TrackSection>
      <TrackSection name="faq">
        <FadeIn>
          <TrustAndFaq part="faq" />
        </FadeIn>
      </TrackSection>
      <TrackSection name="pricing">
        <FadeIn>
          <PricingCTA orderSearch={ORDER_CONVERSION} conversion />
        </FadeIn>
      </TrackSection>
    </div>
  );
}
