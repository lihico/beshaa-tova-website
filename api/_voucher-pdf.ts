// Render the gift voucher HTML to an A4 PDF. On Vercel this uses the serverless Chromium build;
// locally it uses a Chrome found on the machine (CHROME_PATH or Playwright's). Returns null on any
// failure or timeout, so the caller can fall back to attaching the HTML and the order still goes through.
import QRCode from "qrcode";
import { buildRedeemUrl } from "./_voucher.js";

export async function buildVoucherQr(code: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(buildRedeemUrl(code), {
      width: 600, margin: 1, errorCorrectionLevel: "M", color: { dark: "#3D2B1F", light: "#FFFFFF" },
    });
  } catch (err) {
    console.error("Voucher QR failed:", err);
    return null;
  }
}

async function launch() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const executablePath = process.env.CHROME_PATH
    || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return puppeteer.launch({ executablePath, headless: true });
}

export async function renderVoucherPdf(html: string, timeoutMs = 20000): Promise<Buffer | null> {
  let browser: Awaited<ReturnType<typeof launch>> | null = null;
  const work = (async () => {
    browser = await launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
    try { await page.waitForNetworkIdle({ idleTime: 300, timeout: 8000 }); } catch { /* fonts slow: render anyway */ }
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return Buffer.from(pdf);
  })();
  const timer = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    return await Promise.race([work, timer]);
  } catch (err) {
    console.error("Voucher PDF failed:", err);
    return null;
  } finally {
    try { await (browser as unknown as { close: () => Promise<void> } | null)?.close(); } catch { /* ignore */ }
  }
}
