/**
 * /order/thanks/:orderId and /order/thanks/:orderId/cancelled (docs/attribution/00_DESIGN.md 4.4), and
 * /order/thanks with no id: the return URL of a fixed Grow page (one URL per page, so the order id
 * comes from this tab's sessionStorage note, or ?o=). There the server may never hear about the
 * payment by itself (Flow A: Lihi confirms it), so after a short wait the page says "received".
 * The payment page (Grow, or the local fake Grow in test mode) returns here. The page polls
 * /api/pay-status and fires the browser Purchase (same event id as the server's CAPI Purchase)
 * only once the server says the order is paid. Names come from sessionStorage only.
 * All Hebrew copy on this page is a DRAFT awaiting Lihi's approval.
 */
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Instagram, Facebook, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderCode } from "@/components/OrderCode";
import { trackFunnel } from "@/lib/tracking";
import { gtagEvent } from "@/lib/gtag";
import { ORDER_ID_RE, claimPurchaseOnce, goToPayment, isPaymentUrl, readLastOrder } from "@/lib/payment";

const ease = [0.25, 0.1, 0.25, 1] as const;
const POLL_MS = 1500;
const POLL_LIMIT_MS = 60_000;
/** Fixed-page return: wait this long for Grow's server update (Flow B), then show "received". */
const FIXED_RETURN_LIMIT_MS = 20_000;
const WHATSAPP_PHONE = "972502023669";

type View = "pending" | "paid" | "cancelled" | "unknown" | "received";

interface PayStatus {
  status?: string;
  amount?: number;
  currency?: string;
  kind?: "order" | "gift" | "redeem";
  purchase_event_id?: string;
  content_ids?: string[];
  num_items?: number;
  ga4_browser?: boolean;
}

