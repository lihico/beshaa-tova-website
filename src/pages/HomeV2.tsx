import { HeroV2 } from "@/components/sections/HeroV2";
import { CoupleDialoguePrompts } from "@/components/sections/CoupleDialoguePrompts";
import { SocialProof } from "@/components/sections/SocialProof";
import { HowItWorksV2 } from "@/components/sections/HowItWorksV2";
import { WhatsInside } from "@/components/sections/WhatsInside";
import { CafeCollab } from "@/components/sections/CafeCollab";
import { TrustAndFaq } from "@/components/sections/TrustAndFaq";
import { PricingCTA } from "@/components/sections/PricingCTA";
import { FadeIn } from "@/components/motion";

/** מועבר לקישורי הזמנה (טופס הזמנה עם התאמות המרה). */
const ORDER_CONVERSION = "?preview=conversion";

/**
 * דף נחיתה: פתיחה → אמון → תהליך → מה בתוך הערכה → טעימה מהשיח → CTA → התנגדויות → מחיר.
 * כל סקציה עולה (rise + fade) כשמגיעים אליה בגלילה; שתי הסקציות הראשונות
 * נכנסות בקסקדה קצרה בטעינה כדי שהדף "יתעורר" זה-אחרי-זה.
 */
export default function HomeV2() {
  return (
    <div className="bg-white">
      <FadeIn delay={0}>
        <CoupleDialoguePrompts />
      </FadeIn>
      <FadeIn delay={0.1}>
        <HeroV2 conversion orderSearch={ORDER_CONVERSION} showChecklistIntro={false} />
      </FadeIn>
      <FadeIn>
        <HowItWorksV2 />
      </FadeIn>
      <FadeIn>
        <SocialProof conversion />
      </FadeIn>
      <FadeIn>
        <WhatsInside conversion />
      </FadeIn>
      <FadeIn>
        <CafeCollab />
      </FadeIn>
      <FadeIn>
        <TrustAndFaq />
      </FadeIn>
      <FadeIn>
        <PricingCTA orderSearch={ORDER_CONVERSION} conversion />
      </FadeIn>
    </div>
  );
}
