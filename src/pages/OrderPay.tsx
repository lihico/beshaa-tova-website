/**
 * /order/pay/:orderId: the pay screen for a fixed Grow page (Grow Light without the API, or the
 * fallback when the per-order Make link could not be made). Shows the order code with a copy button
 * and asks the buyer to type it in Grow's required "קוד הזמנה" field, then the pay button.
 * The page URL comes from /api/pay-status (pay_url), so a reload or "back" from Grow still works.
 * All Hebrew copy on this page is a DRAFT awaiting Lihi's approval.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderCode } from "@/components/OrderCode";
import { ORDER_ID_RE, isPaymentUrl, readLastOrder } from "@/lib/payment";

const ease = [0.25, 0.1, 0.25, 1] as const;
const WHATSAPP_PHONE = "972502023669";

interface PayInfo { status?: string; amount?: number; pay_url?: string }

export default function OrderPay() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const validId = ORDER_ID_RE.test(orderId);
  const note = validId ? readLastOrder(orderId) : null;
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [loading, setLoading] = useState(validId);

  useEffect(() => {
    if (!validId) return;
    let stopped = false;
    fetch(`/api/pay-status?o=${encodeURIComponent(orderId)}`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<PayInfo>) : null))
      .catch(() => null)
      .then((j) => {
        if (stopped) return;
        if (j?.status === "paid" || j?.status === "free") { navigate(`/order/thanks/${orderId}`, { replace: true }); return; }
        setInfo(j);
        setLoading(false);
      });
    return () => { stopped = true; };
  }, [orderId, validId, navigate]);

  const payUrl = [info?.pay_url, note?.pay_url].find((u) => isPaymentUrl(u));
  const amount = typeof info?.amount === "number" ? info.amount : note?.amount;
  const waText = `שלום, לגבי ההזמנה ${orderId}`;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }} className="px-6 py-24 md:py-32" data-clarity-mask="true">
      <div className="mx-auto max-w-md text-center">
        {!validId ? (
          <>
            <h1 className="mb-4 text-2xl font-bold text-foreground">ההזמנה לא נמצאה</h1>
            <Button variant="outline" asChild><Link to="/">חזרה לעמוד הבית</Link></Button>
          </>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" /><p>רגע...</p>
          </div>
        ) : (
          <>
            <h1 className="mb-2 text-3xl font-bold text-foreground">ההזמנה התקבלה, נשאר רק לשלם</h1>
            {typeof amount === "number" && <p className="mb-6 text-lg text-muted-foreground">סכום לתשלום: <strong className="text-foreground">{amount} ₪</strong></p>}
            <div className="mb-6"><OrderCode code={orderId} /></div>
            {payUrl ? (
              <>
                <p className="mb-6 text-right text-sm leading-relaxed text-muted-foreground" data-testid="type-code-instruction">
                  בדף התשלום יש שדה בשם <strong className="text-foreground">"קוד הזמנה"</strong>. מעתיקים אליו את הקוד שלמעלה, כדי שנדע שהתשלום שייך להזמנה שלכם.
                </p>
                <Button size="lg" className="w-full text-base" asChild>
                  <a href={payUrl} id="go-pay">לתשלום מאובטח</a>
                </Button>
                <p className="mt-4 text-xs text-muted-foreground">התשלום דרך Grow: אשראי, ביט, פייבוקס, Apple Pay או Google Pay. חשבונית תגיע אליכם במייל.</p>
              </>
            ) : (
              <div className="rounded-xl border border-terracotta-200/60 bg-terracotta-50/40 px-6 py-6">
                <p className="mb-4 text-sm text-muted-foreground">לא הצלחנו לפתוח את דף התשלום. נשלח לכם קישור לתשלום בוואטסאפ.</p>
                <Button variant="outline" asChild>
                  <a href={`https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">לכתוב לי בוואטסאפ</a>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
