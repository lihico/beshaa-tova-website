import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { israeliMobileE164Digits, type OrderRecord } from "./_attribution_core.js";
import { purchaseEventId } from "./_ids.js";
import { META_GRAPH_VERSION } from "./_meta_version.js";

// Read at call time, not module load (docs/attribution 5.8): tests set env per run.
const pixelId = () => process.env.META_PIXEL_ID || "946664901627405";
// META_CAPI_TOKEN: the dataset token from Events Manager (PLAN.md Stage 2). META_ACCESS_TOKEN is the old fallback.
const accessToken = () => process.env.META_CAPI_TOKEN || process.env.META_ACCESS_TOKEN || "";

/** send (default) | log | off. */
export function capiMode(): "send" | "log" | "off" {
  const m = (process.env.CAPI_MODE || "send").toLowerCase();
  return m === "log" || m === "off" ? m : "send";
}

export type StandardEvent =
  | "PageView"
  | "ViewContent"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Lead"
  | "Purchase"
  | "CompleteRegistration"
  | "Contact";

export interface UserData {
  em?: string | string[] | null;        // email(s) (raw, will be hashed)
  ph?: string | string[] | null;        // phone(s) (raw, will be hashed and normalized)
  fn?: string | null;        // first name (raw)
  ln?: string | null;        // last name (raw)
  fbc?: string | null;       // _fbc cookie value
  fbp?: string | null;       // _fbp cookie value
  client_ip?: string | null;
  client_user_agent?: string | null;
  external_id?: string | string[] | null; // visitor_id (+ normalised phone), each hashed
}

