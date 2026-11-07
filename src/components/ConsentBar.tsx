import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CONSENT_REOPEN_EVENT, needsConsentChoice, setConsent, type ConsentChoice } from "@/lib/consent";

/**
 * A slim cookie bar at the bottom (docs/attribution/00_DESIGN.md 15). Lihi, 7.11.2026: "ממש ממש קטן ולא מציק".
 * Never a modal, never blocks scrolling, shows until a choice is made, then only again from the footer's
 * "cookie settings" link (reopenConsent).
 * While it shows, the page gets matching bottom padding so nothing (the order button, the footer) ends up under it.
 * The two buttons look the same on purpose (00_DESIGN 15: equal accept / decline).
 * The left edge is kept clear for the WhatsApp bubble; on the home pages it rises above the sticky phone CTA.
 * DRAFT he copy: awaiting Lihi.
 */
export function ConsentBar() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [aboveCta, setAboveCta] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // /order?debug=true (Lihi, 7.11.2026): always show the bar so both buttons can be tested.
    let debug = false;
    try { debug = new URLSearchParams(window.location.search).get("debug") === "true"; } catch { /* ignore */ }
    setOpen(debug || needsConsentChoice());
  }, []);

  // The footer's "cookie settings" link (reopenConsent) brings the bar back so the choice can change.
  useEffect(() => {
    const onReopen = () => setOpen(true);
    window.addEventListener(CONSENT_REOPEN_EVENT, onReopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, onReopen);
  }, []);

  // Mirror StickyMobileCTA's rule (home-like page, scrolled past 600px, phone width).
  const isHomeLike = location.pathname === "/" || location.pathname === "/preview";
  useEffect(() => {
    if (!open || !isHomeLike) { setAboveCta(false); return; }
    const onScroll = () => setAboveCta(window.scrollY > 600 && window.innerWidth < 768);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, isHomeLike]);

  // Reserve room at the bottom of the page for the bar's own height.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const prev = body.style.paddingBottom;
    const apply = () => { body.style.paddingBottom = `${ref.current?.offsetHeight ?? 0}px`; };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      body.style.paddingBottom = prev;
    };
  }, [open]);

  if (!open || location.pathname.startsWith("/dashboard")) return null;

  const choose = (c: ConsentChoice) => {
    setConsent(c);
    setOpen(false);
  };

  return (
    <div
      ref={ref}
      role="region"
      aria-label="עוגיות"
      dir="rtl"
      className="fixed inset-x-0 z-40 border-t border-terracotta-200/60 bg-white/95 text-foreground shadow-[0_-2px_8px_rgba(0,0,0,0.04)] backdrop-blur-sm"
      style={{ bottom: aboveCta ? "66px" : "0px", paddingBottom: aboveCta ? undefined : "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-x-2 py-1.5 pr-4 pl-[92px] text-[11px] leading-tight sm:gap-x-3 sm:text-xs">
        <p className="min-w-0 flex-1 text-muted-foreground">
          האתר משתמש בעוגיות למדידה ולשיפור הפרסום.{" "}
          <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
            פרטים
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => choose("granted")}
            className="h-7 whitespace-nowrap rounded-full border border-terracotta-200 px-2.5 text-[11px] font-semibold sm:px-3 sm:text-xs text-terracotta-600 transition-colors hover:bg-terracotta-50"
          >
            אישור
          </button>
          <button
            type="button"
            onClick={() => choose("denied")}
            className="h-7 whitespace-nowrap rounded-full border border-terracotta-200 px-2.5 text-[11px] font-semibold sm:px-3 sm:text-xs text-terracotta-600 transition-colors hover:bg-terracotta-50"
          >
            לא, תודה
          </button>
        </div>
      </div>
    </div>
  );
}
