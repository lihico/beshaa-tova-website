import { Routes, Route } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { ScrollToTop } from "@/components/ScrollToTop";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Faq from "@/pages/Faq";
import Order from "@/pages/Order";
import Gift from "@/pages/Gift";
import Checkout from "@/pages/Checkout";
import Meetings from "@/pages/Meetings";

export function App() {
  return (
    <>
      <ScrollToTop />
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/order" element={<Order />} />
          <Route path="/gift" element={<Gift />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/meetings" element={<Meetings />} />
        </Routes>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