export interface CustomData {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  num_items?: number;
  [k: string]: unknown;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function normalizePhone(p: string): string {
  // Israeli format → E.164 without +
  const digits = p.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  if (digits.length === 9 && digits.startsWith("5")) return "972" + digits;
  return digits;
}

function list(v: string | string[] | null | undefined): string[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return [...new Set(arr.filter((x): x is string => typeof x === "string" && x.trim() !== ""))];
}

function buildUserData(u: UserData) {
  const out: Record<string, string | string[]> = {};
  const em = list(u.em).map((e) => sha256(e.trim().toLowerCase()));
  const ph = list(u.ph).map((p) => sha256(normalizePhone(p)));
  const ext = list(u.external_id).map((x) => sha256(x));
  if (em.length) out.em = [...new Set(em)];
  if (ph.length) out.ph = [...new Set(ph)];
  if (u.fn) out.fn = [sha256(u.fn.trim().toLowerCase())];
  if (u.ln) out.ln = [sha256(u.ln.trim().toLowerCase())];
  if (u.fbc) out.fbc = u.fbc;
  if (u.fbp) out.fbp = u.fbp;
  if (u.client_ip) out.client_ip_address = u.client_ip;
  if (u.client_user_agent) out.client_user_agent = u.client_user_agent;
  if (ext.length) out.external_id = [...new Set(ext)];
  return out;
}

export interface SendMetaEventArgs {
  event_name: StandardEvent | string;
  event_id: string;              // for dedup with Pixel
  event_source_url?: string;
  event_time?: number;            // unix seconds
  user_data: UserData;
  custom_data?: CustomData;
  action_source?: "website" | "email" | "phone_call" | "chat" | "physical_store" | "system_generated" | "other";
  test_event_code?: string;       // for Meta Events Manager > Test Events
}

export interface SendMetaEventResult {
  ok: boolean;
  status?: number;
  fbtrace_id?: string;
  events_received?: number;
  /** Graph json.error.code and error_subcode only (never the message, which can echo request data). */
  error_code?: number;
  error_subcode?: number;
  error?: unknown;
  logged?: boolean;               // CAPI_MODE=log / no token / test mode without a test code
}

/** `${ATTR_DATA_DIR}/capi.jsonl` when ATTR_DATA_DIR is set and exists (test mode); else null. */
function capiLogFile(): string | null {
  const dir = process.env.ATTR_DATA_DIR;
  if (!dir) return null;
  try { return fs.statSync(dir).isDirectory() ? path.join(dir, "capi.jsonl") : null; } catch { return null; }
}

export async function sendMetaEvent(args: SendMetaEventArgs): Promise<SendMetaEventResult> {
  const mode = capiMode();
  if (mode === "off") return { ok: false, error: "capi off" };

  const token = accessToken();
  const testMode = process.env.ATTR_TEST === "1";
  // Under ATTR_TEST only the env test code counts (never a code from a request).
  const testCode = testMode ? (process.env.META_TEST_EVENT_CODE || undefined) : args.test_event_code;

  // Build the full payload first (hashing included), so log mode records exactly what would go out.
  const payload = {
    data: [
      {
        event_name: args.event_name,
        event_time: args.event_time ?? Math.floor(Date.now() / 1000),
        event_id: args.event_id,
        event_source_url: args.event_source_url,
        action_source: args.action_source ?? "website",
        user_data: buildUserData(args.user_data),
        custom_data: args.custom_data ?? {},
      },
    ],
    ...(testCode ? { test_event_code: testCode } : {}),
  };

  if (mode === "log" || !token || (testMode && !testCode)) {
    const file = capiLogFile();
    if (file) {
      try { fs.appendFileSync(file, JSON.stringify({ payload, would_send: false, at: new Date().toISOString() }) + "\n"); }
      catch (e) { console.error("[meta-capi] could not write capi.jsonl:", e); }
    } else if (!token) {
      console.warn("[meta-capi] META_CAPI_TOKEN / META_ACCESS_TOKEN not set, skipping");
    }
    return { ok: false, logged: true, error: token ? "logged" : "missing token" };
  }

  try {
    // The URL carries the token: never log it.
    const res = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId()}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const e = graphError(json);
      // Codes and the trace id only: the message body can echo request data.
      console.error("[meta-capi] error", res.status, JSON.stringify(e));
      return { ok: false, status: res.status, error_code: e.code, error_subcode: e.error_subcode, error: e };
    }
    return {
      ok: true,
      status: res.status,
      fbtrace_id: (json as { fbtrace_id?: string }).fbtrace_id,
      events_received: (json as { events_received?: number }).events_received,
    };
  } catch (err) {
    console.error("[meta-capi] fetch failed", err instanceof Error ? err.message : "error");
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

/** The safe part of a Graph error body: numeric code, subcode, type and trace id. */
export function graphError(json: unknown): { code?: number; error_subcode?: number; type?: string; fbtrace_id?: string } {
  const e = (json && typeof json === "object" ? (json as { error?: unknown }).error : null) as Record<string, unknown> | null;
  if (!e || typeof e !== "object") return {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
  const out: { code?: number; error_subcode?: number; type?: string; fbtrace_id?: string } = {};
  const code = n(e.code), sub = n(e.error_subcode);
  if (code !== undefined) out.code = code;
  if (sub !== undefined) out.error_subcode = sub;
  if (typeof e.type === "string" && /^[A-Za-z_]{1,40}$/.test(e.type)) out.type = e.type;
  if (typeof e.fbtrace_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(e.fbtrace_id)) out.fbtrace_id = e.fbtrace_id;
  return out;
}

/**
 * One result shape for the sheet (Lead and Purchase alike):
 *   result: ok:<events_received> | logged | off | error:<http status> (error: with no status = network error)
 *   sent: true only when Meta accepted the event (logged, off and errors stay retryable)
 *   error_code: "<code>" or "<code>:<subcode>", "fetch" for a network error, null when not an error
 */
export function capiOutcome(r: Pick<SendMetaEventResult, "ok" | "logged" | "status" | "events_received" | "error_code" | "error_subcode" | "error">): {
  result: string; sent: boolean; error_code: string | null;
} {
  if (r.ok) return { result: `ok:${r.events_received ?? ""}`, sent: true, error_code: null };
  // "logged" covers CAPI_MODE=log and a missing token: nothing reached Meta, so sent stays false and
  // scripts/capi-retry.ts can still re-send it once a token exists.
  if (r.logged) return { result: "logged", sent: false, error_code: null };
  if (r.error === "capi off") return { result: "off", sent: false, error_code: null };
  const code = r.error_code !== undefined ? `${r.error_code}${r.error_subcode !== undefined ? `:${r.error_subcode}` : ""}` : r.status ? null : "fetch";
  return { result: `error:${r.status ?? ""}`, sent: false, error_code: code };
}

export interface LeadPatch { capi_lead_result: string; capi_lead_sent_at: string | null; capi_last_error_code?: string | null }

/**
 * Send the CAPI Lead (lead_<order_id>) and write its result on the order row. consent_marketing=denied
 * skips the send, the same rule as the Purchase. Never throws: a failed sheet write is logged only.
 */
export async function sendLeadRecorded(
  store: { updateOrder(order_id: string, patch: Record<string, unknown>): Promise<void> },
  order: { order_id: string; consent_marketing?: string | null },
  args: Omit<SendMetaEventArgs, "event_name">,
): Promise<LeadPatch> {
  let patch: LeadPatch;
  if (order.consent_marketing === "denied") {
    patch = { capi_lead_result: "skipped_consent", capi_lead_sent_at: null };
  } else {
    const r = await sendMetaEvent({ ...args, event_name: "Lead" })
      .catch((e): SendMetaEventResult => ({ ok: false, error: e instanceof Error ? e.message : "error" }));
    const out = capiOutcome(r);
    patch = { capi_lead_result: out.result, capi_lead_sent_at: out.sent ? new Date().toISOString() : null };
    if (out.error_code) patch.capi_last_error_code = out.error_code;
  }
  try { await store.updateOrder(order.order_id, patch as unknown as Record<string, unknown>); }
  catch (e) { console.error(`[capi] Lead result not saved for ${order.order_id}:`, e instanceof Error ? e.message : "error"); }
  return patch;
}

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

function splitName(full: string): { fn: string | null; ln: string | null } {
  const parts = full.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return { fn: parts[0] ?? null, ln: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

function purchasePlan(o: OrderRecord): "kit" | "kit_all_meetings" | "gift" {
  return o.order_kind === "gift" ? "gift" : o.all_meetings ? "kit_all_meetings" : "kit";
}

/**
 * CAPI Purchase (purchase_<order_id>, value = paid ILS gross), once per order: skipped when
 * capi_purchase_sent_at is set. Called by fulfilPaid (api/_fulfil.ts) and by scripts/capi-retry.ts,
 * which re-sends failed ones. Takes any store with updateOrder, so a script or a test can pass its own.
 */
export async function capiPurchase(store: { updateOrder(order_id: string, patch: Partial<OrderRecord>): Promise<void> }, o: OrderRecord): Promise<OrderRecord> {
  if (o.capi_purchase_sent_at) return o;
  const event_id = purchaseEventId(o.order_id);
  if (o.consent_marketing === "denied") {
    await store.updateOrder(o.order_id, { capi_purchase_event_id: event_id, capi_purchase_result: "skipped_consent" });
    return { ...o, capi_purchase_result: "skipped_consent" };
  }
  const paidMs = o.paid_at ? Date.parse(o.paid_at) : Date.now();
  const createdMs = o.created_at ? Date.parse(o.created_at) : paidMs;
  const old = Number.isFinite(createdMs) && paidMs - createdMs > SEVEN_DAYS_MS;     // Meta rejects website events > 7 days
  const { fn, ln } = splitName(o.buyer.name);
  const phoneE164 = israeliMobileE164Digits(o.buyer.phone);
  const meetings = o.meetings ?? [];
  const r = await sendMetaEvent({
    event_name: "Purchase",
    event_id,
    event_time: Math.floor(paidMs / 1000),
    event_source_url: o.event_source_url ?? undefined,
    action_source: old ? "system_generated" : "website",
    user_data: {
      em: [o.buyer.email, o.payer_email].filter((x): x is string => !!x),
      ph: [o.buyer.phone, o.payer_phone].filter((x): x is string => !!x),
      fn, ln,
      external_id: [o.visitor_id, phoneE164].filter((x): x is string => !!x),
      fbc: o.fbc, fbp: o.fbp, client_ip: o.client_ip, client_user_agent: o.user_agent,
    },
    custom_data: {
      value: o.paid_amount ?? o.amount_expected, currency: "ILS", order_id: o.order_id, content_type: "product",
      content_ids: meetings.length ? meetings : [purchasePlan(o)], num_items: meetings.length || 1,
      content_name: o.order_kind === "gift" ? "couple_kit_gift" : "couple_kit", content_category: o.order_kind,
    },
  }).catch((e): SendMetaEventResult => ({ ok: false, error: e instanceof Error ? e.message : "error" }));
  const out = capiOutcome(r);
  const patch: Partial<OrderRecord> = {
    capi_purchase_event_id: event_id, capi_purchase_result: out.result,
    capi_purchase_sent_at: out.sent ? new Date().toISOString() : null,   // an error is retried (capi-retry.ts)
    ...(out.error_code ? { capi_last_error_code: out.error_code } : {}),
  };
  await store.updateOrder(o.order_id, patch);
  return { ...o, ...patch };
}

// Helpers exported for tests / callers that need them
export const _internal = { sha256, normalizePhone, buildUserData };
