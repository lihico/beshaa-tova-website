/**
 * The dev-api egress fence (scripts/dev-api-lib/fence.ts). Runs in its own process (node:test
 * isolates files). Blocked attempts never leave the machine: the fence refuses before DNS/connect.
 * Hosts used: .invalid / .test names and 203.0.113.0/24 (TEST-NET-3).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { installEgressFence, isAllowedHost } from "../../scripts/dev-api-lib/fence.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attr-fence-"));
const log = path.join(dir, "blocked_egress.jsonl");
const lines = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
let server: http.Server;
let port = 0;

before(async () => {
  installEgressFence(dir);
  server = http.createServer((_req, res) => res.end("ok"));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as net.AddressInfo).port;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test("host rules", () => {
  for (const h of ["localhost", "127.0.0.1", "::1", "[::1]", "localhost:3001", "app.localhost"]) assert.equal(isAllowedHost(h), true, h);
  for (const h of ["graph.facebook.com", "sheets.googleapis.com", "api.resend.com", "secure.meshulam.co.il"]) assert.equal(isAllowedHost(h), false, h);
});

test("graph.facebook.com only with CAPI_MODE=send and a test event code", () => {
  const prev = { m: process.env.CAPI_MODE, c: process.env.META_TEST_EVENT_CODE };
  process.env.CAPI_MODE = "send"; process.env.META_TEST_EVENT_CODE = "TEST123";
  assert.equal(isAllowedHost("graph.facebook.com"), true);
  process.env.META_TEST_EVENT_CODE = "";
  assert.equal(isAllowedHost("graph.facebook.com"), false);
  process.env.CAPI_MODE = prev.m; process.env.META_TEST_EVENT_CODE = prev.c;
  if (prev.m === undefined) delete process.env.CAPI_MODE;
  if (prev.c === undefined) delete process.env.META_TEST_EVENT_CODE;
});

test("fetch to an external host is refused and logged (host + path, no query)", async () => {
  await assert.rejects(fetch("https://api.resend.invalid/emails?key=secret"), (e: Error) => /EGRESS|blocked/.test(String((e.cause as Error)?.message ?? e.message)));
  const last = lines().at(-1);
  assert.equal(last.via, "fetch");
  assert.equal(last.host, "api.resend.invalid");
  assert.equal(last.path, "/emails");
});

test("fetch to localhost still works", async () => {
  const r = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(await r.text(), "ok");
});

test("https.request / http.get to an external host error out and are logged", async () => {
  const before = lines().length;
  await new Promise<void>((resolve) => {
    const req = https.request({ hostname: "sheets.googleapis.invalid", path: "/v4/spreadsheets/x", method: "GET" });
    req.on("error", (e) => { assert.match(e.message, /blocked/); resolve(); });
    req.end();
  });
  await new Promise<void>((resolve) => {
    http.get("http://www.googleapis.invalid/oauth2", () => assert.fail("should not connect")).on("error", () => resolve());
  });
  const l = lines().slice(before);
  assert.deepEqual(l.map((x) => [x.via, x.host, x.path]), [["https", "sheets.googleapis.invalid", "/v4/spreadsheets/x"], ["http", "www.googleapis.invalid", "/oauth2"]]);
});

test("http.get to localhost still works", async () => {
  const body = await new Promise<string>((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/`, (res) => { let s = ""; res.on("data", (c) => (s += c)); res.on("end", () => resolve(s)); }).on("error", reject);
  });
  assert.equal(body, "ok");
});

test("raw sockets (net.connect / tls) are the backstop", async () => {
  await new Promise<void>((resolve) => {
    const s = net.connect({ host: "203.0.113.7", port: 443 });
    s.on("connect", () => assert.fail("should not connect"));
    s.on("error", (e: NodeJS.ErrnoException) => { assert.equal(e.code, "EGRESS_BLOCKED"); resolve(); });
  });
  assert.equal(lines().at(-1).via, "socket");
  assert.equal(lines().at(-1).host, "203.0.113.7");
});
