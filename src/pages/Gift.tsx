import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";

const LIHI_PHONE = "972502023669";

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function Gift() {
  const [giverName, setGiverName] = useState("");
  const [giverPhone, setGiverPhone] = useState("");
  const [giverEmail, setGiverEmail] = useState("");
  const [coupleName1, setCoupleName1] = useState("");
  const [coupleName2, setCoupleName2] = useState("");
  const [weddingDate, setWeddingDate] = useState("");
  const [noDateYet, setNoDateYet] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!giverName.trim()) { setError("נא למלא את השם שלך."); return; }
    if (!giverPhone.trim() || !isValidPhone(giverPhone)) { setError("נא להזין מספר טלפון תקין."); return; }
    if (!giverEmail.trim() || !isValidEmail(giverEmail)) { setError("נא להזין כתובת מייל תקינה."); return; }
    if (!coupleName1.trim() || !coupleName2.trim()) { setError("נא למלא את שמות שני בני הזוג."); return; }
    if (!noDateYet && !weddingDate) { setError("נא לבחור תאריך חתונה, או לסמן שעדיין לא ידוע."); return; }

    const weddingStr = noDateYet ? "עדיין לא יודעים" : new Date(weddingDate).toLocaleDateString("he-IL");

    const lines = [
      `פנייה למתנה מהאתר`,
      ``,
      `שם הנותן/ת: ${giverName.trim()}`,
      `טלפון: ${giverPhone.trim()}`,
      `מייל: ${giverEmail.trim()}`,
      ``,
      `הזוג: ${coupleName1.trim()} ו${coupleName2.trim()}`,
      `תאריך חתונה: ${weddingStr}`,
    ];

    const message = lines.join("\n");

    // Also send email notification (fire-and-forget)
    fetch("/api/gift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        giverName: giverName.trim(), giverPhone: giverPhone.trim(), giverEmail: giverEmail.trim(),
        coupleName1: coupleName1.trim(), coupleName2: coupleName2.trim(),
        weddingDate: noDateYet ? "עדיין לא יודעים" : weddingDate,
      }),
    }).catch(() => {});

    window.open(`https://wa.me/${LIHI_PHONE}?text=${encodeURIComponent(message)}`, "_blank");
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="px-6 py-24 md:py-32">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-terracotta-50">
            <Check className="h-8 w-8 text-terracotta-500" />
          </div>
          <h1 className="mb-4 text-3xl font-bold text-foreground">הפנייה נשלחה!</h1>
          <p className="mb-2 text-lg text-muted-foreground">תודה {giverName}!</p>
          <p className="mb-8 text-muted-foreground">קיבלנו את הפרטים ונחזור אליך בהקדם לגבי המתנה ל{coupleName1} ו{coupleName2}.</p>
          <Button variant="outline" asChild><Link to="/">חזרה לעמוד הבית</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <img src="/logo-icon.png" alt="בשעה טובה" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">מכירים זוג שמתחתן?</h1>
          <p className="text-lg text-muted-foreground">המתנה שתלווה אותם הכי רחוק. מלאו את הפרטים ונחזור אליכם.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">הפרטים שלך</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="giverName">שם מלא</Label>
                <Input id="giverName" value={giverName} onChange={(e) => setGiverName(e.target.value)} placeholder="השם שלך" required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="giverPhone">טלפון</Label>
                  <Input id="giverPhone" type="tel" dir="ltr" value={giverPhone} onChange={(e) => { const val = e.target.value.replace(/[^\d\s\-+()]/g, ""); setGiverPhone(val); }} placeholder="050-1234567" className="text-left" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="giverEmail">מייל</Label>
                  <Input id="giverEmail" type="email" dir="ltr" value={giverEmail} onChange={(e) => setGiverEmail(e.target.value)} placeholder="you@example.com" className="text-left" required />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">שמות בני הזוג</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="coupleName1">שם פרטי (בן/בת זוג 1)</Label>
                <Input id="coupleName1" value={coupleName1} onChange={(e) => setCoupleName1(e.target.value)} placeholder="לדוגמה: יעל" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupleName2">שם פרטי (בן/בת זוג 2)</Label>
                <Input id="coupleName2" value={coupleName2} onChange={(e) => setCoupleName2(e.target.value)} placeholder="לדוגמה: תומר" required />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">מועד החתונה</h2>
            <div className="space-y-3">
              <Input id="weddingDate" type="date" dir="ltr" value={weddingDate} onChange={(e) => { setWeddingDate(e.target.value); if (e.target.value) setNoDateYet(false); }} disabled={noDateYet} className="text-left" />
              <label className="flex cursor-pointer items-center gap-2.5">
                <span
                  role="checkbox" aria-checked={noDateYet} tabIndex={0}
                  onClick={() => { setNoDateYet(!noDateYet); if (!noDateYet) setWeddingDate(""); }}
                  onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setNoDateYet(!noDateYet); if (!noDateYet) setWeddingDate(""); } }}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${noDateYet ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
                >{noDateYet && <Check className="h-3 w-3" />}</span>
                <span className="text-sm text-muted-foreground">עדיין לא יודעים</span>
              </label>
            </div>
          </section>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>}

          <Button size="lg" type="submit" className="w-full text-base">
            לשלוח מתנה
          </Button>
          <p className="text-center text-xs text-muted-foreground">לאחר שליחת הטופס ניצור איתך קשר תוך 24 שעות.</p>
        </form>
      </div>
    </div>
  );
}
