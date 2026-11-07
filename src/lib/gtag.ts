declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

const GA_ID = "G-W3Z965PSD0";

export function gtagEvent(
  eventName: string,
  params?: Record<string, unknown>,
) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, { ...params, send_to: GA_ID });
  }
}
