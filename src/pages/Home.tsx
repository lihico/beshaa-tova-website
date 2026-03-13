import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { WhyDeepTalk } from "@/components/sections/WhyDeepTalk";
import { MeetLihi } from "@/components/sections/MeetLihi";
import { GiftSection } from "@/components/sections/GiftSection";

export default function Home() {
  return (
    <>
      <Hero />
      <WhyDeepTalk />
      <HowItWorks />
      <MeetLihi />
      <GiftSection />
    </>
  );
}
