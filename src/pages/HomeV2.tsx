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
import { Navigate, useSearchParams } from "react-router-dom";

/** מועבר לקישורי הזמנה (טופס הזמנה עם התאמות המרה). */
const ORDER_CONVERSION = "?preview=conversion";

/**
 * דף נחיתה: פתיחה → איך זה עובד → טעימה מהשיח → ציטוטים → מי מאחורי הערכה → מה בתוך הערכה → בתי קפה → שאלות → CTA.
 * H2 (Lihi, 14.11.2026): the headline and the buttons open the page; the rotating prompts move under "איך זה עובד".
 * U2: "מי מאחורי הערכה?" right after the quotes. M2: every block reports once when it is on screen (TrackSection).
 */
export default function HomeV2() {
  // Landing versions for ads (Lihi's question on H1, 14.11.2026): ?for= picks the opening; nothing else on the page
  // changes, and ref / utm / fbclid stay in the address. Default (no ?for=) = engaged couples.
  //   ?for=married  the hero speaks to married couples
  //   ?for=gift     straight to the gift page, with the same parameters
  const [params] = useSearchParams();
  const audience = params.get("for");
  if (audience === "gift") {
    const rest = new URLSearchParams(params);
    rest.delete("for");
    const q = rest.toString();
    return <Navigate to={`/give-a-gift${q ? `?${q}` : ""}`} replace />;
  }
  return (
    <div className="bg-white">
      <TrackSection name="hero">
        <FadeIn delay={0}>
          <HeroV2 conversion orderSearch={ORDER_CONVERSION} showChecklistIntro={false} audience={audience === "married" ? "married" : "engaged"} />
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
