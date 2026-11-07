import { WeddingChecklistIntro } from "@/components/sections/WeddingChecklistIntro";
import { HeroV3 } from "@/components/sections/HeroV3";
import { SocialProof } from "@/components/sections/SocialProof";
import { HowItWorksV2 } from "@/components/sections/HowItWorksV2";
import { WhatsInside } from "@/components/sections/WhatsInside";
import { InlineCTA } from "@/components/sections/InlineCTA";
import { TrustAndFaq } from "@/components/sections/TrustAndFaq";
import { PricingCTA } from "@/components/sections/PricingCTA";

export default function HomeV3() {
  return (
    <>
      <WeddingChecklistIntro />
      <HeroV3 />
      <SocialProof />
      <HowItWorksV2 />
      <WhatsInside />
      <InlineCTA variant="after-preview" />
      <TrustAndFaq />
      <PricingCTA />
    </>
  );
}

