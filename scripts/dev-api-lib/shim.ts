/**
 * Minimal Vercel Node runtime shim (00_DESIGN.md section 6.1): turns Node's IncomingMessage /
 * ServerResponse into VercelRequest / VercelResponse, and tracks background work so
 * GET /__test/idle can wait for it.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseCookieHeader } from "../../api/_cookies.ts";

export const MAX_BODY_BYTES = 6 * 1024 * 1024;

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function readRawBody(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += b.length;
    if (size > limit) throw new HttpError(413, "body too large");
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

function addValue(out: Record<string, unknown>, k: string, v: unknown): void {
  if (!(k in out)) out[k] = v;
  else if (Array.isArray(out[k])) (out[k] as unknown[]).push(v);
  else out[k] = [out[k], v];
}

/** Body the way Vercel parses it: JSON, urlencoded (flat, bracketed keys kept), text; plus multipart. */
export async function parseBody(raw: Buffer, contentType: string): Promise<unknown> {
  if (raw.length === 0) return undefined;
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json") || ct.endsWith("+json")) {
    try { return JSON.parse(raw.toString("utf8")); } catch { throw new HttpError(400, "Invalid JSON"); }
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(raw.toString("utf8"))) addValue(out, k, v);
    return out;
  }
  if (ct.includes("multipart/form-data")) {
    const form = await new Request("http://dev-api.local/", { method: "POST", headers: { "content-type": contentType }, body: new Uint8Array(raw) }).formData();
    const out: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") addValue(out, k, v);
      else addValue(out, k, { filename: v.name, type: v.type, size: v.size });
    }
    return out;
  }
  if (ct.startsWith("text/")) return raw.toString("utf8");
  return raw;
}

/**
 * req.body exactly as @vercel/node builds it (node_modules/@vercel/node/dist/dev-server.mjs getBodyParser):
 * JSON, octet-stream (Buffer), urlencoded (flat keys), text/plain (also for a missing content type);
 * anything else, multipart included, is undefined. api/ handlers must read multipart themselves.
 */
export function vercelBody(raw: Buffer, contentType: string): unknown {
  const type = contentType ? contentType.split(";")[0].trim().toLowerCase() : "text/plain";
  if (type === "application/json") {
    const str = raw.toString("utf8");
    try { return str ? JSON.parse(str) : {}; } catch { throw new HttpError(400, "Invalid JSON"); }
  }
  if (type === "application/octet-stream") return raw;
  if (type === "application/x-www-form-urlencoded") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(raw.toString("utf8"))) addValue(out, k, v);
    return out;
  }
  if (type === "text/plain") return raw.toString("utf8");
  return undefined;
}

/** Like @vercel/node's restoreBody: the consumed stream replays the buffered body to "data"/"end" listeners. */
function restoreStream(req: IncomingMessage, raw: Buffer): void {
  const replica = new PassThrough();
  const originalOn = req.on.bind(req);
  const on = replica.on.bind(replica);
  const patched = ((name: string, cb: (...a: unknown[]) => void) =>
    (name === "data" || name === "end" ? (on(name, cb), req) : originalOn(name, cb))) as typeof req.on;
  req.on = patched;
  req.addListener = patched;
  replica.write(raw);
  replica.end();
}

export function queryOf(url: URL, extra: Record<string, string> = {}): Record<string, string | string[]> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of url.searchParams) addValue(out, k, v);
  return { ...(out as Record<string, string | string[]>), ...extra };
}

/**
 * mode "vercel" (api/ routes): body and stream exactly as on Vercel (see vercelBody); no rawBody.
 * mode "full" (mock Grow, test routes): every type parsed, multipart included, plus rawBody.
 */
