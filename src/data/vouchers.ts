export interface VoucherData {
  coupleNames: string;
  giverName: string;
  code: string;
  issueDate: string;
  expiryDate: string;
}

export const VOUCHERS: Record<string, VoucherData> = {
  "ZIV-AVITAL-1405": {
    coupleNames: "זיו ואביטל",
    giverName: "דקל",
    code: "ZIV-AVITAL-1405",
    issueDate: "17.3.2026",
    expiryDate: "17.6.2026",
  },
  "OR-SHALEV-1805": {
    coupleNames: "אור ושלו",
    giverName: "מירב",
    code: "OR-SHALEV-1805",
    issueDate: "22.3.2026",
    expiryDate: "22.6.2026",
  },
  "OMRI-DANA-2606": {
    coupleNames: "עומרי ודנה",
    giverName: "עמית",
    code: "OMRI-DANA-2606",
    issueDate: "29.3.2026",
    expiryDate: "29.6.2026",
  },
  "LARA-ADAM-1110": {
    coupleNames: "לארה ואדם",
    giverName: "עמית המבורגר",
    code: "LARA-ADAM-1110",
    issueDate: "12.7.2026",
    expiryDate: "12.10.2026",
  },
};

// Codes made automatically by api/_voucher.ts generateVoucherCode(): BST-<DDMM>-XXXX, or BST-XXXX
// with no wedding date. The format alone proves nothing (anyone can make one up), so since
// 21.10.2026 these are checked against the order sheet by /api/voucher-check and again in /api/order.
export const AUTO_VOUCHER_CODE = /^BST-(\d{4}-)?[A-Z0-9]{4}$/;

/** Only the hard-coded list above. Every other code needs the server check. */
export function isValidVoucher(code: string): boolean {
  return !!VOUCHERS[code.trim().toUpperCase()];
}
