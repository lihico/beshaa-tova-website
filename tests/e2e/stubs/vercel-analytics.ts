/**
 * Test mode only (ATTR_TEST=1, Vite dev server): aliased in place of @vercel/analytics/react and
 * @vercel/speed-insights/react, whose development builds load scripts from va.vercel-scripts.com.
 * Production builds never use this file (vite.config.ts applies the alias only to `vite serve`).
 */
export function Analytics(): null {
  return null;
}

export function SpeedInsights(): null {
  return null;
}
