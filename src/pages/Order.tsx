import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown, Heart, Gift, Instagram, Facebook } from "lucide-react";
import { isValidVoucher, AUTO_VOUCHER_CODE } from "@/data/vouchers";
import { trackEvent } from "@/lib/meta-pixel";
import { gtagEvent } from "@/lib/gtag";
import { trackFunnel, trackInitiateCheckoutOnce, getFbc, getFbp, getVisitorId, getSessionId } from "@/lib/tracking";
import { getCafe } from "@/data/cafes";
import { captureAttribution, getAttribution, getAttributionState, getGaClientId, getGaSessionId } from "@/lib/attribution";
import { type OrderResponse, readOrderResponse, isPaymentUrl, goToPayment, rememberOrder } from "@/lib/payment";
import { NEW_PRICES, PRICES, quoteNow } from "@/lib/prices";
import { consentForOrder } from "@/lib/consent";
import { errorReason, trackCta, trackFormDone, trackFormError, trackFormStep, trackPriceSeen, useSeenOnce } from "@/lib/behavior";
import { partnerShareHref } from "@/lib/share";
import { TierPicker, TIER_COPY, sellableTiers } from "@/components/TierPicker";
import { TIER_MEETINGS, isKitTier, kitPrice, type KitTier } from "../../api/_price_table";
import { trackTierSelect } from "@/lib/behavior";
import { FRIEND_CODES_10PCT } from "../../api/_friend_codes_10pct";

const ease = [0.25, 0.1, 0.25, 1] as const;

// Until the payment clearing (Grow) is set up: after an order, show "we received it, we will send a payment link"
// instead of the PayBox/PayPal buttons. Set to false to bring the buttons back. (Lihi, 30.10.2026; draft, copy awaiting her approval)
const PAYMENT_LINK_BY_WHATSAPP = true;

// The PayBox / PayPal buttons below are fixed-amount links for the 2026-10 prices (320 / 370 / 288). They
// are never shown with the new price table (NEW_PRICES=1), whatever PAYMENT_LINK_BY_WHATSAPP says.
const SHOW_LEGACY_PAY_LINKS = !PAYMENT_LINK_BY_WHATSAPP && !NEW_PRICES;

// O1/O2 (Lihi, 14.11.2026): the kit decides how many meetings to pick: 4 (lite), 8, or all 11 (TIER_MEETINGS).

// All prices come from one table (src/lib/prices.ts -> api/_price_table.ts), shared with the server.
const ALL_MEETINGS_PAYBOX_URL = "https://links.payboxapp.com/q94p1IMvK1b";   // 370, 2026-10 prices only
const PROMO_10_PAYBOX_URL = "https://links.payboxapp.com/mOV9pLmmE2b";        // 288, 2026-10 prices only

interface Promo { pct: number; label: string; payboxUrl: string | null; allMeetingsPayboxUrl: string | null }

/** PayBox links are fixed-amount: only the 2026-10 10% base price (288) has one. */
function promoFor(pct: number): Promo {
  return { pct, label: `הנחת ${pct}%`, payboxUrl: !NEW_PRICES && pct === 10 ? PROMO_10_PAYBOX_URL : null, allMeetingsPayboxUrl: null };
}

// MILUIM removed 21.10.2026: the reserve-duty discount (5%) is now given case by case by Lihi,
// and the site shows the regular price. Built-in codes mirror api/_pricing.ts (BUILTIN_PROMO_CODES).
const PROMO_CODES = new Set(["STUDENT2026"]);

// Friend vouchers printed in every kit since 13.7: "<couple-id>-gift" (PRICES.friendPct off).
const FRIEND_GIFT_CODE = /^[a-z0-9-]+-gift$/i;

function getPromo(code: string): Promo | null {
  const trimmed = code.trim();
  if (PROMO_CODES.has(trimmed.toUpperCase())) return promoFor(PRICES.promoPct);
  if (!FRIEND_GIFT_CODE.test(trimmed)) return null;
  // Cards printed before 3.11.2026 say 10% and keep it; newer cards are PRICES.friendPct (mirrors api/_pricing.ts).
  const couple = trimmed.toLowerCase().replace(/-gift$/, "");
  return promoFor(FRIEND_CODES_10PCT.has(couple) ? Math.max(PRICES.friendPct, 10) : PRICES.friendPct);
}

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
  // O2: the ketubah meeting is optional (only if they want it) and counts within the number.
  { id: "13", title: "הכתובה שלנו", description: "מסתכלים אחורה על התהליך שעברנו ומתרגמים את התובנות להבטחות קטנות ומעשים קונקרטיים ליומיום. מגלים שגם בלי מסמך פורמלי, אנחנו יוצאים מכאן עם שפה משותפת שלא הייתה לנו קודם.", optional: true },
];

const DEFAULT_SELECTION = ["02", "03", "06", "07", "13"];

/** The starting selection for a kit: none for lite, today's five for 8, everything for 11. */
function defaultSelection(t: KitTier): string[] {
  return t === "all" ? MEETINGS.map((m) => m.id) : t === "lite" ? [] : DEFAULT_SELECTION;
}

type VoucherCheckStatus = "checking" | "valid" | "invalid" | "redeemed" | "error" | "promo";

const VOUCHER_REDEEMED_MSG = "השובר הזה כבר מומש. אם זו טעות, כתבו לי בוואטסאפ ואבדוק.";

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits.length === 12;
  if (digits.startsWith("0")) return digits.length === 10;
  return digits.length >= 9 && digits.length <= 15;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const PHOTO_MAX_SIDE = 1800;
const PHOTO_MAX_BYTES = 1_500_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

/** Resize to PHOTO_MAX_SIDE and re-encode as JPEG under PHOTO_MAX_BYTES; returns a data URL. Throws "decode" or "too-big". */
async function compressPhoto(file: File): Promise<string> {
  const img = await loadImage(file);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new Error("decode");
  let side = Math.min(PHOTO_MAX_SIDE, Math.max(w0, h0));
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = side / Math.max(w0, h0);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("decode");
    ctx.fillStyle = "#ffffff"; // transparent PNGs would turn black in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.88, 0.8, 0.7, 0.6]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const bytes = Math.ceil(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
      if (bytes <= PHOTO_MAX_BYTES) return dataUrl;
    }
    side = Math.round(side * 0.75);
  }
  throw new Error("too-big");
}

