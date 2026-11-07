/**
 * Spend join and CAC (PLAN.md marketing_machine_2026-11, Stage 1 item 1.6). Pure: no fs, no network.
 *
 * Credit: the last touch (the lt_meta_* columns) of every paid order, not refunded, not a test (the
 * loader already drops tests), with paid_at inside the window. The first touch (ft_) is shown next to
 * it as `paid_ft`, never used for CAC.
 *
 *   CAC(node) = spend(node, dates) / paid orders credited to node     (null when there are none)
 *
 * Resolution of an order's touch to a Meta campaign / ad set / ad, in this order:
 *   1. ids on the touch (cid / asid / aid from the 9.1 URL string, or ref=meta-<ad id>);
 *   2. ref -> ad: the ad's url_tags (`ref=` or `v=`) from GET /act_<id>/ads, else the
 *      meta_upload.csv "Ref code" -> "Ad name" -> the ad with that name in the insights / ads list;
 *   3. utm_campaign -> the campaign with that name (campaign level only);
 *   4. otherwise the order lands in the visible row "Meta, ad unknown".
 * Meta's own offsite_conversion.fb_pixel_purchase count is carried as `meta_claimed`, a sanity column only.
 * Ad set and campaign spend are sums of the ad rows; reach is not summed (it is not additive).
 */
import type { OrderRecord, Touch } from "../../api/_attribution_core.ts";

export interface MetaAction { action_type: string; value: string | number }

/** One insights row at level=ad, time_increment=1 (numbers already parsed by meta-insights.ts). */
export interface InsightRow {
  date_start: string; date_stop: string; account_currency?: string | null;
  campaign_id: string; campaign_name?: string | null;
  adset_id: string; adset_name?: string | null;
  ad_id: string; ad_name?: string | null;
  objective?: string | null; optimization_goal?: string | null;
  spend: number; impressions: number; reach?: number | null; frequency?: number | null;
  clicks: number; inline_link_clicks: number;
  actions?: MetaAction[]; action_values?: MetaAction[]; cost_per_action_type?: MetaAction[];
}

/** One row of GET /act_<id>/ads?fields=id,name,adset_id,campaign_id,creative{url_tags}. */
export interface AdMeta { id: string; name: string | null; adset_id: string | null; campaign_id: string | null; url_tags: string | null }

export interface SpendData {
  rows: InsightRow[];
  ads: AdMeta[];
  /** lower-cased ref code -> ad name (from meta_upload.csv). */
  ref_to_ad_name: Record<string, string>;
  fetched_at?: string | null;
}

export const UNKNOWN_LABEL = "Meta, ad unknown";
export const EARLY_LABEL = "מוקדם";
export const EARLY_BELOW_PAID = 3;
export const VAT_RATE = 0.18;
export const META_PURCHASE_ACTION = "offsite_conversion.fb_pixel_purchase";

export interface CacNode {
  id: string; name: string | null;
  spend: number; impressions: number; clicks: number; link_clicks: number; meta_claimed: number;
  paid: number; paid_ft: number; revenue: number;
  cac: number | null; cac_label: string | null; roas_ex_vat: number | null;
  order_ids: string[];
}
export interface CacAdset extends CacNode { ads: CacNode[] }
export interface CacCampaign extends CacNode { adsets: CacAdset[] }

export type MatchMethod = "id" | "ref" | "utm_campaign";

export interface MetaCac {
  window: { from: string | null; to: string | null };
  currency: string | null;
  fetched_at: string | null;
  campaigns: CacCampaign[];
  unknown: { label: string; paid: number; revenue: number; order_ids: string[] };
  totals: { spend: number; paid: number; revenue: number; meta_claimed: number; cac: number | null; cac_label: string | null; roas_ex_vat: number | null };
  matches: Record<MatchMethod | "unknown", number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const low = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export function israelDay(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(ms));
}

const inRange = (d: string, w: { from: string | null; to: string | null }) =>
  !!d && (!w.from || d >= w.from) && (!w.to || d <= w.to);

export function actionValue(list: MetaAction[] | undefined, type: string): number {
  let n = 0;
  for (const a of list ?? []) if (a && a.action_type === type) n += Number(a.value) || 0;
  return n;
}

