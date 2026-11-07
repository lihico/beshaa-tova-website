/**
 * MockGrowAdapter (docs/attribution/00_DESIGN.md 5.5): the real GrowAdapter pointed at the local
 * fake Grow (scripts/mock-grow.ts, served by dev-api under /_mock/grow). Same wire format, same
 * verify and approve calls, so the production adapter's code is what the E2E tests exercise.
 * Refuses to construct unless ATTR_TEST=1.
 */
import { GrowAdapter } from "./_payments_grow.js";

export const DEFAULT_MOCK_GROW_BASE = "http://127.0.0.1:3001/_mock/grow/api/light/server/1.0";

export class MockGrowAdapter extends GrowAdapter {
  override readonly provider = "grow_mock" as const;
  constructor() {
    if (process.env.ATTR_TEST !== "1") throw new Error("MockGrowAdapter is test-only (ATTR_TEST=1)");
    const e = process.env;
    const publicBaseUrl = (e.PUBLIC_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
    super({
      apiBase: (e.MOCK_GROW_BASE || DEFAULT_MOCK_GROW_BASE).replace(/\/+$/, ""),
      userId: "mock-user", pageCode: "mock-page",
      notifySecret: e.GROW_NOTIFY_SECRET || "0123456789abcdef0123456789abcdef",
      publicBaseUrl, notifyBaseUrl: (e.NOTIFY_BASE_URL || publicBaseUrl).replace(/\/+$/, ""),
    });
  }
}
