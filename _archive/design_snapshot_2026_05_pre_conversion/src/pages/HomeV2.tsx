import { HeroV2 } from "@/components/sections/HeroV2";
import { SocialProof } from "@/components/sections/SocialProof";
import { HowItWorksV2 } from "@/components/sections/HowItWorksV2";
import { WhatsInside } from "@/components/sections/WhatsInside";
import { InlineCTA } from "@/components/sections/InlineCTA";
import { TrustAndFaq } from "@/components/sections/TrustAndFaq";
import { PricingCTA } from "@/components/sections/PricingCTA";

/**
 * Streamlined homepage - 7 sections, optimized for mobile + Facebook ad traffic.
 *
 * Flow: Hook → Trust → Process → Content → CTA → Authority+FAQ → Final CTA
 */
export default function HomeV2() {
  return (
    <>
      <HeroV2 />
      <SocialProof />
      <HowItWorksV2 />
      <WhatsInside />
      <InlineCTA variant="after-preview" />
      <TrustAndFaq />
      <PricingCTA />
    </>
  );
}
