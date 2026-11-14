/**
 * Payment adapters (docs/attribution/00_DESIGN.md section 5.5, docs/attribution/GROW_LIGHT_SETUP.md).
 * PAYMENT_PROVIDER:
 *   grow_make (default)   per-order Grow payment links through Grow's Make app (flow "make"), falling back
 *                         to the fixed page for the amount, then to today's WhatsApp flow.
 *   grow_pages            Grow Light without the API or Make: fixed sales pages per amount (flow "fixed_page").
 *   grow                  the Grow API (createPaymentProcess, hosted page per order; flow "hosted").
 *   mock                  the API adapter against the local fake Grow (test mode only).
 *   manual                no automatic link: Lihi sends a one-time Grow link ("לינק חד-פעמי") by hand and
 *                         confirms with her signed "mark paid" link (Stage 1, CONCLUSIONS.md 2.11.2026).
 *                         There is no adapter; preflightReason() returns "manual_link" before one is asked for.
 * Payments change site behaviour only when PAYMENTS_ENABLED=1 (checked by the callers through
 * paymentsEnabled()); with it unset the site keeps today's WhatsApp payment-link flow.
 */
import type { OrderRecord } from "./_attribution_core.js";
import { GrowAdapter, growConfigFromEnv } from "./_payments_grow.js";
import { MockGrowAdapter } from "./_payments_mock.js";
import { GrowPagesAdapter, growPagesConfigFromEnv } from "./_payments_grow_pages.js";
import { GrowMakeAdapter, growMakeConfigFromEnv } from "./_payments_grow_make.js";

export interface CreatePaymentInput {
  order_id: string; amount: number; description: string;
  buyer: { name: string; phone: string; email: string | null };
  kind: "order" | "gift";
  /** cField1 order id, cField2 visitor hex, cField3 partner|ref, cField4 lt_channel (no PII, no tokens). */
  cFields: { cField1: string; cField2: string; cField3: string; cField4: string };
  /** Grow productData catalogNumber: kit | kit_all | kit_lite | gift (defaults from kind). */
  catalogNumber?: "kit" | "kit_all" | "kit_lite" | "gift";
}
export interface CreatePaymentResult { payment_url: string; process_id: string; process_token: string }

export interface NotifyParsed {
  processId: string | null; processToken: string | null; transactionId: string | null;
  transactionToken: string | null; transactionTypeId: string | null; sum: number | null; statusCode: string | null;
  asmachta: string | null; cardSuffix: string | null; paymentsNum: number | null; fullName: string | null;
  payerPhone: string | null; payerEmail: string | null; customFields: Record<string, string>;
  /** Flat bracketed view of the body (`data[sum]` etc.); never logged with values. */
  raw: Record<string, unknown>;
}
export interface VerifiedPayment { ok: true; sum: number; statusCode: "2"; transactionId: string; via: "process_info" }
export type VerifyResult = VerifiedPayment | { ok: false; reason: string };

/** The API (hosted page) adapter. */
export interface PaymentAdapter {
  readonly provider: "grow" | "grow_mock";
  readonly flow: "hosted";
  createPayment(i: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Accepts bracketed form keys, flat keys, nested objects or a JSON body. */
  parseNotify(body: unknown, contentType: string): NotifyParsed;
  verify(n: NotifyParsed, order: OrderRecord): Promise<VerifyResult>;
  approve(n: NotifyParsed): Promise<{ ok: boolean; detail: string }>;
}

export function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === "1";
}

export type AnyPaymentAdapter = PaymentAdapter | GrowPagesAdapter | GrowMakeAdapter;
export type PaymentProviderName = "grow" | "grow_mock" | "grow_pages" | "grow_make";

export function paymentProviderSetting(): "grow_make" | "grow_pages" | "grow" | "mock" | "manual" {
  const p = (process.env.PAYMENT_PROVIDER || "grow_make").trim().toLowerCase();
  if (p === "grow_make" || p === "grow_pages" || p === "grow" || p === "mock" || p === "manual") return p;
  throw new Error("PAYMENT_PROVIDER must be grow_make, grow_pages, grow, mock or manual");
}

export function payments(): AnyPaymentAdapter {
  const p = paymentProviderSetting();
  if (p === "manual") throw new Error("PAYMENT_PROVIDER=manual has no payment adapter");
  if (p === "mock") return new MockGrowAdapter();
  if (p === "grow") return new GrowAdapter(growConfigFromEnv());
  if (p === "grow_pages") return new GrowPagesAdapter(growPagesConfigFromEnv());
  return new GrowMakeAdapter(growMakeConfigFromEnv());
}

/** Grow's payment-type text (payment-link webhook) -> our method; numbers go through methodFromType. */
export function methodFromText(t: string | null): "card" | "bit" | "apple_pay" | "google_pay" | "paybox" | "bank" | "other" {
  const v = String(t ?? "").trim().toLowerCase();
  if (!v) return "other";
  if (/^\d+$/.test(v)) return methodFromType(v);
  if (/ביט|\bbit\b/.test(v)) return "bit";
  if (/פייבוקס|paybox/.test(v)) return "paybox";
  if (/apple/.test(v)) return "apple_pay";
  if (/google/.test(v)) return "google_pay";
  if (/העברה|בנק|bank|transfer/.test(v)) return "bank";
  if (/אשראי|כרטיס|credit|card|visa|mastercard|isracard/.test(v)) return "card";
  return "other";
}

/** Grow transactionTypeId -> our method (02 section 8: 1 card, 5 PayBox, 6 bit, 13 Apple Pay, 14 Google Pay, 15 bank). */
export function methodFromType(t: string | null): "card" | "bit" | "apple_pay" | "google_pay" | "paybox" | "bank" | "other" {
  switch (String(t ?? "").trim()) {
    case "1": return "card";
    case "5": return "paybox";
    case "6": return "bit";
    case "13": return "apple_pay";
    case "14": return "google_pay";
    case "15": return "bank";
    default: return "other";
  }
}
