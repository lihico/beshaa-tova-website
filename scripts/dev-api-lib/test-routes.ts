/**
 * Test-only routes (00_DESIGN.md section 6.1). They exist only in dev-api; no file under api/
 * serves them. /__test/* = control and assertion endpoints, /_mock/resend = Resend sink.
 */
import fs from "node:fs";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { WEBSITE_DIR } from "./env.ts";
import { waitIdle, runResetHooks } from "./shim.ts";

const FIXTURES = path.join(WEBSITE_DIR, "tests", "e2e", "fixtures");
const STUBS = path.join(WEBSITE_DIR, "tests", "e2e", "stubs");
const SEEDS: Array<[string, string]> = [["codes.json", "codes.json"], ["partners.json", "partners.json"], ["mock_grow.json", "mock_grow.json"], ["vouchers.json", "vouchers.json"]];

function appendJsonl(dataDir: string, file: string, obj: unknown): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.appendFileSync(path.join(dataDir, file), JSON.stringify(obj) + "\n");
}

function readJsonl(file: string): unknown[] {
  return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => {
    try { return JSON.parse(l); } catch { return { _unparsable: l.slice(0, 200) }; }
  });
}

/** Empties the data dir (contents only) and reseeds the registries and the fake Grow state. */
export async function resetDataDir(dataDir: string): Promise<void> {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const entry of fs.readdirSync(dataDir)) fs.rmSync(path.join(dataDir, entry), { recursive: true, force: true });
  fs.mkdirSync(path.join(dataDir, "emails"), { recursive: true });
  for (const [from, to] of SEEDS) fs.copyFileSync(path.join(FIXTURES, from), path.join(dataDir, to));
  emailCounter = 0;
  await runResetHooks();
}

/** orders.jsonl lines {op: "insert"|"update", order_id, data, at} replayed into one object per order. */
export function replayOrders(lines: unknown[]): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const l of lines as Array<{ op?: string; order_id?: string; data?: Record<string, unknown> }>) {
    if (!l || typeof l.order_id !== "string" || !l.data) continue;
    if (l.op === "insert") out[l.order_id] = { ...l.data };
    else if (l.op === "update" && out[l.order_id]) out[l.order_id] = { ...out[l.order_id], ...l.data };
  }
  return out;
}

export function readState(dataDir: string): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  if (!fs.existsSync(dataDir)) return state;
  for (const name of fs.readdirSync(dataDir).sort()) {
    const full = path.join(dataDir, name);
    if (name.endsWith(".jsonl")) state[name.replace(/\.jsonl$/, "")] = readJsonl(full);
    else if (name.endsWith(".json")) {
      try { state[name.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(full, "utf8")); } catch { state[name] = { _unparsable: true }; }
    }
  }
  const emailsDir = path.join(dataDir, "emails");
  state.emails = fs.existsSync(emailsDir)
    ? fs.readdirSync(emailsDir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(emailsDir, f), "utf8")))
    : [];
  if (Array.isArray(state.orders)) state.orders_replayed = replayOrders(state.orders);
  if (!state.blocked_egress) state.blocked_egress = [];
  return state;
}

function beaconPayload(body: unknown): unknown {
  if (typeof body === "string") { try { return JSON.parse(body); } catch { return { _raw: body.slice(0, 2000) }; } }
  if (Buffer.isBuffer(body)) { try { return JSON.parse(body.toString("utf8")); } catch { return { _raw_bytes: body.length }; } }
  return body ?? null;
}

let emailCounter = 0;

/** Resend SDK sink: POST /_mock/resend/emails (and /emails/batch) -> .test-data/emails/<n>.json. */
export function handleMockResend(req: VercelRequest, res: VercelResponse, subpath: string, dataDir: string): void {
  const save = (email: Record<string, unknown>): string => {
    const dir = path.join(dataDir, "emails");
    fs.mkdirSync(dir, { recursive: true });
    emailCounter = Math.max(emailCounter, fs.readdirSync(dir).length) + 1;
    const n = String(emailCounter).padStart(4, "0");
    const attachments = Array.isArray(email.attachments)
      ? (email.attachments as Array<Record<string, unknown>>).map((a) => {
          const content = typeof a.content === "string" ? a.content : "";
          return { filename: a.filename ?? null, content_type: a.content_type ?? a.contentType ?? null, size: content.length, content: content.length <= 50000 ? content : null };
        })
      : [];
    const record = { n: emailCounter, at: new Date().toISOString(), from: email.from ?? null, to: email.to ?? null,
      cc: email.cc ?? null, bcc: email.bcc ?? null, reply_to: email.reply_to ?? email.replyTo ?? null,
      subject: email.subject ?? null, html: email.html ?? null, text: email.text ?? null, attachments };
    fs.writeFileSync(path.join(dir, `${n}.json`), JSON.stringify(record, null, 2));
    return `mock_email_${n}`;
  };
  if (req.method === "POST" && subpath === "/emails" && req.body && typeof req.body === "object") {
    res.status(200).json({ id: save(req.body as Record<string, unknown>) });
    return;
  }
  if (req.method === "POST" && subpath === "/emails/batch" && Array.isArray(req.body)) {
    res.status(200).json({ data: (req.body as Array<Record<string, unknown>>).map((e) => ({ id: save(e) })) });
    return;
  }
  res.status(404).json({ name: "not_found", message: `mock resend: ${req.method} ${subpath} is not implemented` });
}

