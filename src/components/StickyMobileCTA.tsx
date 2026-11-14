import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { trackCta } from "@/lib/behavior";

export function StickyMobileCTA() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  const isHomeLike = location.pathname === "/" || location.pathname === "/preview";
  // U5 (Lihi, 14.11.2026): the gift page gets its own fixed button too.
  const isGift = location.pathname === "/give-a-gift";
  const orderHref = isGift ? "/order?flow=gift" : isHomeLike ? "/order?preview=conversion" : "/order";
  const label = isGift ? "לשליחת שובר מתנה" : "להזמנת הערכה";
  const shown = isHomeLike || isGift;

  useEffect(() => {
    if (!shown) {
      setVisible(false);
      return;
    }

    const onScroll = () => {
      setVisible(window.scrollY > (isGift ? 300 : 600));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [shown, isGift]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-terracotta-200/40 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-sm md:hidden" style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
      <Link
        to={orderHref}
        onClick={() => trackCta(isGift ? "gift_order" : "order", "sticky")}
        className="flex h-11 w-full items-center justify-center rounded-full bg-terracotta-500 text-sm font-bold text-white shadow-sm transition-colors active:bg-terracotta-700"
      >
        {label}
      </Link>
    </div>
  );
}
