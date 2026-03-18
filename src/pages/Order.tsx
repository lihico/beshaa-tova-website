import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown, Heart, Gift } from "lucide-react";

const ease = [0.25, 0.1, 0.25, 1] as const;

const PAYPAL_LINK = "https://www.paypal.com/ncp/payment/XABDWNB7LSMN4";

const MEETINGS = [
  { id: "02", title: "שפות האהבה", description: "לכל אחד מאיתנו יש דרך אחרת להרגיש אהוב. פה תגלו מה עושה את זה לכל אחד מכם - ואיך להשתמש בזה." },
  { id: "03", title: "איך אנחנו רבים (ואיך חוזרים)", description: "כל זוג רב. השאלה היא מה קורה אחרי. מפגש על הדפוסים שלכם ועל הדרך חזרה לקרבה." },
  { id: "04", title: "האינטימיות שלנו", description: "מקום בטוח לדבר על רצונות, גבולות וציפיות - בלי מבוכה ובלי שיפוטיות." },
  { id: "05", title: "לדבר על כסף", description: "מה ספגנו מהבית, מה מפחיד, ומה באמת חשוב לכל אחד. שיחה שרוב הזוגות דוחים - וחבל." },
  { id: "12", title: "עבודה וקריירה", description: "שאיפות, ויתורים, ואיזון בית-עבודה. מה קורה כשיש הזדמנות שמשנה הכל?" },
  { id: "06", title: "המשפחות שלנו", description: "מה לוקחים מהבית, מה משאירים, ואיך שומרים על הזוגיות כשמשפחות מתערבות." },
  { id: "07", title: "הבית שאנחנו בונים", description: "סדר, ניקיון, בישול, כבסים - מי עושה מה? שיחה על השגרה שתיצרו יחד." },
  { id: "08", title: "עתיד וחלומות", description: "איפה אתם רואים את עצמכם בעוד 5 שנים? ואיפה החלומות שלכם נפגשים?" },
  { id: "09", title: "ילדים והורות", description: "אם, מתי, כמה - ואיזה הורים אתם רוצים להיות? שיחה שכדאי לנהל לפני." },
  { id: "10", title: "כשקשה", description: "איך נעמוד בזה יחד כשיגיע משבר, עומס, או שינוי שלא תכננו?" },
  { id: "13", title: "הכתובה שלנו", description: "מפגש סיכום - תסכמו את התהליך ותכתבו ביחד מסמך בשפה שלכם.", alwaysSelected: true },
];

