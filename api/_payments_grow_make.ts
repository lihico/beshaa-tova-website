/**
 * GrowMakeAdapter (provider "grow_make", the preferred provider): per-order Grow payment links on a
 * Light account through Grow's official Make app (https://developers.grow.business/docs/grow-app-for-make ;
 * module "Create Payment Link" = https://developers.grow.business/reference/post_api-light-server-1-0-createpaymentlink ).
 * The two Make scenarios Lihi or Nativ build are in docs/attribution/GROW_LIGHT_SETUP.md.
 *
 * Create: startPayment POSTs the order to a Make custom webhook (GROW_MAKE_CREATE_URL) with the shared
 * secret header x-grow-make-secret (GROW_MAKE_SECRET). The scenario calls Grow's "Create Payment Link"
 * with the exact price, payer details and cField1 = order_id, and answers synchronously through a
 * "Webhook response" module with {"payment_url": "..."}. Timeout GROW_MAKE_TIMEOUT_MS (default 10 s).
 * On any failure: the fixed Grow page for the exact amount (grow_pages), then today's WhatsApp
 * fallback. Never a link for another amount.
 *
 * Confirm: Make's "Notify URL Webhook" trigger receives Grow's notify and an HTTP module forwards it to
 * /api/grow-notify/<GROW_NOTIFY_SECRET> with the same secret header. processMakeNotify() matches by
 * cField1 = order_id, checks paid + exact sum, is idempotent on transactionId, and answers
 * {approve: true|false} (api/_grow_make_notify.ts): the scenario runs Grow's "Approve Transaction" only on true (Grow re-sends an
 * unapproved notify up to 5 more times). Lihi's signed mark-paid link stays the manual backup.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { normalizeIsraeliMobile } from "./_attribution_core.js";
import type { CreatePaymentInput } from "./_payments.js";
import { GrowPagesAdapter, growPagesConfigFromEnv } from "./_payments_grow_pages.js";

export const MAKE_SECRET_HEADER = "x-grow-make-secret";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface GrowMakeConfig {
  createUrl: string | null; secret: string | null; timeoutMs: number;
  publicBaseUrl: string; notifyBaseUrl: string; notifySecret: string;
}

function urlAllowed(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.protocol === "https:") return true;
    return process.env.ATTR_TEST === "1" && x.protocol === "http:" && (x.hostname === "127.0.0.1" || x.hostname === "localhost");
  } catch {
    return false;
  }
}

export function growMakeConfigFromEnv(): GrowMakeConfig {
  const e = process.env;
  const createUrl = (e.GROW_MAKE_CREATE_URL ?? "").trim();
  const secret = (e.GROW_MAKE_SECRET ?? "").trim();
  const publicBaseUrl = (e.PUBLIC_BASE_URL || "https://www.beshaa-tova.co.il").replace(/\/+$/, "");
  const t = Number(e.GROW_MAKE_TIMEOUT_MS);
  return {
    createUrl: createUrl && urlAllowed(createUrl) ? createUrl : null,
    secret: secret.length >= 16 ? secret : null,
    timeoutMs: Number.isFinite(t) && t >= 500 && t <= 25_000 ? t : DEFAULT_TIMEOUT_MS,
    publicBaseUrl, notifyBaseUrl: (e.NOTIFY_BASE_URL || publicBaseUrl).replace(/\/+$/, ""),
    notifySecret: (e.GROW_NOTIFY_SECRET ?? "").trim(),
  };
}

/** Constant-time check of the shared secret header (both sides hashed, so lengths never leak). */
export function makeSecretOk(header: unknown, secret: string | null): boolean {
  if (!secret || typeof header !== "string" || !header) return false;
  const a = createHash("sha256").update(header).digest(), b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export type MakeLinkResult = { ok: true; payment_url: string; link_id: string | null } | { ok: false; reason: string };

export class GrowMakeAdapter {
  readonly provider = "grow_make" as const;
  readonly flow = "make" as const;
  readonly pages: GrowPagesAdapter;
  constructor(private cfg: GrowMakeConfig, pages?: GrowPagesAdapter) {
    this.pages = pages ?? new GrowPagesAdapter(growPagesConfigFromEnv());
  }

  get configured(): boolean {
    return !!this.cfg.createUrl && !!this.cfg.secret;
  }

  /** The body the Make scenario receives (no tokens; the payer details Grow needs for the link). */
  requestBody(i: CreatePaymentInput): Record<string, unknown> {
    const thanks = `${this.cfg.publicBaseUrl}/order/thanks/${i.order_id}`;
    return {
      order_id: i.order_id, amount: i.amount, currency: "ILS",
      product_name: i.kind === "gift" ? "שובר מתנה בשעה טובה" : "ערכת מפגשים בשעה טובה",   // DRAFT he copy: awaiting Lihi
      description: i.description, kind: i.kind, catalog_number: i.catalogNumber ?? (i.kind === "gift" ? "gift" : "kit"),
      payer: { full_name: i.buyer.name, phone: normalizeIsraeliMobile(i.buyer.phone) ?? i.buyer.phone, email: i.buyer.email },
      cField1: i.cFields.cField1, cField2: i.cFields.cField2,
      success_url: thanks,
      notify_url: this.cfg.notifySecret ? `${this.cfg.notifyBaseUrl}/api/grow-notify/${this.cfg.notifySecret}` : null,
    };
  }

  /** Ask the Make scenario for a per-order link. Never throws. */
  async createLink(i: CreatePaymentInput): Promise<MakeLinkResult> {
    if (!this.cfg.createUrl) return { ok: false, reason: "make_not_configured" };
    if (!this.cfg.secret) return { ok: false, reason: "make_secret_missing" };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.cfg.timeoutMs);
    try {
      const r = await fetch(this.cfg.createUrl, {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json", [MAKE_SECRET_HEADER]: this.cfg.secret },
        // The secret also travels in the body: Make's custom webhook drops request headers unless
        // "Get request headers" is switched on in its UI, so Scenario A's filter checks `make_secret`.
        body: JSON.stringify({ ...this.requestBody(i), make_secret: this.cfg.secret }),
      });
      const text = await r.text();
      if (!r.ok) return { ok: false, reason: `make_http_${r.status}` };
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(text) as Record<string, unknown>; } catch { return { ok: false, reason: "make_not_json" }; }
      const data = (j.data && typeof j.data === "object" ? j.data : {}) as Record<string, unknown>;
      const url = [j.payment_url, j.url, data.url, data.payment_url].find((x) => typeof x === "string" && x) as string | undefined;
      if (!url || !urlAllowed(url)) return { ok: false, reason: "make_no_url" };
      // Never a link for another amount: when Make echoes the amount, it must match.
      const echoed = j.amount ?? data.sum ?? data.amount;
      if (echoed !== undefined && echoed !== null && echoed !== "" && Number(echoed) !== i.amount) return { ok: false, reason: "make_amount_mismatch" };
      const id = [j.link_id, j.processId, data.processId, data.paymentLinkId].find((x) => typeof x === "string" || typeof x === "number");
      return { ok: true, payment_url: url, link_id: id === undefined ? null : String(id).slice(0, 64) };
    } catch (e) {
      return { ok: false, reason: (e as { name?: string })?.name === "AbortError" ? "make_timeout" : "make_network" };
    } finally {
      clearTimeout(timer);
    }
  }
}

