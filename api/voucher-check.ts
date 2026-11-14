import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkVoucher, normalizeVoucherCode } from "./_voucher_lookup.js";
import { resolvePromo } from "./_pricing.js";
import { getStore } from "./_store.js";

// GET /api/voucher-check?code=BST-2005-0UGA -> { status: "valid" | "invalid" | "redeemed" | "error", names }
// The order form calls this while a code is typed or arrives via ?voucher=. Sheet reads are cached
// for a minute per warm instance; the order itself is re-checked fresh in api/order.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const code = normalizeVoucherCode(req.query.code);
  if (code.length < 4) {
    return res.status(200).json({ status: "invalid", names: null });
  }
  // Partner codes and the built-in promos (STUDENT2026, "<couple>-gift") answer "promo" before the
  // voucher lookup (docs/attribution 5.9). The order itself re-validates the code on the server.
  try {
    const store = getStore();
    const promo = await resolvePromo(String(req.query.code ?? ""), { getPartnerByCode: (c) => store.getPartnerByCode(c) });
    if (promo) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ status: "promo", discount_pct: promo.discount_pct, partner_id: promo.partner_id, names: null });
    }
  } catch (err) {
    console.error("[voucher-check] promo lookup failed:", err instanceof Error ? err.message : err);
  }
  const verdict = await checkVoucher(code);
  res.setHeader("Cache-Control", "no-store");
  const valid = verdict.status === "valid";
  // tier: which kit the voucher pays for (lite = 4 meetings, base = 8, all = 11); the order form locks it.
  const tier = !valid ? null : verdict.allMeetings ? "all" : verdict.lite ? "lite" : "base";
  return res.status(200).json({ status: verdict.status, names: valid ? verdict.names : null, all_meetings: valid && verdict.allMeetings, tier });
}
