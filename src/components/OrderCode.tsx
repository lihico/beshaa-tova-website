/**
 * The order code, large and left-to-right, with a copy button. Used on /order/pay/<id> (where the
 * buyer types it in Grow's "קוד הזמנה" field) and on the thank-you page.
 * Hebrew copy is a DRAFT awaiting Lihi.
 */
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { copyText } from "@/lib/payment";

export function OrderCode({ code, label = "קוד ההזמנה שלכם" }: { code: string; label?: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const copy = async () => {
    const ok = await copyText(code);
    setCopied(ok ? "yes" : "no");
    if (ok) setTimeout(() => setCopied(null), 2500);
  };
  return (
    <div className="rounded-xl border border-terracotta-200/60 bg-white/80 px-5 py-4 text-center">
      <div className="mb-1 text-sm text-muted-foreground">{label}</div>
      <div className="flex items-center justify-center gap-3">
        <span dir="ltr" data-testid="order-code" className="select-all font-mono text-2xl font-bold tracking-wider text-terracotta-600">{code}</span>
        <button
          type="button" onClick={copy} aria-label="העתקת קוד ההזמנה"
          className="flex items-center gap-1 rounded-lg border border-terracotta-200 px-3 py-1.5 text-sm font-medium text-terracotta-700 transition-colors hover:bg-terracotta-50"
        >
          {copied === "yes" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied === "yes" ? "הועתק" : "העתקה"}
        </button>
      </div>
      {copied === "no" && <p className="mt-2 text-xs text-muted-foreground">אפשר לסמן את הקוד ולהעתיק אותו ידנית.</p>}
    </div>
  );
}