export function cacOf(spend: number, paid: number): { cac: number | null; cac_label: string | null } {
  return { cac: paid > 0 ? round2(spend / paid) : null, cac_label: paid < EARLY_BELOW_PAID ? EARLY_LABEL : null };
}

// ---------------------------------------------------------------------------------------------
// CSV (meta_upload.csv: BOM, quoted fields with newlines)
// ---------------------------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/** "Ref code" (and "Earlier working ref") -> "Ad name", keys lower-cased. */
export function refMapFromCsv(text: string): Record<string, string> {
  const [head, ...body] = parseCsv(text);
  if (!head) return {};
  const col = (n: string) => head.findIndex((h) => h.trim().toLowerCase() === n);
  const name = col("ad name"), refs = [col("ref code"), col("earlier working ref")].filter((i) => i >= 0);
  const out: Record<string, string> = {};
  if (name < 0) return out;
  for (const r of body) {
    const ad = (r[name] ?? "").trim();
    if (!ad) continue;
    for (const i of refs) { const k = low(r[i]); if (k && !out[k]) out[k] = ad; }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------------

interface AdInfo { ad_id: string; adset_id: string | null; campaign_id: string | null; name: string | null }
export interface Resolved { campaign_id: string; adset_id: string | null; ad_id: string | null; method: MatchMethod }

export interface Lookup {
  adById: Map<string, AdInfo>;
  adsByName: Map<string, AdInfo[]>;
  adByTag: Map<string, string>;
  refToAdName: Map<string, string>;
  campaignByName: Map<string, string[]>;
  adsetCampaign: Map<string, string>;
}

function parseTags(tags: string | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of (tags ?? "").replace(/^\?/, "").split("&")) {
    const [k, ...v] = part.split("=");
    if (!k) continue;
    let val = v.join("=");
    try { val = decodeURIComponent(val.replace(/\+/g, " ")); } catch { /* keep raw */ }
    m.set(k.trim().toLowerCase(), val.trim());
  }
  return m;
}

export function buildLookup(spend: SpendData): Lookup {
  const adById = new Map<string, AdInfo>();
  const put = (a: AdInfo) => {
    const prev = adById.get(a.ad_id);
    adById.set(a.ad_id, {
      ad_id: a.ad_id, adset_id: a.adset_id ?? prev?.adset_id ?? null,
      campaign_id: a.campaign_id ?? prev?.campaign_id ?? null, name: a.name ?? prev?.name ?? null,
    });
  };
  const campaignByName = new Map<string, string[]>();
  const adsetCampaign = new Map<string, string>();
  for (const r of spend.rows) {
    put({ ad_id: r.ad_id, adset_id: r.adset_id || null, campaign_id: r.campaign_id || null, name: r.ad_name ?? null });
    if (r.adset_id && r.campaign_id) adsetCampaign.set(r.adset_id, r.campaign_id);
    const cn = low(r.campaign_name);
    if (cn && r.campaign_id) {
      const ids = campaignByName.get(cn) ?? [];
      if (!ids.includes(r.campaign_id)) ids.push(r.campaign_id);
      campaignByName.set(cn, ids);
    }
  }
  const adByTag = new Map<string, string>();
  for (const a of spend.ads) {
    put({ ad_id: a.id, adset_id: a.adset_id, campaign_id: a.campaign_id, name: a.name });
    if (a.adset_id && a.campaign_id) adsetCampaign.set(a.adset_id, a.campaign_id);
    const tags = parseTags(a.url_tags);
    for (const k of ["ref", "v"]) { const v = low(tags.get(k)); if (v && !/^meta-/.test(v) && !v.includes("{{")) adByTag.set(v, a.id); }
  }
  const adsByName = new Map<string, AdInfo[]>();
  for (const a of adById.values()) {
    const n = low(a.name);
    if (n) adsByName.set(n, [...(adsByName.get(n) ?? []), a]);
  }
  const refToAdName = new Map(Object.entries(spend.ref_to_ad_name ?? {}).map(([k, v]) => [low(k), v]));
  return { adById, adsByName, adByTag, refToAdName, campaignByName, adsetCampaign };
}

function fromAd(L: Lookup, ad_id: string, t: Touch, method: MatchMethod): Resolved | null {
  const a = L.adById.get(ad_id);
  const adset_id = t.meta_adset_id || a?.adset_id || null;
  const campaign_id = t.meta_campaign_id || a?.campaign_id || (adset_id ? L.adsetCampaign.get(adset_id) : undefined) || null;
  return campaign_id ? { campaign_id, adset_id, ad_id, method } : null;
}

function fromAdName(L: Lookup, name: string, t: Touch): Resolved | null {
  const hits = L.adsByName.get(low(name)) ?? [];
  if (hits.length === 1) return fromAd(L, hits[0].ad_id, t, "ref");
  const camps = [...new Set(hits.map((h) => h.campaign_id).filter(Boolean))];
  if (hits.length > 1 && camps.length === 1) {
    const sets = [...new Set(hits.map((h) => h.adset_id).filter(Boolean))];
    return { campaign_id: camps[0] as string, adset_id: sets.length === 1 ? (sets[0] as string) : null, ad_id: null, method: "ref" };
  }
  return null;
}

/** Map one touch to a Meta campaign / ad set / ad (null = unknown). */
export function resolveTouch(t: Touch | null | undefined, L: Lookup): Resolved | null {
  if (!t) return null;
  const metaRef = /^meta-(\d+)$/i.exec(t.ref ?? "");
  const adId = t.meta_ad_id || (metaRef ? metaRef[1] : null);
  if (adId) {
    const r = fromAd(L, adId, t, "id");
    if (r) return r;
  }
  if (t.meta_campaign_id) return { campaign_id: t.meta_campaign_id, adset_id: t.meta_adset_id || null, ad_id: null, method: "id" };
  if (t.meta_adset_id && L.adsetCampaign.has(t.meta_adset_id)) {
    return { campaign_id: L.adsetCampaign.get(t.meta_adset_id) as string, adset_id: t.meta_adset_id, ad_id: null, method: "id" };
  }
  const ref = low(t.ref);
  if (ref && !metaRef) {
    const tagged = L.adByTag.get(ref);
    if (tagged) { const r = fromAd(L, tagged, t, "ref"); if (r) return { ...r, method: "ref" }; }
    const name = L.refToAdName.get(ref);
    if (name) { const r = fromAdName(L, name, t); if (r) return r; }
  }
  const camps = L.campaignByName.get(low(t.utm_campaign)) ?? [];
  if (camps.length === 1) return { campaign_id: camps[0], adset_id: null, ad_id: null, method: "utm_campaign" };
  return null;
}

/** An order whose credited (last) touch, or credited channel, says Meta. */
export function isMetaTouch(t: Touch | null | undefined): boolean {
  if (!t) return false;
  return t.channel === "paid_meta" || !!(t.meta_campaign_id || t.meta_adset_id || t.meta_ad_id) || /^meta-/i.test(t.ref ?? "");
}

// ---------------------------------------------------------------------------------------------
// The join
// ---------------------------------------------------------------------------------------------

const node = (id: string, name: string | null): CacNode => ({
  id, name, spend: 0, impressions: 0, clicks: 0, link_clicks: 0, meta_claimed: 0, paid: 0, paid_ft: 0, revenue: 0,
  cac: null, cac_label: null, roas_ex_vat: null, order_ids: [],
});

const paidAmount = (o: OrderRecord) => Number(o.paid_amount ?? o.amount_expected) || 0;

export function joinSpend(orders: OrderRecord[], spend: SpendData, window: { from?: string | null; to?: string | null } = {}): MetaCac {
  const w = { from: window.from ?? null, to: window.to ?? null };
  const L = buildLookup(spend);
  const camps = new Map<string, CacCampaign>();
  const campaign = (id: string, name: string | null = null): CacCampaign => {
    let c = camps.get(id);
    if (!c) camps.set(id, (c = { ...node(id, name), adsets: [] }));
    if (name && !c.name) c.name = name;
    return c;
  };
  const adset = (c: CacCampaign, id: string, name: string | null = null): CacAdset => {
    let s = c.adsets.find((x) => x.id === id);
    if (!s) c.adsets.push((s = { ...node(id, name), ads: [] }));
    if (name && !s.name) s.name = name;
    return s;
  };
  const ad = (s: CacAdset, id: string, name: string | null = null): CacNode => {
    let a = s.ads.find((x) => x.id === id);
    if (!a) s.ads.push((a = node(id, name)));
    if (name && !a.name) a.name = name;
    return a;
  };

  let currency: string | null = null;
  for (const r of spend.rows) {
    if (!inRange(r.date_start, w)) continue;
    currency ??= r.account_currency ?? null;
    const c = campaign(r.campaign_id, r.campaign_name ?? null);
    const s = adset(c, r.adset_id, r.adset_name ?? null);
    const a = ad(s, r.ad_id, r.ad_name ?? null);
    const claimed = actionValue(r.actions, META_PURCHASE_ACTION);
    for (const n of [c, s, a]) {
      n.spend += r.spend || 0; n.impressions += r.impressions || 0; n.clicks += r.clicks || 0;
      n.link_clicks += r.inline_link_clicks || 0; n.meta_claimed += claimed;
    }
  }

  const nodesFor = (res: Resolved): CacNode[] => {
    const c = campaign(res.campaign_id);
    const out: CacNode[] = [c];
    if (res.adset_id) {
      const s = adset(c, res.adset_id);
      out.push(s);
      if (res.ad_id) out.push(ad(s, res.ad_id, L.adById.get(res.ad_id)?.name ?? null));
    }
    return out;
  };

  const unknown = { label: UNKNOWN_LABEL, paid: 0, revenue: 0, order_ids: [] as string[] };
  const matches: MetaCac["matches"] = { id: 0, ref: 0, utm_campaign: 0, unknown: 0 };
  for (const o of orders) {
    if (o.payment_status !== "paid") continue;                       // refunded / cancelled / pending / free are out
    if (!inRange(israelDay(o.paid_at || o.created_at), w)) continue;
    const amt = paidAmount(o);
    const credited = resolveTouch(o.last, L);
    if (credited) {
      matches[credited.method] += 1;
      for (const n of nodesFor(credited)) { n.paid += 1; n.revenue += amt; n.order_ids.push(o.order_id); }
    } else if (isMetaTouch(o.last) || o.credited_channel === "paid_meta") {
      matches.unknown += 1;
      unknown.paid += 1; unknown.revenue += amt; unknown.order_ids.push(o.order_id);
    }
    const first = resolveTouch(o.first, L);
    if (first) for (const n of nodesFor(first)) n.paid_ft += 1;
  }

  const finish = (n: CacNode) => {
    n.spend = round2(n.spend);
    n.revenue = round2(n.revenue);
    Object.assign(n, cacOf(n.spend, n.paid));
    n.roas_ex_vat = n.spend > 0 ? round2(n.revenue / (1 + VAT_RATE) / n.spend) : null;
  };
  const bySpend = (a: CacNode, b: CacNode) => b.spend - a.spend || b.paid - a.paid || a.id.localeCompare(b.id);
  const campaigns = [...camps.values()];
  for (const c of campaigns) {
    finish(c);
    for (const s of c.adsets) { finish(s); s.ads.forEach(finish); s.ads.sort(bySpend); }
    c.adsets.sort(bySpend);
  }
  campaigns.sort(bySpend);
  unknown.revenue = round2(unknown.revenue);

  const tSpend = round2(campaigns.reduce((x, c) => x + c.spend, 0));
  const tPaid = campaigns.reduce((x, c) => x + c.paid, 0) + unknown.paid;
  const tRev = round2(campaigns.reduce((x, c) => x + c.revenue, 0) + unknown.revenue);
  return {
    window: w, currency, fetched_at: spend.fetched_at ?? null, campaigns, unknown,
    totals: {
      spend: tSpend, paid: tPaid, revenue: tRev, meta_claimed: campaigns.reduce((x, c) => x + c.meta_claimed, 0),
      ...cacOf(tSpend, tPaid), roas_ex_vat: tSpend > 0 ? round2(tRev / (1 + VAT_RATE) / tSpend) : null,
    },
    matches,
  };
}
