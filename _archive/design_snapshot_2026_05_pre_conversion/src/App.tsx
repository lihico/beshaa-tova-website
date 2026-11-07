import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Analytics } from "@vercel/analytics/react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import { ScrollToTop } from "@/components/ScrollToTop";
import { trackEvent } from "@/lib/meta-pixel";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Faq from "@/pages/Faq";
import Order from "@/pages/Order";
import Gift from "@/pages/Gift";
import Checkout from "@/pages/Checkout";
import Redeem from "@/pages/Redeem";
import Meetings from "@/pages/Meetings";
import Voucher from "@/pages/Voucher";
import Terms from "@/pages/Terms";
import NotFound from "@/pages/NotFound";
import MetaAds from "@/pages/MetaAds";
import HomeV2 from "@/pages/HomeV2";
import HomeV3 from "@/pages/HomeV3";
import CafeLanding from "@/pages/CafeLanding";

const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
};

export function App() {
  const location = useLocation();

  useEffect(() => {
    trackEvent("PageView");
  }, [location.pathname]);

  return (
    <>
      <ScrollToTop />
      <Header />
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          {...pageTransition}
        >
          <Routes location={location}>
            <Route path="/" element={<HomeV2 />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/order" element={<Order />} />
            <Route path="/gift" element={<Gift />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/redeem" element={<Redeem />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/vouchers/:code" element={<Voucher />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/dashboard/ads" element={<MetaAds />} />
            <Route path="/cafe/:cafeId" element={<CafeLanding />} />
            <Route path="/v1" element={<Home />} />
            <Route path="/v3" element={<HomeV3 />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </motion.main>
      </AnimatePresence>
      <Footer />
      <WhatsAppButton />
      <StickyMobileCTA />
      <Analytics />
    </>
  );
}
