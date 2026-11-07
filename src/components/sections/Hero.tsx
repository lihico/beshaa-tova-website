import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const ease = [0.25, 0.1, 0.25, 1] as const;

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
    <div className="relative mx-auto h-[280px] w-[360px] md:h-[520px] md:w-[680px]">
      <motion.div
        initial={{ opacity: 0, x: 30, rotate: 0 }}
        animate={{ opacity: 1, x: 0, rotate: -8 }}
        transition={{ duration: 0.7, ease, delay: 0.3 }}
        className="absolute -left-2 top-6 z-0 w-[150px] rounded-sm shadow-md shadow-warm-gray-200/40 transition-transform duration-500 hover:rotate-[-4deg] md:-left-3 md:top-10 md:w-[270px]"
      >
        <BookletFront type="personal" name="רועי" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.1 }}
        className="absolute left-1/2 top-0 z-20 w-[170px] -translate-x-1/2 rounded-sm shadow-xl shadow-terracotta-300/30 transition-transform duration-500 hover:-translate-y-1 md:w-[320px]"
      >
        <BookletFront type="couple" name="תמר ורועי" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: -30, rotate: 0 }}
        animate={{ opacity: 1, x: 0, rotate: 8 }}
        transition={{ duration: 0.7, ease, delay: 0.3 }}
        className="absolute -right-2 top-6 z-0 w-[150px] rounded-sm shadow-md shadow-warm-gray-200/40 transition-transform duration-500 hover:rotate-[4deg] md:-right-3 md:top-10 md:w-[270px]"
      >
        <BookletFront type="personal" name="תמר" />
      </motion.div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 md:px-16 lg:px-24">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-terracotta-50/50 to-transparent" />
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col-reverse items-center gap-2 pb-10 pt-8 md:min-h-[calc(100vh-4rem)] md:flex-row md:justify-between md:gap-0 md:py-0">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="flex flex-1 flex-col justify-center text-center md:text-right"
        >
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground md:mb-4 md:text-6xl lg:text-7xl">בשעה טובה</h1>
          <p className="mx-auto mb-8 max-w-lg text-base leading-relaxed text-muted-foreground md:mx-0 md:mb-10 md:text-xl">
            מפגשים זוגיים מותאמים אישית, לקראת החתונה ולחיים שאחריה.
            <br />
            זמן איכות לשיח על הדברים החשובים באמת.
          </p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease, delay: 0.35 }}
            className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center md:justify-start md:gap-4"
          >
            <Button size="lg" className="min-w-[160px] text-base" asChild>
              <Link to="/order">להזמנת הערכה</Link>
            </Button>
            <Button variant="outline" size="lg" className="min-w-[160px] text-base" asChild>
              <a href="#how-it-works">איך זה עובד?</a>
            </Button>
          </motion.div>
        </motion.div>
        <div className="flex-shrink-0">
          <BookletStack />
        </div>
      </div>
    </section>
  );
}