async function fetchStatus(orderId: string): Promise<PayStatus | null> {
  try {
    const r = await fetch(`/api/pay-status?o=${encodeURIComponent(orderId)}`, { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) return null;
    return (await r.json()) as PayStatus;
  } catch {
    return null;
  }
}

/** Browser copies of the paid event, once per order (Meta dedups against the server's CAPI copy). */
function firePurchase(orderId: string, s: PayStatus) {
  if (!s.purchase_event_id || !claimPurchaseOnce(orderId)) return;
  const value = typeof s.amount === "number" ? s.amount : undefined;
  const currency = s.currency || "ILS";
  trackFunnel({
    event: "Purchase",
    eventId: s.purchase_event_id,
    mirror: false,
    value,
    currency,
    contentName: s.kind === "gift" ? "couple_kit_gift" : "couple_kit",
    contentCategory: s.kind === "gift" ? "gift" : "order",
    extra: {
      ...(s.content_ids?.length ? { content_ids: s.content_ids, content_type: "product" } : {}),
      ...(typeof s.num_items === "number" ? { num_items: s.num_items } : {}),
    },
  });
  if (s.ga4_browser) {
    gtagEvent("purchase", {
      transaction_id: orderId,
      value,
      currency,
      ...(s.content_ids?.length ? { items: s.content_ids.map((id) => ({ item_id: id })) } : {}),
    });
  }
}

function whatsappHref(orderId: string) {
  const text = `שלום, לגבי ההזמנה ${orderId}`; // DRAFT he copy: awaiting Lihi
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
}

export default function OrderThanks({ cancelled = false }: { cancelled?: boolean }) {
  const params = useParams();
  const [search] = useSearchParams();
  const fixedReturn = !params.orderId;
  const orderId = params.orderId ?? search.get("o") ?? readLastOrder()?.order_id ?? "";
  const validId = ORDER_ID_RE.test(orderId);
  const [view, setView] = useState<View>(validId ? "pending" : "unknown");
  const [kind, setKind] = useState<PayStatus["kind"]>(undefined);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const note = validId ? readLastOrder(orderId) : null;

  useEffect(() => {
    if (!validId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    setView("pending");

    const tick = async () => {
      const s = await fetchStatus(orderId);
      if (stopped) return;
      if (s?.kind) setKind(s.kind);
      if (s?.status === "paid") { firePurchase(orderId, s); setView("paid"); return; }
      if (s?.status === "free") { setView("paid"); return; }
      // Back from the cancel URL: one check (a late "paid" still wins), then the cancelled view.
      if (cancelled || s?.status === "cancelled") { setView("cancelled"); return; }
      if (Date.now() - started >= (fixedReturn ? FIXED_RETURN_LIMIT_MS : POLL_LIMIT_MS)) { setView(fixedReturn ? "received" : "unknown"); return; }
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [orderId, validId, cancelled, fixedReturn]);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setRetryFailed(false);
    try {
      const r = await fetch("/api/pay-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ order_id: orderId }),
      });
      const j = r.ok ? ((await r.json()) as { payment_url?: string }) : null;
      if (j && isPaymentUrl(j.payment_url)) { goToPayment(j.payment_url); return; }
    } catch {
      // falls through to the WhatsApp option
    }
    setRetryFailed(true);
    setRetrying(false);
  };

  const isGift = (kind ?? note?.kind) === "gift";
  const names = note?.names.filter(Boolean) ?? [];
  const greetName = isGift ? names[0] : names.length === 2 ? `${names[0]} ו${names[1]}` : names[0];
  const couple = note?.couple?.filter(Boolean) ?? [];
  const coupleText = couple.length === 2 ? `${couple[0]} ו${couple[1]}` : "הזוג";

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

        {/* DRAFT he copy: awaiting Lihi (every string in this block) */}
        {view === "pending" && (
          <div className="mb-8 flex items-center justify-center gap-2 text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-lg">רגע, מאשרים את התשלום...</p>
          </div>
        )}

        {view === "paid" && (
          <>
            <h1 className="mb-4 text-3xl font-bold text-foreground">{greetName ? `התשלום התקבל, תודה ${greetName}!` : "התשלום התקבל, תודה!"}</h1>
            {isGift ? (
              <p className="mb-8 text-muted-foreground">{note?.delivery === "direct"
                ? <>קיבלתי את הפרטים. מיד אחרי שהתשלום יאושר, אשלח את השובר ל{coupleText}, ועותק יגיע גם למייל שלך.</>
                : <>קיבלתי את הפרטים. מיד אחרי שהתשלום יאושר, השובר יגיע למייל שלך כקובץ PDF, ותוכל/י להעביר אותו ל{coupleText} בזמן שלך.</>
              }</p>
            ) : (
              <p className="mb-8 text-muted-foreground">קיבלתי את הפרטים ואצור איתכם קשר בהקדם. הערכה מגיעה עד הבית עד 14 ימי עסקים מקבלת ההזמנה.</p>
            )}
          </>
        )}

        {view === "cancelled" && (
          <>
            <h1 className="mb-6 text-3xl font-bold text-foreground">התשלום לא הושלם.</h1>
            <div className="mb-8 flex flex-col gap-3">
              <Button size="lg" className="w-full text-base" onClick={retry} disabled={retrying}>
                לנסות שוב
              </Button>
              <Button size="lg" variant="outline" className="w-full text-base" asChild>
                <a href={whatsappHref(orderId)} target="_blank" rel="noopener noreferrer">לכתוב לי בוואטסאפ</a>
              </Button>
              {retryFailed && <p className="text-sm text-muted-foreground">לא הצלחנו לפתוח שוב את דף התשלום. אפשר לכתוב לי בוואטסאפ ואשלח קישור.</p>}
            </div>
          </>
        )}

        {view === "unknown" && (
          <div className="mb-8 rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6 text-center">
            <p className="text-sm text-muted-foreground">התשלום אולי עוד בעיבוד. אם חויבתם, הכל בסדר: אצור איתכם קשר בוואטסאפ.</p>
          </div>
        )}

        {view === "received" && (
          <>
            <h1 className="mb-4 text-3xl font-bold text-foreground">{greetName ? `תודה ${greetName}!` : "תודה!"}</h1>
            <p className="mb-8 text-muted-foreground">אם התשלום הושלם, החשבונית מ-Grow כבר בדרך למייל שלכם. ברגע שאראה את התשלום אצלי אעדכן אתכם בוואטסאפ.</p>
          </>
        )}

        {validId && view !== "cancelled" && (
          <div className="mb-8"><OrderCode code={orderId} label="קוד ההזמנה" /></div>
        )}

        {view === "paid" && (
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
        )}

        <Button variant="outline" asChild><Link to="/">חזרה לעמוד הבית</Link></Button>
      </div>
    </motion.div>
  );
}
