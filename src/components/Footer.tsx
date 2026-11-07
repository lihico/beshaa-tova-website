import { Link, useLocation } from "react-router-dom";
import { Mail, MessageCircle, Instagram, Facebook } from "lucide-react";
import { reopenConsent } from "@/lib/consent";

export function Footer() {
  // On home-like pages the phone's sticky order button (StickyMobileCTA, about 65px) covers the bottom
  // of the footer, so leave room for it there; otherwise the last link (cookie settings) cannot be tapped.
  const { pathname } = useLocation();
  const isHomeLike = pathname === "/" || pathname === "/preview";
  return (
    <footer className="border-t border-border/60 bg-warm-gray-50">
      <div className={`mx-auto max-w-6xl px-6 py-12${isHomeLike ? " pb-28 md:pb-12" : ""}`}>
        <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-between">
          {/* Logo & tagline */}
          <div className="flex flex-col items-center gap-3 md:items-start">
            <Link to="/" className="flex items-center gap-2.5">
              <img src="/logo-icon.png" alt="בשעה טובה" className="h-8 w-8" />
              <span className="text-base font-semibold text-foreground">בשעה טובה</span>
            </Link>
            <p className="max-w-[18rem] text-center text-sm leading-snug text-muted-foreground md:max-w-none md:text-right">
              מפגשים זוגיים מותאמים אישית, לקראת החתונה ולחיים שאחריה
            </p>
          </div>

          {/* Links */}
          <nav className="flex gap-8 text-sm">
            <div className="flex flex-col gap-2.5">
              <span className="font-medium text-foreground">ניווט</span>
              <Link to="/about" className="text-muted-foreground transition-colors hover:text-foreground">אודות</Link>
              <Link to="/meetings" className="text-muted-foreground transition-colors hover:text-foreground">הנושאים</Link>
              <Link to="/faq" className="text-muted-foreground transition-colors hover:text-foreground">שאלות נפוצות</Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-medium text-foreground">צרו קשר</span>
              <div className="flex items-center gap-3">
                <a href="mailto:beshaatova.il@gmail.com" aria-label="מייל" className="text-muted-foreground transition-colors hover:text-terracotta-600">
                  <Mail className="h-6 w-6" />
                </a>
                <a href="https://wa.me/972502023669" target="_blank" rel="noopener noreferrer" aria-label="וואטסאפ" className="text-muted-foreground transition-colors hover:text-green-600">
                  <MessageCircle className="h-6 w-6" />
                </a>
              </div>
            </div>
          </nav>
        </div>

        <div className="mt-10 border-t border-border/60 pt-6 flex flex-col items-center gap-4">
          <div className="flex items-center gap-6">
            <a href="https://www.instagram.com/beshaatova.il/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-pink-500">
              <Instagram className="h-7 w-7" />
            </a>
            <a href="https://www.facebook.com/profile.php?id=61576780386510" target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-blue-600">
              <Facebook className="h-7 w-7" />
            </a>
            <a href="https://www.mit4mit.co.il/biz/105750" target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70">
              <img src="/illustrations/mit4mit-logo.png" alt="mit4mit" className="h-9 w-auto" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} בשעה טובה. כל הזכויות שמורות.</p>
          <Link to="/terms" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            תנאי שימוש ומדיניות פרטיות
          </Link>
          {/* 00_DESIGN 15: change the cookie choice later. DRAFT he label: awaiting Lihi. */}
          <button
            type="button"
            onClick={reopenConsent}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            הגדרות עוגיות
          </button>
        </div>
      </div>
    </footer>
  );
}
