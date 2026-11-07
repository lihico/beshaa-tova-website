/**
 * Store adapter (docs/attribution/00_DESIGN.md section 5.2). STORE_MODE=file -> FileStore (test mode,
 * JSONL under ATTR_DATA_DIR); anything else -> SheetStore (the live Google Sheet). Read at call time.
 */
import type { OrderRecord, PaymentRecord, Partner, Touch, TrackingCode } from "./_attribution_core.js";
import { FileStore } from "./_store_file.js";
import { SheetStore } from "./_store_sheet.js";

export type StoredTouch = Touch & { visitor_id: string };

export interface Store {
  readonly mode: "file" | "sheet";
  appendTouch(t: StoredTouch): Promise<void>;
  /** legacyRow = today's appendOrderRow/appendGiftRow, called with the attribution columns spread in. */
  appendOrder(o: OrderRecord, legacyRow: () => Promise<void>): Promise<void>;
  /** fresh: bypass any per-instance row cache (SheetStore); use it on the money path. */
  getOrder(order_id: string, opts?: { fresh?: boolean }): Promise<OrderRecord | null>;
  findOrderByProcessId(process_id: string): Promise<OrderRecord | null>;
  updateOrder(order_id: string, patch: Partial<OrderRecord>): Promise<void>;
  /** "duplicate" = a payment with the same payment_id exists. */
  appendPayment(p: PaymentRecord): Promise<"inserted" | "duplicate">;
  /** Additive to 5.2: grow-notify step 5 checks the transaction id before verifying. */
  getPayment(payment_id: string): Promise<PaymentRecord | null>;
  getCode(code: string): Promise<TrackingCode | null>;
  getPartnerByCode(code: string): Promise<Partner | null>;
  getPartnerById(id: string): Promise<Partner | null>;
  listOrders(): Promise<OrderRecord[]>;
}

let cached: { key: string; store: Store } | null = null;

export function getStore(): Store {
  const mode = process.env.STORE_MODE === "file" ? "file" : "sheet";
  // The file store is a test fixture: on Vercel /var/task is read-only and every order would 500.
  if (mode === "file" && process.env.ATTR_TEST !== "1") {
    throw new Error("STORE_MODE=file is allowed only with ATTR_TEST=1 (test mode)");
  }
  const key = mode + "|" + (process.env.ATTR_DATA_DIR ?? "");
  if (!cached || cached.key !== key) {
    cached = { key, store: mode === "file" ? new FileStore(process.env.ATTR_DATA_DIR || ".test-data") : new SheetStore() };
  }
  return cached.store;
}

/** Client IP the way Vercel passes it (first x-forwarded-for hop). */
export function clientIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).split(",")[0].trim();
  return req.socket?.remoteAddress ?? null;
}
