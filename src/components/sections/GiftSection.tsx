import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function GiftSection() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-terracotta-200 bg-gradient-to-bl from-terracotta-50 to-white">
          <div className="p-8 text-center md:p-12">
            <img src="/illustrations/gift-envelope.png" alt="" className="mx-auto mb-6 h-32 w-32 object-contain md:h-40 md:w-40" />
            <h2 className="mb-3 text-2xl font-bold text-foreground md:text-3xl">מתנה לזוג לכבוד האירוסין</h2>
            <p className="mx-auto mb-8 max-w-md leading-relaxed text-muted-foreground">
              אתם רוכשים את הערכה, הזוג מקבל קישור אישי למילוי שאלון ובחירת המפגשים, והערכה מגיעה עד הבית.
            </p>
            <Button size="lg" variant="outline" asChild>
              <Link to="/gift">לשלוח מתנה</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
