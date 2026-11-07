import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import { ScrollToTop } from "@/components/ScrollToTop";
import { ConsentBar } from "@/components/ConsentBar";
import { initTracking, trackPageView } from "@/lib/tracking";
import { captureTouch, hasTrackedParams } from "@/lib/attribution";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Faq from "@/pages/Faq";
import Order from "@/pages/Order";
import OrderThanks from "@/pages/OrderThanks";
import OrderPay from "@/pages/OrderPay";
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
import Cafes from "@/pages/Cafes";
import GiftGive from "@/pages/GiftGive";
import HomePreview from "@/pages/HomePreview";
import FlyerStudents from "@/pages/FlyerStudents";

const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
};

export function App() {
  const location = useLocation();

  // Capture fbclid + provision visitor_id/session_id once on app boot.
  useEffect(() => {
    initTracking();
  }, []);

  // One PageView per route (Pixel + CAPI mirror, deduped by event id; StrictMode-guarded).
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  // An SPA link on our own site that carries tracked params (e.g. /cafe/tre -> /order?ref=tre)
  // is an internal_param touch. The landing itself was captured in main.tsx; captureTouch skips
  // an href it has already captured, so the first run is a no-op.
  useEffect(() => {
    if (!hasTrackedParams(location.search)) return;
    captureTouch({ url: window.location.href, referrer: window.location.origin + "/", internal: true });
  }, [location.search]);

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
            <Route path="/preview" element={<HomePreview />} />
            <Route path="/flyer/students" element={<FlyerStudents />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/order" element={<Order />} />
            <Route path="/order/pay/:orderId" element={<OrderPay />} />
            <Route path="/order/thanks" element={<OrderThanks />} />
            <Route path="/order/thanks/:orderId" element={<OrderThanks />} />
            <Route path="/order/thanks/:orderId/cancelled" element={<OrderThanks cancelled />} />
            <Route path="/gift" element={<Gift />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/redeem" element={<Redeem />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/vouchers/:code" element={<Voucher />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/dashboard/ads" element={<MetaAds />} />
            <Route path="/cafe/:cafeId" element={<CafeLanding />} />
            <Route path="/cafes" element={<Cafes />} />
            <Route path="/give-a-gift" element={<GiftGive />} />
            <Route path="/v1" element={<Home />} />
            <Route path="/v3" element={<HomeV3 />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </motion.main>
      </AnimatePresence>
      <Footer />
      <WhatsAppButton />
      <StickyMobileCTA />
      <ConsentBar />
    </>
  );
}
