/**
 * Behaviour events for GA4 and Clarity (SITE_CHANGES_2026-11-14 M2, approved by Lihi 14.11.2026).
 *
 * Answers "does the visitor scroll, see the price, and where do they leave the form?". No personal
 * data in any event: only fixed names (section, cta, step, reason), never what was typed.
 * GA4: gtag events. Clarity: a custom event plus a session tag, so recordings can be filtered
 * (for example "saw_price" set and no "order_submitted").
 */
import { useEffect, useRef, type RefObject } from "react";
import { gtagEvent } from "@/lib/gtag";

type ClarityFn = (...args: unknown[]) => void;

function clarity(...args: unknown[]): void {
  try {
    const c = (globalThis as unknown as { clarity?: ClarityFn }).clarity;
    if (typeof c === "function") c(...args);
  } catch { /* blocked or not loaded */ }
}

const once = new Set<string>();

/** Fire at most once per page load for this key. */
function first(key: string): boolean {
  if (once.has(key)) return false;
  once.add(key);
  return true;
}

/** A home-page section reached the screen (hero, how, quotes, story, inside, cafe, faq, pricing...). */
export function trackSectionView(section: string, page = "home"): void {
  if (!first(`section:${page}:${section}`)) return;
  gtagEvent("view_section", { section, page });
  clarity("event", `section_${section}`);
}

/** A price was on screen (the order price box, the gift prices, the home price table). */
export function trackPriceSeen(where: string): void {
  if (!first(`price:${where}`)) return;
  gtagEvent("view_price", { where });
  clarity("set", "saw_price", where);
  clarity("event", "saw_price");
}

/** A button or link click: order, gift, whatsapp, share_partner... `where` = the block it sits in. */
export function trackCta(cta: string, where: string): void {
  gtagEvent("cta_click", { cta, where });
  clarity("event", `cta_${cta}`);
}

let lastStep: string | null = null;
let formDone = false;
let abandonWired = false;

/** The visitor entered a part of the order form (names, contact, address, meetings, extras, code, price). */
export function trackFormStep(form: "self" | "gift", step: string): void {
  if (formDone) return;
  lastStep = `${form}:${step}`;
  if (!first(`step:${form}:${step}`)) return;
  gtagEvent("form_step", { form, step });
  clarity("set", "form_step", step);
  if (!abandonWired && typeof window !== "undefined") {
    abandonWired = true;
    // Leaving the page (tab hidden or closed) with a started, unsent form: where they stopped.
    const leave = () => {
      if (formDone || !lastStep || document.visibilityState !== "hidden") return;
      const [f, s] = lastStep.split(":");
      gtagEvent("form_abandon", { form: f, step: s, transport_type: "beacon" });
      clarity("event", "form_abandon");
      formDone = true;
    };
    document.addEventListener("visibilitychange", leave);
  }
}

/** The form was sent (review confirmed): no abandon event after this. */
export function trackFormDone(form: "self" | "gift"): void {
  formDone = true;
  clarity("set", "order_submitted", form);
}

/** A message that stopped the submit (fixed reason key, never the field's value). */
export function trackFormError(form: "self" | "gift", reason: string): void {
  gtagEvent("form_error", { form, reason });
  clarity("event", `form_error_${reason}`);
}

/** Calls fn once, the first time the element is at least `threshold` on screen. */
export function useSeenOnce<T extends Element>(fn: () => void, threshold = 0.35): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const done = useRef(false);
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    const el = ref.current;
    if (!el || done.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !done.current) {
        done.current = true;
        cb.current();
        io.disconnect();
      }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

/** Stable reason keys for the order form messages (Order.tsx), so GA4 never receives free text. */
export function errorReason(message: string): string {
  const table: Array<[RegExp, string]> = [
    [/שמות שני בני הזוג/, "names"], [/מגדר/, "gender"], [/טלפון של בן\/בת הזוג/, "partner_phone"],
    [/מספר טלפון|הטלפון לא תקין|טלפון תקין/, "phone"], [/מייל/, "email"], [/כתובת למשלוח/, "address"],
    [/שם משפחה/, "last_name"], [/מיקוד/, "zip"], [/מפגש/, "meetings"], [/תנאי השימוש/, "terms"],
    [/שובר|קוד/, "voucher"], [/תאריך חתונה/, "wedding_date"], [/השם שלך/, "giver_name"], [/השתבש/, "send_failed"],
  ];
  for (const [re, key] of table) if (re.test(message)) return key;
  return "other";
}
