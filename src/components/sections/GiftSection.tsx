import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion";

export function GiftSection() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-terracotta-200 bg-gradient-to-bl from-terracotta-50 to-white">
            <div className="p-8 text-center md:p-12">
              <img src="/illustrations/gift-envelope.png" alt="" className="mx-auto mb-6 h-32 w-32 object-contain illustration-fade md:h-40 md:w-40" />
              <h2 className="mb-3 text-2xl font-bold text-foreground md:text-3xl">מכירים זוג שישמח לקבל את הערכה?</h2>
              <img
                src="/illustrations/botanical-accent.png"
                alt=""
                className="mx-auto mb-4 h-5 w-48 object-contain opacity-40"
              />
              <p className="mx-auto mb-8 max-w-md leading-relaxed text-muted-foreground">
                אתם משלמים, הזוג מקבל שובר עם קוד אישי - ומרכיב לעצמו ערכה מותאמת שמגיעה עד הבית.
              </p>
              <Button size="lg" variant="outline" asChild>
                <Link to="/order?flow=gift">לשלוח מתנה</Link>
              </Button>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
