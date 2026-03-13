import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section id="order" className="bg-gradient-to-b from-terracotta-50/50 to-terracotta-50 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
          חתונה זה יום אחד.
          <br />
          מה שתדברו עליו לפני - ילווה אתכם הרבה אחרי.
        </h2>
        <div className="mt-10">
          <Button size="lg" className="min-w-[200px] text-base" asChild>
            <Link to="/order">להתחיל</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
