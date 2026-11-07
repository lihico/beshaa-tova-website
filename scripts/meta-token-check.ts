/**
 * Meta token check (PLAN.md marketing_machine_2026-11, Stage 1 item 1.1). One read-only Graph call:
 *
 *   npx tsx scripts/meta-token-check.ts [--var META_ADS_TOKEN] [--secrets ~/.config/besha/meta.env]
 *
 * GET /<META_GRAPH_VERSION>/debug_token?input_token=<token>&access_token=<app id>|<app secret>
 * Prints is_valid, type, expires_at (0 = never), scopes, and the days left; never the token, the app
 * secret, the user id or the app name. Exit 0 = valid, 1 = invalid or the call failed, 2 = setup error.
 * The expected result for the ads token is: valid, type SYSTEM_USER, expires 0.
 *
 * Secrets come ONLY from ~/.config/besha/meta.env (mode 600), never .env.local, never process.env:
 *   META_ADS_TOKEN    the token checked by default (System User, ads_read)
 *   META_APP_ID       the Meta app id
 *   META_APP_SECRET   the Meta app secret
 * `--var NAME` checks another token in the same file instead (for example META_CAPI_TOKEN, or the old
 * META_ACCESS_TOKEN when recording why CAPI fails, PLAN Stage 2).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { META_GRAPH_VERSION } from "../api/_meta_version.ts";
import { DEFAULT_META_ENV, envFileModeWarning, readSecretEnv } from "./report-lib/load.ts";
import { GRAPH_HOST, scrub, type FetchLike } from "./meta-insights.ts";

export interface TokenInfo {
  is_valid: boolean; type: string | null; expires_at: number | null; data_access_expires_at: number | null;
  scopes: string[]; error_code: number | null; error_subcode: number | null;
}

export function debugTokenUrl(version: string, token: string, appId: string, appSecret: string): string {
  const p = new URLSearchParams({ input_token: token, access_token: `${appId}|${appSecret}` });
  return `${GRAPH_HOST}/${version}/debug_token?${p.toString()}`;
}

/** Keeps only the fields that are safe to print. */
export function pickTokenInfo(body: unknown): TokenInfo {
  const d = ((body as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
  const err = (d.error ?? null) as { code?: unknown; subcode?: unknown } | null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    is_valid: d.is_valid === true,
    type: typeof d.type === "string" ? d.type : null,
    expires_at: n(d.expires_at), data_access_expires_at: n(d.data_access_expires_at),
    scopes: Array.isArray(d.scopes) ? d.scopes.filter((s): s is string => typeof s === "string") : [],
    error_code: n(err?.code), error_subcode: n(err?.subcode),
  };
}

const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

export function describe(info: TokenInfo, now: Date): string[] {
  const lines = [
    `is_valid: ${info.is_valid}`,
    `type: ${info.type ?? "-"}`,
    `expires_at: ${info.expires_at === null ? "-" : info.expires_at === 0 ? "0 (never)" : `${info.expires_at} (${iso(info.expires_at)}, ${Math.floor((info.expires_at * 1000 - now.getTime()) / 86_400_000)} days left)`}`,
    `data_access_expires_at: ${info.data_access_expires_at === null ? "-" : info.data_access_expires_at === 0 ? "0 (never)" : iso(info.data_access_expires_at)}`,
    `scopes: ${info.scopes.length ? info.scopes.join(", ") : "-"}`,
  ];
  if (info.error_code !== null) lines.push(`error: code ${info.error_code} subcode ${info.error_subcode ?? "-"}`);
  const want = info.is_valid && info.type === "SYSTEM_USER" && info.expires_at === 0;
  lines.push(want ? "verdict: OK (valid, SYSTEM_USER, never expires)" : info.is_valid ? "verdict: VALID, but not a never-expiring System User token" : "verdict: INVALID");
  return lines;
}

export interface CheckArgs { envFile: string; varName: string }

export function parseArgs(argv: string[]): CheckArgs {
  const a: CheckArgs = { envFile: DEFAULT_META_ENV, varName: "META_ADS_TOKEN" };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i], v = argv[i + 1];
    if ((f === "--secrets" || f === "--var") && (v === undefined || v.startsWith("--"))) throw new Error(`${f} needs a value`);
    if (f === "--secrets") { a.envFile = v; i++; }
    else if (f === "--var") { if (!/^[A-Z_][A-Z0-9_]*$/.test(v)) throw new Error("--var is an env name"); a.varName = v; i++; }
    else throw new Error(`unknown flag ${f}`);
  }
  return a;
}

export async function run(argv: string[], deps: { fetch: FetchLike; now?: Date; log?: (s: string) => void; readFile?: (f: string) => string }): Promise<number> {
  const log = deps.log ?? ((s: string) => process.stdout.write(s + "\n"));
  let args: CheckArgs, env: Record<string, string>;
  try {
    args = parseArgs(argv);
    env = readSecretEnv(args.envFile, [args.varName, "META_APP_ID", "META_APP_SECRET"], { readFile: deps.readFile });
  } catch (e) {
    log(`meta-token-check: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  if (!deps.readFile) { const w = envFileModeWarning(args.envFile); if (w) log(`warning: ${w}`); }
  const token = env[args.varName], secrets = [token, env.META_APP_SECRET, `${env.META_APP_ID}|${env.META_APP_SECRET}`];
  const clean = (s: string) => secrets.reduce((acc, x) => scrub(acc, x), s);
  try {
    const res = await deps.fetch(debugTokenUrl(META_GRAPH_VERSION, token, env.META_APP_ID, env.META_APP_SECRET));
    let body: unknown = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const top = (body as { error?: { code?: unknown; error_subcode?: unknown; type?: unknown } } | null)?.error;
    if (!res.ok || top) {
      log(clean(`meta-token-check: debug_token failed: HTTP ${res.status} code ${top?.code ?? "-"} subcode ${top?.error_subcode ?? "-"} ${top?.type ?? ""}`.trim()));
      return 1;
    }
    const info = pickTokenInfo(body);
    log(`token ${args.varName} (Graph ${META_GRAPH_VERSION})`);
    for (const l of describe(info, deps.now ?? new Date())) log(clean(l));
    return info.is_valid ? 0 : 1;
  } catch (e) {
    log(clean(`meta-token-check: ${e instanceof Error ? e.message : String(e)}`));
    return 1;
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  run(process.argv.slice(2), { fetch: (u) => fetch(u) }).then((code) => process.exit(code));
}