export async function toVercelRequest(req: IncomingMessage, url: URL, extraQuery: Record<string, string> = {}, mode: "vercel" | "full" = "full"): Promise<VercelRequest> {
  if (!req.headers["x-forwarded-for"]) req.headers["x-forwarded-for"] = "127.0.0.1";
  const raw = req.method === "GET" || req.method === "HEAD" ? Buffer.alloc(0) : await readRawBody(req);
  const ct = req.headers["content-type"] === undefined ? "" : String(req.headers["content-type"]);
  const body = mode === "vercel" ? vercelBody(raw, ct) : await parseBody(raw, ct);
  const v = req as VercelRequest & { rawBody?: Buffer };
  Object.defineProperty(v, "query", { value: queryOf(url, extraQuery), writable: true, configurable: true });
  Object.defineProperty(v, "cookies", { value: parseCookieHeader(String(req.headers.cookie ?? "")), writable: true, configurable: true });
  Object.defineProperty(v, "body", { value: body, writable: true, configurable: true });
  if (mode === "vercel") restoreStream(req, raw);
  else Object.defineProperty(v, "rawBody", { value: raw, writable: true, configurable: true });
  return v;
}

export function toVercelResponse(res: ServerResponse): VercelResponse {
  const r = res as VercelResponse;
  r.status = (code: number) => { res.statusCode = code; return r; };
  r.json = (obj: unknown) => {
    if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return r;
  };
  r.send = (body: unknown) => {
    if (body === undefined || body === null) { res.end(); return r; }
    if (Buffer.isBuffer(body)) {
      if (!res.getHeader("content-type")) res.setHeader("content-type", "application/octet-stream");
      res.end(body);
      return r;
    }
    if (typeof body === "object") return r.json(body);
    if (!res.getHeader("content-type")) res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(String(body));
    return r;
  };
  r.redirect = (statusOrUrl: string | number, url?: string) => {
    const [status, location] = typeof statusOrUrl === "number" ? [statusOrUrl, url ?? "/"] : [307, statusOrUrl];
    res.statusCode = status;
    res.setHeader("location", location);
    res.end();
    return r;
  };
  return r;
}

// ---------------------------------------------------------------------------------------------
// Background work tracking. Contract for api/_bg.ts (later slice): when
// globalThis.__ATTR_TEST__ exists, call __ATTR_TEST__.trackBackground(promise) for every
// afterResponse() job, so GET /__test/idle resolves only once that work is done.
// __ATTR_TEST__.onReset(fn) registers a cache reset that POST /__test/reset calls.
// ---------------------------------------------------------------------------------------------

export interface AttrTestHooks {
  trackBackground(p: Promise<unknown>): void;
  onReset(fn: () => void | Promise<void>): void;
}

const pending = new Set<Promise<unknown>>();
const resetHooks: Array<() => void | Promise<void>> = [];
let inflight = 0;

export const hooks: AttrTestHooks = {
  trackBackground(p) {
    const tracked = Promise.resolve(p).catch((e) => console.error("[dev-api] background job failed:", e));
    pending.add(tracked);
    void tracked.finally(() => pending.delete(tracked));
  },
  onReset(fn) { resetHooks.push(fn); },
};

export function installHooks(): void {
  (globalThis as unknown as { __ATTR_TEST__?: AttrTestHooks }).__ATTR_TEST__ = hooks;
}

export async function runResetHooks(): Promise<void> {
  for (const fn of resetHooks) {
    try { await fn(); } catch (e) { console.error("[dev-api] reset hook failed:", e); }
  }
}

export function requestStarted(): void { inflight++; }
export function requestFinished(): void { inflight = Math.max(0, inflight - 1); }

/** Resolves when no other request is in flight and no tracked background job is pending. */
export async function waitIdle(timeoutMs = 30000): Promise<{ idle: boolean; inflight: number; pending: number }> {
  const deadline = Date.now() + timeoutMs;
  let quietSince = 0;
  for (;;) {
    const busy = inflight > 0 || pending.size > 0;
    if (!busy) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= 50) return { idle: true, inflight, pending: pending.size };   // settle window
    } else {
      quietSince = 0;
      if (pending.size) await Promise.race([Promise.allSettled([...pending]), new Promise((r) => setTimeout(r, 100))]);
    }
    if (Date.now() > deadline) return { idle: false, inflight, pending: pending.size };
    await new Promise((r) => setTimeout(r, 20));
  }
}
