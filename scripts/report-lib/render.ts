/**
 * Plain-text rendering of buildReport() (docs/attribution/00_DESIGN.md section 10). ILS, tables
 * sorted by revenue. Buyer names appear only in the per-order list (withOrders).
 */
import type { ChannelRow, Model, Report } from "./build.ts";
import type { CacNode, MetaCac } from "./join.ts";

type Cell = string | number | null | undefined;

const ils = (n: number) => `${Math.round(n).toLocaleString("en-US")} ILS`;
const pct = (x: number | null) => (x === null ? "-" : `${Math.round(x * 1000) / 10}%`);
const cell = (v: Cell) => (v === null || v === undefined || v === "" ? "-" : String(v));

export function table(headers: string[], rows: Cell[][]): string {
  const all = [headers, ...rows.map((r) => r.map(cell))];
  const w = headers.map((_, i) => Math.max(...all.map((r) => String(r[i] ?? "").length)));
  const line = (r: Cell[]) => r.map((v, i) => String(v ?? "").padEnd(w[i])).join("  ").trimEnd();
  if (!rows.length) return line(headers) + "\n(none)";
  return [line(headers), w.map((n) => "-".repeat(n)).join("  "), ...all.slice(1).map(line)].join("\n");
}

const h = (n: number, title: string) => `\n${n}. ${title}\n${"=".repeat(title.length + 3)}`;

function channelBlock(label: string, rows: ChannelRow[]): string {
  return `\n${label}\n` + table(["channel", "orders", "paid", "revenue", "commission"],
    rows.map((r) => [r.channel, r.orders, r.paid, ils(r.revenue), r.commission ? ils(r.commission) : "-"]));
}

const list = (ids: string[]) => (ids.length ? ids.join(", ") : "none");

export function renderText(r: Report, opts: { withOrders: boolean }): string {
  const out: string[] = [];
  const s = r.summary;
  out.push(`Attribution report  (generated ${r.generated_at}, source ${r.source})`);
  out.push(`window: ${r.window.from ?? "start"} .. ${r.window.to ?? "now"}   model: ${r.model}${r.paid_only ? "   paid only" : ""}`);
  if (r.excluded_tests.length) out.push(`test rows excluded: ${r.excluded_tests.length} (${r.excluded_tests.map((t) => `${t.order_id} ${t.reason}`).join(", ")})`);

  out.push(h(1, "Summary"));
  out.push(table(["metric", "value"], [
    ["orders submitted", s.orders_submitted], ["payable (not free)", s.payable_orders], ["paid", s.paid],
    ["paid rate", pct(s.paid_rate)], ["revenue", ils(s.revenue)], ["free redemptions", s.free_redemptions],
    ["pending", s.pending], ["pending older than 48 h", s.pending_over_48h.length], ["cancelled", s.cancelled],
    ["refunded", s.refunded], ["commission (not void)", ils(s.commission_total)],
  ]));
  out.push("\nby kind\n" + table(["kind", "orders", "paid", "revenue"],
    Object.entries(s.by_kind).map(([k, c]) => [k, c.orders, c.paid, ils(c.revenue)])));

  const order: Model[] = [r.model, ...(["credited", "first", "last"] as Model[]).filter((m) => m !== r.model)];
  const names: Record<Model, string> = { credited: "credited channel (credit rule, section 9.3)", first: "first touch", last: "last non-direct touch" };
  out.push(h(2, "By channel"));
  for (const m of order) out.push(channelBlock(names[m], r.by_channel[m]));

  out.push(h(3, `Meta drill-down (${r.model} model; touches from the touch log)`));
  const mrows: Cell[][] = [];
  for (const c of r.meta.campaigns) {
    mrows.push([`campaign ${c.campaign_id}`, c.campaign_name, c.touches, c.orders, c.paid, ils(c.revenue)]);
    for (const a of c.adsets) {
      mrows.push([`  adset ${a.adset_id}`, a.adset_name, a.touches, a.orders, a.paid, ils(a.revenue)]);
      for (const ad of a.ads) mrows.push([`    ad ${ad.ad_id}`, ad.ad_name, ad.touches, ad.orders, ad.paid, ils(ad.revenue)]);
    }
  }
  out.push(table(["id", "name", "touches", "orders", "paid", "revenue"], mrows));
  out.push("\nplacement\n" + table(["placement", "touches", "orders", "paid", "revenue"],
    r.meta.placements.map((p) => [p.placement, p.touches, p.orders, p.paid, ils(p.revenue)])));
  out.push(r.meta.cac ? renderCac(r.meta.cac) : "(no Meta spend loaded: run scripts/meta-insights.ts, then add --spend)");

  out.push(h(4, "QR and ref codes (orders = orders that touched the code; credited = the code got the credit)"));
  out.push(table(["code", "channel", "location", "status", "scans", "touches", "orders", "paid", "revenue", "credited paid", "credited revenue", "cost", "cost/paid"],
    r.codes.map((c) => [c.code, c.channel, c.location, c.in_registry ? c.status : "not in registry", c.scans, c.touches, c.orders, c.paid,
      ils(c.revenue), c.credited_paid, ils(c.credited_revenue), c.cost_ils === null ? null : ils(c.cost_ils), c.cost_per_paid === null ? null : ils(c.cost_per_paid)])));

  out.push(h(5, "Affiliates"));
  out.push(table(["partner", "code", "active", "code uses", "ref touches", "orders", "paid", "revenue", "pending", "approved", "paid out", "void"],
    r.affiliates.map((a) => [a.partner_id + (a.in_registry ? "" : " (not in registry)"), a.code, a.active === null ? null : a.active ? "yes" : "no",
      a.code_uses, a.ref_touches, a.orders, a.paid, ils(a.revenue), ils(a.commission.pending), ils(a.commission.approved),
      ils(a.commission.paid), a.self_referral_void ? `${ils(a.commission.void)} (${a.self_referral_void} self-referral)` : ils(a.commission.void)])));

  const mx = r.first_vs_last;
  out.push(h(6, "First touch (rows) x last touch (columns), paid orders"));
  out.push(table(["first \\ last", ...mx.cols], mx.rows.map((row) => [row, ...mx.cols.map((c) => mx.cells[row]?.[c] ?? 0)])));

  const sr = r.self_report;
  out.push(h(7, "Self-report vs tracked"));
  out.push(`answers ${sr.with_answer}, compared ${sr.compared} (unmapped answers ${sr.unmapped}, no tracked channel ${sr.no_tracked})`);
  out.push(`agreement: exact ${pct(sr.pct_strict)}, compatible ${pct(sr.pct_compatible)} (e.g. "instagram" vs a Meta ad counts as compatible)`);
  out.push(table(["order", "self-reported", "as channel", "tracked", "credit rule"],
    sr.disagreements.map((d) => [d.order_id, d.self_reported, d.self_channel, d.tracked_channel, d.credit_rule])));

  out.push(renderHealth(r));
  if (opts.withOrders) out.push(renderOrders(r));
  return out.join("\n") + "\n";
}

