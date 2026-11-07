/** Section 11.4: the report over every journey of this run (J1-J5, J7, J8 share one store). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect, DATA_DIR, WEBSITE_DIR, state } from "./helpers.ts";

interface Row { channel?: string; paid: number; revenue: number }
interface Ad extends Row { ad_id: string }
interface Report {
  summary: { paid: number; revenue: number; free_redemptions: number };
  by_channel: { credited: Array<Row & { channel: string }> };
  meta: { campaigns: Array<{ adsets: Array<{ ads: Ad[] }> }> };
  codes: Array<Row & { code: string; scans: number; credited_paid: number }>;
  affiliates: Array<Row & { partner_id: string; ref_touches: number; code_uses: number; commission: { pending: number } }>;
  health: { ok: boolean; blocked_egress: number | null; duplicate_purchase_events: string[]; purchase_for_unpaid: string[] };
}

const PAYING = { J1: 349, J2: 349, J3: 349, J4: 332, J5: 410, J8: 332 };
const BUYERS = ["יעל כהן", "נועה לוי", "מיכל מזרחי", "שירה פרץ", "דנה לוי", "רוני", "הילה אברהם"];

test("11.4 report: paid orders, revenue, channels, Meta ad, QR code, affiliate", async () => {
  await state();   // waits for background work to settle
  const r = spawnSync("npx", ["tsx", "scripts/attribution-report.ts", "--source", "file", "--json", "--check"], {
    cwd: WEBSITE_DIR, encoding: "utf8", env: { ...process.env, ATTR_DATA_DIR: DATA_DIR },
  });
  expect(r.status, `report exit code; stderr: ${r.stderr}`).toBe(0);
  const rep = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))) as Report;

  expect(rep.summary.paid).toBe(Object.keys(PAYING).length);
  expect(rep.summary.revenue).toBe(Object.values(PAYING).reduce((a, b) => a + b, 0));
  expect(rep.summary.free_redemptions, "J7").toBe(1);

  const paidBy = Object.fromEntries(rep.by_channel.credited.filter((c) => c.paid > 0).map((c) => [c.channel, c.paid]));
  expect(paidBy).toEqual({ paid_meta: 1, offline_print: 2, community_group: 1, affiliate: 1, partner: 1 });

  const ads = rep.meta.campaigns.flatMap((c) => c.adsets.flatMap((s) => s.ads));
  const ad = ads.find((a) => a.ad_id === "120200000000000003");
  expect(ad, "Meta ad 120200000000000003 in the drill-down").toBeTruthy();
  expect(ad!.paid).toBe(1);
  expect(ad!.revenue).toBe(349);

  const qr = rep.codes.find((c) => c.code === "pst-v5-eng-1a-biulib");
  expect(qr, "QR code row").toBeTruthy();
  expect(qr!.scans).toBe(1);
  expect(qr!.credited_paid).toBe(1);

  const aff = rep.affiliates.find((a) => a.partner_id === "testcreator");
  expect(aff, "affiliate row").toBeTruthy();
  expect(aff!.commission.pending).toBe(50);
  expect(aff!.ref_touches, "J4 phone A's /r touch in the ref-link column").toBeGreaterThanOrEqual(1);

  expect(rep.health.ok, JSON.stringify(rep.health)).toBe(true);
  expect(rep.health.blocked_egress ?? 0).toBe(0);
  expect(rep.health.duplicate_purchase_events).toEqual([]);
  expect(rep.health.purchase_for_unpaid).toEqual([]);

  // The proof artifact for Lihi: .test-data/report.txt lists every journey's buyer and source.
  const txt = fs.readFileSync(path.join(DATA_DIR, "report.txt"), "utf8");
  for (const b of BUYERS) expect(txt, `report.txt names ${b}`).toContain(b);
  for (const ch of ["paid_meta", "offline_print", "community_group", "affiliate", "partner"]) expect(txt).toContain(ch);
});
