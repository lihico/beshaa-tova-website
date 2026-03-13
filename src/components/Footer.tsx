import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-warm-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-between">
          {/* Logo & tagline */}
          <div className="flex flex-col items-center gap-3 md:items-start">
            <Link to="/" className="flex items-center gap-2.5">
              <img src="/logo-icon.png" alt="בשעה טובה" className="h-8 w-8" />
              <span className="text-base font-semibold text-foreground">בשעה טובה</span>
            </Link>
            <p className="text-sm text-muted-foreground">ערכת שיח מותאמת אישית לזוגות</p>
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
              <a href="mailto:beshaatova.il@gmail.com" className="text-muted-foreground transition-colors hover:text-foreground">אימייל</a>
              <a href="https://wa.me/972502023669" target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-foreground">וואטסאפ</a>
            </div>
          </nav>
        </div>

        <div className="mt-10 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} בשעה טובה. כל הזכויות שמורות.</p>
        </div>
      </div>
    </footer>
  );
}
