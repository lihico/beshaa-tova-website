/**
 * GrowPagesAdapter: Grow Light WITHOUT the API (provider "grow_pages", the production default).
 * docs/attribution/GROW_LIGHT_SETUP.md; future/business_plan_2027/clearing_grow_without_api_2026-10-25.md.
 *
 * Flow A: Lihi creates one fixed Grow sales page ("עמוד מכירה קבוע") per exact amount. The site sends
 * the buyer to the page for the order's amount; the buyer types the order code in the page's
 * required custom field "קוד הזמנה"; Grow issues the invoice and redirects back to /order/thanks.
 * Payment is confirmed by Lihi's signed one-click link (api/_mark_paid.ts) or, if Grow posts it,
 * by the page's server-update webhook (Flow B, api/_grow_pages_notify.ts). There is no API call.
 *
 * Env:
 *   GROW_PAGE_URLS          JSON map amount -> page URL, e.g. {"349":"https://pay.grow.link/...","399":"..."}.
 *                           An amount without a page never gets a payment link: the order falls back to
 *                           today's WhatsApp flow (payment_fallback_reason "no_grow_page_for_amount").
 *   GROW_PAGE_ORDER_PARAM   optional. When set, "?<param>=<order_id>" is appended to the page URL, for
 *                           the day Grow confirms a fixed page can be prefilled from the URL (UNVERIFIED;
 *                           default off).
 */

export interface GrowPagesConfig {
  pages: Map<number, string>;
  orderParam: string | null;
}

function urlAllowed(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.protocol === "https:") return true;
    // The local fake Grow (scripts/mock-grow.ts) only, and only in test mode.
    return process.env.ATTR_TEST === "1" && x.protocol === "http:" && (x.hostname === "127.0.0.1" || x.hostname === "localhost");
  } catch {
    return false;
  }
}

/** Parse GROW_PAGE_URLS. Bad entries are reported by key, never by value. */
export function parseGrowPageUrls(raw: string | undefined): { pages: Map<number, string>; errors: string[] } {
  const pages = new Map<number, string>();
  const errors: string[] = [];
  const text = (raw ?? "").trim();
  if (!text) return { pages, errors };
  let obj: unknown;
  try { obj = JSON.parse(text); } catch { return { pages, errors: ["GROW_PAGE_URLS is not valid JSON"] }; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { pages, errors: ["GROW_PAGE_URLS must be a JSON object {amount: url}"] };
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const amount = Number(k);
    if (!Number.isInteger(amount) || amount <= 0) { errors.push(`key ${JSON.stringify(k).slice(0, 20)} is not a whole amount`); continue; }
    if (typeof v !== "string" || !urlAllowed(v.trim())) { errors.push(`amount ${amount}: not an https URL`); continue; }
    pages.set(amount, v.trim());
  }
  return { pages, errors };
}

let memo: { key: string; cfg: GrowPagesConfig } | null = null;

/** Read at call time (memoised per env value, so a bad entry is logged once per instance). */
export function growPagesConfigFromEnv(): GrowPagesConfig {
  const raw = process.env.GROW_PAGE_URLS ?? "";
  const param = (process.env.GROW_PAGE_ORDER_PARAM ?? "").trim();
  const key = `${process.env.ATTR_TEST ?? ""}|${param}|${raw}`;
  if (memo && memo.key === key) return memo.cfg;
  const { pages, errors } = parseGrowPageUrls(raw);
  if (errors.length) console.error("[grow-pages] GROW_PAGE_URLS problems:", errors.join("; "));
  const cfg = { pages, orderParam: /^[A-Za-z0-9_[\]-]{1,40}$/.test(param) ? param : null };
  memo = { key, cfg };
  return cfg;
}

export class GrowPagesAdapter {
  readonly provider = "grow_pages" as const;
  readonly flow = "fixed_page" as const;
  constructor(private cfg: GrowPagesConfig) {}

  /** The configured page for exactly this amount, or null (never a page for another amount). */
  pageUrlFor(amount: number): string | null {
    if (!Number.isInteger(amount) || amount <= 0) return null;
    return this.cfg.pages.get(amount) ?? null;
  }

  /** The URL the buyer opens: the page, plus ?<param>=<order_id> when GROW_PAGE_ORDER_PARAM is set. */
  paymentUrlFor(order_id: string, amount: number): string | null {
    const page = this.pageUrlFor(amount);
    if (!page) return null;
    if (!this.cfg.orderParam) return page;
    const u = new URL(page);
    u.searchParams.set(this.cfg.orderParam, order_id);
    return u.toString();
  }

  amounts(): number[] {
    return [...this.cfg.pages.keys()].sort((a, b) => a - b);
  }
}
