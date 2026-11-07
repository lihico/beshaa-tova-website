import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

export function StickyMobileCTA() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (location.pathname !== "/") {
      setVisible(false);
      return;
    }

    const onScroll = () => {
      setVisible(window.scrollY > 600);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-terracotta-200/40 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-sm md:hidden" style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
      <Link
        to="/order"
        className="flex h-11 w-full items-center justify-center rounded-full bg-terracotta-500 text-sm font-bold text-white shadow-sm transition-colors active:bg-terracotta-700"
      >
        להזמנת הערכה · 320 ₪
      </Link>
    </div>
  );
}
