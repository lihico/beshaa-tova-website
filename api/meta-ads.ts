/**
 * Meta Ads insights for the /meta-ads dashboard page (auth: Bearer META_DASHBOARD_KEY).
 *
 * PLAN.md Stage 2: token META_ADS_TOKEN || META_ACCESS_TOKEN, Graph version from api/_meta_version.ts.
 * Plain fetch instead of facebook-nodejs-business-sdk, whose Graph version is fixed inside the SDK.
 * Same response shape as before ({summary, data, level, date_preset, time_range}). On a Graph error
 * the answer carries only json.error.code and error_subcode, never the token or the message body.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { graphError } from "./_meta-capi.js";
import { META_GRAPH_VERSION } from "./_meta_version.js";

type Level = "campaign" | "adset" | "ad";

export const INSIGHT_FIELDS = [
  "campaign_name",
  "adset_name",
  "ad_name",
  "impressions",
  "reach",
  "clicks",
  "cpc",
  "cpm",
  "ctr",
  "spend",
  "actions",
  "cost_per_action_type",
  "frequency",
  "date_start",
  "date_stop",
];

const SUMMARY_FIELDS = ["impressions", "reach", "spend", "clicks", "ctr", "cpm", "actions"];

export function adsToken(env: NodeJS.ProcessEnv = process.env): string {
  return env.META_ADS_TOKEN || env.META_ACCESS_TOKEN || "";
}

export class GraphCallError extends Error {
  constructor(public status: number, public code?: number, public error_subcode?: number) {
    super(`graph error ${status}${code !== undefined ? ` code ${code}` : ""}${error_subcode !== undefined ? `:${error_subcode}` : ""}`);
  }
}

/** One GET /act_<id>/insights page (the SDK call this replaces also read the first page only). */
export async function fetchInsights(
  accountId: string, token: string, fields: string[], params: Record<string, unknown>, fetchImpl: typeof fetch = fetch,
): Promise<Array<Record<string, unknown>>> {
  const qs = new URLSearchParams({ fields: fields.join(",") });
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    qs.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  qs.set("access_token", token);   // the URL carries the token: never log it
  const act = `act_${accountId.replace(/^act_/, "")}`;
  const res = await fetchImpl(`https://graph.facebook.com/${META_GRAPH_VERSION}/${act}/insights?${qs.toString()}`);
  const json = (await res.json().catch(() => ({}))) as { data?: unknown };
  if (!res.ok) {
    const e = graphError(json);
    throw new GraphCallError(res.status, e.code, e.error_subcode);
  }
  return Array.isArray(json.data) ? (json.data as Array<Record<string, unknown>>) : [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth required, unconditionally. If META_DASHBOARD_KEY is not set in env
  // we still 401 (rather than silently allowing all requests through) so a
  // missing env var fails closed instead of leaking ad performance data.
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.META_DASHBOARD_KEY;
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = adsToken();
  const accountId = process.env.META_AD_ACCOUNT_ID || "";
  if (!token || !accountId) {
    const missing = [!token ? "META_ADS_TOKEN (or META_ACCESS_TOKEN)" : "", !accountId ? "META_AD_ACCOUNT_ID" : ""].filter(Boolean);
    return res.status(500).json({ error: `Missing env vars: ${missing.join(", ")}` });
  }

  try {
    const {
      level = "campaign",
      date_preset = "last_30d",
      since,
      until,
    } = req.query as Record<string, string>;

    const lvl: Level = level === "adset" || level === "ad" ? level : "campaign";
    // Only one of date_preset / time_range is sent: Meta rejects an empty time_range.
    const range: Record<string, unknown> = since && until ? { time_range: { since, until } } : { date_preset };

    const rows = await fetchInsights(accountId, token, INSIGHT_FIELDS, { level: lvl, ...range });
    const data = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const f of INSIGHT_FIELDS) obj[f] = row[f];
      return obj;
    });

    const accountRows = await fetchInsights(accountId, token, SUMMARY_FIELDS, range);
    const a = accountRows[0];
    const summary = a
      ? {
          impressions: a.impressions,
          reach: a.reach,
          spend: a.spend,
          clicks: a.clicks,
          ctr: a.ctr,
          cpm: a.cpm,
          actions: a.actions,
        }
      : null;

    return res.status(200).json({
      summary,
      data,
      level: lvl,
      date_preset: since ? undefined : date_preset,
      time_range: since ? { since, until } : undefined,
    });
  } catch (err) {
    if (err instanceof GraphCallError) {
      console.error("Meta Ads API error:", err.message);
      return res.status(502).json({ error: err.message, code: err.code ?? null, error_subcode: err.error_subcode ?? null });
    }
    console.error("Meta Ads API error:", err instanceof Error ? err.message : "error");
    return res.status(500).json({ error: "Meta Ads request failed" });
  }
}
