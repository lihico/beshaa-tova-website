import { Link } from "react-router-dom";
import { FadeIn } from "@/components/motion";

export function MeetLihi() {
  return (
    <section className="bg-warm-gray-50 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center gap-10 md:flex-row">
          <FadeIn flat className="relative flex-shrink-0">
            <img
              src="/illustrations/enso-circle.png"
              alt=""
              className="absolute -inset-6 h-[calc(100%+48px)] w-[calc(100%+48px)] object-contain opacity-20"
            />
            <img src="/illustrations/about-ketubah-signing.png" alt="ליהי ונתיב חותמים על כתובה אישית" className="relative h-48 w-48 rounded-xl object-cover md:h-56 md:w-56" />
          </FadeIn>
          <FadeIn delay={0.15}>
            <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">נעים מאוד. אני ליהי.</h2>
            <p className="mb-4 leading-relaxed text-muted-foreground">
              דוקטורנטית לפסיכולוגיה. לפני שנה התחתנתי, ובתקופה שלפני קבענו לעצמנו דייט שבועי קבוע - בכל פעם נושא אחר, שיח על הדברים החשובים באמת.
            </p>
            <p className="mb-4 leading-relaxed text-muted-foreground">
              המפגשים האלה היו כל כך משמעותיים שהפכנו אותם לכתובה אישית. יום אחד אמרתי לעצמי - אני רוצה לתת את המתנה הזו לזוגות אחרים.
            </p>
            <p className="mb-4 font-medium leading-relaxed text-terracotta-700">
              להרחיב את ה&quot;בשעה טובה&quot; של האירוסין לשעות טובות, של שיחות עומק על הדברים החשובים באמת.
            </p>
            <Link to="/about" className="text-sm font-medium text-terracotta-600 transition-colors hover:text-terracotta-500">
              לסיפור המלא ←
            </Link>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
