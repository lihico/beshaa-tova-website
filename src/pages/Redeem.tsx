import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gift } from "lucide-react";

// /redeem used to post its own form to /api/gift with a fake email, which the server rejected,
// so redemptions were lost (docs/voucher_redeem_missed_2026-10-28.md). Redemption now always goes
// through the order page, which checks the code, writes the sheet row and mails Lihi.
const orderLink = (code: string) => `/order?voucher=${encodeURIComponent(code.trim())}`;

export default function Redeem() {
  const [searchParams] = useSearchParams();
  const codeFromUrl = (searchParams.get("code") || searchParams.get("voucher") || "").trim();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  if (codeFromUrl) return <Navigate to={orderLink(codeFromUrl)} replace />;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setError("נא להזין את קוד השובר שקיבלתם."); return; } // DRAFT he copy: awaiting Lihi
    navigate(orderLink(code));
  };

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="mb-8 text-center">
        <Gift className="mx-auto mb-4 h-10 w-10 text-terracotta-500" />
        {/* DRAFT he copy: awaiting Lihi */}
        <h1 className="text-2xl font-bold text-foreground">מימוש שובר מתנה</h1>
        <p className="mt-2 text-muted-foreground">מזינים את הקוד שמופיע בשובר, ובשלב הבא בוחרים את המפגשים וממלאים פרטים למשלוח.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="voucherCode">קוד השובר</Label>
          <Input id="voucherCode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BST-0000-XXXX" dir="ltr" className="text-center tracking-wider" />
        </div>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>}
        <Button size="lg" type="submit" className="w-full text-base">להמשך</Button>
      </form>
    </div>
  );
}