function renderHealth(r: Report): string {
  const x = r.health;
  const lines: Cell[][] = [
    ["paid orders", x.paid_orders, ""],
    ["paid orders with no touch at all", x.paid_no_touch.length, list(x.paid_no_touch)],
    ["paid orders missing capi_purchase_event_id", x.paid_missing_capi_event_id.length, list(x.paid_missing_capi_event_id)],
    ["CAPI Purchase events logged / distinct", `${x.capi_purchase_logged} / ${x.capi_purchase_unique}`, x.capi_log_present ? "from capi.jsonl" : "no capi.jsonl (prod: see the column)"],
    ["paid orders marked Purchase sent", x.capi_purchase_marked, "capi_purchase_sent_at"],
    ["paid orders with no logged Purchase", x.paid_without_logged_purchase.length, list(x.paid_without_logged_purchase)],
    ["Purchase for an unpaid or unknown order", x.purchase_for_unpaid.length, list(x.purchase_for_unpaid)],
    ["duplicate Purchase event ids", x.duplicate_purchase_events.length, list(x.duplicate_purchase_events)],
    ["orders with no logged Lead", x.lead_missing.length, list(x.lead_missing)],
    ["paid orders with no payment record", x.paid_without_payment_record.length, list(x.paid_without_payment_record)],
    ["payments for an unknown order", x.payments_without_order.length, list(x.payments_without_order)],
    ["orders with payment_fallback_reason", x.fallback.length, x.fallback.map((f) => `${f.order_id} (${f.reason})`).join(", ") || "none"],
    ["price mismatches (shown != charged)", x.price_mismatch.length, x.price_mismatch.map((p) => `${p.order_id} ${p.shown}!=${p.expected} ${p.rule}`).join(", ") || "none"],
    ["pending older than 48 h", x.pending_over_48h.length, list(x.pending_over_48h)],
    ["blocked egress (test harness)", x.blocked_egress === null ? "-" : x.blocked_egress, ""],
  ];
  return h(8, `Health checks: ${x.ok ? "OK" : "ATTENTION"}`) + "\n" + table(["check", "count", "orders"], lines);
}