type MockGrowModule = {
  replayNotify?: (orderId: string, ctx: { dataDir: string }) => Promise<unknown>;
  setMakeMode?: (mode: string, ctx: { dataDir: string }) => Promise<unknown>;
  replayPageWebhook?: (tx: string, encoding: string | null, ctx: { dataDir: string }) => Promise<unknown>;
  replayMakeNotify?: (orderId: string, ctx: { dataDir: string }) => Promise<unknown>;
};

/** PAYMENT_PROVIDER before POST /__test/provider changed it (null = not changed); POST /reset restores it. */
let bootProvider: string | undefined | null = null;
const TEST_PROVIDERS = ["manual", "grow_make", "grow_pages"];

/** Returns true when it handled the request. */
export async function handleTestRoute(
  req: VercelRequest, res: VercelResponse, subpath: string, dataDir: string,
  loadMockGrow: () => Promise<MockGrowModule | null>,
): Promise<boolean> {
  const route = `${req.method} ${subpath}`;
  switch (route) {
    case "GET /health":
      res.status(200).json({ ok: true, mode: "test", data_dir: path.relative(WEBSITE_DIR, dataDir) });
      return true;
    case "POST /reset":
      if (bootProvider !== null) {
        if (bootProvider === undefined) delete process.env.PAYMENT_PROVIDER; else process.env.PAYMENT_PROVIDER = bootProvider;
        bootProvider = null;
      }
      await resetDataDir(dataDir);
      res.status(200).json({ ok: true });
      return true;
    case "GET /idle": {
      const r = await waitIdle(Number(req.query.timeout_ms) || 30000);
      res.status(r.idle ? 200 : 504).json(r);
      return true;
    }
    case "GET /state":
      res.status(200).json(readState(dataDir));
      return true;
    case "POST /pixel":
    case "POST /gtag":
      appendJsonl(dataDir, subpath === "/pixel" ? "pixel.jsonl" : "gtag.jsonl", { ...(beaconPayload(req.body) as object), received_at: Date.now() });
      res.status(204).end();
      return true;
    case "GET /fbevents-stub.js":
    case "GET /gtag-stub.js":
      res.setHeader("content-type", "application/javascript; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.status(200).send(fs.readFileSync(path.join(STUBS, subpath.slice(1)), "utf8"));
      return true;
    case "POST /replay-notify": {
      const mod = await loadMockGrow();
      if (!mod?.replayNotify) { res.status(501).json({ error: "scripts/mock-grow.ts is not built yet (slice 5)" }); return true; }
      const o = String(req.query.o ?? "");
      res.status(200).json((await mod.replayNotify(o, { dataDir })) ?? { ok: true });
      return true;
    }
    case "POST /provider": {
      // The api handlers run in this process, so this switches PAYMENT_PROVIDER until the next reset.
      const p = typeof req.query.p === "string" ? req.query.p : "";
      if (!TEST_PROVIDERS.includes(p)) { res.status(400).json({ error: `p must be one of ${TEST_PROVIDERS.join(", ")}` }); return true; }
      if (bootProvider === null) bootProvider = process.env.PAYMENT_PROVIDER;
      process.env.PAYMENT_PROVIDER = p;
      res.status(200).json({ ok: true, provider: p });
      return true;
    }
    case "POST /make-mode":
    case "POST /replay-page-webhook":
    case "POST /replay-make-notify": {
      const mod = await loadMockGrow();
      const q = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : "");
      const out = subpath === "/make-mode" ? await mod?.setMakeMode?.(q("mode"), { dataDir })
        : subpath === "/replay-page-webhook" ? await mod?.replayPageWebhook?.(q("tx"), q("encoding") || null, { dataDir })
        : await mod?.replayMakeNotify?.(q("o"), { dataDir });
      res.status(out ? 200 : 501).json(out ?? { error: "mock-grow lacks this test hook" });
      return true;
    }
    default:
      return false;
  }
}
