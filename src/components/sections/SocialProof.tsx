import { useState } from "react";
import { FadeIn } from "@/components/motion";
import { Star, ChevronDown } from "lucide-react";
import { trackCta } from "@/lib/behavior";

// Q2 (Lihi, 14.11.2026): four quotes word for word from marketing/testimonials.md ("..." = a cut, no word changed),
// first, because most phones show only the first ones. The older (edited) quotes stay after them (Q3: she keeps them).
const cards = [
  {
    name: "עומר",
    text: "...7 שנים ביחד והרגשתי ש**כבר דיברנו על הכל** אבל בזכות השאלות והחוברות האישיות הצלחנו לגעת עוד יותר לעומק בנושאים חשובים",
  },
  {
    name: "לירון",
    text: "...בשפות אהבה שנינו מאוד טעינו וזה הפתיע אותנו מאוד אחרי 6 שנים של זוגיות אבל זה ממש עזר לנו לדייק ולהבין פתאום **שאנחנו לא יודעים הכל אחד על השני**…",
  },
  {
    name: "עומר",
    text: "זה נתן לנו עוד פרספקטיבה **לדברים שכבר דיברנו עליהם** אבל רק בזכות המפגש נכנסנו לעומקים שלא הגענו אליהם אף פעם",
  },
  {
    name: "שחר",
    text: "שמחנו שזה גרם לנו לדבר על הדברים **בצורה מסודרת**. לעבור תהליך חיובי.",
  },
  {
    name: "שחר",
    text: "בדרך לחתונה לפעמים שוכחים לעצור רגע ולדבר על הדברים החשובים באמת. **חוויה מדהימה** - אפילו הייתי ממליצה בתור מתנה לזוג שמתחתן.",
  },
  {
    name: "אלמוג",
    text: "אנחנו מרגישים שאנחנו מכירים אחד את השנייה מצוין, אבל **העצירה הזו בתוך כל הבלאגן** עשתה לנו טוב ועזרה לנו לפקס את עצמנו לעתיד שלנו ביחד.",
  },
  {
    name: "חן",
    text: "גם כזוג שנמצא יחד מספר לא מבוטל של שנים, יש נושאים שלא פשוט לדבר עליהם. **ניכרת ההשקעה והמחשבה** בחוברות - היכולת להנחות אותנו לנקודות הקשות אבל גם לתת לשיחה לזרום.",
  },
  {
    name: "נתי",
    text: "זו הייתה **נקודת העצירה** שהיינו צריכים - לשים רעשי רקע בצד ולהתרכז נטו בזוגיות שלנו ובחיים שאנחנו בונים יחד.",
  },
  {
    name: "עמר",
    text: "**כלי מדהים** לזוגות שרוצים זמן איכות משותף ומשמעותי - שיחות עמוקות וכנות שלא תמיד מגיעים אליהן ביומיום, גם אם חשבתם שאתם מכירים הכי טוב בעולם!",
  },
  {
    name: "אלמוג",
    text: "הכול כתוב בצורה אישית, **בגובה העיניים**, ונוגע בדברים חשובים מאוד.",
  },
  {
    name: "חן",
    text: "אהבנו את **ההתאמה האישית** ואת האפשרות לבחור את הנושאים שרלוונטיים לנו.",
  },
  {
    name: "נתי",
    text: "בעקבות השיחות, ממש **כתבנו את הכתובה שלנו** על בסיס התובנות מהחוברות.",
  },
  {
    name: "יובל",
    text: "חוויה טובה, **פותחת שיח אישי וחשוב** בתוך תקופה שעסוקים בפרקטיקה של אירוע החתונה.",
  },
  {
    name: "ליבי",
    text: "הערכות מדהימות, אפילו זוג דברנים כמונו מצאו את הדרך למצוא נושאים חדשים ולאגד את הכל על הכתב, מה שעושה סדר **דייט קבוע כל שבת**!",
  },
];

function formatBold(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-foreground">{part}</strong> : part
  );
}

