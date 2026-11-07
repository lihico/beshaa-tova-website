import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

const navItems = [
  { label: "אודות", href: "/about" },
  { label: "הנושאים", href: "/meetings" },
  { label: "שאלות נפוצות", href: "/faq" },
  { label: "הזמנת שובר כמתנה לזוג", href: "/give-a-gift" },
  { label: '"בשעה טובה" בבית קפה', href: "/cafes" },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    // דף בית קפה בודד (/cafe/:slug) מדליק גם את "בבית קפה"
    if (href === "/cafes") return pathname === "/cafes" || pathname.startsWith("/cafe/");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo-icon.png" alt="בשעה טובה" className="h-10 w-10" />
          <span className="text-xl font-semibold text-foreground">בשעה טובה</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-4 lg:gap-5 md:flex">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative whitespace-nowrap text-sm transition-colors after:absolute after:-bottom-1.5 after:right-0 after:h-0.5 after:rounded-full after:bg-terracotta-500 after:transition-all after:duration-300 ${
                  active
                    ? "font-semibold text-foreground after:w-full"
                    : "text-muted-foreground hover:text-foreground after:w-0 hover:after:w-full"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Button size="sm" className="whitespace-nowrap" asChild>
            <Link to="/order">להזמנה</Link>
          </Button>
        </nav>

        {/* Mobile toggle */}
        <button onClick={() => setMobileOpen(!mobileOpen)} className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground md:hidden" aria-label="תפריט">
          {mobileOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h16M4 6h16M4 18h16" /></svg>
          )}
        </button>
      </div>

      {/* Mobile nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden border-t border-border/60 bg-background md:hidden"
          >
            <nav className="flex flex-col gap-4 px-6 py-4">
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 py-1 text-base transition-colors ${
                      active
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {active && (
                      <span className="h-4 w-1 flex-shrink-0 rounded-full bg-terracotta-500" />
                    )}
                    {item.label}
                  </Link>
                );
              })}
              <Button size="lg" className="w-full" asChild>
                <Link to="/order" onClick={() => setMobileOpen(false)}>להזמנה</Link>
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
