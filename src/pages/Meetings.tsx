import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const palette = [
  { bg: "bg-[#FDF8F5]", border: "border-[#F4E8E1]", badge: "bg-[#F4E8E1] text-[#8B4530]" },
  { bg: "bg-[#FBF3EE]", border: "border-[#EDCFBF]", badge: "bg-[#EDCFBF] text-[#944B2C]" },
  { bg: "bg-[#FAF0EA]", border: "border-[#E8C5B0]", badge: "bg-[#E8C5B0] text-[#7E3F24]" },
  { bg: "bg-[#FCF5EF]", border: "border-[#F0D9C8]", badge: "bg-[#F0D9C8] text-[#9A5A3A]" },
  { bg: "bg-[#FAF2ED]", border: "border-[#E5CBBA]", badge: "bg-[#E5CBBA] text-[#86452A]" },
  { bg: "bg-[#FDF6F2]", border: "border-[#F2DDD0]", badge: "bg-[#F2DDD0] text-[#A06040]" },
];

const meetings = [
  { number: 1, title: "שפות האהבה", description: "מה באמת גורם לכל אחד מכם להרגיש אהוב? (רמז: זה לא תמיד מה שחשבתם).", illustration: "/illustrations/meetings/01-love-languages.png" },
  { number: 2, title: "איך אנחנו רבים (ואיך משלימים)", description: "על דפוסי המריבה שלכם, ומה באמת עוזר לכם לעשות \"ריסטארט\" ולחזור לקרבה.", illustration: "/illustrations/meetings/02-conflicts.png" },
  { number: 3, title: "האינטימיות שלנו", description: "רצונות, פערים וציפיות - במרחב הכי בטוח שיש, ונטול מבוכה.", illustration: "/illustrations/meetings/03-intimacy.png" },
  { number: 4, title: "לדבר על כסף", description: "ההרגלים שספגנו, הפחדים שמסתתרים מאחורי המספרים, ואיך בונים הסכמות כלכליות.", illustration: "/illustrations/meetings/04-money.png" },
  { number: 5, title: "המשפחות שלנו", description: "מה לוקחים ממשפחת המקור, מה משאירים מאחור, ואיך שומרים על הגבולות של הזוגיות.", illustration: "/illustrations/meetings/05-families.png" },
  { number: 6, title: "הבית שאנחנו בונים", description: "חלוקת אחריות, בניית שגרה, ואיך ייראה היומיום שאתם רוצים ליצור יחד.", illustration: "/illustrations/meetings/06-home.png" },
  { number: 7, title: "עתיד וחלומות", description: "איפה אנחנו רואים את עצמנו בעוד 5, 10 או 20 שנה - ואיפה החזונות שלנו נפגשים.", illustration: "/illustrations/meetings/07-future.png" },
  { number: 8, title: "ילדים והורות", description: "אם, מתי, איך - ומה עושים כשיש פערים בציפיות.", illustration: "/illustrations/meetings/08-children.png" },
  { number: 9, title: "כשקשה", description: "איך מתמודדים כצוות מול משברים, שינויים לא צפויים ותקופות של עומס.", illustration: "/illustrations/meetings/09-hardtimes.png" },
  { number: 10, title: "עבודה וקריירה", description: "שאיפות, ויתורים, איזון בית-עבודה - ומה עושים כשלצד אחד יש הזדמנות שמשנה הכל.", illustration: "/illustrations/meetings/10-career.png" },
  { number: 11, title: "מפגש סיכום (הכתובה שלנו)", description: "אוספים את כל מה שלמדתם על עצמכם בתהליך, ומנסחים יחד את \"הכתובה האישית\" שלכם להמשך הדרך.", illustration: "/illustrations/meetings/11-ketubah.png" },
];

export default function Meetings() {
  return (
    <div className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-14 text-center">
          <h1 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            אתם בוחרים את המפגשים לערכה שלכם
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            כל מפגש מוקדש לנושא אחר. בחרו את מה שמדבר אליכם - אין מינימום ואין
            מקסימום.
          </p>
        </div>

        <div className="space-y-6">
          {meetings.map((meeting, index) => {
            const color = palette[index % palette.length];
            return (
              <div
                key={meeting.number}
                className={`flex items-center gap-6 rounded-2xl border p-5 transition-colors md:gap-8 md:p-6 ${color.bg} ${color.border} hover:shadow-sm`}
              >
                <div className="relative hidden h-24 w-36 flex-shrink-0 sm:block md:h-28 md:w-44">
                  <img
                    src={meeting.illustration}
                    alt={meeting.title}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                </div>

                <div className="flex-1">
                  <div className="mb-1.5 flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${color.badge}`}
                    >
                      {meeting.number}
                    </span>
                    <h2 className="text-lg font-semibold text-foreground">
                      {meeting.title}
                    </h2>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {meeting.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-14 text-center">
          <Button size="lg" className="min-w-[200px] text-base" asChild>
            <Link to="/order">להזמנת הערכה</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
