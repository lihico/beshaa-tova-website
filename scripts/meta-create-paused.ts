/**
 * Create approved ad drafts in Meta as PAUSED ads (PLAN.md marketing_machine_2026-11, Stage 5 and 6.3).
 * Lihi publishes them herself in Ads Manager. Nothing here ever activates, edits, budgets or targets.
 *
 *   npx tsx scripts/meta-create-paused.ts --approve-hash <approvals.json>
 *       prints the sha256 of the drafts array; Lihi puts it in "approved_sha256" when she approves.
 *   npx tsx scripts/meta-create-paused.ts --draft-approvals <campaign_dir> --adset <id> --ids eng-s1,cpl-q1s
 *       prints a skeleton approvals file from that campaign's meta_upload.csv (to stdout, nothing written).
 *   npx tsx scripts/meta-create-paused.ts --approvals <approvals.json>            (dry run, the default)
 *       runs every check and prints every payload; makes no network call at all.
 *   npx tsx scripts/meta-create-paused.ts --approvals <approvals.json> --create
 *       GET  /act_<id>?fields=spend_cap,...      refuses unless the account has a spend cap above 0
 *       GET  /<adset_id>?fields=account_id,...   refuses unless the ad set belongs to this account
 *       per draft:
 *         POST /act_<id>/adimages (or /advideos, then waits for the video to be ready)
 *         POST /act_<id>/adcreatives  object_story_spec + url_tags + degrees_of_freedom_spec (opt-outs)
 *         POST /act_<id>/ads          status PAUSED
 *         GET  /<ad_id>/previews?ad_format=MOBILE_FEED_STANDARD
 *       writes website/.data/meta/created_<YYYY-MM-DD>.json (ids and preview links; no token).
 *   Other flags: --secrets <file> (default ~/.config/besha/meta.env), --out-dir <dir>.
 *
 * Secrets and ids come ONLY from ~/.config/besha/meta.env (mode 600), never .env.local or process.env:
 *   META_ADS_TOKEN       System User token with ads_management (Mac only, never on Vercel)
 *   META_AD_ACCOUNT_ID   the ad account, digits or act_<digits>
 *   PAGE_ID              the Facebook Page the ads run as
 *   IG_USER_ID           the Instagram account (object_story_spec.instagram_user_id)
 * The token is never printed; error text is scrubbed of it.
 *
 * Guardrails (scripts/meta-lib/guard.ts, each covered by tests/unit/meta-create-paused.test.ts):
 *   only POST /act_<id>/{adimages,advideos,adcreatives,ads}; never /campaigns, /adsets or an existing id;
 *   no daily_budget, lifetime_budget, bid_amount, bid_strategy, spend_cap or targeting anywhere;
 *   status PAUSED only; at most 6 ads per run; the approvals hash must match; the account must have a
 *   spend cap; the copy must pass Hebrew QA (scripts/meta-lib/copy-qa.ts). Graph version from
 *   api/_meta_version.ts. Exit 0 = done (or dry run clean), 1 = refused or failed, 2 = setup error.
 *
 * Advantage+ creative opt-outs (PLAN decision 18 default): text_optimizations (Hebrew text rewriting),
 * image_uncrop (image expansion) and the music feature. The feature key names come from Meta's
 * "Standard Enhancements" and "Generative AI features" pages; the key for music is UNVERIFIED (no Meta
 * page found naming it on 7.11.2026). If Meta rejects a key, the creative POST fails and no ad is made.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { META_GRAPH_VERSION } from "../api/_meta_version.ts";
import { DEFAULT_META_ENV, envFileModeWarning, readSecretEnv } from "./report-lib/load.ts";
import { GRAPH_HOST, israelDate, normalizeAccount, scrub } from "./meta-insights.ts";
import { GuardError, MAX_ADS_PER_RUN, PostGuard, assertAllowedGet, assertPayloadSafe } from "./meta-lib/guard.ts";
import { qaCopy } from "./meta-lib/copy-qa.ts";
import {
  draftProblems, draftsSha256, insideDir, isVideo, parseApprovals, parseCsv, skeletonApprovals,
  type Approvals, type Draft,
} from "./meta-lib/approvals.ts";

const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(WEBSITE_DIR, "..");
export const DEFAULT_OUT_DIR = path.join(WEBSITE_DIR, ".data", "meta");
export const ENV_KEYS = ["META_ADS_TOKEN", "META_AD_ACCOUNT_ID", "PAGE_ID", "IG_USER_ID"];
export const PREVIEW_FORMAT = "MOBILE_FEED_STANDARD";
export const MUSIC_FEATURE_KEY = "music"; // UNVERIFIED key name, see the header
export const VIDEO_POLL_TRIES = 30;
export const VIDEO_POLL_MS = 10_000;

export type HttpInit = { method?: "GET" | "POST"; body?: URLSearchParams | FormData };
export type HttpLike = (url: string, init?: HttpInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// ---------------------------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------------------------

export interface Ids { account: string; pageId: string; igUserId: string; adsetId: string }
export type MediaRef = { image_hash: string } | { video_id: string; image_hash: string };

const OPT_OUT = { enroll_status: "OPT_OUT" } as const;

export function degreesOfFreedomSpec(kind: "image" | "video"): Record<string, unknown> {
  const f: Record<string, unknown> = { text_optimizations: OPT_OUT, [MUSIC_FEATURE_KEY]: OPT_OUT };
  if (kind === "image") f.image_uncrop = OPT_OUT;
  return { creative_features_spec: f };
}

export function creativePayload(d: Draft, ids: Ids, media: MediaRef): Record<string, unknown> {
  const cta = { type: d.cta, value: { link: d.website_url } };
  const story: Record<string, unknown> = { page_id: ids.pageId, instagram_user_id: ids.igUserId };
  if ("video_id" in media) {
    story.video_data = {
      video_id: media.video_id, image_hash: media.image_hash, message: d.primary_text,
      title: d.headline, link_description: d.description, call_to_action: cta,
    };
  } else {
    story.link_data = {
      link: d.website_url, message: d.primary_text, name: d.headline, description: d.description,
      image_hash: media.image_hash, call_to_action: cta,
    };
  }
  return {
    name: d.ad_name, object_story_spec: story, url_tags: d.url_parameters,
    degrees_of_freedom_spec: degreesOfFreedomSpec("video_id" in media ? "video" : "image"),
  };
}

export function adPayload(d: Draft, adsetId: string, creativeId: string): Record<string, unknown> {
  return { name: d.ad_name, adset_id: adsetId, creative: { creative_id: creativeId }, status: "PAUSED" };
}

/** Graph form encoding: objects as JSON strings. */
export function formEncode(payload: Record<string, unknown>, token: string): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) p.set(k, typeof v === "string" ? v : JSON.stringify(v));
  p.set("access_token", token);
  return p;
}