function Stars({ conversion }: { conversion?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      ))}
      {!conversion && (
        <span className="mr-1.5 text-xs font-medium text-muted-foreground">100/100</span>
      )}
    </div>
  );
}

/** תמונות שזוגות שלחו מהמפגשים שלהם. */
const photos = [
  { src: "/recommendations/beach.jpg", alt: "מפגש של זוג על שפת הים", position: "center 72%" },
  { src: "/recommendations/river.jpg", alt: "מפגש מול נהר והרים", position: "center 82%" },
  { src: "/recommendations/home.jpg", alt: "מפגש בבית לאור נרות", position: "center 42%" },
  { src: "/recommendations/poolside.jpg", alt: "מפגש ליד הבריכה", position: "center 45%" },
];

/** U1 (Lihi, 14.11.2026): three quotes open, the rest behind "עוד ציטוטים", instead of the one-at-a-time carousel. */
const VISIBLE = 3;

function QuoteCard({ name, text, conversion }: { name: string; text: string; conversion?: boolean }) {
  return (
    <figure className="relative overflow-hidden rounded-2xl border border-terracotta-200/70 bg-gradient-to-br from-terracotta-50/60 to-white px-5 py-5 shadow-[0_10px_30px_-12px_rgba(168,86,56,0.25)] md:px-7">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-terracotta-300 via-terracotta-400 to-terracotta-300" />
      <span aria-hidden="true" className="pointer-events-none absolute -top-2 right-3 select-none font-serif text-[4.2rem] leading-none text-terracotta-200/80">&rdquo;</span>
      {/* Q2 note: five stars on every review */}
      <div className="relative mb-2.5"><Stars conversion={conversion} /></div>
      <blockquote className="relative text-[1rem] font-medium leading-relaxed text-foreground/90 md:text-[1.06rem]">{formatBold(text)}</blockquote>
      <figcaption className="mt-3 text-sm font-semibold text-foreground">{name}</figcaption>
    </figure>
  );
}

export function SocialProof({ conversion = false }: { conversion?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? cards : cards.slice(0, VISIBLE);

  return (
    <section className="border-t border-warm-gray-100 bg-[#faf8f5] px-5 py-5 md:py-7">
      <div className="mx-auto max-w-2xl">
        <FadeIn>
          <div className={`mb-5 flex items-center justify-center gap-2 ${conversion ? "flex-col" : ""}`}>
            {!conversion && (
              <img
                src="/illustrations/mit4mit-logo.webp"
                alt="mit4mit"
                loading="lazy"
                className="h-5 w-auto"
              />
            )}
            {conversion ? (
              <>
                {/* Q1 (Lihi, 14.11.2026) */}
                <h2 className="text-center text-xl font-bold text-foreground md:text-2xl">דיברתם על זה? לא ככה.</h2>
                <p className="text-center text-[0.9rem] text-muted-foreground">מה כתבו זוגות אחרי המפגשים</p>
              </>
            ) : (
              <p className="text-[0.85rem] font-medium uppercase tracking-widest text-terracotta-400">מה אומרים זוגות שכבר עברו את זה</p>
            )}
          </div>

          <div className="space-y-3">
            {shown.map((c, i) => <QuoteCard key={i} name={c.name} text={c.text} conversion={conversion} />)}
          </div>
          {!showAll && cards.length > VISIBLE && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setShowAll(true); trackCta("more_quotes", "quotes"); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-terracotta-200 bg-white px-5 py-2 text-sm font-semibold text-terracotta-600 shadow-sm transition-colors hover:bg-terracotta-50"
              >
                עוד ציטוטים <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* תמונות אמיתיות שזוגות שלחו מהמפגשים שלהם */}
          <div className="mt-6">
            <p className="mb-3 text-center text-[0.8rem] font-medium uppercase tracking-widest text-terracotta-400">
              מהמפגשים של הזוגות
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {photos.map((photo) => (
                <div
                  key={photo.src}
                  className="overflow-hidden rounded-xl border border-terracotta-200/60 bg-white shadow-[0_6px_18px_-10px_rgba(168,86,56,0.35)]"
                >
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                    style={{ objectPosition: photo.position }}
                  />
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
