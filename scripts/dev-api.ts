/**
 * Local API server for test mode (docs/attribution/00_DESIGN.md section 6.1). Replaces `vercel dev`,
 * which would download the project's env vars; this one never reads .env.local.
 *
 *   npm run dev:api        (tsx scripts/dev-api.ts; port 3001, DEV_API_PORT to change)
 *   npm run dev:test       (Vite with ATTR_TEST=1: tag stubs + proxy to this server)
 *
 * Order matters: 1. load tests/e2e/test.env and refuse to start on any production variable,
 * 2. install the outbound network fence, 3. only then import the routing (which imports the
 * handlers in api/ lazily, per request).
 */
import http from "node:http";
import { prepareTestEnvOrExit } from "./dev-api-lib/env.ts";
import { installEgressFence } from "./dev-api-lib/fence.ts";

const { dataDir } = prepareTestEnvOrExit();
installEgressFence(dataDir);

const { installHooks } = await import("./dev-api-lib/shim.ts");
const { resetDataDir } = await import("./dev-api-lib/test-routes.ts");
const { createDevApiServer } = await import("./dev-api-lib/server.ts");

installHooks();
await resetDataDir(dataDir);

process.on("unhandledRejection", (e) => console.error("[dev-api] unhandled rejection:", e));

const port = Number(process.env.DEV_API_PORT || 3001);
const listener = createDevApiServer(dataDir);
const hosts = ["127.0.0.1", "::1"];      // loopback only, both families ("localhost" may resolve to either)
let listening = 0;
for (const host of hosts) {
  const server = http.createServer(listener);
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (host === "::1" && (e.code === "EADDRNOTAVAIL" || e.code === "EAFNOSUPPORT")) return;   // no IPv6 loopback
    console.error(`dev-api: cannot listen on ${host}:${port}: ${e.code ?? e.message}`);
    process.exit(1);
  });
  server.listen(port, host, () => {
    listening++;
    if (listening === 1) {
      console.log(`dev-api (TEST MODE) on http://localhost:${port}  data: ${dataDir}`);
      console.log("  env: tests/e2e/test.env only; outbound network fenced to localhost");
    }
  });
}
