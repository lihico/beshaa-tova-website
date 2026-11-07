/**
 * afterResponse(fn) (docs/attribution/00_DESIGN.md section 5.7): run slow work after the HTTP answer.
 *
 * - Test mode (dev-api): globalThis.__ATTR_TEST__.trackBackground(promise), so GET /__test/idle waits.
 * - Vercel: the request context's waitUntil. This is what `@vercel/functions` waitUntil() reads
 *   (globalThis[Symbol.for("@vercel/request-context")].get().waitUntil); reading it directly avoids a
 *   new dependency. UNVERIFIED on this project's runtime (00_DESIGN section 17 item 11).
 * - Neither available: the caller must await the returned promise before responding (returns
 *   `{ deferred: false }` so it knows), which only risks a Grow retry that idempotency absorbs.
 */
type WaitUntil = (p: Promise<unknown>) => void;

interface AttrTestHooks { trackBackground(p: Promise<unknown>): void; onReset(fn: () => void | Promise<void>): void }

function testHooks(): AttrTestHooks | null {
  return (globalThis as unknown as { __ATTR_TEST__?: AttrTestHooks }).__ATTR_TEST__ ?? null;
}

function vercelWaitUntil(): WaitUntil | null {
  try {
    const holder = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
      | { get?: () => { waitUntil?: WaitUntil } | undefined }
      | undefined;
    const w = holder?.get?.()?.waitUntil;
    return typeof w === "function" ? w : null;
  } catch {
    return null;
  }
}

/** Starts fn now. deferred=true: the platform keeps it alive, respond at once. false: await `done`. */
export function afterResponse(fn: () => Promise<unknown>): { deferred: boolean; done: Promise<void> } {
  const done = Promise.resolve()
    .then(fn)
    .then(() => undefined, (e) => { console.error("[bg] background job failed:", e); });
  const hooks = testHooks();
  if (hooks) { hooks.trackBackground(done); return { deferred: true, done }; }
  const w = vercelWaitUntil();
  if (w) { w(done); return { deferred: true, done }; }
  return { deferred: false, done };
}

/** Registers a cache reset run by POST /__test/reset (test mode only; a no-op elsewhere). */
export function onTestReset(fn: () => void | Promise<void>): void {
  testHooks()?.onReset(fn);
}

/** Per-instance lock: jobs with the same key run one after another. */
const locks = new Map<string, Promise<unknown>>();
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const settled = next.catch(() => undefined);
  locks.set(key, settled);
  void settled.then(() => { if (locks.get(key) === settled) locks.delete(key); });
  return next;
}
