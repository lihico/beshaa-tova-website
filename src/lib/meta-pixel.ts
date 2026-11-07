declare global {
  interface Window {
    fbq: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[] };
  }
}

type StandardEvent =
  | "PageView"
  | "Lead"
  | "CompleteRegistration"
  | "ViewContent"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "Contact";

export function trackEvent(event: StandardEvent, params?: Record<string, unknown>, eventID?: string) {
  if (typeof window === "undefined" || !window.fbq) return;
  if (eventID) {
    window.fbq("track", event, params ?? {}, { eventID });
  } else if (params) {
    window.fbq("track", event, params);
  } else {
    window.fbq("track", event);
  }
}

export function trackCustomEvent(event: string, params?: Record<string, unknown>, eventID?: string) {
  if (typeof window === "undefined" || !window.fbq) return;
  if (eventID) {
    window.fbq("trackCustom", event, params ?? {}, { eventID });
  } else if (params) {
    window.fbq("trackCustom", event, params);
  } else {
    window.fbq("trackCustom", event);
  }
}
