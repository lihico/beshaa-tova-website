import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const ALL_MEETINGS = [
  { id: "02", title: "שפות האהבה" },
  { id: "03", title: "איך אנחנו רבים (ואיך חוזרים)" },
  { id: "04", title: "האינטימיות שלנו" },
  { id: "05", title: "לדבר על כסף" },
  { id: "06", title: "המשפחות שלנו" },
  { id: "07", title: "הבית שאנחנו בונים" },
  { id: "08", title: "עתיד וחלומות" },
  { id: "09", title: "ילדים והורות" },
  { id: "10", title: "כשקשה" },
  { id: "12", title: "עבודה וקריירה" },
];

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const p1 = searchParams.get("p1") || "בן/בת זוג 1";
  const p2 = searchParams.get("p2") || "בן/בת זוג 2";
  const meetingsParam = searchParams.get("meetings") || "";
  const selectedIds = meetingsParam.split(",").filter(Boolean);
  const selectedMeetings = ALL_MEETINGS.filter((m) => selectedIds.includes(m.id));

  return (
    <div className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-8 text-center text-3xl font-bold text-foreground md:text-4xl">
          סיכום הזמנה ותשלום
        </h1>
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Mock Payment Form */}
          <div className="order-2 rounded-2xl border border-border/60 bg-white p-8 shadow-sm lg:order-1">
            <h2 className="mb-6 text-xl font-semibold text-foreground">פרטי תשלום</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">מספר כרטיס</label>
                <input disabled className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm text-muted-foreground" placeholder="**** **** **** ****" value="1234 5678 9101 1121" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">תוקף</label>
                  <input disabled className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm text-muted-foreground" placeholder="MM/YY" value="12/28" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">CVV</label>
                  <input disabled className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm text-muted-foreground" placeholder="***" value="123" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">תעודת זהות</label>
                <input disabled className="flex h-10 w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm text-muted-foreground" value="123456789" />
              </div>
              <div className="mt-8 border-t border-border/60 pt-6">
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span>סך הכל לתשלום</span>
                  <span className="text-terracotta-600">250 &#8362;</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">כולל משלוח עד הבית</p>
              </div>
              <Button size="lg" className="w-full text-lg mt-6 bg-terracotta-600 hover:bg-terracotta-700" onClick={() => { alert('זהו דף תשלום לדוגמה. בפיילוט התשלום יתבצע מול ליהי.'); navigate('/'); }}>
                שלם עכשיו 250 &#8362;
              </Button>
            </div>
          </div>

          {/* Booklet Preview */}
          <div className="order-1 lg:order-2">
            <div className="sticky top-24">
              <h2 className="mb-6 text-xl font-semibold text-foreground">הערכה שלכם</h2>
              <div className="relative mx-auto flex w-full max-w-sm flex-col items-center justify-center overflow-hidden rounded-2xl border border-terracotta-200 bg-warm-gray-50 p-8 shadow-xl">
                <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-terracotta-100/50 blur-2xl" />
                <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-terracotta-200/40 blur-3xl" />
                <div className="relative z-10 flex w-full flex-col items-center mb-8">
                  <img src="/logo-booklet.png" alt="בשעה טובה" className="mb-4 w-[120px] opacity-90" />
                  <p className="mb-3 text-xs tracking-widest text-warm-gray-400">ערכת שיח לזוגות על הדברים החשובים באמת</p>
                  <div className="mb-3 h-px w-10 bg-terracotta-200" />
                  <h3 className="mb-1 text-2xl font-bold text-terracotta-700">{p1} ו{p2}</h3>
                  <p className="font-medium text-gray-800">חוברת זוגית</p>
                </div>
                <div className="relative z-10 w-full rounded-xl bg-white/80 p-5 shadow-sm backdrop-blur-sm border border-terracotta-100">
                  <h4 className="mb-3 border-b border-border/50 pb-2 text-sm font-semibold text-foreground">תוכן העניינים</h4>
                  <ul className="space-y-2.5 text-sm text-muted-foreground">
                    {selectedMeetings.map((m, index) => (
                      <li key={m.id} className="flex gap-3 items-center">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-terracotta-100 text-[10px] font-bold text-terracotta-600">{index + 1}</span>
                        <span>{m.title}</span>
                      </li>
                    ))}
                    {selectedMeetings.length > 0 && (
                      <li className="flex gap-3 items-center pt-2 border-t border-border/50 mt-3">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-terracotta-100 text-[10px] font-bold text-terracotta-600">{selectedMeetings.length + 1}</span>
                        <span className="font-bold text-foreground">הכתובה שלנו</span>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