const DEFAULT_SELECTION = ["02", "03", "06", "07", "13"];

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits.length === 12;
  if (digits.startsWith("0")) return digits.length === 10;
  return digits.length >= 9 && digits.length <= 15;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function Order() {
  const [searchParams] = useSearchParams();
  const debug = searchParams.get("debug") === "true";
  const voucherParam = searchParams.get("voucher") || "";
  const isVoucherRedeem = !!voucherParam;
  const initialFlow = isVoucherRedeem ? "self" : searchParams.get("flow") === "gift" ? "gift" : null;
  const [flowChoice, setFlowChoice] = useState<"self" | "gift" | null>(initialFlow);

  const [partner1, setPartner1] = useState(debug ? "יעל" : "");
  const [partner2, setPartner2] = useState(debug ? "תומר" : "");
  const [gender1, setGender1] = useState<"F" | "M" | "">(debug ? "F" : "");
  const [gender2, setGender2] = useState<"F" | "M" | "">(debug ? "M" : "");
  const [phone, setPhone] = useState(debug ? "050-1234567" : "");
  const [email, setEmail] = useState(debug ? "test@example.com" : "");
  const [weddingDate, setWeddingDate] = useState(debug ? "2026-09-15" : "");
  const [city, setCity] = useState(debug ? "תל אביב" : "");
  const [street, setStreet] = useState(debug ? "דיזנגוף 99" : "");
  const [apartment, setApartment] = useState(debug ? "4" : "");
  const [zipCode, setZipCode] = useState(debug ? "6120101" : "");
  const [selectedMeetings, setSelectedMeetings] = useState<string[]>(debug ? ["02", "03", "05", "07", "08", "09"] : DEFAULT_SELECTION);
  const [freeText, setFreeText] = useState("");
  const [voucherCode, setVoucherCode] = useState(voucherParam || "");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);

  // Gift flow state
  const [giverName, setGiverName] = useState("");
  const [giverPhone, setGiverPhone] = useState("");
  const [giverEmail, setGiverEmail] = useState("");
  const [coupleName1Gift, setCoupleName1Gift] = useState("");
  const [coupleName2Gift, setCoupleName2Gift] = useState("");
  const [giftWeddingDate, setGiftWeddingDate] = useState("");
  const [noDateYet, setNoDateYet] = useState(false);
  const [blessing, setBlessing] = useState("");
  const [giftError, setGiftError] = useState("");
  const [giftSubmitted, setGiftSubmitted] = useState(false);

  const handleToggleMeeting = (id: string) => {
    const meeting = MEETINGS.find((m) => m.id === id);
    if (meeting?.alwaysSelected) return;
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
    if (!isValidPhone(phone)) { setError("מספר הטלפון לא תקין - צריך להיות 10 ספרות (למשל 050-1234567)."); return; }
    if (email.trim() && !isValidEmail(email)) { setError("כתובת המייל לא תקינה."); return; }
    if (!city.trim() || !street.trim()) { setError("נא למלא כתובת למשלוח (עיר ורחוב)."); return; }
    if (!zipCode.trim()) { setError("נא למלא מיקוד."); return; }
    if (selectedMeetings.length === 0) { setError("נא לבחור לפחות מפגש אחד."); return; }

    const genderLabel = (g: string) => g === "F" ? "נ" : "ז";
    const meetingNames = selectedMeetings.map((id) => MEETINGS.find((m) => m.id === id)?.title || id);

    fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partner1: partner1.trim(), partner2: partner2.trim(),
        gender1, gender2, phone: phone.trim(),
        email: email.trim() || null,
        weddingDate: weddingDate || null,
        address: { city: city.trim(), street: street.trim(), apartment: apartment.trim() || null, zipCode: zipCode.trim() },
        meetings: selectedMeetings,
        freeText: freeText.trim() || null,
        voucherCode: voucherCode.trim() || null,
        isVoucherRedeem,
      }),
    }).catch(() => {});

    if (!isVoucherRedeem) {
      window.open(PAYPAL_LINK, "_blank");
    }
    setSubmitted(true);
    window.scrollTo(0, 0);
  };

  const handleGiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGiftError("");

    if (!giverName.trim()) { setGiftError("נא למלא את השם שלך."); return; }
    if (!giverPhone.trim() || !isValidPhone(giverPhone)) { setGiftError("נא להזין מספר טלפון תקין."); return; }
    if (!giverEmail.trim() || !isValidEmail(giverEmail)) { setGiftError("נא להזין כתובת מייל תקינה."); return; }
    if (!coupleName1Gift.trim() || !coupleName2Gift.trim()) { setGiftError("נא למלא את שמות שני בני הזוג."); return; }
    if (!noDateYet && !giftWeddingDate) { setGiftError("נא לבחור תאריך חתונה, או לסמן שעדיין לא ידוע."); return; }

    fetch("/api/gift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        giverName: giverName.trim(), giverPhone: giverPhone.trim(), giverEmail: giverEmail.trim(),
        coupleName1: coupleName1Gift.trim(), coupleName2: coupleName2Gift.trim(),
        weddingDate: noDateYet ? "עדיין לא יודעים" : giftWeddingDate,
        blessing: blessing.trim() || null,
      }),
    }).catch(() => {});

    window.open(PAYPAL_LINK, "_blank");
    setGiftSubmitted(true);
    window.scrollTo(0, 0);
  };

  if (giftSubmitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="px-6 py-24 md:py-32"
      >
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 h-28 w-28">
            <img src="/illustrations/confirmation-envelope.png" alt="" className="h-full w-full object-contain illustration-fade-soft" />
          </div>
          <h1 className="mb-4 text-3xl font-bold text-foreground">הפנייה נשלחה!</h1>
          <p className="mb-2 text-lg text-muted-foreground">תודה {giverName}!</p>
          <p className="mb-8 text-muted-foreground">קיבלתי את הפרטים ואצור איתך קשר בהקדם. תקבל/י שובר דיגיטלי שתוכל/י להעביר ל{coupleName1Gift} ו{coupleName2Gift} בזמן שלך.</p>
          <Button variant="outline" asChild><Link to="/">חזרה לעמוד הבית</Link></Button>
        </div>
      </motion.div>
    );
  }

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="px-6 py-24 md:py-32"
      >
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 h-28 w-28">
            <img src="/illustrations/confirmation-envelope.png" alt="" className="h-full w-full object-contain illustration-fade-soft" />
          </div>
          <h1 className="mb-4 text-3xl font-bold text-foreground">הפנייה נשלחה!</h1>
          <p className="mb-2 text-lg text-muted-foreground">תודה {partner1} ו{partner2}.</p>
          <p className="mb-8 text-muted-foreground">קודם כל מזל טוב! קיבלתי את הפרטים שלכם ואצור אתכם קשר בהקדם.</p>
          <Button variant="outline" asChild><Link to="/">חזרה לעמוד הבית</Link></Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className="px-6 py-8 md:py-12"
    >
      <div className="mx-auto max-w-xl">
        <div className="mb-8 text-center">
          <img src="/logo-booklet.png" alt="בשעה טובה" className="mx-auto mb-4 h-20 w-auto" />
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">להזמנת הערכה</h1>
        </div>

        {/* Flow Chooser */}
        {!isVoucherRedeem && (
        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setFlowChoice("self")}
            className={`group relative rounded-xl border-2 p-6 text-right transition-all duration-200 ${
              flowChoice === "self"
                ? "border-terracotta-400 bg-terracotta-50/60 shadow-sm"
                : "border-border/60 bg-warm-gray-50 hover:border-terracotta-200 hover:bg-warm-gray-50/80"
            }`}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-terracotta-100 text-terracotta-500">
              <Heart className="h-5 w-5" />
            </div>
            <h3 className="mb-1 text-base font-semibold text-foreground">אנחנו לפני חתונה</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              ממלאים שאלון קצר, בוחרים מפגשים, והערכה מגיעה אליכם הביתה.
            </p>
            {flowChoice === "self" && (
              <div className="absolute left-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-terracotta-500 text-white">
                <Check className="h-3 w-3" />
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() => setFlowChoice("gift")}
            className={`group relative rounded-xl border-2 p-6 text-right transition-all duration-200 ${
              flowChoice === "gift"
                ? "border-terracotta-400 bg-terracotta-50/60 shadow-sm"
                : "border-border/60 bg-warm-gray-50 hover:border-terracotta-200 hover:bg-warm-gray-50/80"
            }`}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-terracotta-100 text-terracotta-500">
              <Gift className="h-5 w-5" />
            </div>
            <h3 className="mb-1 text-base font-semibold text-foreground">קונה כמתנה לזוג</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              משלמים ומקבלים שובר עם קוד. הזוג ממלא בעצמו ומרכיב ערכה מותאמת.
            </p>
            {flowChoice === "gift" && (
              <div className="absolute left-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-terracotta-500 text-white">
                <Check className="h-3 w-3" />
              </div>
            )}
          </button>
        </div>
        )}

        {/* Voucher redeem banner */}
        {isVoucherRedeem && (
          <div className="mb-10 rounded-xl border border-terracotta-200/60 bg-terracotta-50/50 px-6 py-5 text-center">
            <div className="mb-1 text-sm text-muted-foreground">שובר מתנה</div>
            <div className="mb-2 text-lg font-bold tracking-wide text-terracotta-600" dir="ltr">{voucherCode}</div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">סכום לתשלום:</span>
              <span className="text-xl font-bold text-terracotta-600">0 &#8362;</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">המתנה כבר שולמה - רק מלאו את הפרטים.</p>
          </div>
        )}

        {/* Questionnaire - visible only after choosing "self" */}
        <AnimatePresence mode="wait">
        {flowChoice === "self" && (
        <motion.form
          key="self-form"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease }}
          onSubmit={handleSubmit}
          className="space-y-8"
        >
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
              <Label htmlFor="email">מייל{" "}<span className="font-normal text-muted-foreground">(לא חובה, לגיבוי)</span></Label>
              <Input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="text-left" />
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
                <Label htmlFor="street">רחוב ומספר</Label>
                <Input id="street" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="למשל: הרצל 10" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apartment">דירה{" "}<span className="font-normal text-muted-foreground">(לא חובה)</span></Label>
                <Input id="apartment" value={apartment} onChange={(e) => setApartment(e.target.value)} placeholder="מספר דירה" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">עיר</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="למשל: תל אביב" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zipCode">מיקוד</Label>
                <Input id="zipCode" value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="למשל: 6120101" required />
              </div>
            </div>
          </section>

          {/* Meetings */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">בחירת מפגשים</h2>
              <span className="rounded-full bg-terracotta-100 px-3 py-1 text-xs font-medium text-terracotta-700">{selectedMeetings.length} נבחרו (5-7 אידיאלי)</span>
            </div>
            <p className="text-sm text-muted-foreground">שווה להשקיע מחשבה ולבחור יחד - תתייעצו עם בן/בת הזוג, כי אלה הנושאים שתדברו עליהם. לחצו על החץ ליד כל מפגש כדי לקרוא עוד.</p>
            <div className="space-y-2">
              {MEETINGS.map((meeting) => {
                const isSelected = selectedMeetings.includes(meeting.id);
                const isExpanded = expandedMeeting === meeting.id;
                const isLocked = meeting.alwaysSelected;
                return (
                  <div key={meeting.id} className={`overflow-hidden rounded-lg border transition-colors ${isSelected ? "border-terracotta-400 bg-terracotta-50/50" : "border-border/60 bg-background hover:border-terracotta-200"}`}>
                    <div role="button" tabIndex={0} onClick={() => handleToggleMeeting(meeting.id)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleToggleMeeting(meeting.id); } }} className={`flex items-center gap-3 px-4 py-3.5 text-right ${isLocked ? "cursor-default" : "cursor-pointer"}`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${isSelected ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}>{isSelected && <Check className="h-3 w-3" />}</span>
                      <span className="flex-1 text-sm font-medium text-foreground">{meeting.title}{isLocked && <span className="mr-2 text-xs font-normal text-terracotta-400">(כלול תמיד)</span>}</span>
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
          </section>

          {/* Free Text */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">הערות</h2>
            <p className="text-sm text-muted-foreground">רגישויות, משהו שאני צריכה לקחת בחשבון בהרכבת הערכה עבורכם? לא חובה.</p>
            <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="מה שבא לכם..." rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-terracotta-300" />
          </section>

          {/* Voucher Code */}
          {!isVoucherRedeem && (
          <section className="space-y-3 rounded-xl border border-dashed border-terracotta-200 bg-terracotta-50/30 p-6">
            <h2 className="text-base font-semibold text-foreground">קיבלתם שובר כמתנה?</h2>
            <p className="text-sm text-muted-foreground">אם קיבלתם קוד שובר ממי שרכש עבורכם, הזינו אותו כאן. אם לא - פשוט דלגו.</p>
            <Input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} placeholder="למשל: YAEL-TOMER-2609" />
          </section>
          )}

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>}

          <Button size="lg" type="submit" className="w-full text-base">
            {isVoucherRedeem ? "להזמנת הערכה" : "לתשלום"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {isVoucherRedeem
              ? "המתנה כבר שולמה - לאחר מילוי הטופס ניצור איתכם קשר."
              : "לאחר מילוי הטופס תועברו לדף תשלום מאובטח."}
          </p>
        </motion.form>
        )}
        {flowChoice === "gift" && (
        <motion.form
          key="gift-form"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease }}
          onSubmit={handleGiftSubmit}
          className="space-y-8"
        >
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
                <Label htmlFor="coupleName1Gift">שם פרטי (בן/בת זוג 1)</Label>
                <Input id="coupleName1Gift" value={coupleName1Gift} onChange={(e) => setCoupleName1Gift(e.target.value)} placeholder="לדוגמה: יעל" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coupleName2Gift">שם פרטי (בן/בת זוג 2)</Label>
                <Input id="coupleName2Gift" value={coupleName2Gift} onChange={(e) => setCoupleName2Gift(e.target.value)} placeholder="לדוגמה: תומר" required />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">מועד החתונה</h2>
            <div className="space-y-3">
              <Input id="giftWeddingDate" type="date" dir="ltr" value={giftWeddingDate} onChange={(e) => { setGiftWeddingDate(e.target.value); if (e.target.value) setNoDateYet(false); }} disabled={noDateYet} className="text-left" />
              <label className="flex cursor-pointer items-center gap-2.5">
                <span
                  role="checkbox" aria-checked={noDateYet} tabIndex={0}
                  onClick={() => { setNoDateYet(!noDateYet); if (!noDateYet) setGiftWeddingDate(""); }}
                  onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setNoDateYet(!noDateYet); if (!noDateYet) setGiftWeddingDate(""); } }}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${noDateYet ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
                >{noDateYet && <Check className="h-3 w-3" />}</span>
                <span className="text-sm text-muted-foreground">עדיין לא יודעים</span>
              </label>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">רוצה לצרף כמה מילים?</h2>
            <p className="text-sm text-muted-foreground">ברכה קצרה שתצורף עם המתנה. לא חובה.</p>
            <textarea value={blessing} onChange={(e) => setBlessing(e.target.value)} placeholder="למשל: מזל טוב! שתמיד תמשיכו לדבר..." rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-terracotta-300" />
          </section>

          {giftError && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{giftError}</p>}

          <Button size="lg" type="submit" className="w-full text-base">
            לתשלום
          </Button>

          <p className="text-center text-xs text-muted-foreground">לאחר התשלום תקבלו שובר דיגיטלי להעברה לזוג.</p>
        </motion.form>
        )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
