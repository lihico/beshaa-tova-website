/**
 * Test-mode environment for scripts/dev-api.ts (00_DESIGN.md section 6.1).
 * Loads tests/e2e/test.env (never .env.local) and refuses to start when anything points at
 * production. Messages name variables only, never their values.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WEBSITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TEST_ENV_FILE = path.join(WEBSITE_DIR, "tests", "e2e", "test.env");

/** Must be unset or empty after loading (real Google, calendar, Grow, affiliate or Vercel context). */
export const FORBIDDEN_VARS = [
  "GOOGLE_SPREADSHEET_ID", "GOOGLE_PRIVATE_KEY", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_APPLICATION_CREDENTIALS",
  "LIHI_CALENDAR_ID", "GROW_USER_ID", "GROW_PAGE_CODE", "GROW_API_BASE",
  "FIRSTPROMOTER_API_KEY", "FIRSTPROMOTER_ACCOUNT_ID", "META_AD_ACCOUNT_ID",
  "VERCEL", "VERCEL_ENV", "VERCEL_URL",
] as const;

const isSet = (name: string) => (process.env[name] ?? "").trim() !== "";

/** Minimal KEY=VALUE parser, used only when process.loadEnvFile is missing (Node < 20.12). */
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

export function loadTestEnv(file: string = TEST_ENV_FILE): void {
  if (path.basename(file).startsWith(".env")) throw new Error("dev-api: refusing to load a .env* file");
  const loader = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
  if (typeof loader === "function") {
    loader.call(process, file);               // does not override variables already in the shell
  } else {
    for (const [k, v] of Object.entries(parseEnvFile(fs.readFileSync(file, "utf8")))) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

/** Returns the list of problems (variable names and rules only). Empty = safe to start. */
export function checkTestEnv(): string[] {
  const problems: string[] = [];
  for (const name of FORBIDDEN_VARS) if (isSet(name)) problems.push(`${name} is set (production variable)`);
  const e = process.env;
  if (e.ATTR_TEST !== "1") problems.push("ATTR_TEST must be 1");
  if (e.STORE_MODE !== "file") problems.push("STORE_MODE must be file");
  if (!["mock", "grow_pages", "grow_make"].includes(e.PAYMENT_PROVIDER ?? "")) problems.push("PAYMENT_PROVIDER must be mock, grow_pages or grow_make");
  // Fixed Grow pages and the Make scenario must be the local fake (scripts/mock-grow.ts).
  if (isSet("GROW_PAGE_URLS")) {
    try {
      const pages = JSON.parse(String(e.GROW_PAGE_URLS)) as Record<string, unknown>;
      for (const [k, v] of Object.entries(pages)) {
        if (typeof v !== "string" || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(v)) problems.push(`GROW_PAGE_URLS[${k}] must point at localhost`);
      }
    } catch { problems.push("GROW_PAGE_URLS is not valid JSON"); }
  }
  if (!(e.RESEND_BASE_URL ?? "").startsWith("http://localhost:3001/")) problems.push("RESEND_BASE_URL must start with http://localhost:3001/");
  if (!(e.RESEND_API_KEY ?? "").startsWith("re_test")) problems.push("RESEND_API_KEY must be a re_test dummy");
  if (!/\.test$/i.test(e.ORDER_NOTIFICATION_EMAIL ?? "")) problems.push("ORDER_NOTIFICATION_EMAIL must be a .test address");
  if (isSet("META_ACCESS_TOKEN") && !isSet("META_TEST_EVENT_CODE")) problems.push("META_ACCESS_TOKEN is set without META_TEST_EVENT_CODE");
  if (e.CAPI_MODE === "send" && !isSet("META_TEST_EVENT_CODE")) problems.push("CAPI_MODE=send needs META_TEST_EVENT_CODE");
  if ((e.AFFILIATE_PROVIDER ?? "stub") !== "stub") problems.push("AFFILIATE_PROVIDER must be stub");
  if (e.FULFIL_GIFT_RELEASE === "1") problems.push("FULFIL_GIFT_RELEASE must not be 1 (use log)");
  for (const name of ["MOCK_GROW_BASE", "PUBLIC_BASE_URL", "NOTIFY_BASE_URL", "GROW_MAKE_CREATE_URL"]) {
    const v = e[name] ?? "";
    if (v && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(v)) problems.push(`${name} must point at localhost`);
  }
  return problems;
}

/** Absolute data dir; must be inside website/ and named .test-data* (reset deletes its contents). */
export function resolveDataDir(): string {
  const dir = path.resolve(WEBSITE_DIR, process.env.ATTR_DATA_DIR || ".test-data");
  const rel = path.relative(WEBSITE_DIR, dir);
  if (rel.startsWith("..") || path.isAbsolute(rel) || !path.basename(dir).startsWith(".test-data")) {
    throw new Error("dev-api: ATTR_DATA_DIR must be a .test-data* folder inside website/");
  }
  return dir;
}

/** Load, check, exit 1 on any problem. Sets ATTR_DATA_DIR to the absolute path for the handlers. */
export function prepareTestEnvOrExit(): { dataDir: string } {
  loadTestEnv();
  const problems = checkTestEnv();
  let dataDir = "";
  try { dataDir = resolveDataDir(); } catch (e) { problems.push((e as Error).message); }
  if (problems.length) {
    console.error("dev-api: refusing to start (test mode guard):\n  - " + problems.join("\n  - "));
    console.error("Run it from a fresh shell that has not exported production variables (do not source .env.local).");
    process.exit(1);
  }
  process.env.ATTR_DATA_DIR = dataDir;
  fs.mkdirSync(dataDir, { recursive: true });
  return { dataDir };
}