export default function Order() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const previewConversion = searchParams.get("preview") === "conversion";
  const debug = searchParams.get("debug") === "true";
  const voucherParam = searchParams.get("voucher") || "";
  const isVoucherRedeem = !!voucherParam;
  const refParam = searchParams.get("ref") || "";
  const cafePartner = refParam ? getCafe(refParam) : undefined;
  const isCafePickup = !!cafePartner;
  const promoParam = searchParams.get("promo") || "";
  const hasPromoParam = !!getPromo(promoParam);
  const initialFlow = isVoucherRedeem ? "self" : isCafePickup ? "self" : hasPromoParam ? "self" : searchParams.get("flow") === "gift" ? "gift" : null;
  const [flowChoice, setFlowChoice] = useState<"self" | "gift" | null>(initialFlow ?? (debug ? "self" : null));

  useEffect(() => {
    // ViewContent - mirror to CAPI via trackFunnel so we get deduped + adblock-resistant data.
    trackFunnel({
      event: "ViewContent",
      contentName: "order_page",
      contentCategory: "order",
    });
    gtagEvent("begin_order", { flow: isVoucherRedeem ? "voucher_redeem" : "landing" });
  }, []);

  const [partner1, setPartner1] = useState(debug ? "יעל" : "");
  const [partner2, setPartner2] = useState(debug ? "תומר" : "");
  const [gender1, setGender1] = useState<"F" | "M" | "">(debug ? "F" : "");
  const [gender2, setGender2] = useState<"F" | "M" | "">(debug ? "M" : "");
  const [phone, setPhone] = useState(debug ? "050-1234567" : "");
  const [partnerPhone, setPartnerPhone] = useState("");
  const [email, setEmail] = useState(debug ? "test@example.com" : "");
  const [weddingDate, setWeddingDate] = useState(debug ? "2026-09-15" : "");
  const [lastName, setLastName] = useState(debug ? "כהן" : "");
  const [city, setCity] = useState(debug ? "תל אביב" : "");
  const [street, setStreet] = useState(debug ? "דיזנגוף 99" : "");
  const [apartment, setApartment] = useState(debug ? "4" : "");
  const [zipCode, setZipCode] = useState(debug ? "6120101" : "");
  // ?tier=lite|base|all from the home price cards (P1) or a gift link; only a tier the live table sells.
  const tierParam = searchParams.get("tier");
  const [tier, setTier] = useState<KitTier>(isKitTier(tierParam) && sellableTiers(initialFlow === "gift").includes(tierParam) ? tierParam : "base");
  const allMeetings = tier === "all";
  const [selectedMeetings, setSelectedMeetings] = useState<string[]>(debug ? ["02", "03", "05", "06", "07", "08", "09", "13"] : defaultSelection(isKitTier(tierParam) ? tierParam : "base"));
  const [express, setExpress] = useState(false);
  const [freeText, setFreeText] = useState(debug ? "בדיקת מערכת (debug)" : "");
  const [showFreeText, setShowFreeText] = useState(debug);
  const [modestLanguage, setModestLanguage] = useState(false);
  const [shabbat, setShabbat] = useState(false);
  const [postWedding, setPostWedding] = useState(false);
  // Always send a receipt by email; no checkbox (Lihi, 4.11.2026).
  const wantReceipt = true;
  const [notEngaged, setNotEngaged] = useState(false);
  const [referralSource, setReferralSource] = useState(cafePartner ? "cafe" : debug ? "instagram" : "");
  const [referralOther, setReferralOther] = useState(cafePartner ? cafePartner.name : "");
  const [voucherCode, setVoucherCode] = useState(voucherParam || (hasPromoParam ? promoParam : ""));
  const [attribution] = useState(() => { captureAttribution(searchParams.toString()); return getAttribution(); });
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResponse | null>(null);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);

  const [agreedToTerms, setAgreedToTerms] = useState(debug);

  // Gift flow state
  const [giverName, setGiverName] = useState(debug ? "דנה בדיקה" : "");
  const [giverPhone, setGiverPhone] = useState(debug ? "050-7654321" : "");
  const [giverEmail, setGiverEmail] = useState(debug ? "test@example.com" : "");
  const [coupleName1Gift, setCoupleName1Gift] = useState(debug ? "נועה" : "");
  const [coupleName2Gift, setCoupleName2Gift] = useState(debug ? "איתי" : "");
  const [giftWeddingDate, setGiftWeddingDate] = useState("");
  const [noDateYet, setNoDateYet] = useState(debug);
  const [blessing, setBlessing] = useState("");
  const [giftDelivery, setGiftDelivery] = useState<"self" | "direct">("self");
  const [couplePhone, setCouplePhone] = useState("");
  const [coupleContactName, setCoupleContactName] = useState("");
  const [giftPostWedding, setGiftPostWedding] = useState(false);
  const [giftNotes, setGiftNotes] = useState(debug ? "בדיקת מערכת (debug)" : "");
  const [showGiftNotes, setShowGiftNotes] = useState(debug);
  const [giftAgreedToTerms, setGiftAgreedToTerms] = useState(debug);
  const [giftTier, setGiftTier] = useState<KitTier>(isKitTier(tierParam) && sellableTiers(true).includes(tierParam) ? tierParam : "base");
  const giftAll = giftTier === "all";
  const [giftError, setGiftError] = useState("");
  const [giftReview, setGiftReview] = useState(false);
  const [giftSubmitted, setGiftSubmitted] = useState(false);
  const [giftSubmitting, setGiftSubmitting] = useState(false);
  const [giftResult, setGiftResult] = useState<OrderResponse | null>(null);
  const [couplePhoto, setCouplePhoto] = useState<string | null>(null);
  const [couplePhotoName, setCouplePhotoName] = useState<string | null>(null);

  // M2 (Lihi, 14.11.2026): a message that stopped the submit, as a fixed reason key (never the typed value).
  useEffect(() => { if (error) trackFormError("self", errorReason(error)); }, [error]);
  useEffect(() => { if (giftError) trackFormError("gift", errorReason(giftError)); }, [giftError]);

  // Local promos (STUDENT2026, "<couple>-gift") are known here; partner codes are recognised by
  // /api/voucher-check ("promo"), see serverPromo below (docs/attribution 4.3 item 6).
  const isLocalPromo = !!getPromo(voucherCode);
  const promoFullPrice = kitPrice(PRICES, tier);
  // Gift vouchers are checked on the server against the order sheet (21.10.2026); the format of a
  // BST- code alone no longer counts. api/order.ts checks again when the order arrives.
  const voucherKey = voucherCode.trim().toUpperCase();
  const [voucherCheck, setVoucherCheck] = useState<{ code: string; status: VoucherCheckStatus; names: string | null; pct?: number | null; allMeetings?: boolean; tier?: KitTier | null } | null>(null);
  useEffect(() => {
    if (!voucherKey || isLocalPromo || (!isVoucherRedeem && voucherKey.length < 6)) { setVoucherCheck(null); return; }
    let cancelled = false;
    setVoucherCheck({ code: voucherKey, status: "checking", names: null });
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/voucher-check?code=${encodeURIComponent(voucherKey)}`);
        const j = await r.json();
        const status: VoucherCheckStatus = j.status === "valid" || j.status === "invalid" || j.status === "redeemed" || j.status === "promo" ? j.status : "error";
        if (!cancelled) setVoucherCheck({
          code: voucherKey, status, names: typeof j.names === "string" ? j.names : null,
          pct: typeof j.discount_pct === "number" ? j.discount_pct : null, allMeetings: j.all_meetings === true,
          tier: isKitTier(j.tier) ? j.tier : null,
        });
      } catch {
        if (!cancelled) setVoucherCheck({ code: voucherKey, status: "error", names: null });
      }
    }, isVoucherRedeem ? 0 : 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [voucherKey, isLocalPromo, isVoucherRedeem]);
  const voucherStatus: VoucherCheckStatus | null = voucherCheck && voucherCheck.code === voucherKey ? voucherCheck.status : null;
  const serverPromo = voucherStatus === "promo";
  const activePromo = getPromo(voucherCode) || (serverPromo ? promoFor(voucherCheck?.pct ?? PRICES.promoPct) : null);
  const isPromoCode = !!activePromo; // = isLocalPromo || serverPromo (kept as !!activePromo so TS narrows it)
  const promoPrice = activePromo ? quoteNow({ kind: "order", allMeetings, tier, discountPct: activePromo.pct }).kit : 0;
  const promoPayboxUrl = activePromo ? (allMeetings ? activePromo.allMeetingsPayboxUrl : activePromo.payboxUrl) : null;
  const looksLikeVoucher = isValidVoucher(voucherKey) || AUTO_VOUCHER_CODE.test(voucherKey);
  // If the check itself fails (network), let a voucher-shaped code through: the server re-checks and flags it.
  const isGiftVoucher = !isVoucherRedeem && !isPromoCode && (voucherStatus === "valid" || (voucherStatus === "error" && looksLikeVoucher));
  // Codes from a ?voucher= link: auto BST- codes must be in the sheet; hand-made link codes pass as before.
  const linkVoucherBad = isVoucherRedeem && (voucherStatus === "redeemed" || (voucherStatus === "invalid" && AUTO_VOUCHER_CODE.test(voucherKey)));
  const freeVoucher = (isVoucherRedeem && !linkVoucherBad) || isGiftVoucher;
  // A full-kit gift voucher (/api/voucher-check all_meetings) comes with all 11 meetings.
  const voucherAllMeetings = freeVoucher && voucherStatus === "valid" && voucherCheck?.allMeetings === true;
  // A lite voucher (14.11.2026) comes with 4 meetings; the kit of a voucher is fixed (the picker is locked).
  const voucherTier: KitTier = voucherAllMeetings ? "all" : freeVoucher && voucherStatus === "valid" && voucherCheck?.tier === "lite" ? "lite" : "base";
  // Express shipping: only with the new price table, for a paid order that is shipped (not a cafe pickup).
  const expressAvailable = PRICES.express !== null && !isCafePickup && !freeVoucher;
  const expressOn = express && expressAvailable;
  const selfQuote = quoteNow({ kind: "order", allMeetings, tier, express: expressOn, discountPct: activePromo?.pct ?? 0, freeVoucher });
  const giftQuote = quoteNow({ kind: "gift", allMeetings: giftAll, tier: giftTier });
  const need = TIER_MEETINGS[tier];

  const changeTier = (t: KitTier, track = true) => {
    if (t !== tier) {
      setSelectedMeetings((sel) => t === "all" ? MEETINGS.map((m) => m.id) : tier === "all" ? defaultSelection(t) : sel.slice(0, TIER_MEETINGS[t]));
      setTier(t);
    }
    if (track) trackTierSelect("self", t);
  };

  useEffect(() => {
    if (isVoucherRedeem || isGiftVoucher) changeTier(voucherTier, false);
  }, [isGiftVoucher, isVoucherRedeem, voucherTier]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleMeeting = (id: string) => {
    if (allMeetings) return;
    setSelectedMeetings((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= need) return prev;
      return [...prev, id];
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
    if (partnerPhone.trim() && !isValidPhone(partnerPhone)) { setError("מספר הטלפון של בן/בת הזוג לא תקין - צריך להיות 10 ספרות (למשל 050-1234567)."); return; }
    if (email.trim() && !isValidEmail(email)) { setError("כתובת המייל לא תקינה."); return; }
    if (!isCafePickup && (!city.trim() || !street.trim())) { setError("נא למלא כתובת למשלוח (עיר ורחוב)."); return; }
    if (!isCafePickup && !lastName.trim()) { setError("נא למלא שם משפחה למשלוח."); return; }
    if (!isCafePickup && !zipCode.trim()) { setError("נא למלא מיקוד."); return; }
    // O2: exactly as many meetings as the kit.
    if (!allMeetings && selectedMeetings.length !== need) {
      setError(selectedMeetings.length < need ? `נשארו עוד ${need - selectedMeetings.length} מפגשים לבחור (בחרו ${need}).` : `אפשר לבחור ${need} מפגשים.`);
      return;
    }
    if (!agreedToTerms) { setError("נא לאשר את תנאי השימוש."); return; }
    if (voucherKey && !isPromoCode && (isVoucherRedeem || voucherKey.length >= 6)) {
      if (voucherStatus === "checking" || voucherStatus === null) { setError("רגע, עוד בודקים את קוד השובר. נסו שוב בעוד שנייה."); return; }
      if (linkVoucherBad) { setError(voucherStatus === "redeemed" ? VOUCHER_REDEEMED_MSG : "קוד השובר שבקישור לא נמצא. כתבו לי בוואטסאפ ואבדוק."); return; }
      if (!isVoucherRedeem && (voucherStatus === "invalid" || voucherStatus === "redeemed")) {
        setError(voucherStatus === "redeemed" ? VOUCHER_REDEEMED_MSG : "קוד השובר לא נמצא. אפשר לתקן אותו, או למחוק אותו כדי להמשיך להזמנה רגילה.");
        return;
      }
    }

    // Funnel step: user reached the review page (form was valid + submitted).
    trackFunnel({
      event: "AddPaymentInfo",
      contentName: "order_self",
      contentCategory: "order",
      userData: { em: email.trim() || null, ph: phone.trim() || null, fn: partner1.trim() || null, ln: lastName.trim() || null },
    });

    setReview(true);
    window.scrollTo(0, 0);
  };

  const handleConfirm = async () => {
    if (submitting) return;
    trackFormDone("self");
    const orderValue = selfQuote.amount;

    // Lead fires only after /api/order answers, with the server's id (lead_<order_id>); the
    // server sends its CAPI copy. Purchase fires only after a verified payment: server-side, plus
    // the browser copy on /order/thanks (docs/attribution 4.2, 4.3).
    setSubmitting(true);
    setError("");
    const sent = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partner1: partner1.trim(), partner2: partner2.trim(),
        gender1, gender2, phone: phone.trim(),
        partnerPhone: partnerPhone.trim() || null,
        email: email.trim() || null,
        weddingDate: weddingDate || null,
        address: isCafePickup
          ? { city: `איסוף: ${cafePartner!.name}`, street: cafePartner!.branches?.[0]?.address || cafePartner!.name, apartment: null, zipCode: "", lastName: "" }
          : { city: city.trim(), street: street.trim(), apartment: apartment.trim() || null, zipCode: zipCode.trim(), lastName: lastName.trim() },
        meetings: selectedMeetings,
        allMeetings,
        tier,
        express: expressOn,
        modestLanguage,
        shabbat: modestLanguage && shabbat,
        postWedding,
        freeText: freeText.trim() || null,
        test: debug || undefined,
        referralSource: referralSource ? (referralSource === "other" ? referralOther.trim() || "אחר" : referralSource === "cafe" ? `בית קפה - ${referralOther}` : referralSource) : null,
        voucherCode: isPromoCode ? null : (voucherCode.trim() || null),
        isVoucherRedeem,
        promoCode: isPromoCode ? voucherCode.trim() : null,
        wantReceipt,
        ref: attribution.ref || null,
        utm: attribution.utm_source || attribution.utm_medium || attribution.utm_campaign ? attribution : null,
        // Tracking attribution fields (for CAPI dedup + late attribution)
        fbc: getFbc(),
        fbp: getFbp(),
        attribution: getAttributionState(),
        notEngaged,
        clientDisplayedAmount: orderValue,
        ga_client_id: getGaClientId(),
        ga_session_id: getGaSessionId(),
        visitor_id: getVisitorId(),
        session_id: getSessionId(),
        event_source_url: typeof location !== "undefined" ? location.href : undefined,
        consent_marketing: consentForOrder(),
      }),
    }).catch(() => null);

    if (!sent || !sent.ok) {
      setError("משהו השתבש בשליחה. אפשר לנסות שוב, או לכתוב לי בוואטסאפ."); // DRAFT he copy: awaiting Lihi
      setSubmitting(false);
      return;
    }
    const result = await readOrderResponse(sent);
    const amount = typeof result.amount === "number" ? result.amount : orderValue;
    trackFunnel({
      event: "Lead",
      eventId: result.lead_event_id,
      mirror: false,
      contentName: "order_self",
      contentCategory: isVoucherRedeem || (freeVoucher && amount === 0) ? "voucher_redeem" : "order",
      value: amount,
      currency: "ILS",
    });
    gtagEvent("generate_lead", { value: amount, currency: "ILS", order_id: result.order_id });
    // GA4 funnel step between the lead and the paid purchase (PLAN.md Stage 6); nothing to pay, no checkout.
    if (amount > 0) {
      gtagEvent("begin_checkout", {
        value: amount, currency: "ILS", order_id: result.order_id, flow: isVoucherRedeem ? "voucher_redeem" : "self",
        items: [{ item_id: allMeetings ? "kit_all_meetings" : tier === "lite" ? "kit_lite" : "kit", item_name: "couple_kit", price: amount, quantity: 1 }],
      });
    }

    if (result.order_id && isPaymentUrl(result.payment_url)) {
      rememberOrder({ order_id: result.order_id, kind: "order", names: [partner1.trim(), partner2.trim()] });
      goToPayment(result.payment_url);
      return;
    }
    // A fixed Grow page: first the screen with the order code to type on Grow (/order/pay/<id>).
    if (result.order_id && isPaymentUrl(result.pay_url)) {
      rememberOrder({ order_id: result.order_id, kind: "order", names: [partner1.trim(), partner2.trim()], pay_url: result.pay_url, amount });
      navigate(`/order/pay/${result.order_id}`);
      return;
    }

    // No payment link (payments off, free voucher, or a fallback): today's success screen.
    setOrderResult(result);
    setSubmitting(false);
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

    trackFunnel({
      event: "AddPaymentInfo",
      contentName: "order_gift",
      contentCategory: "gift",
      userData: { em: giverEmail.trim() || null, ph: giverPhone.trim() || null, fn: giverName.trim() || null },
    });

    setGiftReview(true);
    window.scrollTo(0, 0);
  };

  const handleGiftConfirm = async () => {
    if (giftSubmitting) return;
    trackFormDone("gift");
    // Same pattern as handleConfirm: Lead after the server answers, Purchase only after payment.
    setGiftSubmitting(true);
    setGiftError("");
    const sent = await fetch("/api/gift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        giverName: giverName.trim(), giverPhone: giverPhone.trim(), giverEmail: giverEmail.trim(),
        coupleName1: coupleName1Gift.trim(), coupleName2: coupleName2Gift.trim(),
        weddingDate: noDateYet ? "עדיין לא יודעים" : giftWeddingDate,
        blessing: blessing.trim() || null,
        couplePhoto,
        couplePhotoName,
        giftDelivery,
        coupleContactName: giftDelivery === "direct" ? coupleContactName.trim() : null,
        couplePhone: giftDelivery === "direct" ? couplePhone.trim() : null,
        postWedding: giftPostWedding,
        notes: giftNotes.trim() || null,
        test: debug || undefined,
        giftAllMeetings: giftAll && PRICES.gift.all !== null,
        giftTier,
        wantReceipt,
        ref: attribution.ref || null,
        utm: attribution.utm_source || attribution.utm_medium || attribution.utm_campaign ? attribution : null,
        referralSource: referralSource ? (referralSource === "other" ? referralOther.trim() || "אחר" : referralSource === "cafe" ? `בית קפה - ${referralOther}` : referralSource) : null,
        // Tracking attribution fields
        fbc: getFbc(),
        fbp: getFbp(),
        attribution: getAttributionState(),
        clientDisplayedAmount: giftQuote.amount,
        ga_client_id: getGaClientId(),
        ga_session_id: getGaSessionId(),
        visitor_id: getVisitorId(),
        session_id: getSessionId(),
        event_source_url: typeof location !== "undefined" ? location.href : undefined,
        consent_marketing: consentForOrder(),
      }),
    }).catch(() => null);

    if (!sent || !sent.ok) {
      setGiftError("משהו השתבש בשליחה. אפשר לנסות שוב, או לכתוב לי בוואטסאפ."); // DRAFT he copy: awaiting Lihi
      setGiftSubmitting(false);
      return;
    }
    const result = await readOrderResponse(sent);
    const amount = typeof result.amount === "number" ? result.amount : giftQuote.amount;
    trackFunnel({
      event: "Lead",
      eventId: result.lead_event_id,
      mirror: false,
      contentName: "order_gift",
      contentCategory: "gift",
      value: amount,
      currency: "ILS",
    });
    gtagEvent("generate_lead", { value: amount, currency: "ILS", order_id: result.order_id });
    if (amount > 0) {
      gtagEvent("begin_checkout", {
        value: amount, currency: "ILS", order_id: result.order_id, flow: "gift",
        items: [{ item_id: "gift", item_name: "couple_kit_gift", price: amount, quantity: 1 }],
      });
    }

    const giftNote = {
      order_id: result.order_id ?? "", kind: "gift" as const, names: [giverName.trim()],
      couple: [coupleName1Gift.trim(), coupleName2Gift.trim()], delivery: giftDelivery,
    };
    if (result.order_id && isPaymentUrl(result.payment_url)) {
      rememberOrder(giftNote);
      goToPayment(result.payment_url);
      return;
    }
    if (result.order_id && isPaymentUrl(result.pay_url)) {
      rememberOrder({ ...giftNote, pay_url: result.pay_url, amount });
      navigate(`/order/pay/${result.order_id}`);
      return;
    }

    setGiftResult(result);
    setGiftSubmitting(false);
    setGiftSubmitted(true);
    window.scrollTo(0, 0);
  };

  // Couple photo: Vercel rejects request bodies over ~4.5 MB, so shrink it in the browser before it
  // is sent (21.10.2026). It only reaches Lihi's email (no pipeline prints it), so the long side is
  // capped at 1800px and the JPEG at ~1.5 MB, lowering quality and then size until it fits.
  const [photoBusy, setPhotoBusy] = useState(false);
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setGiftError("");
    const input = e.target;
    const file = input.files?.[0];
    input.value = ""; // let the same file be picked again after an error
    if (!file) return;
    const isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
    if (!file.type.startsWith("image/") && !isHeic) { setGiftError("אפשר להעלות רק קובץ תמונה (JPG או PNG)."); return; }
    setPhotoBusy(true);
    try {
      const dataUrl = await compressPhoto(file);
      setCouplePhoto(dataUrl);
      setCouplePhotoName(file.name.replace(/\.[^.]+$/, "") + ".jpg");
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setGiftError(
        code === "decode" && isHeic
          ? "התמונה בפורמט HEIC (של אייפון), והדפדפן הזה לא מצליח לפתוח אותה. אפשר לשמור אותה כ-JPG, או לצלם לה מסך, ולהעלות שוב."
          : code === "too-big"
            ? "התמונה גדולה מדי גם אחרי כיווץ. נסו תמונה אחרת."
            : "לא הצלחנו לעבד את התמונה. נסו קובץ JPG או PNG.",
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = () => { setCouplePhoto(null); setCouplePhotoName(null); };

  if (giftReview && !giftSubmitted) {
    const weddingDateDisplay = noDateYet ? "עדיין לא יודעים" : new Date(giftWeddingDate).toLocaleDateString("he-IL");
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease }}
        className="px-6 py-24 md:py-32"
        data-clarity-mask="true"
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
                {/* DRAFT he copy: awaiting Lihi */}
                {PRICES.gift.all !== null && <p>{giftAll ? "ערכה מלאה, כל 11 המפגשים" : `ערכה של ${TIER_MEETINGS[giftTier]} מפגשים (${TIER_COPY[giftTier].label})`} ({giftQuote.amount} ₪)</p>}
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

            {couplePhoto && (
              <>
                <hr className="border-border/40" />
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">תמונה מצורפת</h3>
                  <img src={couplePhoto} alt="תמונת הזוג" className="h-24 w-24 rounded-lg border border-border object-cover" />
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
            {giftError && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{giftError}</p>}
            <Button size="lg" className="w-full text-base" onClick={handleGiftConfirm} disabled={giftSubmitting}>
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
        data-clarity-mask="true"
      >
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 h-28 w-28">
            <img src="/illustrations/confirmation-envelope.png" alt="" className="h-full w-full object-contain illustration-fade-soft" />
          </div>
          <h1 className="mb-4 text-3xl font-bold text-foreground">הפנייה נשלחה!</h1>
          <p className="mb-2 text-lg text-muted-foreground">תודה {giverName}!</p>
          <p className="mb-8 text-muted-foreground">{giftDelivery === "direct"
            ? <>קיבלתי את הפרטים. מיד אחרי שהתשלום יאושר, אשלח את השובר ל{coupleName1Gift} ו{coupleName2Gift}, ועותק יגיע גם למייל שלך.</>
            : <>קיבלתי את הפרטים. מיד אחרי שהתשלום יאושר, השובר יגיע למייל שלך כקובץ PDF, ותוכל/י להעביר אותו ל{coupleName1Gift} ו{coupleName2Gift} בזמן שלך.</>
          }</p>

          {!SHOW_LEGACY_PAY_LINKS ? (
          <div className="mb-8 rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-center">
            <h2 className="mb-2 text-lg font-semibold text-foreground">קיבלנו את ההזמנה</h2>
            {/* A5 (CONCLUSIONS.md 2.11.2026): with a manual Grow link, promise when it arrives. DRAFT he copy: awaiting Lihi */}
            {giftResult?.pay_mode === "manual"
              ? <p className="text-sm text-muted-foreground">קישור לתשלום מאובטח (Grow) יגיע אלייך בוואטסאפ תוך 24 שעות, ובסופ״ש או בחג קצת יותר.</p>
              : <p className="text-sm text-muted-foreground">ניצור איתכם קשר בוואטסאפ עם קישור לתשלום.</p>}
          </div>
          ) : (
          <div className="mb-8 rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-right">
            <h2 className="mb-1 text-center text-lg font-semibold text-foreground">תשלום</h2>
            <p className="mb-4 text-center text-sm text-muted-foreground">{PRICES.base} ₪ - אפשר לשלם כבר עכשיו באחת מהאופציות:</p>
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
            <p className="mt-4 text-center text-xs text-muted-foreground">השובר יישלח אחרי שאאשר את התשלום.</p>
          </div>
          )}

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
        data-clarity-mask="true"
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
                {partnerPhone.trim() && <p dir="ltr" className="text-left">{partnerPhone}</p>}
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
                  {/* DRAFT he copy: awaiting Lihi */}
                  {expressOn && <p className="text-xs text-terracotta-500">משלוח מהיר (+{selfQuote.express} ₪)</p>}
                </>
              )}
            </div>

            <hr className="border-border/40" />

            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">מפגשים ({selectedMeetings.length})</h3>
              {allMeetings && (
                <p className="mb-2 rounded-md bg-terracotta-100/60 px-3 py-1.5 text-xs font-semibold text-terracotta-700">כל 11 המפגשים</p>
              )}
              {tier === "lite" && (
                <p className="mb-2 rounded-md bg-terracotta-100/60 px-3 py-1.5 text-xs font-semibold text-terracotta-700">לייט, 4 מפגשים</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {meetingNames.map((name, i) => (
                  <span key={i} className="rounded-md bg-terracotta-100/60 px-2 py-0.5 text-xs font-medium text-terracotta-700">{name}</span>
                ))}
              </div>
            </div>

            {NEW_PRICES && !freeVoucher && (
              <>
                <hr className="border-border/40" />
                {/* DRAFT he copy: awaiting Lihi */}
                <p className="text-sm font-semibold text-foreground">סכום לתשלום: {selfQuote.amount} ₪</p>
              </>
            )}

            {modestLanguage && (
              <>
                <hr className="border-border/40" />
                <p className="text-sm text-muted-foreground">התאמה לזוג דתי{shabbat ? ", מפגשים בשבת" : ""}</p>
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
            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>}
            <Button size="lg" className="w-full text-base" onClick={handleConfirm} disabled={submitting}>
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
        data-clarity-mask="true"
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
            <p className="mb-8 text-muted-foreground">קיבלתי את הפרטים שלכם ואצור אתכם קשר בהקדם.</p>
          )}

          {!SHOW_LEGACY_PAY_LINKS && !freeVoucher ? (
          <div className="mb-8 rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-center">
            <h2 className="mb-2 text-lg font-semibold text-foreground">קיבלנו את ההזמנה</h2>
            {/* A5 (CONCLUSIONS.md 2.11.2026): with a manual Grow link, promise when it arrives. DRAFT he copy: awaiting Lihi */}
            {orderResult?.pay_mode === "manual"
              ? <p className="text-sm text-muted-foreground">קישור לתשלום מאובטח (Grow) יגיע אליכם בוואטסאפ תוך 24 שעות, ובסופ״ש או בחג קצת יותר.</p>
              : <p className="text-sm text-muted-foreground">ניצור איתכם קשר בוואטסאפ עם קישור לתשלום.</p>}
            {/* DRAFT he copy: awaiting Lihi */}
            {!isCafePickup && <p className="mt-2 text-sm text-muted-foreground">{expressOn ? "הערכה מגיעה עד הבית עד 7 ימי עסקים מקבלת ההזמנה." : "הערכה מגיעה עד הבית עד 14 ימי עסקים מקבלת ההזמנה."}</p>}
          </div>
          ) : isPromoCode ? (
          <div className="mb-8 rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-right">
            <h2 className="mb-1 text-center text-lg font-semibold text-foreground">תשלום - {activePromo.label}</h2>
            <p className="mb-4 text-center text-sm text-muted-foreground">{promoPrice} ₪ (במקום {promoFullPrice} ₪)</p>
            {promoPayboxUrl ? (
            <>
            <div className="space-y-3">
              <a href={promoPayboxUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-4 py-3 transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg">₪</span>
                <div className="flex-1 text-right">
                  <div className="text-sm font-medium text-foreground">PayBox</div>
                </div>
              </a>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">אחרי התשלום אצור אתכם קשר בוואטסאפ לאישור.</p>
            </>
            ) : (
            <p className="text-center text-sm text-muted-foreground">אשלח לכם קישור לתשלום בוואטסאפ.</p>
            )}
          </div>
          ) : freeVoucher ? (
          <div className="mb-8 rounded-xl border border-emerald-200/60 bg-emerald-50/40 px-6 py-5 text-center">
            <p className="text-base font-medium text-emerald-800">הערכה שולמה כבר כמתנה עבורכם, אין צורך בתשלום נוסף.</p>
          </div>
          ) : allMeetings ? (
          <div className="mb-8 rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-right">
            <h2 className="mb-1 text-center text-lg font-semibold text-foreground">תשלום - כל 11 המפגשים</h2>
            <p className="mb-4 text-center text-sm text-muted-foreground">{PRICES.all} ₪</p>
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
            <p className="mb-4 text-center text-sm text-muted-foreground">{PRICES.base} ₪ - אפשר לשלם כבר עכשיו באחת מהאופציות:</p>
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
      {debug && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-900" data-testid="debug-banner">
          מצב בדיקה: הטופס מולא אוטומטית, ההזמנה תסומן "בדיקת מערכת" ולא תישלח למטא
        </div>
      )}
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
            <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">
              להזמנת הערכה
            </h1>
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
            {linkVoucherBad ? (
              <p className="text-sm font-medium text-red-600">{voucherStatus === "redeemed" ? VOUCHER_REDEEMED_MSG : "לא מצאנו שובר עם הקוד הזה. כתבו לי בוואטסאפ ואבדוק."}</p>
            ) : voucherStatus === "checking" || voucherStatus === null ? (
              <p className="text-sm text-muted-foreground">בודקים את השובר...</p>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm text-muted-foreground">סכום לתשלום:</span>
                  <span className="text-xl font-bold text-terracotta-600">0 &#8362;</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">המתנה כבר שולמה - רק מלאו את הפרטים.</p>
              </>
            )}
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
          {/* O1 (Lihi, 14.11.2026): the kit and its price first, before any details. DRAFT he copy: awaiting Lihi. */}
          <section className="space-y-3 rounded-xl border-2 border-terracotta-200 bg-white p-4 sm:p-6" data-testid="tier-step">
            <h2 className="text-center text-lg font-bold text-foreground">כמה מפגשים?</h2>
            {freeVoucher && voucherStatus === "valid" && (
              <p className="text-center text-sm font-medium text-terracotta-700">השובר שלכם הוא ל-{TIER_MEETINGS[voucherTier]} מפגשים.</p>
            )}
            <TierPicker value={tier} onChange={(t) => changeTier(t)} locked={freeVoucher} />
            <p className="text-center text-sm text-muted-foreground">{TIER_COPY[tier].sub}</p>
          </section>

          {/* Names + Gender */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6" onFocusCapture={() => trackFormStep("self", "names")}>
            <h2 className="text-lg font-semibold text-foreground">שמות בני הזוג</h2>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-terracotta-500">מי ממלא/ת את השאלון?</Label>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Input id="partner1" value={partner1} onChange={(e) => setPartner1(e.target.value)} onFocus={() => trackInitiateCheckoutOnce({ contentName: "order_self", contentCategory: "order" })} placeholder="שם פרטי" required />
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
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6" onFocusCapture={() => trackFormStep("self", "contact")}>
            <h2 className="text-lg font-semibold text-foreground">פרטי התקשרות</h2>
            <p className="text-sm text-muted-foreground">ניצור איתכם קשר בוואטסאפ למספר הזה.</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              </span>
              <Input id="phone" type="tel" dir="ltr" value={phone} onChange={(e) => { const val = e.target.value.replace(/[^\d\s\-+()]/g, ""); setPhone(val); }} placeholder="050-1234567" className="pl-10 text-left" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partnerPhone">טלפון של בן/בת הזוג</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                </span>
                <Input id="partnerPhone" type="tel" dir="ltr" value={partnerPhone} onChange={(e) => { const val = e.target.value.replace(/[^\d\s\-+()]/g, ""); setPartnerPhone(val); }} placeholder="050-1234567" className="pl-10 text-left" />
              </div>
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
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6" onFocusCapture={() => trackFormStep("self", "address")}>
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
            {expressAvailable && (
            <label className="flex cursor-pointer items-start gap-3">
              <span
                role="checkbox" aria-checked={express} tabIndex={0} id="express"
                onClick={() => setExpress(!express)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setExpress(!express); } }}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${express ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
              >{express && <Check className="h-3 w-3" />}</span>
              {/* DRAFT he copy: awaiting Lihi */}
              <span className="text-sm text-foreground">
                <span className="font-medium">משלוח מהיר</span>{" "}
                <span className="text-muted-foreground">(בתוספת {PRICES.express} ₪, הערכה מגיעה עד 7 ימי עסקים מקבלת ההזמנה, במקום עד 14)</span>
              </span>
            </label>
            )}
            </>
            )}
          </section>

          {/* Meetings */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6" onFocusCapture={() => trackFormStep("self", "meetings")} onClickCapture={() => trackFormStep("self", "meetings")}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">בחירת מפגשים</h2>
              {!allMeetings && (
                <span className="rounded-full bg-terracotta-100 px-3 py-1 text-xs font-medium text-terracotta-700" data-testid="meeting-counter">{selectedMeetings.length}/{need} נבחרו</span>
              )}
              {allMeetings && (
                <span className="rounded-full bg-terracotta-500 px-3 py-1 text-xs font-medium text-white">כל 11 המפגשים</span>
              )}
            </div>
            {/* O2 (Lihi, 14.11.2026): one clear number; the ketubah meeting only if they want it. DRAFT he copy: awaiting Lihi. */}
            <p className="text-sm text-muted-foreground">
              {allMeetings
                ? "כל 11 המפגשים כלולים. לחצו על החץ ליד כל מפגש כדי לקרוא עוד."
                : `בחרו ${need} מפגשים. אפשר לבחור גם את מפגש הכתובה, אם תרצו. לחצו על החץ ליד כל מפגש כדי לקרוא עוד.`}
            </p>

            {/* DRAFT he copy: awaiting Lihi */}
            {voucherAllMeetings && (
              <p className="rounded-lg bg-terracotta-100/60 px-4 py-3 text-sm font-medium text-terracotta-700">השובר שלכם כולל את כל 11 המפגשים.</p>
            )}

            <div className={`space-y-2 transition-opacity ${allMeetings ? "opacity-50" : ""}`}>
              {MEETINGS.map((meeting) => {
                const isSelected = selectedMeetings.includes(meeting.id);
                const isExpanded = expandedMeeting === meeting.id;
                const isLocked = allMeetings;
                const isFull = !isSelected && !allMeetings && selectedMeetings.length >= need;
                return (
                  <div key={meeting.id} className={`overflow-hidden rounded-lg border transition-colors ${isSelected ? "border-terracotta-400 bg-terracotta-50/50" : "border-border/60 bg-background hover:border-terracotta-200"}`}>
                    <div role="button" tabIndex={0} data-meeting-id={meeting.id} aria-pressed={isSelected} onClick={() => handleToggleMeeting(meeting.id)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleToggleMeeting(meeting.id); } }} className={`flex items-center gap-3 px-4 py-3.5 text-right ${isLocked ? "cursor-default" : "cursor-pointer"} ${isFull ? "opacity-55" : ""}`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${isSelected ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}>{isSelected && <Check className="h-3 w-3" />}</span>
                      <span className="flex-1 text-sm font-medium text-foreground">{meeting.title}{meeting.optional && !allMeetings && <span className="mr-2 text-xs font-normal text-terracotta-400">(אם תרצו)</span>}</span>
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
          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6" onFocusCapture={() => trackFormStep("self", "extras")}>
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
            {modestLanguage && (
            <label className="flex cursor-pointer items-start gap-3 ps-7">
              <span
                role="checkbox" aria-checked={shabbat} tabIndex={0} id="shabbat"
                onClick={() => setShabbat(!shabbat)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setShabbat(!shabbat); } }}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${shabbat ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
              >{shabbat && <Check className="h-3 w-3" />}</span>
              {/* C1 (Lihi, 4.11.2026). DRAFT he copy: awaiting Lihi */}
              <span className="text-sm text-foreground">נשמח לעשות את המפגשים בשבת <span className="text-muted-foreground">(החלק האישי בכתיבה מראש, והחלק הזוגי בשבת, בלי כתיבה)</span></span>
            </label>
            )}
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
                role="checkbox" aria-checked={notEngaged} tabIndex={0}
                onClick={() => setNotEngaged(!notEngaged)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setNotEngaged(!notEngaged); } }}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${notEngaged ? "border-terracotta-500 bg-terracotta-500 text-white" : "border-terracotta-300"}`}
              >{notEngaged && <Check className="h-3 w-3" />}</span>
              <span className="text-sm font-medium text-foreground">אנחנו זוג אבל לא התארסנו עדיין / לא מתכוונים להתחתן</span>
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
                { value: "print", label: "מודעה מודפסת" },
                { value: "newsletter", label: "ניוזלטר" },
                { value: "event", label: "ערב או הרצאה" },
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
          <section className="space-y-3 rounded-xl border border-dashed border-terracotta-200 bg-terracotta-50/30 p-6" onFocusCapture={() => trackFormStep("self", "code")}>
            <h2 className="text-base font-semibold text-foreground">הכנסת קוד שובר</h2>
            <p className="text-sm text-muted-foreground">אם קיבלתם קוד שובר כמתנה שרכשו עבורכם או כהנחה, הזינו אותו כאן.</p>
            <Input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} placeholder="למשל: YAEL-TOMER-2609" />
            {!isPromoCode && voucherStatus === "checking" && <p className="text-xs text-muted-foreground">בודקים את הקוד...</p>}
            {!isPromoCode && voucherStatus === "invalid" && <p className="text-sm text-red-600">לא מצאנו שובר עם הקוד הזה. כדאי לבדוק שהוקלד נכון, או לכתוב לי בוואטסאפ.</p>}
            {!isPromoCode && voucherStatus === "redeemed" && <p className="text-sm text-red-600">{VOUCHER_REDEEMED_MSG}</p>}
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
          {/* D1 (Lihi, 4.11.2026). DRAFT he copy: awaiting Lihi */}
          {!freeVoucher && <p className="-mt-2 ps-7 text-xs text-muted-foreground">הערכה מודפסת במיוחד בשבילכם, ולכן אחרי התשלום אי אפשר לבטל את ההזמנה.</p>}

          {!isVoucherRedeem && (isGiftVoucher ? (
          <div className="rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-5 text-center">
            <div className="text-2xl font-bold text-emerald-600">0 &#8362;</div>
            <p className="mt-1 text-sm text-muted-foreground">שובר מתנה - הערכה כבר שולמה עבורכם</p>
          </div>
          ) : (
          <KitValueBox
            dates={need}
            amount={selfQuote.amount}
            express={selfQuote.express}
            fullPrice={isPromoCode ? promoFullPrice + selfQuote.express : null}
            promoLabel={isPromoCode ? activePromo.label : null}
          />
          ))}
          <Button size="lg" type="submit" className="w-full text-base">
            {freeVoucher ? "שליחת הטופס" : "להזמנה (תשלום לאחר מכן)"}
          </Button>

          {freeVoucher && (
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
          {/* O1 + H5 (Lihi, 14.11.2026): a voucher for 4, 8 or 11 meetings, chosen first. DRAFT he copy: awaiting Lihi. */}
          {PRICES.gift.all !== null && (
          <section className="space-y-3 rounded-xl border-2 border-terracotta-200 bg-white p-4 sm:p-6" data-testid="gift-tier-step">
            <h2 className="text-center text-lg font-bold text-foreground">כמה מפגשים במתנה?</h2>
            <TierPicker gift value={giftTier} onChange={(t) => { setGiftTier(t); trackTierSelect("gift", t); }} />
            <p className="text-center text-sm text-muted-foreground">{TIER_COPY[giftTier].giftSub}</p>
          </section>
          )}

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6" onFocusCapture={() => trackFormStep("gift", "giver")}>
            <h2 className="text-lg font-semibold text-foreground">הפרטים שלך</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="giverName">שם מלא</Label>
                <Input id="giverName" value={giverName} onChange={(e) => setGiverName(e.target.value)} onFocus={() => trackInitiateCheckoutOnce({ contentName: "order_gift", contentCategory: "gift" })} placeholder="השם שלך" required />
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

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6" onFocusCapture={() => trackFormStep("gift", "couple")}>
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

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6" onFocusCapture={() => trackFormStep("gift", "blessing")} data-clarity-mask="true">
            <h2 className="text-lg font-semibold text-foreground">רוצה לצרף כמה מילים?</h2>
            <p className="text-sm text-muted-foreground">ברכה קצרה שתצורף עם המתנה. לא חובה.</p>
            <input type="text" value={blessing} onChange={(e) => setBlessing(e.target.value)} placeholder="למשל: בשעה טובה! שתמיד תמשיכו לדבר..." className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-terracotta-300" />
          </section>

          <section className="space-y-4 rounded-xl border border-border/60 bg-warm-gray-50 p-6" data-clarity-mask="true">
            <h2 className="text-lg font-semibold text-foreground">רוצה לצרף תמונה של הזוג?</h2>
            <p className="text-sm text-muted-foreground">התמונה תגיע אלינו יחד עם ההזמנה - נשמח להכיר. לא חובה.</p>
            {!couplePhoto ? (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-terracotta-300 bg-background px-4 py-6 text-sm font-medium text-muted-foreground transition-colors hover:border-terracotta-400 hover:text-terracotta-600">
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} disabled={photoBusy} />
                <span>{photoBusy ? "מכינים את התמונה..." : "📷 לחצו כדי לבחור תמונה"}</span>
              </label>
            ) : (
              <div className="flex items-center gap-4">
                <img src={couplePhoto} alt="תצוגה מקדימה" className="h-20 w-20 rounded-lg border border-border object-cover" />
                <div className="flex flex-col items-start gap-1">
                  <span className="text-sm text-foreground">✓ התמונה נבחרה</span>
                  <button type="button" onClick={handleRemovePhoto} className="text-xs font-medium text-terracotta-600 underline underline-offset-2">הסרה / החלפה</button>
                </div>
              </div>
            )}
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
                <span className="text-sm text-muted-foreground">אין תאריך / לא רלוונטי</span>
              </label>
            </div>
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
                { value: "print", label: "מודעה מודפסת" },
                { value: "newsletter", label: "ניוזלטר" },
                { value: "event", label: "ערב או הרצאה" },
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

          <KitValueBox dates={TIER_MEETINGS[giftTier]} amount={giftQuote.amount} express={0} gift />

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
          {/* D2 (Lihi, 4.11.2026). DRAFT he copy: awaiting Lihi */}
          <p className="-mt-2 ps-7 text-xs text-muted-foreground">אחרי מימוש השובר הערכה מודפסת במיוחד, ולכן אי אפשר לבטל.</p>

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

/**
 * The price box under the order and gift forms (Lihi, 4.11.2026): lead with what the couple gets
 * (8 or 11 dates, made for them) so the price reads as value. DRAFT he copy: awaiting Lihi.
 */
function KitValueBox({ dates, amount, express, fullPrice = null, promoLabel = null, gift = false }: {
  dates: number; amount: number; express: number; fullPrice?: number | null; promoLabel?: string | null; gift?: boolean;
}) {
  const perDate = Math.round((amount - express) / dates);
  // M2: "saw the price"; M1: the price stays readable in Clarity recordings (numbers are masked by default).
  const seen = useSeenOnce<HTMLDivElement>(() => trackPriceSeen(gift ? "gift_box" : "order_box"), 0.5);
  return (
    <div ref={seen} className="rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-center" data-testid="kit-value" data-clarity-unmask="true">
      <p className="text-4xl font-bold text-terracotta-600">{dates} דייטים</p>
      <p className="mt-2 text-balance text-lg font-semibold leading-snug text-foreground">
        ששמים במרכז השולחן את הדברים החשובים באמת {gift ? "לזוג שאתם אוהבים" : "לזוגות"}
      </p>
      <div className="mt-5 flex items-baseline justify-center gap-2">
        {fullPrice != null && <span className="text-lg text-muted-foreground/60 line-through">{fullPrice} ₪</span>}
        <span className="text-3xl font-bold text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>{amount} &#8362;</span>
      </div>
      {promoLabel && <p className="mt-1 text-sm text-terracotta-600">{promoLabel}</p>}
      <p className="mt-1 text-sm text-muted-foreground">כ-{perDate} ₪ לדייט</p>
      {express > 0 && <p className="mt-1 text-xs text-terracotta-600">כולל משלוח מהיר (+{express} ₪)</p>}
      <ul className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-x-5 gap-y-1.5 border-t border-terracotta-200/60 pt-4 text-sm text-muted-foreground">
        <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-terracotta-500" />מותאמים אישית {gift ? "לזוג" : "לכם"}</li>
        <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-terracotta-500" />חוברת זוגית ושתי חוברות אישיות</li>
        <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-terracotta-500" />משלוח עד הבית</li>
      </ul>
    </div>
  );
}
