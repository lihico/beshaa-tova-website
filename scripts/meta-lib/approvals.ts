/**
 * The approvals file for meta-create-paused.ts (PLAN.md Stage 5).
 *
 * Shape (JSON; every draft repeats the exact copy Lihi approved, so the hash covers the words):
 *   {
 *     "campaign_dir": "marketing/campaigns/2026-11_meta_v3",   // relative to the repo root, or absolute
 *     "adset_id": "<existing ad set id>",
 *     "page_id": "<optional; must equal PAGE_ID in meta.env>",
 *     "instagram_user_id": "<optional; must equal IG_USER_ID in meta.env>",
 *     "approved_by": "Lihi", "approved_at": "2026-11-08",
 *     "approved_sha256": "<sha256 over the drafts array, from --approve-hash>",
 *     "drafts": [ {
 *        "ad_name": "2026-11_meta_v3_eng-s1",            // the "Ad name" column of meta_upload.csv
 *        "media": "creatives/static/E1_eng_s1_4x5_a.png", // one of the row's Creative / Video columns
 *        "thumbnail": "creatives/...png",                 // reels only: the cover image
 *        "primary_text": "...", "headline": "...", "description": "...",
 *        "cta": "LEARN_MORE", "website_url": "https://beshaa-tova.co.il/",
 *        "url_parameters": "ref=meta-{{ad.id}}&utm_source=..."   // the "URL parameters" column
 *     } ]
 *   }
 * The hash is sha256 of the canonical JSON (keys sorted, no whitespace) of `drafts`. Any change to a
 * draft after Lihi approved it changes the hash, and the script refuses.
 */
import crypto from "node:crypto";
import path from "node:path";

export interface Draft {
  ad_name: string; media: string; thumbnail?: string;
  primary_text: string; headline: string; description: string;
  cta: string; website_url: string; url_parameters: string;
}

export interface Approvals {
  campaign_dir: string; adset_id: string; page_id?: string; instagram_user_id?: string;
  approved_by?: string; approved_at?: string; approved_sha256?: string; drafts: Draft[];
}

export const ALLOWED_CTAS = ["LEARN_MORE", "SHOP_NOW", "ORDER_NOW", "BUY_NOW", "SEE_MORE"];
export const ALLOWED_LINK_HOSTS = ["beshaa-tova.co.il", "www.beshaa-tova.co.il"];
const ID_RE = /^\d{5,25}$/;

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function draftsSha256(drafts: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(drafts), "utf8").digest("hex");
}

/** RFC 4180 CSV (quoted fields may hold commas, quotes and newlines), BOM stripped. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = ""; rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function parseApprovals(text: string): Approvals {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("approvals file is not valid JSON"); }
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.drafts)) throw new Error("approvals file has no drafts array");
  if (!str(o.campaign_dir)) throw new Error("approvals file has no campaign_dir");
  if (!ID_RE.test(str(o.adset_id))) throw new Error("approvals adset_id must be the numeric id of an existing ad set");
  for (const k of ["page_id", "instagram_user_id"]) if (o[k] !== undefined && !ID_RE.test(str(o[k]))) throw new Error(`approvals ${k} must be numeric`);
  return o as unknown as Approvals;
}

export function isVideo(p: string): boolean { return /\.(mp4|mov|m4v)$/i.test(p); }
export function isImage(p: string): boolean { return /\.(png|jpe?g)$/i.test(p); }

/** Resolves `rel` inside `dir` and refuses anything that escapes it. */
export function insideDir(dir: string, rel: string): string {
  const abs = path.resolve(dir, rel);
  const root = path.resolve(dir) + path.sep;
  if (!abs.startsWith(root)) throw new Error(`media path ${rel} is outside the campaign folder`);
  return abs;
}

const CSV_FIELDS: Array<[keyof Draft, string]> = [
  ["primary_text", "Primary text"], ["headline", "Headline"], ["description", "Description"],
  ["cta", "CTA"], ["website_url", "Website URL"], ["url_parameters", "URL parameters"],
];
const MEDIA_COLUMNS = ["Creative 4:5", "Creative 9:16", "Creative 1:1", "Video 9:16"];

/**
 * Structural problems with one draft, checked against its meta_upload.csv row. Empty = fine.
 * Copy QA is separate (copy-qa.ts).
 */
export function draftProblems(d: Draft, csvRows: Record<string, string>[]): string[] {
  const p: string[] = [];
  const name = str(d.ad_name);
  if (!name) return ["draft has no ad_name"];
  const rows = csvRows.filter((r) => r["Ad name"] === name);
  if (rows.length !== 1) return [`${name}: ${rows.length === 0 ? "not in" : "appears more than once in"} meta_upload.csv`];
  const row = rows[0];
  if ("URL parameters" in row === false) p.push(`${name}: meta_upload.csv has no "URL parameters" column`);
  for (const [k, col] of CSV_FIELDS) if (str(d[k]) !== (row[col] ?? "")) p.push(`${name}: ${k} differs from the "${col}" column of meta_upload.csv`);
  if (!/^yes\b/i.test(row["Ready to upload"] ?? "")) p.push(`${name}: "Ready to upload" is not yes`);
  if (!MEDIA_COLUMNS.some((c) => row[c] && row[c] === d.media)) p.push(`${name}: media is not one of the row's creative columns`);
  if (!isImage(d.media) && !isVideo(d.media)) p.push(`${name}: media must be png, jpg or mp4`);
  if (isVideo(d.media) && !(d.thumbnail && isImage(d.thumbnail))) p.push(`${name}: a reel needs a thumbnail image`);
  if (!ALLOWED_CTAS.includes(str(d.cta))) p.push(`${name}: CTA ${str(d.cta) || "(empty)"} is not allowed`);
  try {
    const u = new URL(str(d.website_url));
    if (u.protocol !== "https:" || !ALLOWED_LINK_HOSTS.includes(u.hostname)) p.push(`${name}: website_url must be https on beshaa-tova.co.il`);
    if (u.search) p.push(`${name}: website_url must be clean; tracking goes in url_parameters`);
  } catch { p.push(`${name}: website_url is not a URL`); }
  const up = str(d.url_parameters);
  if (!up || up.startsWith("?") || !/(^|&)v=/.test(up)) p.push(`${name}: url_parameters must be the 9.1 string with v=<slug>`);
  if (!str(d.primary_text) || !str(d.headline)) p.push(`${name}: primary_text and headline are required`);
  return p;
}

/** A skeleton approvals object from campaign rows (for --draft-approvals); Lihi checks it and adds the hash. */
export function skeletonApprovals(campaignDir: string, adsetId: string, rows: Record<string, string>[], names: string[]): Approvals {
  const drafts = names.map((n): Draft => {
    const r = rows.find((x) => x["Ad name"] === n || x["Ad name"].endsWith(`_${n}`));
    if (!r) throw new Error(`${n} is not in meta_upload.csv`);
    const media = r["Video 9:16"] || r["Creative 4:5"] || r["Creative 1:1"] || r["Creative 9:16"];
    const d: Draft = {
      ad_name: r["Ad name"], media, primary_text: r["Primary text"], headline: r["Headline"], description: r["Description"],
      cta: r["CTA"], website_url: r["Website URL"], url_parameters: r["URL parameters"] ?? "",
    };
    if (isVideo(media)) d.thumbnail = "";
    return d;
  });
  return { campaign_dir: campaignDir, adset_id: adsetId, approved_by: "", approved_at: "", approved_sha256: "", drafts };
}
