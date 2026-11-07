import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Test mode (docs/attribution/00_DESIGN.md section 4.6): only `ATTR_TEST=1 vite` (npm run dev:test),
// together with scripts/dev-api.ts on :3001. With ATTR_TEST unset the config below is the same as
// before (react + tailwind + "@" alias), so production builds are unaffected.
const ATTR_TEST = process.env.ATTR_TEST === "1";
const DEV_API = "http://127.0.0.1:3001";
const ANALYTICS_STUB = path.resolve(__dirname, "./tests/e2e/stubs/vercel-analytics.ts");

// Anything left from these hosts in the test page means a tag would reach a real third party.
const EXTERNAL_TAG_HOSTS = [
  "connect.facebook.net", "facebook.com/tr", "googletagmanager.com", "google-analytics.com",
  "clarity.ms", "cloudfront.net", "fonts.googleapis.com", "fonts.gstatic.com",
];

/** Swaps the Pixel and gtag for local recording stubs, drops Clarity, RB2B, Google Fonts and <noscript>. */
function attrTestHtml(): Plugin {
  return {
    name: "attr-test-html",
    apply: "serve",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const out = html
          .replace("https://connect.facebook.net/en_US/fbevents.js", "/__test/fbevents-stub.js")
          .replace(/https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=[A-Z0-9-]+/, "/__test/gtag-stub.js")
          .replace(/<!-- Microsoft Clarity \(deferred\) -->\s*<script>[\s\S]*?<\/script>/, "<!-- Clarity removed (ATTR_TEST) -->")
          .replace(/<!-- RB2B \(deferred\) -->\s*<script>[\s\S]*?<\/script>/, "<!-- RB2B removed (ATTR_TEST) -->")
          .replace(/<noscript>[\s\S]*?<\/noscript>\s*/g, "")
          .replace(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/g, "");
        const left = EXTERNAL_TAG_HOSTS.filter((h) => out.includes(h));
        if (left.length) throw new Error(`attrTestHtml: index.html still loads ${left.join(", ")} in test mode; update vite.config.ts`);
        return out;
      },
    },
  };
}

export default defineConfig(({ command }) => {
  if (ATTR_TEST && command === "build") {
    throw new Error("ATTR_TEST=1 is for the local dev server only; unset it before building.");
  }
  const test = ATTR_TEST && command === "serve";
  const toDevApi = { target: DEV_API, xfwd: true, changeOrigin: false };   // keeps Host: localhost:5173 for cookies
  return {
    // NEW_PRICES=1 (Vercel env, read at build time) selects the 2.11.2026 price table in the bundle
    // (src/lib/prices.ts); the functions read the same variable at run time (api/_pricing.ts).
    define: { __BESHAA_NEW_PRICES__: JSON.stringify(process.env.NEW_PRICES === "1") },
    plugins: [react(), tailwindcss(), ...(test ? [attrTestHtml()] : [])],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        ...(test ? { "@vercel/analytics/react": ANALYTICS_STUB, "@vercel/speed-insights/react": ANALYTICS_STUB } : {}),
      },
    },
    // "/api/<file>.ts" is a module request (src/lib/attribution.ts imports api/_attribution_core.ts):
    // Vite serves it; every other /api path goes to dev-api.
    ...(test
      ? { server: { proxy: { "^/api/(?![^?]*\\.ts(?:\\?|$))": toDevApi, "^/q/": toDevApi, "^/r/": toDevApi, "^/__test/": toDevApi, "^/_mock/": toDevApi } } }
      : {}),
  };
});
