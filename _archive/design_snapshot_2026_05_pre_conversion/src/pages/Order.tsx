import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown, Heart, Gift, Instagram, Facebook } from "lucide-react";
import { isValidVoucher } from "@/data/vouchers";
import { trackEvent } from "@/lib/meta-pixel";
import { gtagEvent } from "@/lib/gtag";
import { getCafe } from "@/data/cafes";

const ease = [0.25, 0.1, 0.25, 1] as const;

const MAX_MEETINGS = 7;

const ALL_MEETINGS_PRICE = 370;
const ALL_MEETINGS_PAYBOX_URL = "https://links.payboxapp.com/q94p1IMvK1b";

const PROMO_CODES: Record<string, { price: number; payboxUrl: string; label: string }> = {
  "MILUIM": {
    price: 288,
    payboxUrl: "https://links.payboxapp.com/mOV9pLmmE2b",
    label: "הנחת 10%",
  },
};

const MEETINGS = [
  { id: "02", title: "שפות האהבה", description: "עוצרים להבין למה לפעמים אנחנו משקיעים המון אהבה שהצד השני פשוט לא מרגיש. בודקים מה למדנו על אהבה בבית, ולומדים להראות אותה בשפה שהשני באמת מבין." },
  { id: "03", title: "איך אנחנו רבים (ואיך חוזרים)", description: "מסתכלים בכנות על ה\"לופ\" הקבוע שלנו כשאנחנו כועסים, נסגרים או נפגעים. כותבים אחד לשני \"מדריך למשתמש\" - מה באמת עוזר ומה רק מחמיר כשאנחנו באמצע חיכוך, כדי לדעת איך לחזור לקרבה." },
  { id: "04", title: "האינטימיות שלנו", description: "מניחים את המבוכה בצד ומדברים על אינטימיות במובן הרחב - מקרבה פיזית ועד לבדיחה פרטית או מבט. משתפים ב\"מנועים והבלמים\" שלנו, ולומדים לדבר בטבעיות על הפערים בצרכים ובקצב שלנו." },
  { id: "05", title: "לדבר על כסף", description: "מבינים שמאחורי כל הוצאה מסתתרים צרכים אמיתיים כמו חופש או ביטחון. משתפים ביחס לכסף שהבאנו מהבית, ומדברים בלי לשפוט על סדרי העדיפויות שמתאימים לנו יחד." },
  { id: "12", title: "עבודה וקריירה", description: "מכירים בכך שהעבודה מעצבת את הקשר ומשפיעה על מה שנכנס איתנו הביתה בסוף היום. בודקים איפה השאיפות המקצועיות שלנו נפגשות או מתנגשות, ואיך נאזן ביניהן." },
  { id: "06", title: "המשפחות שלנו", description: "מדברים בפתיחות על ההבדלים והציפיות בין המשפחות שבהן גדלנו. בונים יחד גישה משותפת לחגים, למעורבות ולגבולות לפני שמצטברים מתחים, ומבינים איך כל אחד מאיתנו שומר על הזוגיות מול משפחת המקור שלו." },
  { id: "07", title: "הבית שאנחנו בונים", description: "בודקים מה הערך שעומד מאחורי ה\"ככה ברור שצריך\" שהבאנו איתנו מהבית. בוחרים אילו מנהגים והרגלים קטנים אנחנו רוצים ליצור בעצמנו כדי שהיומיום ירגיש באמת שלנו." },
  { id: "08", title: "עתיד וחלומות", description: "מורידים את הציניות, משתיקים את ה\"איך\", ונותנים מקום לחלומות - גם הגדולים וגם השקטים - שהשגרה דוחקת הצידה. משתפים בהרפתקאות שנרצה לחוות ובונים ציר זמן משותף קדימה." },
  { id: "09", title: "ילדים והורות", description: "מנקים את רעשי הרקע של הסביבה, ומדברים על מה שאנחנו באמת מרגישים לגבי משפחה כשכל בחירה היא לגיטימית. משתפים איזה הורים נרצה להיות ואיך נשמור על הזוגיות בתוך השינוי." },
  { id: "10", title: "כשקשה", description: "מדברים על מה שעוצר אותנו מלבקש עזרה, ומגלים דרך \"הסיפור שלך מהצד שלי\" איך הצד השני חווה את הרגעים הקשים שלנו. כותבים \"מדריך למשתמש\" שמסביר למה כל אחד מאיתנו באמת זקוק כשקשה." },
  { id: "13", title: "הכתובה שלנו", description: "מסתכלים אחורה על התהליך שעברנו ומתרגמים את התובנות להבטחות קטנות ומעשים קונקרטיים ליומיום. מגלים שגם בלי מסמך פורמלי, אנחנו יוצאים מכאן עם שפה משותפת שלא הייתה לנו קודם.", alwaysSelected: true },
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
  const refParam = searchParams.get("ref") || "";
  const cafePartner = refParam ? getCafe(refParam) : undefined;
  const isCafePickup = !!cafePartner;
  const initialFlow = isVoucherRedeem ? "self" : isCafePickup ? "self" : searchParams.get("flow") === "gift" ? "gift" : null;
  const [flowChoice, setFlowChoice] = useState<"self" | "gift" | null>(initialFlow);

  useEffect(() => {
    trackEvent("ViewContent", { content_name: "order_page", content_category: "order" });
    gtagEvent("begin_order", { flow: isVoucherRedeem ? "voucher_redeem" : "landing" });
  }, []);

  const [partner1, setPartner1] = useState(debug ? "יעל" : "");
  const [partner2, setPartner2] = useState(debug ? "תומר" : "");
  const [gender1, setGender1] = useState<"F" | "M" | "">(debug ? "F" : "");
  const [gender2, setGender2] = useState<"F" | "M" | "">(debug ? "M" : "");
  const [phone, setPhone] = useState(debug ? "050-1234567" : "");
  const [email, setEmail] = useState(debug ? "test@example.com" : "");
  const [weddingDate, setWeddingDate] = useState(debug ? "2026-09-15" : "");
  const [lastName, setLastName] = useState(debug ? "כהן" : "");
  const [city, setCity] = useState(debug ? "תל אביב" : "");
  const [street, setStreet] = useState(debug ? "דיזנגוף 99" : "");
  const [apartment, setApartment] = useState(debug ? "4" : "");
  const [zipCode, setZipCode] = useState(debug ? "6120101" : "");
  const [selectedMeetings, setSelectedMeetings] = useState<string[]>(debug ? ["02", "03", "05", "07", "08", "09"] : DEFAULT_SELECTION);
  const [allMeetings, setAllMeetings] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [showFreeText, setShowFreeText] = useState(false);
  const [modestLanguage, setModestLanguage] = useState(false);
  const [postWedding, setPostWedding] = useState(false);
  const [referralSource, setReferralSource] = useState(cafePartner ? "cafe" : "");
  const [referralOther, setReferralOther] = useState(cafePartner ? cafePartner.name : "");
  const [voucherCode, setVoucherCode] = useState(voucherParam || "");
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);

  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Gift flow state
  const [giverName, setGiverName] = useState("");
  const [giverPhone, setGiverPhone] = useState("");
  const [giverEmail, setGiverEmail] = useState("");
  const [coupleName1Gift, setCoupleName1Gift] = useState("");
  const [coupleName2Gift, setCoupleName2Gift] = useState("");
  const [giftWeddingDate, setGiftWeddingDate] = useState("");
  const [noDateYet, setNoDateYet] = useState(false);
  const [blessing, setBlessing] = useState("");
  const [giftDelivery, setGiftDelivery] = useState<"self" | "direct">("self");
  const [couplePhone, setCouplePhone] = useState("");
  const [coupleContactName, setCoupleContactName] = useState("");
  const [giftPostWedding, setGiftPostWedding] = useState(false);
  const [giftNotes, setGiftNotes] = useState("");
  const [showGiftNotes, setShowGiftNotes] = useState(false);
  const [giftAgreedToTerms, setGiftAgreedToTerms] = useState(false);
  const [giftError, setGiftError] = useState("");
  const [giftReview, setGiftReview] = useState(false);
  const [giftSubmitted, setGiftSubmitted] = useState(false);

  const activePromo = PROMO_CODES[voucherCode.trim().toUpperCase()] || null;
  const isPromoCode = !!activePromo;
  const isGiftVoucher = !isPromoCode && isValidVoucher(voucherCode);

  useEffect(() => {
    if (isVoucherRedeem || isGiftVoucher) {
      setAllMeetings(false);
      setSelectedMeetings((prev) => prev.length === MEETINGS.length ? DEFAULT_SELECTION : prev);
    }
  }, [isGiftVoucher, isVoucherRedeem]);

  const handleToggleMeeting = (id: string) => {
    if (allMeetings) return;
    const meeting = MEETINGS.find((m) => m.id === id);
    if (meeting?.alwaysSelected) return;
    setSelectedMeetings((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      const nonKetubah = prev.filter((m) => m !== "13");
      if (nonKetubah.length >= MAX_MEETINGS) return prev;
      return [...prev, id];
    });
  };

  const handleToggleAllMeetings = () => {
    setAllMeetings((prev) => {
      const next = !prev;
      if (next) {
        setSelectedMeetings(MEETINGS.map((m) => m.id));
      } else {
        setSelectedMeetings(DEFAULT_SELECTION);
      }
      return next;
    });
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
    if (!isCafePickup && (!city.trim() || !street.trim())) { setError("נא למלא כתובת למשלוח (עיר ורחוב)."); return; }
    if (!isCafePickup && !lastName.trim()) { setError("נא למלא שם משפחה למשלוח."); return; }
    if (!isCafePickup && !zipCode.trim()) { setError("נא למלא מיקוד."); return; }
    if (selectedMeetings.length === 0) { setError("נא לבחור לפחות מפגש אחד."); return; }
    if (!agreedToTerms) { setError("נא לאשר את תנאי השימוש."); return; }

    setReview(true);
    window.scrollTo(0, 0);
  };

  const handleConfirm = () => {
    const meetingNames = selectedMeetings.map((id) => MEETINGS.find((m) => m.id === id)?.title || id);

    fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partner1: partner1.trim(), partner2: partner2.trim(),
        gender1, gender2, phone: phone.trim(),
        email: email.trim() || null,
        weddingDate: weddingDate || null,
        address: isCafePickup
          ? { city: `איסוף: ${cafePartner!.name}`, street: cafePartner!.branches?.[0]?.address || cafePartner!.name, apartment: null, zipCode: "", lastName: "" }
          : { city: city.trim(), street: street.trim(), apartment: apartment.trim() || null, zipCode: zipCode.trim(), lastName: lastName.trim() },
        meetings: selectedMeetings,
        allMeetings,
        modestLanguage,
        postWedding,
        freeText: freeText.trim() || null,
        referralSource: referralSource ? (referralSource === "other" ? referralOther.trim() || "אחר" : referralSource === "cafe" ? `בית קפה - ${referralOther}` : referralSource) : null,
        voucherCode: isPromoCode ? null : (voucherCode.trim() || null),
        isVoucherRedeem,
        promoCode: isPromoCode ? voucherCode.trim() : null,
      }),
    }).catch(() => {});

    const orderValue = isPromoCode
      ? activePromo.price
      : (isVoucherRedeem || isGiftVoucher)
        ? 0
        : allMeetings
          ? ALL_MEETINGS_PRICE
          : 320;

    trackEvent("Lead", {
      content_name: "order_self",
      content_category: "order",
      value: orderValue,
      currency: "ILS",
    });

    gtagEvent("purchase", {
      currency: "ILS",
      value: orderValue,
      transaction_id: `order_${Date.now()}`,
      items: selectedMeetings.map((id) => ({
        item_id: id,
        item_name: MEETINGS.find((m) => m.id === id)?.title || id,
      })),
    });

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
    if (giftDelivery === "direct" && !coupleContactName.trim()) { setGiftError("נא למלא את שם בן/בת הזוג לפנייה."); return; }
    if (giftDelivery === "direct" && (!couplePhone.trim() || !isValidPhone(couplePhone))) { setGiftError("נא להזין מספר טלפון תקין של בן/בת הזוג."); return; }
    if (!giftAgreedToTerms) { setGiftError("נא לאשר את תנאי השימוש."); return; }

    setGiftReview(true);
    window.scrollTo(0, 0);
  };

  const handleGiftConfirm = () => {
    fetch("/api/gift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        giverName: giverName.trim(), giverPhone: giverPhone.trim(), giverEmail: giverEmail.trim(),
        coupleName1: coupleName1Gift.trim(), coupleName2: coupleName2Gift.trim(),
        weddingDate: noDateYet ? "עדיין לא יודעים" : giftWeddingDate,
        blessing: blessing.trim() || null,
        giftDelivery,
        coupleContactName: giftDelivery === "direct" ? coupleContactName.trim() : null,
        couplePhone: giftDelivery === "direct" ? couplePhone.trim() : null,
        postWedding: giftPostWedding,
        notes: giftNotes.trim() || null,
        referralSource: referralSource ? (referralSource === "other" ? referralOther.trim() || "אחר" : referralSource === "cafe" ? `בית קפה - ${referralOther}` : referralSource) : null,
      }),
    }).catch(() => {});

    trackEvent("Lead", {
      content_name: "order_gift",
      content_category: "gift",
      value: 320,
      currency: "ILS",
    });

    gtagEvent("gift_purchase", {
      currency: "ILS",
      value: 320,
      transaction_id: `gift_${Date.now()}`,
    });

    setGiftSubmitted(true);
    window.scrollTo(0, 0);
  };

  if (giftReview && !giftSubmitted) {
    const weddingDateDisplay = noDateYet ? "עדיין לא יודעים" : new Date(giftWeddingDate).toLocaleDateString("he-IL");
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease }}
        className="px-6 py-24 md:py-32"
      >
        <div className="mx-auto max-w-md">
          <h1 className="mb-2 text-center text-2xl font-bold text-foreground">לפני שנשלח - בואו נוודא</h1>
          <p className="mb-8 text-center text-sm text-muted-foreground">כדאי לבדוק שהפרטים נכונים, במיוחד שמות בני הזוג.</p>

          <div className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">הפרטים שלך</h3>
              <div className="space-y-1 text-sm text-foreground">
                <p>{giverName}</p>
                <p dir="ltr" className="text-left">{giverPhone}</p>
                <p dir="ltr" className="text-left">{giverEmail}</p>
              </div>
            </div>

            <hr className="border-border/40" />

            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">הזוג</h3>
              <div className="space-y-1 text-sm text-foreground">
                <p className="text-lg font-medium">{coupleName1Gift} ו{coupleName2Gift}</p>
                <p>מועד חתונה: {weddingDateDisplay}</p>
              </div>
            </div>

            {blessing.trim() && (
              <>
                <hr className="border-border/40" />
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">ברכה</h3>
                  <p className="text-sm text-foreground">{blessing}</p>
                </div>
              </>
            )}

            <hr className="border-border/40" />

            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">העברת השובר</h3>
              {giftDelivery === "direct" ? (
                <div className="space-y-1 text-sm text-foreground">
                  <p>שליחה ישירה ל{coupleContactName}</p>
                  <p dir="ltr" className="text-left">{couplePhone}</p>
                </div>
              ) : (
                <p className="text-sm text-foreground">אעביר את השובר בעצמי</p>
              )}
            </div>

            {(giftPostWedding || giftNotes.trim()) && (
              <>
                <hr className="border-border/40" />
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">הערות</h3>
                  {giftPostWedding && <p className="text-sm text-foreground">המפגשים יתקיימו אחרי החתונה</p>}
                  {giftNotes.trim() && <p className="text-sm text-foreground">{giftNotes}</p>}
                </div>
              </>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <Button size="lg" className="w-full text-base" onClick={handleGiftConfirm}>
              הכל נכון, שלחו!
            </Button>
            <Button size="lg" variant="outline" className="w-full text-base" onClick={() => { setGiftReview(false); window.scrollTo(0, 0); }}>
              רוצה לתקן משהו
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

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
          <p className="mb-8 text-muted-foreground">{giftDelivery === "direct"
            ? <>קיבלתי את הפרטים ואצור קשר עם {coupleName1Gift} ו{coupleName2Gift} ישירות כדי לשלוח להם את השובר.</>
            : <>קיבלתי את הפרטים ואצור איתך קשר בהקדם. תקבל/י שובר דיגיטלי שתוכל/י להעביר ל{coupleName1Gift} ו{coupleName2Gift} בזמן שלך.</>
          }</p>

          <div className="mb-8 rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-right">
            <h2 className="mb-1 text-center text-lg font-semibold text-foreground">תשלום</h2>
            <p className="mb-4 text-center text-sm text-muted-foreground">320 ₪ - אפשר לשלם כבר עכשיו באחת מהאופציות:</p>
            <div className="space-y-3">
              <a href="https://links.payboxapp.com/Ih0Zp6nsI1b" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg">₪</span>
                <div className="flex-1 text-right">
                  <div className="text-sm font-medium text-foreground">PayBox</div>
                </div>
              </a>
              <a href="https://www.paypal.com/ncp/payment/78MHBN2YDVLF6" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg">P</span>
                <div className="flex-1 text-right">
                  <div className="text-sm font-medium text-foreground">PayPal</div>
                </div>
              </a>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">אחרי התשלום אצור איתך קשר בוואטסאפ לאישור.</p>
          </div>

          <Button variant="outline" asChild><Link to="/">חזרה לעמוד הבית</Link></Button>
        </div>
      </motion.div>
    );
  }

  if (review && !submitted) {
    const meetingNames = selectedMeetings.map((id) => MEETINGS.find((m) => m.id === id)?.title || id);
    const weddingDateDisplay = weddingDate ? new Date(weddingDate).toLocaleDateString("he-IL") : "לא צוין";
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease }}
        className="px-6 py-24 md:py-32"
      >
        <div className="mx-auto max-w-md">
          <h1 className="mb-2 text-center text-2xl font-bold text-foreground">לפני שנשלח - בואו נוודא</h1>
          <p className="mb-8 text-center text-sm text-muted-foreground">כדאי לבדוק שהפרטים נכונים, במיוחד שמות בני הזוג.</p>

          <div className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">בני הזוג</h3>
              <div className="space-y-1 text-sm text-foreground">
                <p className="text-lg font-medium">{partner1} ו{partner2}</p>
                <p>מועד חתונה: {weddingDateDisplay}</p>
              </div>
            </div>

            <hr className="border-border/40" />

            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">פרטי קשר</h3>
              <div className="space-y-1 text-sm text-foreground">
                <p dir="ltr" className="text-left">{phone}</p>
                {email && <p dir="ltr" className="text-left">{email}</p>}
              </div>
            </div>

            <hr className="border-border/40" />

            <div>
              {isCafePickup ? (
                <>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">איסוף בבית קפה</h3>
                  <p className="text-sm text-foreground">{cafePartner!.name}</p>
                  <p className="text-xs text-terracotta-500">+ זוג כוסות קפה לדייט הראשון - עלינו</p>
                </>
              ) : (
                <>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">כתובת למשלוח</h3>
                  <p className="text-sm text-foreground">למשפחת {lastName}</p>
                  <p className="text-sm text-foreground">{street}{apartment ? `, דירה ${apartment}` : ""}, {city} {zipCode}</p>
                </>
              )}
            </div>

            <hr className="border-border/40" />

            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">מפגשים ({selectedMeetings.length})</h3>
              {allMeetings && (
                <p className="mb-2 rounded-md bg-terracotta-100/60 px-3 py-1.5 text-xs font-semibold text-terracotta-700">כל 11 המפגשים</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {meetingNames.map((name, i) => (
                  <span key={i} className="rounded-md bg-terracotta-100/60 px-2 py-0.5 text-xs font-medium text-terracotta-700">{name}</span>
                ))}
              </div>
            </div>

            {modestLanguage && (
              <>
                <hr className="border-border/40" />
                <p className="text-sm text-muted-foreground">התאמה לזוג דתי</p>
              </>
            )}

            {postWedding && (
              <>
                <hr className="border-border/40" />
                <p className="text-sm text-muted-foreground">המפגשים יתקיימו אחרי החתונה</p>
              </>
            )}

            {freeText.trim() && (
              <>
                <hr className="border-border/40" />
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">הערות</h3>
                  <p className="text-sm text-foreground">{freeText}</p>
                </div>
              </>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <Button size="lg" className="w-full text-base" onClick={handleConfirm}>
              הכל נכון, שלחו!
            </Button>
            <Button size="lg" variant="outline" className="w-full text-base" onClick={() => { setReview(false); window.scrollTo(0, 0); }}>
              רוצה לתקן משהו
            </Button>
          </div>
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
          <p className="mb-2 text-lg text-muted-foreground">{`תודה ${partner1} ו${partner2}.`}</p>
          {isCafePickup ? (
            <>
              <p className="mb-4 text-muted-foreground">קיבלנו את הפרטים. ניצור איתכם קשר בוואטסאפ כשהערכה מוכנה לאיסוף ב{cafePartner!.name}.</p>
              <p className="mb-8 text-sm font-medium text-terracotta-500">לא לשכוח - זוג כוסות קפה לדייט הראשון עלינו.</p>
            </>
          ) : (
            <p className="mb-8 text-muted-foreground">קודם כל מזל טוב! קיבלתי את הפרטים שלכם ואצור אתכם קשר בהקדם.</p>
          )}

          {isPromoCode ? (
          <div className="mb-8 rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-right">
            <h2 className="mb-1 text-center text-lg font-semibold text-foreground">תשלום - {activePromo.label}</h2>
            <p className="mb-4 text-center text-sm text-muted-foreground">{activePromo.price} ₪ (במקום 320 ₪)</p>
            <div className="space-y-3">
              <a href={activePromo.payboxUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg">₪</span>
                <div className="flex-1 text-right">
                  <div className="text-sm font-medium text-foreground">PayBox</div>
                </div>
              </a>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">אחרי התשלום אצור אתכם קשר בוואטסאפ לאישור.</p>
          </div>
          ) : (isVoucherRedeem || isGiftVoucher) ? (
          <div className="mb-8 rounded-xl border border-emerald-200/60 bg-emerald-50/40 px-6 py-5 text-center">
            <p className="text-base font-medium text-emerald-800">הערכה שולמה כבר כמתנה עבורכם, אין צורך בתשלום נוסף.</p>
          </div>
          ) : allMeetings ? (
          <div className="mb-8 rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-right">
            <h2 className="mb-1 text-center text-lg font-semibold text-foreground">תשלום - כל 11 המפגשים</h2>
            <p className="mb-4 text-center text-sm text-muted-foreground">{ALL_MEETINGS_PRICE} ₪ (במקום 320 ₪)</p>
            <div className="space-y-3">
              <a href={ALL_MEETINGS_PAYBOX_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg">₪</span>
                <div className="flex-1 text-right">
                  <div className="text-sm font-medium text-foreground">PayBox</div>
                </div>
              </a>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">אחרי התשלום אצור אתכם קשר בוואטסאפ לאישור.</p>
          </div>
          ) : (
          <div className="mb-8 rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-right">
            <h2 className="mb-1 text-center text-lg font-semibold text-foreground">תשלום</h2>
            <p className="mb-4 text-center text-sm text-muted-foreground">320 ₪ - אפשר לשלם כבר עכשיו באחת מהאופציות:</p>
            <div className="space-y-3">
              <a href="https://links.payboxapp.com/Ih0Zp6nsI1b" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg">₪</span>
                <div className="flex-1 text-right">
                  <div className="text-sm font-medium text-foreground">PayBox</div>
                </div>
              </a>
              <a href="https://www.paypal.com/ncp/payment/78MHBN2YDVLF6" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg">P</span>
                <div className="flex-1 text-right">
                  <div className="text-sm font-medium text-foreground">PayPal</div>
                </div>
              </a>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">אחרי התשלום אצור אתכם קשר בוואטסאפ לאישור.</p>
          </div>
          )}

          <div className="mb-8">
            <p className="mb-3 text-sm text-muted-foreground">מוזמנים לעקוב</p>
            <div className="flex justify-center gap-4">
              <a href="https://www.instagram.com/beshaatova.il/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-pink-500">
                <Instagram className="h-7 w-7" />
              </a>
              <a href="https://www.facebook.com/profile.php?id=61576780386510" target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-blue-600">
                <Facebook className="h-7 w-7" />
              </a>
            </div>
          </div>

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
        {isCafePickup ? (
          <div className="mb-8 text-center">
            <div className="mb-4 flex items-center justify-center gap-3">
              <img src="/logo-icon.png" alt="בשעה טובה" className="h-10 w-10" />
              <span className="text-sm font-bold text-terracotta-500">×</span>
              <img src={cafePartner!.logoUrl} alt={cafePartner!.name} className="h-12 w-auto object-contain" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-foreground md:text-3xl">הערכה שלכם תחכה ב{cafePartner!.name}</h1>
            <p className="text-sm text-muted-foreground">ממלאים פרטים, בוחרים מפגשים - ואנחנו מכינים הכל.</p>
          </div>
        ) : (
          <div className="mb-8 text-center">
            <img src="/logo-booklet.png" alt="בשעה טובה" className="mx-auto mb-4 h-20 w-auto" />
            <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">להזמנת הערכה</h1>
          </div>
        )}

        {/* Flow Chooser */}
        {!isVoucherRedeem && !isCafePickup && (
        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => { setFlowChoice("self"); gtagEvent("select_flow", { flow: "self" }); }}
            className={`group relative rounded-xl border-2 p-6 text-right transition-all duration-200 ${
              flowChoice === "self"
                ? "border-terracotta-400 bg-terracotta-50/60 shadow-sm"
                : "border-border/60 bg-warm-gray-50 hover:border-terracotta-200 hover:bg-warm-gray-50/80"
            }`}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-terracotta-100 text-terracotta-500">
              <Heart className="h-5 w-5" />
            </div>
            <h3 className="mb-1 text-base font-semibold text-foreground">אנחנו מזמינים לעצמנו</h3>
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
            onClick={() => { setFlowChoice("gift"); gtagEvent("select_flow", { flow: "gift" }); }}
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
            {isCafePickup ? (
              <>
                <h2 className="text-lg font-semibold text-foreground">איסוף בבית קפה</h2>
                <div className="flex items-center gap-3 rounded-lg border border-terracotta-200 bg-terracotta-50/60 px-4 py-3">
                  <img src={cafePartner!.logoUrl} alt={cafePartner!.name} className="h-10 w-10 rounded-full object-contain" />
                  <div>
                    <p className="text-sm font-bold text-foreground">הערכה תחכה לכם ב{cafePartner!.name}</p>
                    <p className="text-xs text-muted-foreground">+ זוג כוסות קפה לדייט הראשון שלכם - עלינו</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">נתאם איתכם מתי הערכה מוכנה לאיסוף.</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-foreground">כתובת למשלוח</h2>
                <p className="text-sm text-muted-foreground">לאן לשלוח את הערכה? החבילה מגיעה בדואר.</p>
              </>
            )}
            {!isCafePickup && (
            <>
            <div className="space-y-2">
              <Label htmlFor="lastName">שם ושם משפחה{" "}<span className="font-normal text-muted-foreground">(למשלוח)</span></Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="למשל: כהן" required />
            </div>
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
            </>
            )}
          </section>

          {/* Meetings */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">בחירת מפגשים</h2>
              {!allMeetings && (
                <span className="rounded-full bg-terracotta-100 px-3 py-1 text-xs font-medium text-terracotta-700">{selectedMeetings.filter(m => m !== "13").length}/{MAX_MEETINGS} נבחרו (+ כתובה)</span>
              )}
              {allMeetings && (
                <span className="rounded-full bg-terracotta-500 px-3 py-1 text-xs font-medium text-white">כל 11 המפגשים</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">בחרו 5-8 נושאים מתוך הבנק (מפגש הכתובה כלול תמיד). תתייעצו עם בן/בת הזוג, כי אלה הנושאים שתדברו עליהם. לחצו על החץ ליד כל מפגש כדי לקרוא עוד.</p>

            {/* All meetings toggle - hidden for gift voucher redemptions */}
            {!isVoucherRedeem && !isGiftVoucher && (
            <div
              role="button" tabIndex={0}
              onClick={handleToggleAllMeetings}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleToggleAllMeetings(); } }}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3.5 text-right transition-colors ${allMeetings ? "border-terracotta-500 bg-terracotta-50" : "border-dashed border-terracotta-300 bg-background hover:border-terracotta-400 hover:bg-terracotta-50/40"}`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${allMeetings ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-400"}`}>{allMeetings && <Check className="h-3 w-3" />}</span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-foreground">אנחנו רוצים את כל המפגשים</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">כל 11 הנושאים, בלי צורך לבחור · בעלות נוספת של 50 ₪</span>
              </span>
            </div>
            )}

            <div className={`space-y-2 transition-opacity ${allMeetings ? "opacity-50" : ""}`}>
              {MEETINGS.map((meeting) => {
                const isSelected = selectedMeetings.includes(meeting.id);
                const isExpanded = expandedMeeting === meeting.id;
                const isLocked = meeting.alwaysSelected || allMeetings;
                return (
                  <div key={meeting.id} className={`overflow-hidden rounded-lg border transition-colors ${isSelected ? "border-terracotta-400 bg-terracotta-50/50" : "border-border/60 bg-background hover:border-terracotta-200"}`}>
                    <div role="button" tabIndex={0} onClick={() => handleToggleMeeting(meeting.id)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleToggleMeeting(meeting.id); } }} className={`flex items-center gap-3 px-4 py-3.5 text-right ${isLocked ? "cursor-default" : "cursor-pointer"}`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${isSelected ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}>{isSelected && <Check className="h-3 w-3" />}</span>
                      <span className="flex-1 text-sm font-medium text-foreground">{meeting.title}{meeting.alwaysSelected && <span className="mr-2 text-xs font-normal text-terracotta-400">(כלול תמיד)</span>}</span>
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

          {/* Free Text + Modest Language */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">הערות והתאמה אישית</h2>
            <p className="text-sm text-muted-foreground">מעבר לבחירת המפגשים - אפשר לבקש כאן כל התאמה שחשובה לכם. רגישות מסוימת, דגש שחשוב לקחת בחשבון, עניין שקרוב לליבכם שהיינו רוצים להתעמק בו - כל מה שיעזור לי להתאים את התוכן עבורכם. לא חובה.</p>
            <label className="flex cursor-pointer items-start gap-3">
              <span
                role="checkbox" aria-checked={modestLanguage} tabIndex={0}
                onClick={() => setModestLanguage(!modestLanguage)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setModestLanguage(!modestLanguage); } }}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${modestLanguage ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
              >{modestLanguage && <Check className="h-3 w-3" />}</span>
              <span className="text-sm font-medium text-foreground">אנחנו זוג דתי ונשמח שהערכה תותאם עבורנו</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <span
                role="checkbox" aria-checked={postWedding} tabIndex={0}
                onClick={() => setPostWedding(!postWedding)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setPostWedding(!postWedding); } }}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${postWedding ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
              >{postWedding && <Check className="h-3 w-3" />}</span>
              <span className="text-sm font-medium text-foreground">כבר התחתנו / מתכננים לעשות את המפגשים אחרי החתונה</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <span
                role="checkbox" aria-checked={showFreeText} tabIndex={0}
                onClick={() => setShowFreeText(!showFreeText)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setShowFreeText(!showFreeText); } }}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${showFreeText ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
              >{showFreeText && <Check className="h-3 w-3" />}</span>
              <span className="text-sm font-medium text-foreground">משהו אחר</span>
            </label>
            {showFreeText && (
              <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-terracotta-300" />
            )}
          </section>

          {/* Referral Source */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">איך שמעת עלינו?</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "facebook", label: "פייסבוק" },
                { value: "instagram", label: "אינסטגרם" },
                { value: "friend", label: "חבר/ה" },
                { value: "whatsapp", label: "קבוצת ווטסאפ" },
                { value: "cafe", label: "בית קפה" },
                { value: "other", label: "אחר" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { setReferralSource(referralSource === option.value ? "" : option.value); if (option.value !== "other" && option.value !== "cafe") setReferralOther(""); }}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    referralSource === option.value
                      ? "border-terracotta-400 bg-terracotta-500 text-white"
                      : "border-border bg-background text-muted-foreground hover:border-terracotta-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {(referralSource === "other" || referralSource === "cafe") && (
              <Input
                value={referralOther}
                onChange={(e) => setReferralOther(e.target.value)}
                placeholder="ספרו לנו..."
                className="mt-2"
              />
            )}
          </section>

          {/* Voucher Code */}
          {!isVoucherRedeem && (
          <section className="space-y-3 rounded-xl border border-dashed border-terracotta-200 bg-terracotta-50/30 p-6">
            <h2 className="text-base font-semibold text-foreground">הכנסת קוד שובר</h2>
            <p className="text-sm text-muted-foreground">אם קיבלתם קוד שובר כמתנה שרכשו עבורכם או כהנחה, הזינו אותו כאן.</p>
            <Input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} placeholder="למשל: YAEL-TOMER-2609" />
          </section>
          )}

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>}

          <label className="flex cursor-pointer items-start gap-2.5">
            <span
              role="checkbox" aria-checked={agreedToTerms} tabIndex={0}
              onClick={() => setAgreedToTerms(!agreedToTerms)}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setAgreedToTerms(!agreedToTerms); } }}
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${agreedToTerms ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
            >{agreedToTerms && <Check className="h-3 w-3" />}</span>
            <span className="text-sm text-muted-foreground">
              קראתי ואני מסכים/ה ל<Link to="/terms" target="_blank" className="underline underline-offset-4 text-foreground hover:text-terracotta-600">תנאי השימוש ומדיניות הפרטיות</Link>
            </span>
          </label>

          {!isVoucherRedeem && (
          <div className="rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-5 text-center">
            {isPromoCode ? (
              <>
                <div className="text-2xl font-bold text-terracotta-600">{activePromo.price} &#8362;</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="line-through text-muted-foreground/60">320 ₪</span>
                  {" "}{activePromo.label} - כולל חוברת זוגית, שתי חוברות אישיות ומשלוח עד הבית
                </p>
              </>
            ) : isGiftVoucher ? (
              <>
                <div className="text-2xl font-bold text-emerald-600">0 &#8362;</div>
                <p className="mt-1 text-sm text-muted-foreground">שובר מתנה - הערכה כבר שולמה עבורכם</p>
              </>
            ) : allMeetings ? (
              <>
                <div className="text-2xl font-bold text-terracotta-600">{ALL_MEETINGS_PRICE} &#8362;</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="line-through text-muted-foreground/60">320 ₪</span>
                  {" "}כל 11 המפגשים - כולל חוברת זוגית, שתי חוברות אישיות ומשלוח עד הבית
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-terracotta-600">320 &#8362;</div>
                <p className="mt-1 text-sm text-muted-foreground">כולל חוברת זוגית, שתי חוברות אישיות ומשלוח עד הבית</p>
              </>
            )}
          </div>
          )}

          <Button size="lg" type="submit" className="w-full text-base">
            {isVoucherRedeem || isGiftVoucher ? "שליחת הטופס" : "להזמנה (תשלום לאחר מכן)"}
          </Button>

          {(isVoucherRedeem || isGiftVoucher) && (
            <p className="text-center text-xs text-muted-foreground">המתנה כבר שולמה - לאחר מילוי הטופס ניצור איתכם קשר.</p>
          )}
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
            <input type="text" value={blessing} onChange={(e) => setBlessing(e.target.value)} placeholder="למשל: בשעה טובה! שתמיד תמשיכו לדבר..." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-terracotta-300" />
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">איך תרצה/י להעביר את השובר?</h2>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors"
                style={{ borderColor: giftDelivery === "self" ? "var(--terracotta-400, #c2714f)" : undefined, backgroundColor: giftDelivery === "self" ? "var(--terracotta-50, #fdf5f2)" : undefined }}
                onClick={() => setGiftDelivery("self")}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${giftDelivery === "self" ? "border-terracotta-500" : "border-terracotta-300"}`}>
                  {giftDelivery === "self" && <span className="block h-2 w-2 rounded-full bg-terracotta-500" />}
                </span>
                <span className="text-sm text-foreground">אני אעביר את השובר בעצמי</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors"
                style={{ borderColor: giftDelivery === "direct" ? "var(--terracotta-400, #c2714f)" : undefined, backgroundColor: giftDelivery === "direct" ? "var(--terracotta-50, #fdf5f2)" : undefined }}
                onClick={() => setGiftDelivery("direct")}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${giftDelivery === "direct" ? "border-terracotta-500" : "border-terracotta-300"}`}>
                  {giftDelivery === "direct" && <span className="block h-2 w-2 rounded-full bg-terracotta-500" />}
                </span>
                <span className="text-sm text-foreground">אשמח שתשלחו את השובר ישירות לזוג</span>
              </label>
              {giftDelivery === "direct" && (
                <div className="space-y-4 pr-7">
                  <div className="space-y-2">
                    <Label htmlFor="coupleContactName">שם בן/בת הזוג לפנייה</Label>
                    <Input id="coupleContactName" value={coupleContactName} onChange={(e) => setCoupleContactName(e.target.value)} placeholder="לדוגמה: יעל" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="couplePhone">מספר הטלפון שלו/ה</Label>
                    <Input id="couplePhone" type="tel" dir="ltr" value={couplePhone} onChange={(e) => { const val = e.target.value.replace(/[^\d\s\-+()]/g, ""); setCouplePhone(val); }} placeholder="050-1234567" className="text-left" required />
                  </div>
                  <p className="text-xs text-muted-foreground">נשלח לו/ה הודעה עם השובר בוואטסאפ.</p>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">הערות והתאמה אישית</h2>
            <p className="text-sm text-muted-foreground">יש משהו שחשוב לך שנדע על הזוג? לא חובה.</p>
            <label className="flex cursor-pointer items-start gap-3">
              <span
                role="checkbox" aria-checked={giftPostWedding} tabIndex={0}
                onClick={() => setGiftPostWedding(!giftPostWedding)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setGiftPostWedding(!giftPostWedding); } }}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${giftPostWedding ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
              >{giftPostWedding && <Check className="h-3 w-3" />}</span>
              <span className="text-sm font-medium text-foreground">הזוג כבר התחתן / מתכננים לעשות את המפגשים אחרי החתונה</span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <span
                role="checkbox" aria-checked={showGiftNotes} tabIndex={0}
                onClick={() => setShowGiftNotes(!showGiftNotes)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setShowGiftNotes(!showGiftNotes); } }}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${showGiftNotes ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
              >{showGiftNotes && <Check className="h-3 w-3" />}</span>
              <span className="text-sm font-medium text-foreground">הערות נוספות</span>
            </label>
            {showGiftNotes && (
              <textarea value={giftNotes} onChange={(e) => setGiftNotes(e.target.value)} placeholder="מה שבא לכם..." rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-terracotta-300" />
            )}
          </section>

          {/* Referral Source (gift) */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6">
            <h2 className="text-lg font-semibold text-foreground">איך שמעת עלינו?</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "facebook", label: "פייסבוק" },
                { value: "instagram", label: "אינסטגרם" },
                { value: "friend", label: "חבר/ה" },
                { value: "whatsapp", label: "קבוצת ווטסאפ" },
                { value: "cafe", label: "בית קפה" },
                { value: "other", label: "אחר" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { setReferralSource(referralSource === option.value ? "" : option.value); if (option.value !== "other" && option.value !== "cafe") setReferralOther(""); }}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    referralSource === option.value
                      ? "border-terracotta-400 bg-terracotta-500 text-white"
                      : "border-border bg-background text-muted-foreground hover:border-terracotta-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {(referralSource === "other" || referralSource === "cafe") && (
              <Input
                value={referralOther}
                onChange={(e) => setReferralOther(e.target.value)}
                placeholder="ספרו לנו..."
                className="mt-2"
              />
            )}
          </section>

          {giftError && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{giftError}</p>}

          <div className="rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-5 text-center">
            <div className="text-2xl font-bold text-terracotta-600">320 &#8362;</div>
            <p className="mt-1 text-sm text-muted-foreground">כולל ערכה מותאמת אישית + משלוח עד הבית</p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <span
              role="checkbox" aria-checked={giftAgreedToTerms} tabIndex={0}
              onClick={() => setGiftAgreedToTerms(!giftAgreedToTerms)}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setGiftAgreedToTerms(!giftAgreedToTerms); } }}
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${giftAgreedToTerms ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
            >{giftAgreedToTerms && <Check className="h-3 w-3" />}</span>
            <span className="text-sm text-muted-foreground">
              קראתי ואני מסכים/ה ל<Link to="/terms" target="_blank" className="underline underline-offset-4 text-foreground hover:text-terracotta-600">תנאי השימוש ומדיניות הפרטיות</Link>
            </span>
          </label>

          <Button size="lg" type="submit" className="w-full text-base">
            הזמנת שובר מתנה
          </Button>
        </motion.form>
        )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
