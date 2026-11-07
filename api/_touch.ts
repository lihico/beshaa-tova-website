/**
 * Shared by /api/touch and /api/q (docs/attribution/00_DESIGN.md sections 2, 3.1, 5.1, 5.9):
 * apply one touch to the visitor's cookie state, set bsh_vid / bsh_att / _fbc, and log the touch.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { emptyState, mergeTouch, type AttributionState, type Touch } from "./_attribution_core.js";
import {
  appendSetCookie, attCookie, fbcCookie, fbcForClick, readAttCookie, readVisitorCookie, requestHost, visitorCookie,
} from "./_cookies.js";
import { adoptVisitorId } from "./_ids.js";
import { getStore } from "./_store.js";

/** Hosts whose referrer means "our own site" (the request host is added by parseTouch itself). */
export function ownHosts(req: VercelRequest): string[] {
  const hosts = ["beshaa-tova.co.il", "www.beshaa-tova.co.il"];
  const h = requestHost(req);
  if (h) hosts.push(h);
  return hosts;
}

export interface AppliedTouch {
  state: AttributionState;
  visitor_id: string;
  added: boolean;           // false for a direct load or a duplicate within 30 minutes
  fbc: string | null;
}

/**
 * Merge `t` into the bsh_att cookie state, set the cookies, and append the touch to the store
 * when TOUCH_LOG is file or sheet. Store failures are logged, never fatal (a touch is best effort).
 */
export async function applyTouch(req: VercelRequest, res: VercelResponse, t: Touch | null, vidLs?: unknown): Promise<AppliedTouch> {
  const { visitor_id } = adoptVisitorId(readVisitorCookie(req), vidLs);
  const cookie = readAttCookie(req);
  const before: AttributionState = { ...emptyState(visitor_id), first: cookie?.first ?? null, last: cookie?.last ?? null };
  const state = mergeTouch(before, t);
  state.visitor_id = visitor_id;
  const added = !!t && state.touches.some((x) => x.touch_id === t.touch_id);

  appendSetCookie(res, visitorCookie(req, visitor_id));
  if (added) {
    const att = attCookie(req, state);
    if (att) appendSetCookie(res, att);
  }
  let fbc: string | null = null;
  if (t?.fbclid) {
    const f = fbcForClick(req, t.fbclid);
    fbc = f.value;
    if (f.set) appendSetCookie(res, fbcCookie(req, f.value));
  }

  const log = process.env.TOUCH_LOG;
  if (added && t && (log === "file" || log === "sheet")) {
    try {
      await getStore().appendTouch({ ...t, visitor_id });
    } catch (e) {
      console.error("[touch] store append failed:", e instanceof Error ? e.message : e);
    }
  }
  return { state, visitor_id, added, fbc };
}
