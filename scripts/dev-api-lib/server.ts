/**
 * dev-api routing (00_DESIGN.md section 6.1). Imported by scripts/dev-api.ts only after the test
 * env is checked and the egress fence is installed.
 *
 *   /api/grow-notify/<k>   -> api/grow-notify.ts, query.k = <k>   (mirrors the vercel.json rewrite)
 *   /api/<name>            -> default export of api/<name>.ts
 *   /q/<code>, /r/<handle> -> api/q.ts with query.code / query.r
 *   /_mock/grow/*          -> scripts/mock-grow.ts  handleMockGrow(req, res, { subpath, dataDir })
 *   /_mock/resend/*        -> Resend sink (.test-data/emails/)
 *   /__test/*              -> test endpoints (test-routes.ts)
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { WEBSITE_DIR } from "./env.ts";
import { HttpError, toVercelRequest, toVercelResponse, requestStarted, requestFinished } from "./shim.ts";
import { handleMockResend, handleTestRoute } from "./test-routes.ts";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;
type MockGrowModule = {
  handleMockGrow?: (req: VercelRequest, res: VercelResponse, ctx: { subpath: string; dataDir: string }) => Promise<unknown>;
  replayNotify?: (orderId: string, ctx: { dataDir: string }) => Promise<unknown>;
  setMakeMode?: (mode: string, ctx: { dataDir: string }) => Promise<unknown>;
  replayPageWebhook?: (tx: string, encoding: string | null, ctx: { dataDir: string }) => Promise<unknown>;
  replayMakeNotify?: (orderId: string, ctx: { dataDir: string }) => Promise<unknown>;
};

const API_DIR = path.join(WEBSITE_DIR, "api");
const MOCK_GROW_FILE = path.join(WEBSITE_DIR, "scripts", "mock-grow.ts");

async function loadHandler(name: string): Promise<Handler | null> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return null;      // "_" files are helpers, never routes (as on Vercel)
  const file = path.join(API_DIR, `${name}.ts`);
  if (!fs.existsSync(file)) return null;
  const mod = (await import(pathToFileURL(file).href)) as { default?: Handler };
  return typeof mod.default === "function" ? mod.default : null;
}

async function loadMockGrow(): Promise<MockGrowModule | null> {
  if (!fs.existsSync(MOCK_GROW_FILE)) return null;
  return (await import(pathToFileURL(MOCK_GROW_FILE).href)) as MockGrowModule;
}

function notBuilt(res: VercelResponse, what: string): void {
  res.status(501).json({ error: `${what} is not built yet` });
}

async function route(req: http.IncomingMessage, res: http.ServerResponse, dataDir: string): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost:3001");
  const p = url.pathname;
  let m: RegExpExecArray | null;
  let extraQuery: Record<string, string> = {};
  let target: { kind: "api"; name: string } | { kind: "mock-grow" | "mock-resend" | "test"; subpath: string } | null = null;

  if ((m = /^\/api\/grow-notify\/([^/]+)\/?$/.exec(p))) {
    target = { kind: "api", name: "grow-notify" };
    extraQuery = { k: decodeURIComponent(m[1]) };
  } else if ((m = /^\/api\/([^/]+)\/?$/.exec(p))) {
    target = { kind: "api", name: m[1] };
  } else if ((m = /^\/q\/([^/]+)\/?$/.exec(p))) {
    target = { kind: "api", name: "q" };
    extraQuery = { code: decodeURIComponent(m[1]) };
  } else if ((m = /^\/r\/([^/]+)\/?$/.exec(p))) {
    target = { kind: "api", name: "q" };
    extraQuery = { r: decodeURIComponent(m[1]) };
  } else if (p.startsWith("/_mock/grow/") || p === "/_mock/grow") {
    target = { kind: "mock-grow", subpath: p.slice("/_mock/grow".length) || "/" };
  } else if (p.startsWith("/_mock/resend/")) {
    target = { kind: "mock-resend", subpath: p.slice("/_mock/resend".length) };
  } else if (p.startsWith("/__test/")) {
    target = { kind: "test", subpath: p.slice("/__test".length) };
  } else if (p === "/health") {
    target = { kind: "test", subpath: "/health" };
  }

  const vreq = await toVercelRequest(req, url, extraQuery, target?.kind === "api" ? "vercel" : "full");
  const vres = toVercelResponse(res);
  if (!target) {
    vres.status(404).json({ error: "dev-api: no route", path: p });
    return;
  }
  if (target.kind === "api") {
    const handler = await loadHandler(target.name);
    if (!handler) {
      if (target.name === "q" || target.name === "grow-notify") return notBuilt(vres, `api/${target.name}.ts`);
      vres.status(404).json({ error: `dev-api: no api/${target.name}.ts` });
      return;
    }
    await handler(vreq, vres);
    return;
  }
  if (target.kind === "mock-grow") {
    const mod = await loadMockGrow();
    if (!mod?.handleMockGrow) return notBuilt(vres, "scripts/mock-grow.ts");
    await mod.handleMockGrow(vreq, vres, { subpath: target.subpath, dataDir });
    return;
  }
  if (target.kind === "mock-resend") {
    handleMockResend(vreq, vres, target.subpath, dataDir);
    return;
  }
  if (!(await handleTestRoute(vreq, vres, target.subpath, dataDir, loadMockGrow))) {
    vres.status(404).json({ error: "dev-api: unknown test route", path: p });
  }
}

export function createDevApiServer(dataDir: string): http.RequestListener {
  return (req, res) => {
    const counted = !(req.url ?? "").startsWith("/__test/idle");
    if (counted) requestStarted();
    route(req, res, dataDir)
      .catch((e: unknown) => {
        const status = e instanceof HttpError ? e.status : 500;
        if (status === 500) console.error(`[dev-api] ${req.method} ${req.url} threw:`, e);
        if (!res.headersSent) {
          res.statusCode = status;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: e instanceof HttpError ? e.message : "dev-api: handler threw (see the dev-api log)" }));
        } else if (!res.writableEnded) {
          res.end();
        }
      })
      .finally(() => { if (counted) requestFinished(); });
  };
}
