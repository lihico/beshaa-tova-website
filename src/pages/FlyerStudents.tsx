import { HeroV2 } from "@/components/sections/HeroV2";
import { SocialProof } from "@/components/sections/SocialProof";
import { HowItWorksV2 } from "@/components/sections/HowItWorksV2";
import { WhatsInside } from "@/components/sections/WhatsInside";
import { CoupleDialoguePrompts } from "@/components/sections/CoupleDialoguePrompts";
import { InlineCTA } from "@/components/sections/InlineCTA";
import { TrustAndFaq } from "@/components/sections/TrustAndFaq";
import { PricingCTA } from "@/components/sections/PricingCTA";
import { Link } from "react-router-dom";
import { PRICES } from "@/lib/prices";

/** דף נחיתה לפלאייר סטודנטים: כמו HomeV2 אבל בלי צ׳קליסט. */
export default function FlyerStudents() {
  const ORDER_CONVERSION = "?preview=conversion";

  return (
    <div className="bg-white">
      <HeroV2
        conversion
        orderSearch={ORDER_CONVERSION}
        showChecklistIntro={false}
        note={
          // P4 (Lihi, 14.11.2026): the code is on the flyer page itself; the link opens the form with it filled in.
          <p className="rounded-xl bg-terracotta-50/70 px-4 py-2.5 text-[0.9rem] leading-snug text-foreground">
            סטודנטים? הקוד{" "}
            <Link to="/order?promo=STUDENT2026" className="font-bold tracking-wide text-terracotta-600 underline underline-offset-4" dir="ltr">STUDENT2026</Link>{" "}
            נותן {PRICES.promoPct}% הנחה. מזינים אותו בטופס ההזמנה.
          </p>
        }
      />
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

