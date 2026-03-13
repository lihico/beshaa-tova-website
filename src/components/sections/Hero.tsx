import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

function DiamondDivider({
  color = "rgba(212,149,107,0.5)",
  borderColor = "rgba(212,149,107,0.6)",
  className = "",
}: {
  color?: string;
  borderColor?: string;
  className?: string;
}) {
  return (
    <div className={`flex w-[55%] items-center gap-1.5 ${className}`}>
      <div className="h-[1px] flex-1" style={{ background: color }} />
      <div className="h-1.5 w-1.5 rotate-45" style={{ border: `1.5px solid ${borderColor}` }} />
      <div className="h-[1px] flex-1" style={{ background: color }} />
    </div>
  );
}

function BookletFront({ name, type }: { name: string; type: "couple" | "personal" }) {
  return (
    <div className="relative flex aspect-[210/297] w-full flex-col items-center overflow-hidden bg-white text-center">
      <div className="pointer-events-none absolute inset-[6%] border-[1.5px] border-terracotta-300/50" />
      <div className="pointer-events-none absolute inset-[8%] border-[1.5px] border-terracotta-300/30" />
      <div className="pt-[18%]" />
      <img src="/logo-booklet.png" alt="בשעה טובה" className="w-[38%]" />
      <DiamondDivider className="my-[5%]" />
      <div className="flex-1" />
      <div className="mb-[30%]">
        <p className="mb-1 text-[0.65rem] font-bold text-terracotta-600 md:text-sm">{name}</p>
        <p className="text-[0.5rem] font-semibold text-terracotta-400 md:text-xs">
          {type === "couple" ? "חוברת זוגית" : "חוברת אישית"}
        </p>
      </div>
    </div>
  );
}

function BookletStack() {
  return (
    <div className="relative mx-auto h-[260px] w-[320px] md:h-[500px] md:w-[600px]">
      <div className="absolute left-0 top-8 z-0 w-[140px] rotate-[-6deg] rounded-sm shadow-md shadow-warm-gray-200/40 transition-transform duration-500 hover:rotate-[-3deg] md:top-14 md:w-[250px]">
        <BookletFront type="personal" name="רועי" />
      </div>
      <div className="absolute left-1/2 top-0 z-20 w-[170px] -translate-x-1/2 rounded-sm shadow-xl shadow-terracotta-300/30 transition-transform duration-500 hover:-translate-y-1 md:w-[320px]">
        <BookletFront type="couple" name="תמר ורועי" />
      </div>
      <div className="absolute right-0 top-8 z-0 w-[140px] rotate-[6deg] rounded-sm shadow-md shadow-warm-gray-200/40 transition-transform duration-500 hover:rotate-[3deg] md:top-14 md:w-[250px]">
        <BookletFront type="personal" name="תמר" />
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 md:px-16 lg:px-24">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-terracotta-50/50 to-transparent" />
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col-reverse items-center gap-2 pb-10 pt-8 md:min-h-[calc(100vh-4rem)] md:flex-row md:justify-between md:gap-0 md:py-0">
        <div className="flex flex-1 flex-col justify-center text-center md:text-right">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground md:mb-4 md:text-6xl lg:text-7xl">בשעה טובה</h1>
          <p className="mx-auto mb-8 max-w-lg text-base leading-relaxed text-muted-foreground md:mx-0 md:mb-10 md:text-xl">
            ערכת שיח מותאמת אישית לזוגות לפני חתונה
            <br />
            לשיח על הדברים החשובים באמת.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:justify-start md:gap-4">
            <Button size="lg" className="min-w-[160px] text-base" asChild>
              <Link to="/order">להזמנת הערכה</Link>
            </Button>
            <Button variant="outline" size="lg" className="min-w-[160px] text-base" asChild>
              <a href="#how-it-works">איך זה עובד?</a>
            </Button>
          </div>
        </div>
        <div className="flex-shrink-0">
          <BookletStack />
        </div>
      </div>
    </section>
  );
}