// ---------------------------------------------------------------------------------------------
// Graph client: every POST passes the guard first
// ---------------------------------------------------------------------------------------------

export class GraphCallError extends Error {
  constructor(message: string, readonly status: number, readonly code: number | null) { super(message); }
}

export class MetaClient {
  readonly guard: PostGuard;
  constructor(private token: string, readonly account: string, private http: HttpLike, readonly version = META_GRAPH_VERSION, maxAds = MAX_ADS_PER_RUN) {
    this.guard = new PostGuard(account, maxAds);
  }
  private url(p: string, q?: Record<string, string>): string {
    const qs = new URLSearchParams(q ?? {});
    return `${GRAPH_HOST}/${this.version}/${p.replace(/^\/+/, "")}${qs.toString() ? `?${qs}` : ""}`;
  }
  private async parse(res: { ok: boolean; status: number; json(): Promise<unknown> }, what: string): Promise<Record<string, unknown>> {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const err = (body as { error?: { message?: unknown; code?: unknown; error_subcode?: unknown } } | null)?.error;
    if (!res.ok || err) {
      const msg = `${what}: HTTP ${res.status} code ${err?.code ?? "-"} subcode ${err?.error_subcode ?? "-"} ${typeof err?.message === "string" ? err.message : ""}`.trim();
      throw new GraphCallError(scrub(msg, this.token), res.status, typeof err?.code === "number" ? err.code : null);
    }
    return (body ?? {}) as Record<string, unknown>;
  }
  async get(p: string, q: Record<string, string> = {}): Promise<Record<string, unknown>> {
    assertAllowedGet(p, q);
    const res = await this.http(this.url(p, { ...q, access_token: this.token }), { method: "GET" });
    return this.parse(res, `GET ${p}`);
  }
  /** `file` is sent as multipart field `source` (videos); the guard sees "<file>" in its place. */
  async post(p: string, payload: Record<string, unknown>, file?: { bytes: Uint8Array; filename: string }): Promise<Record<string, unknown>> {
    this.guard.check(p, file ? { ...payload, source: "<file>" } : payload);
    let body: URLSearchParams | FormData;
    if (file) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(payload)) fd.set(k, typeof v === "string" ? v : JSON.stringify(v));
      fd.set("access_token", this.token);
      fd.set("source", new Blob([file.bytes]), file.filename);
      body = fd;
    } else body = formEncode(payload, this.token);
    const res = await this.http(this.url(p), { method: "POST", body });
    return this.parse(res, `POST ${p}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Checks before anything is sent
// ---------------------------------------------------------------------------------------------

export interface FsDeps { readFile(f: string): string; readBytes(f: string): Uint8Array; exists(f: string): boolean }

export interface Prepared { approvals: Approvals; hash: string; campaignDir: string; problems: string[] }

export function prepare(approvalsText: string, envIds: { pageId?: string; igUserId?: string }, fsd: FsDeps, repoRoot = REPO_ROOT): Prepared {
  const approvals = parseApprovals(approvalsText);
  const problems: string[] = [];
  const hash = draftsSha256(approvals.drafts);
  if (!approvals.approved_sha256) problems.push(`approvals file has no approved_sha256 (run --approve-hash after Lihi approves; current hash ${hash})`);
  else if (approvals.approved_sha256 !== hash) problems.push(`approvals hash mismatch: the drafts changed after approval (recorded ${approvals.approved_sha256.slice(0, 12)}..., now ${hash.slice(0, 12)}...)`);
  const n = approvals.drafts.length;
  if (n === 0) problems.push("no drafts to create");
  if (n > MAX_ADS_PER_RUN) problems.push(`${n} drafts: at most ${MAX_ADS_PER_RUN} ads per run`);
  const names = approvals.drafts.map((d) => d.ad_name);
  if (new Set(names).size !== names.length) problems.push("the same ad_name appears twice");
  if (approvals.page_id && envIds.pageId && approvals.page_id !== envIds.pageId) problems.push("approvals page_id differs from PAGE_ID in meta.env");
  if (approvals.instagram_user_id && envIds.igUserId && approvals.instagram_user_id !== envIds.igUserId) problems.push("approvals instagram_user_id differs from IG_USER_ID in meta.env");

  const campaignDir = path.isAbsolute(approvals.campaign_dir) ? approvals.campaign_dir : path.resolve(repoRoot, approvals.campaign_dir);
  let rows: Record<string, string>[] = [];
  try { rows = parseCsv(fsd.readFile(path.join(campaignDir, "meta_upload.csv"))); }
  catch { problems.push(`cannot read ${approvals.campaign_dir}/meta_upload.csv`); }
  if (rows.length) {
    for (const d of approvals.drafts) {
      problems.push(...draftProblems(d, rows));
      for (const i of qaCopy({ primary_text: d.primary_text, headline: d.headline, description: d.description })) problems.push(`${d.ad_name}: copy QA ${i.field}: ${i.detail}`);
      for (const rel of [d.media, d.thumbnail].filter((x): x is string => !!x)) {
        try { if (!fsd.exists(insideDir(campaignDir, rel))) problems.push(`${d.ad_name}: file ${rel} not found`); }
        catch (e) { problems.push(`${d.ad_name}: ${(e as Error).message}`); }
      }
      // The same guard the client applies, on the payloads with placeholder ids, so a dry run refuses too.
      try {
        const ids: Ids = { account: "act_0", pageId: "0", igUserId: "0", adsetId: approvals.adset_id };
        const media: MediaRef = isVideo(d.media) ? { video_id: "0", image_hash: "0" } : { image_hash: "0" };
        assertPayloadSafe("adcreatives", creativePayload(d, ids, media));
        assertPayloadSafe("ads", adPayload(d, approvals.adset_id, "0"));
      } catch (e) { problems.push(`${d.ad_name}: ${(e as Error).message}`); }
    }
  }
  return { approvals, hash, campaignDir, problems };
}

/** The spend cap in account currency minor units, or a refusal reason. */
export function spendCapProblem(body: Record<string, unknown>): string | null {
  const raw = body.spend_cap;
  const cap = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(cap) || cap <= 0) return "the ad account has no spend cap (spend_cap unset or 0). Lihi sets it in Ads Manager (test budget + 10%) before any ad is created";
  return null;
}

export function iframeSrc(body: unknown): string | null {
  const html = (((body as { data?: Array<{ body?: unknown }> } | null)?.data ?? [])[0]?.body);
  if (typeof html !== "string") return null;
  const m = /src="([^"]+)"/.exec(html);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

// ---------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------

export interface AdResult {
  ad_name: string; image_hash?: string; video_id?: string; creative_id?: string; ad_id?: string;
  status?: "PAUSED"; preview_url?: string | null; error?: string;
}

export interface CreateDeps { sleep?: (ms: number) => Promise<void>; log: (s: string) => void; fs: FsDeps }

async function uploadImage(c: MetaClient, abs: string, fsd: FsDeps): Promise<string> {
  const bytes = fsd.readBytes(abs);
  const body = await c.post(`${c.account}/adimages`, { bytes: Buffer.from(bytes).toString("base64"), name: path.basename(abs) });
  const images = (body.images ?? {}) as Record<string, { hash?: unknown }>;
  const hash = Object.values(images)[0]?.hash;
  if (typeof hash !== "string" || !hash) throw new Error("adimages returned no hash");
  return hash;
}

async function uploadVideo(c: MetaClient, abs: string, name: string, deps: CreateDeps): Promise<string> {
  const body = await c.post(`${c.account}/advideos`, { name, title: name }, { bytes: deps.fs.readBytes(abs), filename: path.basename(abs) });
  const id = body.id;
  if (typeof id !== "string" || !id) throw new Error("advideos returned no id");
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < VIDEO_POLL_TRIES; i++) {
    const s = await c.get(id, { fields: "status" });
    const st = (s.status as { video_status?: unknown } | undefined)?.video_status;
    if (st === "ready") return id;
    if (st === "error") throw new Error(`video ${id} failed processing at Meta`);
    await sleep(VIDEO_POLL_MS);
  }
  throw new Error(`video ${id} not ready after ${VIDEO_POLL_TRIES} checks`);
}

export async function createAll(c: MetaClient, prep: Prepared, ids: Ids, deps: CreateDeps): Promise<{ results: AdResult[]; ok: boolean }> {
  const results: AdResult[] = [];
  for (const d of prep.approvals.drafts) {
    const r: AdResult = { ad_name: d.ad_name };
    results.push(r);
    try {
      const mediaAbs = insideDir(prep.campaignDir, d.media);
      let media: MediaRef;
      if (isVideo(d.media)) {
        r.video_id = await uploadVideo(c, mediaAbs, d.ad_name, deps);
        r.image_hash = await uploadImage(c, insideDir(prep.campaignDir, d.thumbnail ?? ""), deps.fs);
        media = { video_id: r.video_id, image_hash: r.image_hash };
      } else {
        r.image_hash = await uploadImage(c, mediaAbs, deps.fs);
        media = { image_hash: r.image_hash };
      }
      const cr = await c.post(`${c.account}/adcreatives`, creativePayload(d, ids, media));
      if (typeof cr.id !== "string") throw new Error("adcreatives returned no id");
      r.creative_id = cr.id;
      const ad = await c.post(`${c.account}/ads`, adPayload(d, ids.adsetId, cr.id));
      if (typeof ad.id !== "string") throw new Error("ads returned no id");
      r.ad_id = ad.id; r.status = "PAUSED";
      try { r.preview_url = iframeSrc(await c.get(`${ad.id}/previews`, { ad_format: PREVIEW_FORMAT })); }
      catch (e) { r.preview_url = null; deps.log(`  preview failed for ${d.ad_name}: ${(e as Error).message}`); }
      deps.log(`created PAUSED ${d.ad_name}: ad ${r.ad_id}, creative ${r.creative_id}`);
    } catch (e) {
      r.error = (e as Error).message;
      deps.log(`stopped at ${d.ad_name}: ${r.error}`);
      return { results, ok: false };
    }
  }
  return { results, ok: true };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export interface CliArgs {
  approvals: string | null; approveHash: string | null; draftApprovals: string | null;
  ids: string[]; adset: string | null; create: boolean; envFile: string; outDir: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { approvals: null, approveHash: null, draftApprovals: null, ids: [], adset: null, create: false, envFile: DEFAULT_META_ENV, outDir: DEFAULT_OUT_DIR };
  const valued = ["--approvals", "--approve-hash", "--draft-approvals", "--ids", "--adset", "--secrets", "--out-dir"];
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i], v = argv[i + 1];
    if (valued.includes(f)) {
      if (v === undefined || v.startsWith("--")) throw new Error(`${f} needs a value`);
      i++;
      if (f === "--approvals") a.approvals = v;
      else if (f === "--approve-hash") a.approveHash = v;
      else if (f === "--draft-approvals") a.draftApprovals = v;
      else if (f === "--ids") a.ids = v.split(",").map((s) => s.trim()).filter(Boolean);
      else if (f === "--adset") a.adset = v;
      else if (f === "--secrets") a.envFile = v;
      else a.outDir = v;
    } else if (f === "--create") a.create = true;
    else if (f === "--dry-run") a.create = false;
    else throw new Error(`unknown flag ${f}`);
  }
  const modes = [a.approvals, a.approveHash, a.draftApprovals].filter(Boolean).length;
  if (modes !== 1) throw new Error("give exactly one of --approvals, --approve-hash, --draft-approvals");
  if (a.create && !a.approvals) throw new Error("--create needs --approvals");
  if (a.draftApprovals && (!a.adset || !a.ids.length)) throw new Error("--draft-approvals needs --adset and --ids");
  return a;
}

export interface RunDeps {
  fetch: HttpLike; log?: (s: string) => void; now?: Date; fs?: FsDeps; repoRoot?: string;
  writeFile?: (f: string, text: string) => void; sleep?: (ms: number) => Promise<void>; checkEnvMode?: boolean;
}

const realFs: FsDeps = {
  readFile: (f) => fs.readFileSync(f, "utf8"),
  readBytes: (f) => fs.readFileSync(f),
  exists: (f) => fs.existsSync(f),
};

function summarizeUpload(abs: string, fsd: FsDeps): string {
  try {
    const b = fsd.readBytes(abs);
    return `<${b.length} bytes, sha256 ${crypto.createHash("sha256").update(b).digest("hex").slice(0, 12)}...>`;
  } catch { return "<file>"; }
}

export async function run(argv: string[], deps: RunDeps): Promise<number> {
  const log = deps.log ?? ((s: string) => process.stdout.write(s + "\n"));
  const fsd = deps.fs ?? realFs;
  const repoRoot = deps.repoRoot ?? REPO_ROOT;
  let args: CliArgs;
  try { args = parseArgs(argv); } catch (e) { log(`meta-create-paused: ${(e as Error).message}`); return 2; }

  if (args.approveHash) {
    try { log(draftsSha256(parseApprovals(fsd.readFile(args.approveHash)).drafts)); return 0; }
    catch (e) { log(`meta-create-paused: ${(e as Error).message}`); return 2; }
  }
  if (args.draftApprovals) {
    try {
      const dir = path.isAbsolute(args.draftApprovals) ? args.draftApprovals : path.resolve(repoRoot, args.draftApprovals);
      const rows = parseCsv(fsd.readFile(path.join(dir, "meta_upload.csv")));
      log(JSON.stringify(skeletonApprovals(args.draftApprovals, args.adset!, rows, args.ids), null, 2));
      return 0;
    } catch (e) { log(`meta-create-paused: ${(e as Error).message}`); return 2; }
  }

  // Env: required for --create; a dry run uses placeholders if the file is missing.
  let env: Record<string, string> = {};
  try {
    env = readSecretEnv(args.envFile, ENV_KEYS, { readFile: deps.fs ? fsd.readFile : undefined });
    if (deps.checkEnvMode !== false && !deps.fs) { const w = envFileModeWarning(args.envFile); if (w) log(`warning: ${w}`); }
  } catch (e) {
    if (args.create) { log(`meta-create-paused: ${(e as Error).message}`); return 2; }
    log(`note: ${(e as Error).message}; the dry run uses placeholder ids`);
  }
  const token = env.META_ADS_TOKEN ?? "";
  const clean = (s: string) => scrub(s, token);

  let prep: Prepared;
  try { prep = prepare(fsd.readFile(args.approvals!), { pageId: env.PAGE_ID, igUserId: env.IG_USER_ID }, fsd, repoRoot); }
  catch (e) { log(clean(`meta-create-paused: ${(e as Error).message}`)); return 2; }

  let account: string;
  try { account = env.META_AD_ACCOUNT_ID ? normalizeAccount(env.META_AD_ACCOUNT_ID) : "act_<META_AD_ACCOUNT_ID>"; }
  catch (e) { log(`meta-create-paused: ${(e as Error).message}`); return 2; }
  const ids: Ids = {
    account, pageId: prep.approvals.page_id ?? env.PAGE_ID ?? "<PAGE_ID>",
    igUserId: prep.approvals.instagram_user_id ?? env.IG_USER_ID ?? "<IG_USER_ID>", adsetId: prep.approvals.adset_id,
  };

  log(`meta-create-paused (Graph ${META_GRAPH_VERSION}), ${args.create ? "CREATE" : "DRY RUN"}: ${prep.approvals.drafts.length} draft(s) into ad set ${ids.adsetId}, approvals sha256 ${prep.hash}`);
  if (prep.problems.length) {
    log("REFUSED:");
    for (const p of prep.problems) log(`  - ${clean(p)}`);
    return 1;
  }

  if (!args.create) {
    for (const d of prep.approvals.drafts) {
      const vid = isVideo(d.media);
      log(`\n== ${d.ad_name} ==`);
      if (vid) {
        log(`POST /${META_GRAPH_VERSION}/${account}/advideos ${JSON.stringify({ name: d.ad_name, title: d.ad_name, source: summarizeUpload(insideDir(prep.campaignDir, d.media), fsd) })}`);
        log(`POST /${META_GRAPH_VERSION}/${account}/adimages ${JSON.stringify({ bytes: summarizeUpload(insideDir(prep.campaignDir, d.thumbnail!), fsd), name: path.basename(d.thumbnail!) })}`);
      } else {
        log(`POST /${META_GRAPH_VERSION}/${account}/adimages ${JSON.stringify({ bytes: summarizeUpload(insideDir(prep.campaignDir, d.media), fsd), name: path.basename(d.media) })}`);
      }
      const media: MediaRef = vid ? { video_id: "<video_id from upload>", image_hash: "<image_hash from upload>" } : { image_hash: "<image_hash from upload>" };
      log(`POST /${META_GRAPH_VERSION}/${account}/adcreatives ${JSON.stringify(creativePayload(d, ids, media), null, 2)}`);
      log(`POST /${META_GRAPH_VERSION}/${account}/ads ${JSON.stringify(adPayload(d, ids.adsetId, "<creative_id from adcreatives>"))}`);
      log(`GET  /${META_GRAPH_VERSION}/<ad_id>/previews?ad_format=${PREVIEW_FORMAT}`);
    }
    log("\nDry run: nothing was sent. The account spend cap and the ad set are checked only with --create.");
    return 0;
  }

  const client = new MetaClient(token, account, deps.fetch);
  const now = deps.now ?? new Date();
  const started = now.toISOString();
  let results: AdResult[] = [], ok = false, preflight: string | null = null;
  try {
    const acct = await client.get(account, { fields: "spend_cap,amount_spent,currency,account_status" });
    preflight = spendCapProblem(acct);
    if (!preflight) {
      const as = await client.get(ids.adsetId, { fields: "id,account_id,campaign_id,effective_status" });
      if (String(as.account_id ?? "") !== account.replace(/^act_/, "")) preflight = `ad set ${ids.adsetId} does not belong to ${account}`;
    }
  } catch (e) { preflight = (e as Error).message; }
  if (preflight) { log(clean(`REFUSED: ${preflight}`)); return 1; }

  try {
    ({ results, ok } = await createAll(client, prep, ids, { log: (s) => log(clean(s)), fs: fsd, sleep: deps.sleep }));
  } catch (e) {
    log(clean(`meta-create-paused: ${e instanceof GuardError ? e.message : (e as Error).message}`));
  }

  const file = path.join(args.outDir, `created_${israelDate(now)}.json`);
  let doc: { runs: unknown[] } = { runs: [] };
  try { const prev = JSON.parse(fsd.readFile(file)); if (Array.isArray(prev?.runs)) doc = prev; } catch { /* new file */ }
  doc.runs.push({ started_at: started, graph_version: META_GRAPH_VERSION, account, adset_id: ids.adsetId, approvals_sha256: prep.hash, ok, results });
  const text = clean(JSON.stringify(doc, null, 2) + "\n");
  const write = deps.writeFile ?? ((f: string, t: string) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t, { mode: 0o600 }); });
  write(file, text);
  log(`results: ${file}`);
  log(ok ? `done: ${results.length} PAUSED ad(s). Lihi reviews the previews and publishes in Ads Manager.` : "finished with an error; see above. Objects already created stay PAUSED.");
  return ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  run(process.argv.slice(2), { fetch: (u, init) => fetch(u, init) }).then((code) => process.exit(code));
}
