/**
 * Outbound network fence for test mode (00_DESIGN.md section 6.1). Installed before any handler
 * is imported. Every connection to a host other than localhost / 127.0.0.1 / ::1 is refused and
 * logged (host + path only) to <data dir>/blocked_egress.jsonl; every E2E test asserts that file
 * is empty. graph.facebook.com is allowed only for the optional Meta Test Events step
 * (CAPI_MODE=send with META_TEST_EVENT_CODE), which needs Lihi's approval.
 *
 * Layers: global fetch, http(s).request/get, and net.Socket#connect as the backstop (covers
 * tls.connect, net.connect and undici).
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

let logFile = "";
let installed = false;

function cleanHost(h: unknown): string {
  let s = String(h ?? "").trim().toLowerCase();
  if (s.startsWith("[")) s = s.slice(1, s.indexOf("]") > 0 ? s.indexOf("]") : undefined);
  else if ((s.match(/:/g) ?? []).length === 1) s = s.split(":")[0];
  return s;
}

export function isAllowedHost(host: unknown): boolean {
  const h = cleanHost(host);
  if (LOCAL_HOSTS.has(h) || h.endsWith(".localhost")) return true;
  if (h === "graph.facebook.com" && process.env.CAPI_MODE === "send" && (process.env.META_TEST_EVENT_CODE ?? "") !== "") return true;
  return false;
}

export function blockedError(host: string): Error {
  const err = new Error(`dev-api egress fence: connection to ${host} blocked in test mode`);
  (err as NodeJS.ErrnoException).code = "EGRESS_BLOCKED";
  return err;
}

export function logBlocked(via: string, host: string, p: string): void {
  const line = JSON.stringify({ at: new Date().toISOString(), via, host: cleanHost(host), path: String(p || "/").split("?")[0].slice(0, 200) });
  console.error(`[egress blocked] ${via} ${cleanHost(host)}${String(p || "/").split("?")[0]}`);
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line + "\n");
  } catch { /* the console line above is the fallback */ }
}

type AnyFn = (...args: unknown[]) => unknown;

function requestTarget(args: unknown[]): { host: string; path: string } {
  let host = "localhost", p = "/";
  const [a0, a1] = args;
  if (typeof a0 === "string" || a0 instanceof URL) {
    try { const u = new URL(String(a0)); host = u.hostname; p = u.pathname; } catch { /* keep defaults */ }
    if (a1 && typeof a1 === "object") {
      const o = a1 as Record<string, unknown>;
      host = String(o.hostname ?? o.host ?? host); p = String(o.path ?? p);
    }
  } else if (a0 && typeof a0 === "object") {
    const o = a0 as Record<string, unknown>;
    host = String(o.hostname ?? o.host ?? "localhost"); p = String(o.path ?? "/");
  }
  return { host, path: p };
}

function erroredSocket(host: string): net.Socket {
  const s = new net.Socket();
  process.nextTick(() => s.destroy(blockedError(host)));
  return s;
}

function wrapRequest(mod: typeof http | typeof https, via: string): void {
  const original = mod.request as unknown as AnyFn;
  const wrapped = function (this: unknown, ...args: unknown[]) {
    const { host, path: p } = requestTarget(args);
    if (isAllowedHost(host)) return original.apply(mod, args);
    logBlocked(via, host, p);
    const cb = args.find((a) => typeof a === "function");
    const urlArg = typeof args[0] === "string" || args[0] instanceof URL ? args[0] : null;
    const optArg = (urlArg ? args[1] : args[0]) as Record<string, unknown> | undefined;
    const opts = { ...(optArg && typeof optArg === "object" ? optArg : {}), agent: undefined, createConnection: () => erroredSocket(host) };   // no agent: ClientRequest then uses createConnection
    return urlArg ? original.call(mod, urlArg, opts, cb) : original.call(mod, opts, cb);
  };
  (mod as unknown as { request: AnyFn }).request = wrapped;
  (mod as unknown as { get: AnyFn }).get = function (...args: unknown[]) {
    const req = wrapped(...args) as http.ClientRequest;
    req.end();
    return req;
  };
}

function wrapFetch(): void {
  const original = globalThis.fetch;
  if (typeof original !== "function") return;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    let host = "", p = "/";
    try { const u = new URL(raw); host = u.hostname; p = u.pathname; } catch { /* relative URL: let fetch throw */ }
    if (host && !isAllowedHost(host)) {
      logBlocked("fetch", host, p);
      throw new TypeError("fetch failed", { cause: blockedError(host) });
    }
    return original(input, init);
  }) as typeof fetch;
}

function wrapSocketConnect(): void {
  const proto = net.Socket.prototype as unknown as { connect: AnyFn };
  const original = proto.connect;
  proto.connect = function (this: net.Socket, ...args: unknown[]) {
    let a0 = args[0];
    if (Array.isArray(a0)) a0 = a0[0];            // Node passes normalized [options, cb] internally
    let host = "localhost";
    if (a0 && typeof a0 === "object") {
      const o = a0 as Record<string, unknown>;
      if (typeof o.path === "string" && o.port === undefined) return original.apply(this, args);   // IPC socket
      host = String(o.host ?? "localhost");
    } else if (typeof a0 === "number" || (typeof a0 === "string" && /^\d+$/.test(a0))) {
      host = typeof args[1] === "string" ? args[1] : "localhost";
    } else if (typeof a0 === "string") {
      return original.apply(this, args);         // IPC path
    }
    if (isAllowedHost(host)) return original.apply(this, args);
    logBlocked("socket", host, "");
    process.nextTick(() => this.destroy(blockedError(host)));
    return this;
  };
}

export function installEgressFence(dataDir: string): void {
  if (installed) return;
  installed = true;
  logFile = path.join(dataDir, "blocked_egress.jsonl");
  wrapFetch();
  wrapRequest(http, "http");
  wrapRequest(https, "https");
  wrapSocketConnect();
}