function renderOrders(r: Report): string {
  return h(9, "Orders (buyer data: keep this list private)") + "\n" + table(
    ["order", "kind", "created", "status", "amount", "buyer", "phone", "credited", "rule", "detail", "first", "last", "self-reported", "partner", "commission", "method", "fallback"],
    r.orders.map((o) => [o.order_id, o.kind, o.created.slice(0, 16).replace("T", " "), o.status, o.paid_amount ?? o.amount, o.buyer, o.buyer_phone,
      o.credited, o.credit_rule, o.detail, o.first, o.last, o.self_reported, o.partner_id, o.commission, o.payment_method, o.fallback]))
    + "\n\n" + h(10, "Order sources (what each order is credited to, and its first and last touch)") + "\n" + table(
    ["order", "status", "amount", "credited", "rule", "detail", "code typed", "meta campaign / adset / ad", "qr code", "first touch", "last touch"],
    r.orders.map((o) => [o.order_id, o.status, o.paid_amount ?? o.amount, o.credited, o.credit_rule, o.detail, o.promo_code, o.meta, o.q_code, o.first_touch, o.last_touch]));
}

export function renderCommissionClose(changes: Array<{ order_id: string; partner_id: string | null; commission_ils: number | null; to: string; reason: string }>, applied: boolean, holdDays: number): string {
  return `\nCommission close (hold ${holdDays} days) ${applied ? "APPLIED" : "dry run"}\n` + table(["order", "partner", "commission", "to", "reason"],
    changes.map((c) => [c.order_id, c.partner_id, c.commission_ils === null ? null : ils(c.commission_ils), c.to, c.reason])) + "\n";
}

const money = (n: number | null) => (n === null ? "-" : (Math.round(n * 100) / 100).toFixed(2));
const cacCell = (n: Pick<CacNode, "cac" | "cac_label">) => (n.cac === null ? (n.cac_label ?? "-") : `${money(n.cac)}${n.cac_label ? ` (${n.cac_label})` : ""}`);

/** Spend and CAC (PLAN 1.6): last touch credited, first touch shown, Meta's own count as a sanity column. */
export function renderCac(c: MetaCac): string {
  const rows: Cell[][] = [];
  const line = (label: string, n: CacNode) =>
    [label, n.name, money(n.spend), n.impressions, n.link_clicks, n.paid, n.paid_ft, cacCell(n), n.roas_ex_vat ?? "-", n.meta_claimed];
  for (const camp of c.campaigns) {
    rows.push(line(`campaign ${camp.id}`, camp));
    for (const s of camp.adsets) {
      rows.push(line(`  adset ${s.id}`, s));
      for (const a of s.ads) rows.push(line(`    ad ${a.id}`, a));
    }
  }
  rows.push([c.unknown.label, null, "-", "-", "-", c.unknown.paid, "-", "-", "-", "-"]);
  rows.push(["total", null, money(c.totals.spend), "-", "-", c.totals.paid, "-", cacCell(c.totals), c.totals.roas_ex_vat ?? "-", c.totals.meta_claimed]);
  const head = `\nSpend and CAC (${c.currency ?? "currency ?"}; spend days ${c.window.from ?? "start"} .. ${c.window.to ?? "now"}; paid = last touch credited, paid_at in the window; ft = first touch, shown only)`;
  const foot = [
    `matched by id ${c.matches.id}, by ref ${c.matches.ref}, by utm_campaign ${c.matches.utm_campaign}, unknown ${c.matches.unknown}` +
      (c.unknown.order_ids.length ? ` (${c.unknown.order_ids.join(", ")})` : ""),
    `CAC = spend / paid. Under 3 paid orders it is marked "מוקדם" (the interval comes in Stage 4). ROAS on revenue ex-VAT (18%).`,
    `meta claimed = Meta's offsite_conversion.fb_pixel_purchase, a sanity column only. Spend pulled ${c.fetched_at ?? "-"}.`,
  ];
  return head + "\n" + table(["id", "name", "spend", "impr", "link clicks", "paid", "paid ft", "CAC", "ROAS ex-VAT", "meta claimed"], rows) + "\n" + foot.join("\n");
}
