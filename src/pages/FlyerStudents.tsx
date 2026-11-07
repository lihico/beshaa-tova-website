import { HeroV2 } from "@/components/sections/HeroV2";
import { SocialProof } from "@/components/sections/SocialProof";
import { HowItWorksV2 } from "@/components/sections/HowItWorksV2";
import { WhatsInside } from "@/components/sections/WhatsInside";
import { CoupleDialoguePrompts } from "@/components/sections/CoupleDialoguePrompts";
import { InlineCTA } from "@/components/sections/InlineCTA";
import { TrustAndFaq } from "@/components/sections/TrustAndFaq";
import { PricingCTA } from "@/components/sections/PricingCTA";

/** דף נחיתה לפלאייר סטודנטים: כמו HomeV2 אבל בלי צ׳קליסט. */
export default function FlyerStudents() {
  const ORDER_CONVERSION = "?preview=conversion";

  return (
    <div className="bg-white">
      <HeroV2 conversion orderSearch={ORDER_CONVERSION} showChecklistIntro={false} />
      <SocialProof conversion />
      <HowItWorksV2 />
      <WhatsInside conversion />
      <CoupleDialoguePrompts />
      <InlineCTA variant="after-preview" orderSearch={ORDER_CONVERSION} />
      <TrustAndFaq />
      <PricingCTA orderSearch={ORDER_CONVERSION} conversion />
    </div>
  );
}

