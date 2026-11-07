import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type InlineCTAProps = {
  variant?: "default" | "after-preview";
  /** מתווסף לנתיב ההזמנה, למשל `?preview=conversion` */
  orderSearch?: string;
};

export function InlineCTA({ variant = "default", orderSearch = "" }: InlineCTAProps) {
  const orderHref = `/order${orderSearch}`;
  const giftHref =
    orderSearch === ""
      ? "/order?flow=gift"
      : `/order${orderSearch.startsWith("?") ? `${orderSearch}&` : "?"}flow=gift`;

  return (
    <div className="flex flex-col items-center gap-3 border-y border-warm-gray-100 bg-warm-gray-50/50 px-5 py-5">
      {variant === "after-preview" && (
        <p className="mb-0.5 text-center text-base font-semibold text-foreground">
          מוכנים לנסות?
        </p>
      )}
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
        <Button size="lg" className="w-full max-w-[260px] text-base shadow-sm sm:w-auto sm:min-w-[180px]" asChild>
          <Link to={orderHref}>להזמנת הערכה</Link>
        </Button>
        <Button variant="outline" size="lg" className="w-full max-w-[260px] text-base sm:w-auto sm:min-w-[180px]" asChild>
          <Link to={giftHref}>🎁 לשלוח כמתנה</Link>
        </Button>
      </div>
    </div>
  );
}
