/**
 * Hard guardrails for meta-create-paused.ts (PLAN.md marketing_machine_2026-11, Stage 5 and section 6.3).
 *
 * Every POST the script makes passes through assertAllowedPost() before any byte leaves the machine:
 *   - only four endpoints, all "create new object" edges of the one ad account in meta.env:
 *       /act_<id>/adimages, /act_<id>/advideos, /act_<id>/adcreatives, /act_<id>/ads
 *     so a POST to /campaigns, /adsets, or to any existing object id (an edit) is refused;
 *   - no budget, bid, spend cap or targeting field anywhere in the payload (searched recursively,
 *     including inside JSON-encoded string values);
 *   - any status field must be PAUSED, and a POST to /ads must carry status PAUSED explicitly
 *     (Meta's default for a new ad is ACTIVE);
 *   - at most MAX_ADS_PER_RUN POSTs to /ads per run.
 * The script never sends DELETE, and GET calls are read-only: assertAllowedGet() limits them to a numeric
 * object id, the ad account, or <id>/previews, and refuses a "method" query parameter (Graph honours
 * ?method=post on a GET, which would otherwise be a write that skips the POST guard).
 */

export const MAX_ADS_PER_RUN = 6;

export const FORBIDDEN_KEYS = [
  "daily_budget", "lifetime_budget", "bid_amount", "bid_strategy", "spend_cap", "targeting",
  // the same things by another route: inline ad set or campaign creation, and budget variants
  "adset_spec", "campaign_spec", "daily_spend_cap", "lifetime_spend_cap", "bid_constraints", "budget_remaining",
] as const;

const STATUS_KEYS = ["status", "configured_status", "effective_status"];

export const ALLOWED_POST_EDGES = ["adimages", "advideos", "adcreatives", "ads"] as const;
export type AllowedEdge = (typeof ALLOWED_POST_EDGES)[number];

export class GuardError extends Error {
  constructor(message: string) { super(`guardrail: ${message}`); this.name = "GuardError"; }
}

/** The edge name for an allowed POST path, or a GuardError. `account` is "act_<digits>". */
export function allowedEdge(pathname: string, account: string): AllowedEdge {
  const clean = pathname.replace(/^\/+/, "").replace(/^v\d+\.\d+\//, "").replace(/\/+$/, "");
  const parts = clean.split("/");
  if (parts.length !== 2) throw new GuardError(`POST to "${clean}" refused: only /${account}/{${ALLOWED_POST_EDGES.join(",")}} may be posted to (no edits of existing objects)`);
  const [node, edge] = parts;
  if (node !== account) throw new GuardError(`POST to node "${node}" refused: only the ad account ${account} may be posted to`);
  if (edge === "campaigns" || edge === "adsets") throw new GuardError(`POST to /${edge} refused: campaigns and ad sets are Lihi's, by hand`);
  if (!(ALLOWED_POST_EDGES as readonly string[]).includes(edge)) throw new GuardError(`POST to /${account}/${edge} refused: not one of ${ALLOWED_POST_EDGES.join(", ")}`);
  return edge as AllowedEdge;
}

function tryParseJson(s: string): unknown {
  const t = s.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
}

/** Every forbidden key or non-PAUSED status inside `value`, as "a.b.c" paths. */
export function findViolations(value: unknown, at = "$"): string[] {
  const out: string[] = [];
  if (typeof value === "string") {
    const inner = tryParseJson(value);
    if (inner !== undefined) out.push(...findViolations(inner, at));
    return out;
  }
  if (Array.isArray(value)) { value.forEach((v, i) => out.push(...findViolations(v, `${at}[${i}]`))); return out; }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = `${at}.${k}`;
      if ((FORBIDDEN_KEYS as readonly string[]).includes(k.toLowerCase())) out.push(`${p} (forbidden field)`);
      if (STATUS_KEYS.includes(k.toLowerCase()) && v !== "PAUSED") out.push(`${p}=${JSON.stringify(v)} (only PAUSED is allowed)`);
      out.push(...findViolations(v, p));
    }
  }
  return out;
}

export function assertPayloadSafe(edge: AllowedEdge, payload: Record<string, unknown>): void {
  const v = findViolations(payload);
  if (v.length) throw new GuardError(`payload for /${edge} refused: ${v.join("; ")}`);
  if (edge === "ads" && payload.status !== "PAUSED") throw new GuardError("payload for /ads refused: status must be sent as PAUSED (Meta defaults a new ad to ACTIVE)");
}

const GET_PATH_RE = /^(act_\d+|\d+)(\/previews)?$/;

/** Throws a GuardError unless this GET is a plain read of an id, the account, or an ad preview. */
export function assertAllowedGet(pathname: string, query: Record<string, string>): void {
  const clean = pathname.replace(/^\/+/, "");
  if (!GET_PATH_RE.test(clean)) throw new GuardError(`GET "${clean}" refused: only a numeric id, the ad account, or <id>/previews`);
  for (const k of Object.keys(query)) if (k.trim().toLowerCase() === "method") throw new GuardError("GET with a method parameter refused (would turn the read into a write)");
}

/** One per run. Counts /ads POSTs and refuses the seventh. */
export class PostGuard {
  private ads = 0;
  constructor(readonly account: string, readonly maxAds = MAX_ADS_PER_RUN) {
    if (!/^act_\d+$/.test(account)) throw new GuardError("ad account must be act_<digits>");
  }
  /** Throws a GuardError unless this POST is allowed; returns the edge. */
  check(pathname: string, payload: Record<string, unknown>): AllowedEdge {
    const edge = allowedEdge(pathname, this.account);
    assertPayloadSafe(edge, payload);
    if (edge === "ads") {
      if (this.ads >= this.maxAds) throw new GuardError(`at most ${this.maxAds} ads per run`);
      this.ads++;
    }
    return edge;
  }
  get adsPosted(): number { return this.ads; }
}
