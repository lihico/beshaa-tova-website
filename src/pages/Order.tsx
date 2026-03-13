import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown } from "lucide-react";

const LIHI_PHONE = "972502023669";

const MEETINGS = [
  { id: "02", title: "שפות האהבה", description: "מה באמת גורם לכל אחד מכם להרגיש אהוב? (רמז: זה לא תמיד מה שחשבתם)." },
  { id: "07", title: "הבית שאנחנו בונים", description: "חלוקת אחריות, בניית שגרה, ואיך ייראה היומיום שאתם רוצים ליצור יחד." },
  { id: "08", title: "עתיד וחלומות", description: "איפה אנחנו רואים את עצמנו בעוד 5, 10 או 20 שנה - ואיפה החזונות שלנו נפגשים." },
  { id: "06", title: "המשפחות שלנו", description: "מה לוקחים ממשפחת המקור, מה משאירים מאחור, ואיך שומרים על הגבולות של הזוגיות." },
  { id: "05", title: "לדבר על כסף", description: "ההרגלים שספגנו, הפחדים שמסתתרים מאחורי המספרים, ואיך בונים הסכמות כלכליות." },
  { id: "12", title: "עבודה וקריירה", description: "שאיפות, ויתורים, איזון בית-עבודה - ומה עושים כשלצד אחד יש הזדמנות שמשנה הכל." },
  { id: "09", title: "ילדים והורות", description: "אם, מתי, איך - ומה עושים כשיש פערים בציפיות." },
  { id: "03", title: "איך אנחנו רבים (ואיך חוזרים)", description: "על דפוסי המריבה שלכם, ומה באמת עוזר לכם לעשות \"ריסטארט\" ולחזור לקרבה." },
  { id: "04", title: "האינטימיות שלנו", description: "רצונות, פערים וציפיות - במרחב הכי בטוח שיש, ונטול מבוכה." },
  { id: "10", title: "כשקשה", description: "איך מתמודדים כצוות מול משברים, שינויים לא צפויים ותקופות של עומס." },
];

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export default function Order() {
  const [searchParams] = useSearchParams();
  const debug = searchParams.get("debug") === "true";

  const [partner1, setPartner1] = useState(debug ? "יעל" : "");
  const [partner2, setPartner2] = useState(debug ? "תומר" : "");
  const [gender1, setGender1] = useState<"F" | "M" | "">(debug ? "F" : "");
  const [gender2, setGender2] = useState<"F" | "M" | "">(debug ? "M" : "");
  const [phone, setPhone] = useState(debug ? "050-1234567" : "");
  const [weddingDate, setWeddingDate] = useState(debug ? "2026-09-15" : "");
  const [city, setCity] = useState(debug ? "תל אביב" : "");
  const [street, setStreet] = useState(debug ? "דיזנגוף 99" : "");
  const [apartment, setApartment] = useState(debug ? "4" : "");
  const [selectedMeetings, setSelectedMeetings] = useState<string[]>(debug ? ["02", "03", "05", "07", "08", "09"] : []);
  const [desiredCount, setDesiredCount] = useState<string>(debug ? "6" : "");
  const [freeText, setFreeText] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);

  const handleToggleMeeting = (id: string) => {
    setSelectedMeetings((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleToggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedMeeting((prev) => (prev === id ? null : id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!partner1.trim() || !partner2.trim()) { setError("נא למלא את שמות שני בני הזוג."); return; }
    if (!gender1 || !gender2) { setError("נא לבחור מגדר לכל אחד מבני הזוג."); return; }
    if (!phone.trim()) { setError("נא להזין מספר טלפון."); return; }
    if (!isValidPhone(phone)) { setError("מספר הטלפון לא תקין. נא להזין מספר תקף (למשל 050-1234567 או +972-50-1234567)."); return; }
    if (!city.trim() || !street.trim()) { setError("נא למלא כתובת למשלוח (עיר ורחוב)."); return; }
    if (selectedMeetings.length === 0) { setError("נא לבחור לפחות מפגש אחד."); return; }

    const genderLabel = (g: string) => g === "F" ? "נ" : "ז";
    const meetingNames = selectedMeetings.map((id) => MEETINGS.find((m) => m.id === id)?.title || id);
    const addressStr = [street.trim(), apartment.trim() ? `דירה ${apartment.trim()}` : "", city.trim()].filter(Boolean).join(", ");

    const lines = [
      `הזמנה חדשה מהאתר`,
      ``,
      `${partner1.trim()} (${genderLabel(gender1)}) ו${partner2.trim()} (${genderLabel(gender2)})`,
      `טלפון: ${phone.trim()}`,
      `תאריך חתונה: ${weddingDate ? new Date(weddingDate).toLocaleDateString("he-IL") : "לא צוין"}`,
      `כתובת: ${addressStr}`,
      ``,
      `מפגשים (${selectedMeetings.length}):`,
      ...meetingNames.map((name) => `- ${name}`),
      `- הכתובה שלנו (תמיד כלול)`,
      ``,
      `כמות מפגשים רצויה: ${desiredCount || "לא צוין"}`,
    ];
    if (freeText.trim()) {
      lines.push(``, `הערות: ${freeText.trim()}`);
    }

    const message = lines.join("\n");

    // Also send email notification (fire-and-forget, don't block on failure)
    fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partner1: partner1.trim(), partner2: partner2.trim(),
        gender1, gender2, phone: phone.trim(),
        weddingDate: weddingDate || null,
        address: { city: city.trim(), street: street.trim(), apartment: apartment.trim() || null },
        meetings: selectedMeetings, desiredCount: desiredCount || null,
        freeText: freeText.trim() || null,
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
          <p className="mb-2 text-lg text-muted-foreground">תודה {partner1} ו{partner2}.</p>
          <p className="mb-8 text-muted-foreground">קיבלנו את הפרטים שלכם וניצור איתכם קשר בוואטסאפ בהקדם.</p>
          <Button variant="outline" asChild><Link to="/">חזרה לעמוד הבית</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <img src="/logo-booklet.png" alt="בשעה טובה" className="mx-auto mb-4 h-20 w-auto" />
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">שאלון התאמה</h1>
          <p className="text-lg text-muted-foreground">מלאו את השאלון הקצר ואבנה לכם ערכה שמתאימה בדיוק לכם.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Names + Gender */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">שמות בני הזוג</h2>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-terracotta-500">מי ממלא/ת את השאלון?</Label>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Input id="partner1" value={partner1} onChange={(e) => setPartner1(e.target.value)} placeholder="שם פרטי" required />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setGender1("F")} className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${gender1 === "F" ? "border-terracotta-400 bg-terracotta-500 text-white" : "border-border bg-background text-muted-foreground hover:border-terracotta-200"}`}>היא</button>
                    <button type="button" onClick={() => setGender1("M")} className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${gender1 === "M" ? "border-terracotta-400 bg-terracotta-500 text-white" : "border-border bg-background text-muted-foreground hover:border-terracotta-200"}`}>הוא</button>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-terracotta-500">בן/בת הזוג</Label>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Input id="partner2" value={partner2} onChange={(e) => setPartner2(e.target.value)} placeholder="שם פרטי" required />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setGender2("F")} className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${gender2 === "F" ? "border-terracotta-400 bg-terracotta-500 text-white" : "border-border bg-background text-muted-foreground hover:border-terracotta-200"}`}>היא</button>
                    <button type="button" onClick={() => setGender2("M")} className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${gender2 === "M" ? "border-terracotta-400 bg-terracotta-500 text-white" : "border-border bg-background text-muted-foreground hover:border-terracotta-200"}`}>הוא</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Phone + Wedding Date */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">פרטי התקשרות</h2>
            <p className="text-sm text-muted-foreground">ניצור איתכם קשר בוואטסאפ למספר הזה.</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              </span>
              <Input id="phone" type="tel" dir="ltr" value={phone} onChange={(e) => { const val = e.target.value.replace(/[^\d\s\-+()]/g, ""); setPhone(val); }} placeholder="050-1234567" className="pl-10 text-left" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weddingDate">תאריך חתונה{" "}<span className="font-normal text-muted-foreground">(משוער, לא חובה)</span></Label>
              <Input id="weddingDate" type="date" dir="ltr" value={weddingDate} onChange={(e) => setWeddingDate(e.target.value)} className="text-left" />
            </div>
          </section>

          {/* Shipping Address */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">כתובת למשלוח</h2>
            <p className="text-sm text-muted-foreground">לאן לשלוח את הערכה?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">עיר</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="למשל: תל אביב" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apartment">דירה{" "}<span className="font-normal text-muted-foreground">(לא חובה)</span></Label>
                <Input id="apartment" value={apartment} onChange={(e) => setApartment(e.target.value)} placeholder="מספר דירה" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="street">רחוב ומספר</Label>
              <Input id="street" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="למשל: הרצל 10" required />
            </div>
          </section>

          {/* Meetings */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">בחירת מפגשים</h2>
              <span className="rounded-full bg-terracotta-100 px-3 py-1 text-xs font-medium text-terracotta-700">{selectedMeetings.length} נבחרו (5-8 אידיאלי)</span>
            </div>
            <div className="space-y-2">
              {MEETINGS.map((meeting) => {
                const isSelected = selectedMeetings.includes(meeting.id);
                const isExpanded = expandedMeeting === meeting.id;
                return (
                  <div key={meeting.id} className={`overflow-hidden rounded-lg border transition-colors ${isSelected ? "border-terracotta-400 bg-terracotta-50/50" : "border-border/60 bg-background hover:border-terracotta-200"}`}>
                    <div role="button" tabIndex={0} onClick={() => handleToggleMeeting(meeting.id)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleToggleMeeting(meeting.id); } }} className="flex cursor-pointer items-center gap-3 px-4 py-3.5 text-right">
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${isSelected ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}>{isSelected && <Check className="h-3 w-3" />}</span>
                      <span className="flex-1 text-sm font-medium text-foreground">{meeting.title}</span>
                      <button type="button" onClick={(e) => handleToggleExpand(e, meeting.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-terracotta-100 hover:text-terracotta-600" aria-label={isExpanded ? "סגור תיאור" : "הצג תיאור"}>
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-border/40 px-4 pb-3 pt-2">
                        <p className="text-xs leading-relaxed text-muted-foreground">{meeting.description}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg bg-terracotta-50 p-4 text-sm leading-relaxed text-foreground">
              <strong className="text-terracotta-500">מפגש הכתובה האישית</strong> כלול תמיד - שם תסכמו את התהליך ותוכלו לכתוב ביחד מסמך בשפה שלכם.
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">כמה מפגשים מרגיש לכם ריאלי?</h2>
            <div className="flex gap-2">
              {["5", "6", "7", "8", "לא בטוחים"].map((val) => (
                <button key={val} type="button" onClick={() => setDesiredCount(val)} className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${desiredCount === val ? "border-terracotta-400 bg-terracotta-500 text-white" : "border-border/60 bg-background text-muted-foreground hover:border-terracotta-200"}`}>
                  {val === "לא בטוחים" ? "?" : val}
                </button>
              ))}
            </div>
          </section>

          {/* Free Text */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">הערות</h2>
            <p className="text-sm text-muted-foreground">רגישויות, משהו שאני צריכה לקחת בחשבון בהרכבת הערכה עבורכם? לגמרי אופציונלי.</p>
            <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="מה שבא לכם..." rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-terracotta-300" />
          </section>

          {/* Price Note */}
          <div className="rounded-xl border border-terracotta-200/60 bg-terracotta-50/50 px-6 py-5 text-center">
            <p className="mb-1 text-sm font-medium text-foreground">
              <span className="text-lg font-bold text-terracotta-500">250 ש&quot;ח</span>
              {" "}| כולל ערכה מותאמת אישית + משלוח עד הבית
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              אחרי שתשלחו את הטופס, אחזור אליכם בוואטסאפ לוודא את הפרטים.
              <br />רק אחרי שנסגור הכל - תשלום ואז הערכה יוצאת אליכם.
            </p>
          </div>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>}

          <Button size="lg" type="submit" className="w-full text-base">
            שליחה לליהי בוואטסאפ
          </Button>

          <p className="text-center text-xs text-muted-foreground">שליחת הטופס לא מחייבת תשלום. ניצור קשר בוואטסאפ תוך 24 שעות.</p>
        </form>
      </div>
    </div>
  );
}
