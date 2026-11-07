import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function InlineCTA({ variant = "default" }: { variant?: "default" | "after-preview" }) {
  return (
    <div className="flex flex-col items-center gap-3 border-y border-warm-gray-100 bg-warm-gray-50/50 px-5 py-8">
      {variant === "after-preview" && (
        <p className="mb-0.5 text-center text-base font-semibold text-foreground">
          מוכנים לנסות?
        </p>
      )}
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
        <Button size="lg" className="w-full max-w-[260px] text-base shadow-sm sm:w-auto sm:min-w-[180px]" asChild>
          <Link to="/order">להזמנת הערכה · 320 ₪</Link>
        </Button>
        <Button variant="outline" size="lg" className="w-full max-w-[260px] text-base sm:w-auto sm:min-w-[180px]" asChild>
          <Link to="/order?flow=gift">🎁 לשלוח כמתנה</Link>
        </Button>
      </div>
    </div>
  );
}
