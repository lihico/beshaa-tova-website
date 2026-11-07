/**
 * PLAN.md marketing_machine_2026-11 Stage 5 and 6.3: the PAUSED-ad creator and its guardrails.
 * Every Graph call goes to an injected fake fetch; nothing leaves the machine. Files live in a temp dir.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { META_GRAPH_VERSION } from "../../api/_meta_version.ts";
import { FORBIDDEN_KEYS, GuardError, MAX_ADS_PER_RUN, PostGuard, allowedEdge, assertAllowedGet, assertPayloadSafe } from "../../scripts/meta-lib/guard.ts";
import { EM_DASH, qaText } from "../../scripts/meta-lib/copy-qa.ts";
import { canonicalJson, draftsSha256, parseCsv, skeletonApprovals, type Approvals, type Draft } from "../../scripts/meta-lib/approvals.ts";
import { MetaClient, REPO_ROOT, adPayload, creativePayload, iframeSrc, parseArgs, prepare, run, spendCapProblem, type HttpInit, type HttpLike } from "../../scripts/meta-create-paused.ts";

const TOKEN = "EAAG-super-secret-ads-token";
const ACCOUNT_DIGITS = "289945905492499";
const ACCOUNT = `act_${ACCOUNT_DIGITS}`;
const PAGE = "111111111111";
const IG = "222222222222";
const ADSET = "120200000000000001";
const URL_PARAMS = "ref=meta-{{ad.id}}&utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&utm_id={{campaign.id}}&cid={{campaign.id}}&asid={{adset.id}}&aid={{ad.id}}&plc={{placement}}&v=202611-test-";

const HEAD = ["Ad name", "Format", "Primary text", "Headline", "Description", "CTA", "Creative 4:5", "Creative 9:16", "Creative 1:1", "Video 9:16", "Website URL", "URL parameters", "Ready to upload", "Status"];
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

function csvRow(name: string, opts: { video?: boolean; text?: string; ready?: string } = {}): string {
  const vals: Record<string, string> = {
    "Ad name": name, Format: opts.video ? "reel" : "static",
    "Primary text": opts.text ?? "בין כל ההכנות, ערב רק לשניכם.\nבוחרים נושאים, כותבים לבד ואז מדברים, \"ביחד\".",
    Headline: "מפגשים זוגיים מותאמים אישית", Description: "בבית או בבית קפה, בקצב שלכם", CTA: "LEARN_MORE",
    "Creative 4:5": opts.video ? "" : `creatives/static/${name}_4x5.png`, "Creative 9:16": "", "Creative 1:1": "",
    "Video 9:16": opts.video ? `creatives/video/${name}.mp4` : "",
    "Website URL": "https://beshaa-tova.co.il/", "URL parameters": URL_PARAMS + name,
    "Ready to upload": opts.ready ?? "yes, after Hebrew approval and a clean render", Status: "draft",
  };
  return HEAD.map((h) => q(vals[h])).join(",");
}

let dir: string;
let campaign: string;
let envFile: string;
let outDir: string;

function writeCampaign(rows: string[]): void {
  fs.writeFileSync(path.join(campaign, "meta_upload.csv"), "﻿" + [HEAD.map(q).join(","), ...rows].join("\r\n") + "\r\n");
}

function makeApprovals(names: string[], mutate?: (a: Approvals) => void, withHash = true): string {
  const rows = parseCsv(fs.readFileSync(path.join(campaign, "meta_upload.csv"), "utf8"));
  const a = skeletonApprovals(campaign, ADSET, rows, names);
  for (const d of a.drafts) if (d.thumbnail !== undefined) d.thumbnail = `creatives/video/${d.ad_name}_thumb.png`;
  a.approved_by = "Lihi"; a.approved_at = "2026-11-08";
  if (withHash) a.approved_sha256 = draftsSha256(a.drafts);
  mutate?.(a);
  const f = path.join(dir, `approvals_${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(f, JSON.stringify(a, null, 2));
  return f;
}

interface Call { method: string; path: string; query: URLSearchParams; body: Record<string, string> }

function fakeGraph(opts: { spendCap?: unknown; adsetAccount?: string; failAt?: string; videoNotReadyTimes?: number } = {}) {
  const calls: Call[] = [];
  let n = 0, polls = 0;
  const http: HttpLike = async (url: string, init?: HttpInit) => {
    const u = new URL(url);
    const p = u.pathname.replace(`/${META_GRAPH_VERSION}/`, "");
    const body: Record<string, string> = {};
    if (init?.body instanceof URLSearchParams) for (const [k, v] of init.body) body[k] = v;
    else if (init?.body instanceof FormData) for (const [k, v] of init.body) body[k] = typeof v === "string" ? v : "<blob>";
    const method = init?.method ?? "GET";
    calls.push({ method, path: p, query: u.searchParams, body });
    const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j });
    if (opts.failAt && p.endsWith(opts.failAt) && method === "POST") return { ok: false, status: 400, json: async () => ({ error: { message: `Invalid parameter, token ${TOKEN}`, code: 100 } }) };
    if (method === "GET" && p === ACCOUNT) return ok("spendCap" in opts ? (opts.spendCap === undefined ? { currency: "ILS" } : { spend_cap: opts.spendCap, currency: "ILS" }) : { spend_cap: "50600", currency: "ILS" });
    if (method === "GET" && p === ADSET) return ok({ id: ADSET, account_id: opts.adsetAccount ?? ACCOUNT_DIGITS, effective_status: "PAUSED" });
    if (method === "POST" && p === `${ACCOUNT}/adimages`) return ok({ images: { bytes: { hash: `hash${++n}` } } });
    if (method === "POST" && p === `${ACCOUNT}/advideos`) return ok({ id: `91000${++n}` });
    if (method === "GET" && /^91000\d+$/.test(p)) return ok({ status: { video_status: polls++ < (opts.videoNotReadyTimes ?? 0) ? "processing" : "ready" } });
    if (method === "POST" && p === `${ACCOUNT}/adcreatives`) return ok({ id: `cr${++n}` });
    if (method === "POST" && p === `${ACCOUNT}/ads`) return ok({ id: `93000${++n}` });
    if (method === "GET" && /^93000\d+\/previews$/.test(p)) return ok({ data: [{ body: `<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=x&amp;t=y" width="1"></iframe>` }] });
    return { ok: false, status: 404, json: async () => ({ error: { message: "unexpected call in test", code: 1 } }) };
  };
  return { http, calls };
}

async function runCli(args: string[], http: HttpLike, extra: { writes?: Record<string, string> } = {}) {
  const lines: string[] = [];
  const writes = extra.writes ?? {};
  const code = await run([...args, "--secrets", envFile, "--out-dir", outDir], {
    fetch: http, log: (s) => lines.push(s), now: new Date("2026-11-08T08:00:00Z"), repoRoot: dir,
    writeFile: (f, t) => { writes[f] = t; }, sleep: async () => {}, checkEnvMode: false,
  });
  return { code, out: lines.join("\n"), writes };
}

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "meta-create-paused-"));
  campaign = path.join(dir, "campaign");
  outDir = path.join(dir, "out");
  for (const sub of ["creatives/static", "creatives/video"]) fs.mkdirSync(path.join(campaign, sub), { recursive: true });
  const names = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];
  for (const nm of names) fs.writeFileSync(path.join(campaign, `creatives/static/${nm}_4x5.png`), `png-${nm}`);
  fs.writeFileSync(path.join(campaign, "creatives/video/r1.mp4"), "mp4-bytes");
  fs.writeFileSync(path.join(campaign, "creatives/video/r1_thumb.png"), "thumb-bytes");
  writeCampaign([...names.map((nm) => csvRow(nm)), csvRow("r1", { video: true }), csvRow("notready", { ready: "no" })]);
  fs.writeFileSync(path.join(campaign, "creatives/static/notready_4x5.png"), "x");
  envFile = path.join(dir, "meta.env");
  fs.writeFileSync(envFile, `META_ADS_TOKEN=${TOKEN}\nMETA_AD_ACCOUNT_ID=${ACCOUNT_DIGITS}\nPAGE_ID=${PAGE}\nIG_USER_ID=${IG}\n`, { mode: 0o600 });
});
after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

// ---------------------------------------------------------------------------------------------

describe("guard: forbidden fields", () => {
  for (const key of ["daily_budget", "lifetime_budget", "bid_amount", "bid_strategy", "spend_cap", "targeting"]) {
    test(`refuses ${key} at top level, nested, and inside a JSON-encoded string`, () => {
      assert.ok((FORBIDDEN_KEYS as readonly string[]).includes(key));
      assert.throws(() => assertPayloadSafe("ads", { name: "x", status: "PAUSED", [key]: 100 }), GuardError);
      assert.throws(() => assertPayloadSafe("adcreatives", { name: "x", object_story_spec: { link_data: { [key]: { a: 1 } } } }), GuardError);
      assert.throws(() => assertPayloadSafe("ads", { name: "x", status: "PAUSED", creative: JSON.stringify({ creative_id: "1", [key]: 5 }) }), GuardError);
    });
  }
  test("refuses status other than PAUSED, and an /ads payload without status", () => {
    assert.throws(() => assertPayloadSafe("ads", { name: "x", status: "ACTIVE" }), /only PAUSED/);
    assert.throws(() => assertPayloadSafe("ads", { name: "x", configured_status: "ACTIVE", status: "PAUSED" }), /only PAUSED/);
    assert.throws(() => assertPayloadSafe("ads", { name: "x" }), /must be sent as PAUSED/);
    assert.throws(() => assertPayloadSafe("adcreatives", { name: "x", status: "ACTIVE" }), /only PAUSED/);
    assert.doesNotThrow(() => assertPayloadSafe("ads", { name: "x", adset_id: "1", creative: { creative_id: "2" }, status: "PAUSED" }));
  });
  test("the real payload builders pass the guard", () => {
    const d = { ad_name: "n", media: "m.png", primary_text: "t", headline: "h", description: "d", cta: "LEARN_MORE", website_url: "https://beshaa-tova.co.il/", url_parameters: "v=x" } as Draft;
    const ids = { account: ACCOUNT, pageId: PAGE, igUserId: IG, adsetId: ADSET };
    assert.doesNotThrow(() => assertPayloadSafe("adcreatives", creativePayload(d, ids, { image_hash: "h" })));
    assert.doesNotThrow(() => assertPayloadSafe("ads", adPayload(d, ADSET, "c")));
  });
});

describe("guard: endpoints (no campaigns, no ad sets, no edits)", () => {
  test("only the four create edges of the one account", () => {
    for (const e of ["adimages", "advideos", "adcreatives", "ads"]) assert.equal(allowedEdge(`/${META_GRAPH_VERSION}/${ACCOUNT}/${e}`, ACCOUNT), e);
    assert.throws(() => allowedEdge(`${ACCOUNT}/campaigns`, ACCOUNT), /campaigns and ad sets/);
    assert.throws(() => allowedEdge(`${ACCOUNT}/adsets`, ACCOUNT), /campaigns and ad sets/);
    assert.throws(() => allowedEdge(ADSET, ACCOUNT), /no edits/); // POST /<existing id> = an edit
    assert.throws(() => allowedEdge("120200000000000099", ACCOUNT), /no edits/);
    assert.throws(() => allowedEdge(`${ACCOUNT}`, ACCOUNT), /no edits/); // editing the account (spend_cap)
    assert.throws(() => allowedEdge(`${ADSET}/ads`, ACCOUNT), /only the ad account/);
    assert.throws(() => allowedEdge("act_999/ads", ACCOUNT), /only the ad account/);
    assert.throws(() => allowedEdge(`${ACCOUNT}/customaudiences`, ACCOUNT), /not one of/);
    assert.throws(() => allowedEdge(`${ACCOUNT}/ads/extra`, ACCOUNT), /no edits/);
  });
  test(`at most ${MAX_ADS_PER_RUN} ads per run in the client guard`, () => {
    const g = new PostGuard(ACCOUNT);
    const ad = { name: "x", status: "PAUSED" };
    for (let i = 0; i < MAX_ADS_PER_RUN; i++) g.check(`${ACCOUNT}/ads`, ad);
    assert.throws(() => g.check(`${ACCOUNT}/ads`, ad), /at most 6 ads per run/);
    assert.doesNotThrow(() => g.check(`${ACCOUNT}/adcreatives`, { name: "x" }));
  });
});

describe("guard: reviewer bypass attempts", () => {
  test("path tricks are refused", () => {
    const bad = [
      `${ACCOUNT}/../act_999/ads`, `${ACCOUNT}//ads`, `${ACCOUNT}/ads?method=post`, `${ACCOUNT}/ads#x`,
      `${ACCOUNT}/ADSETS`, `${ACCOUNT}/Campaigns`, `ACT_${ACCOUNT_DIGITS}/ads`, `${ACCOUNT}%2Fadsets`,
      `${ACCOUNT}/ads%2F..%2Fadsets`, `${ACCOUNT}/adsets/`, ` ${ACCOUNT}/ads`, `${ACCOUNT}/ads `,
      `https://graph.facebook.com/${ACCOUNT}/adsets`, `${ACCOUNT}/ad_sets`, `${ACCOUNT}/copies`,
    ];
    for (const p of bad) assert.throws(() => allowedEdge(p, ACCOUNT), GuardError, p);
  });
  test("payload tricks are refused", () => {
    const tries: Record<string, unknown>[] = [
      { name: "x", status: "PAUSED", Daily_Budget: 1 },
      { name: "x", status: "PAUSED", creative: { creative_id: "1", adset_spec: { daily_budget: 1 } } },
      { name: "x", status: "PAUSED", creative: JSON.stringify({ x: [{ targeting: {} }] }) },
      { name: "x", status: "PAUSED", creative: "  \n" + JSON.stringify([{ y: JSON.stringify({ bid_amount: 5 }) }]) },
      { name: "x", status: "paused" },
      { name: "x", status: ["PAUSED"] },
      { name: "x", status: "PAUSED", configured_status: "ACTIVE" },
      { name: "x", Status: "ACTIVE" },
      { name: "x", configured_status: "PAUSED" }, // /ads must carry "status" itself
      { name: "x", status: "PAUSED", campaign_spec: {} },
    ];
    for (const t of tries) assert.throws(() => new PostGuard(ACCOUNT).check(`${ACCOUNT}/ads`, t), GuardError, JSON.stringify(t));
  });
  test("a refused 7th ad cannot be retried through a different spelling of the path", () => {
    const g = new PostGuard(ACCOUNT);
    for (let i = 0; i < MAX_ADS_PER_RUN; i++) g.check(`/${META_GRAPH_VERSION}/${ACCOUNT}/ads/`, { name: "x", status: "PAUSED" });
    for (const p of [`${ACCOUNT}/ads`, `/${ACCOUNT}/ads`, `v1.0/${ACCOUNT}/ads`]) assert.throws(() => g.check(p, { name: "x", status: "PAUSED" }), /at most 6/);
  });
  test("GET cannot be turned into a write (?method=post) or aimed at an edge", async () => {
    assert.doesNotThrow(() => assertAllowedGet(ACCOUNT, { fields: "spend_cap" }));
    assert.doesNotThrow(() => assertAllowedGet(`${ADSET}/previews`, { ad_format: "MOBILE_FEED_STANDARD" }));
    assert.throws(() => assertAllowedGet(ADSET, { method: "post", daily_budget: "1" }), /method/);
    assert.throws(() => assertAllowedGet(ADSET, { " METHOD ": "post" }), /method/);
    assert.throws(() => assertAllowedGet(`${ADSET}?method=post`, {}), GuardError);
    assert.throws(() => assertAllowedGet(`${ACCOUNT}/campaigns`, {}), GuardError);
    let calls = 0;
    const c = new MetaClient(TOKEN, ACCOUNT, async () => { calls++; return { ok: true, status: 200, json: async () => ({}) }; });
    await assert.rejects(() => c.get(ADSET, { method: "POST", status: "ACTIVE" }), GuardError);
    await assert.rejects(() => c.post(`${ACCOUNT}/adsets`, { name: "x", status: "PAUSED" }), GuardError);
    assert.equal(calls, 0, "nothing reached fetch");
  });
});

describe("copy QA (Hebrew)", () => {
  test("em dash, price with the shekel sign either side or a shekel word, urgency, banned phrases", () => {
    assert.deepEqual(qaText("t", `ערב רק לשניכם ${EM_DASH} בלי טלפונים`).map((i) => i.rule), ["em_dash"]);
    assert.deepEqual(qaText("t", "רק 349 ₪ לערכה").map((i) => i.rule), ["price"]);
    assert.deepEqual(qaText("t", "ב-₪349 בלבד").map((i) => i.rule), ["price"]);
    assert.deepEqual(qaText("t", "349 ש\"ח").map((i) => i.rule), ["price"]);
    assert.deepEqual(qaText("t", "נשארו מקומות אחרונים").map((i) => i.rule), ["urgency", "urgency"]);
    assert.deepEqual(qaText("t", "ומהרו להזמין").map((i) => i.rule), ["urgency"]);
    assert.deepEqual(qaText("t", "ערכת שיח מותאמת אישית לזוגות לפני חתונה").map((i) => i.rule), ["banned"]);
    assert.deepEqual(qaText("t", "5 נושאים, 8 מפגשים, ₪ בלי מספר"), []);
  });
  test("every ready row of the real v3 meta_upload.csv passes the QA (no false positives)", () => {
    const rows = parseCsv(fs.readFileSync(path.join(REPO_ROOT, "marketing/campaigns/2026-11_meta_v3/meta_upload.csv"), "utf8"));
    const ready = rows.filter((r) => /^yes/.test(r["Ready to upload"]));
    assert.ok(ready.length >= 5);
    for (const r of ready) for (const f of ["Primary text", "Headline", "Description"]) assert.deepEqual(qaText(f, r[f]), [], r["Ad name"]);
    assert.ok(ready.every((r) => r["URL parameters"].includes("v=")));
  });
  test("a draft whose copy fails QA is refused even when it matches the CSV and the hash", async () => {
    writeCampaign([csvRow("a1"), csvRow("bad", { text: "מבצע לזמן מוגבל, 299 ₪" })]);
    fs.writeFileSync(path.join(campaign, "creatives/static/bad_4x5.png"), "x");
    const f = makeApprovals(["bad"]);
    const { http, calls } = fakeGraph();
    const r = await runCli(["--approvals", f, "--create"], http);
    assert.equal(r.code, 1);
    assert.match(r.out, /copy QA primary_text: a price/);
    assert.match(r.out, /urgency phrase "מבצע"/);
    assert.equal(calls.length, 0);
  });
});

describe("approvals hash", () => {
  test("canonical JSON ignores key order; --approve-hash prints the drafts hash", async () => {
    assert.equal(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] }), canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
    resetCampaign();
    const f = makeApprovals(["a1", "a2"], undefined, false);
    const want = draftsSha256(JSON.parse(fs.readFileSync(f, "utf8")).drafts);
    const r = await runCli(["--approve-hash", f], fakeGraph().http);
    assert.equal(r.code, 0);
    assert.equal(r.out.trim(), want);
    assert.match(want, /^[0-9a-f]{64}$/);
  });
  test("refuses a file without approved_sha256, and one edited after approval", async () => {
    resetCampaign();
    const { http, calls } = fakeGraph();
    const noHash = await runCli(["--approvals", makeApprovals(["a1"], undefined, false), "--create"], http);
    assert.equal(noHash.code, 1);
    assert.match(noHash.out, /no approved_sha256/);
    const edited = makeApprovals(["a1"], (a) => { a.drafts[0].headline = "כותרת אחרת"; });
    const r = await runCli(["--approvals", edited, "--create"], http);
    assert.equal(r.code, 1);
    assert.match(r.out, /approvals hash mismatch/);
    assert.equal(calls.length, 0);
  });
  test("refuses a draft that no longer matches meta_upload.csv (hash re-recorded)", async () => {
    resetCampaign();
    const f = makeApprovals(["a1"], (a) => { a.drafts[0].primary_text = "טקסט שלא בקובץ"; a.approved_sha256 = draftsSha256(a.drafts); });
    const r = await runCli(["--approvals", f], fakeGraph().http);
    assert.equal(r.code, 1);
    assert.match(r.out, /primary_text differs from the "Primary text" column/);
  });
  test("refuses more than 6 drafts, a row not ready, and a link with a query string", async () => {
    resetCampaign();
    const seven = await runCli(["--approvals", makeApprovals(["a1", "a2", "a3", "a4", "a5", "a6", "a7"])], fakeGraph().http);
    assert.equal(seven.code, 1);
    assert.match(seven.out, /7 drafts: at most 6 ads per run/);
    const nr = await runCli(["--approvals", makeApprovals(["notready"])], fakeGraph().http);
    assert.match(nr.out, /"Ready to upload" is not yes/);
    const p = prepare(fs.readFileSync(makeApprovals(["a1"], (a) => { a.drafts[0].website_url = "https://beshaa-tova.co.il/?ref=x"; a.approved_sha256 = draftsSha256(a.drafts); }), "utf8"), {}, realFsForTest(), dir);
    assert.ok(p.problems.some((x) => /website_url must be clean/.test(x)));
  });
});

describe("dry run (the default)", () => {
  test("prints every payload and makes no network call", async () => {
    resetCampaign();
    const { http, calls } = fakeGraph();
    const r = await runCli(["--approvals", makeApprovals(["a1", "r1"])], http);
    assert.equal(r.code, 0, r.out);
    assert.equal(calls.length, 0);
    assert.match(r.out, /DRY RUN: 2 draft\(s\)/);
    assert.match(r.out, new RegExp(`POST /${META_GRAPH_VERSION}/${ACCOUNT}/adimages`));
    assert.match(r.out, new RegExp(`POST /${META_GRAPH_VERSION}/${ACCOUNT}/advideos`));
    assert.match(r.out, /"url_tags": "ref=meta-\{\{ad\.id\}\}/);
    assert.match(r.out, /"text_optimizations": \{\s*"enroll_status": "OPT_OUT"/);
    assert.match(r.out, /"image_uncrop"/);
    assert.match(r.out, /"status":"PAUSED"/);
    assert.match(r.out, new RegExp(`"instagram_user_id": "${IG}"`));
    assert.match(r.out, /previews\?ad_format=MOBILE_FEED_STANDARD/);
    assert.ok(!r.out.includes(TOKEN));
    assert.equal(Object.keys(r.writes).length, 0);
  });
});

describe("--create", () => {
  test("refuses when the account spend_cap is missing or 0, before any POST", async () => {
    resetCampaign();
    const f = makeApprovals(["a1"]);
    for (const cap of [undefined, "0", 0, ""]) {
      const { http, calls } = fakeGraph({ spendCap: cap });
      const r = await runCli(["--approvals", f, "--create"], http);
      assert.equal(r.code, 1, String(cap));
      assert.match(r.out, /no spend cap/);
      assert.deepEqual(calls.map((c) => c.method), ["GET"]);
      assert.equal(calls[0].query.get("fields")?.split(",").includes("spend_cap"), true);
    }
    assert.equal(spendCapProblem({ spend_cap: "50600" }), null);
  });
  test("refuses an ad set from another account", async () => {
    resetCampaign();
    const { http, calls } = fakeGraph({ adsetAccount: "999" });
    const r = await runCli(["--approvals", makeApprovals(["a1"]), "--create"], http);
    assert.equal(r.code, 1);
    assert.match(r.out, /does not belong/);
    assert.ok(calls.every((c) => c.method === "GET"));
  });
  test("image ad: upload, creative with url_tags and opt-outs, ad PAUSED, preview, results file; token never shown", async () => {
    resetCampaign();
    const { http, calls } = fakeGraph();
    const r = await runCli(["--approvals", makeApprovals(["a1"]), "--create"], http);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
      `GET ${ACCOUNT}`, `GET ${ADSET}`, `POST ${ACCOUNT}/adimages`, `POST ${ACCOUNT}/adcreatives`, `POST ${ACCOUNT}/ads`, "GET 930003/previews",
    ]);
    assert.equal(Buffer.from(calls[2].body.bytes, "base64").toString(), "png-a1");
    const cr = calls[3].body;
    assert.equal(cr.url_tags, URL_PARAMS + "a1");
    const story = JSON.parse(cr.object_story_spec);
    assert.equal(story.page_id, PAGE);
    assert.equal(story.instagram_user_id, IG);
    assert.equal(story.link_data.image_hash, "hash1");
    assert.equal(story.link_data.link, "https://beshaa-tova.co.il/");
    assert.equal(story.link_data.call_to_action.type, "LEARN_MORE");
    const dof = JSON.parse(cr.degrees_of_freedom_spec).creative_features_spec;
    for (const k of ["text_optimizations", "image_uncrop", "music"]) assert.equal(dof[k].enroll_status, "OPT_OUT");
    const ad = calls[4].body;
    assert.equal(ad.status, "PAUSED");
    assert.equal(ad.adset_id, ADSET);
    assert.deepEqual(JSON.parse(ad.creative), { creative_id: "cr2" });
    for (const c of calls) for (const k of FORBIDDEN_KEYS) assert.ok(!(k in c.body));
    assert.equal(calls[5].query.get("ad_format"), "MOBILE_FEED_STANDARD");
    const file = path.join(outDir, "created_2026-11-08.json");
    const doc = JSON.parse(r.writes[file]);
    assert.equal(doc.runs[0].ok, true);
    assert.deepEqual(doc.runs[0].results[0], {
      ad_name: "a1", image_hash: "hash1", creative_id: "cr2", ad_id: "930003", status: "PAUSED",
      preview_url: "https://www.facebook.com/ads/api/preview_iframe.php?d=x&t=y",
    });
    assert.ok(!r.out.includes(TOKEN) && !r.writes[file].includes(TOKEN));
  });
  test("reel: multipart video upload, waits for ready, thumbnail, video_data", async () => {
    resetCampaign();
    const { http, calls } = fakeGraph({ videoNotReadyTimes: 2 });
    const r = await runCli(["--approvals", makeApprovals(["r1"]), "--create"], http);
    assert.equal(r.code, 0, r.out);
    const seq = calls.map((c) => `${c.method} ${c.path}`);
    assert.deepEqual(seq.slice(2), [`POST ${ACCOUNT}/advideos`, "GET 910001", "GET 910001", "GET 910001", `POST ${ACCOUNT}/adimages`, `POST ${ACCOUNT}/adcreatives`, `POST ${ACCOUNT}/ads`, "GET 930004/previews"]);
    assert.equal(calls[2].body.source, "<blob>");
    const vd = JSON.parse(calls[7].body.object_story_spec).video_data;
    assert.equal(vd.video_id, "910001");
    assert.equal(vd.image_hash, "hash2");
    assert.equal(vd.title, "מפגשים זוגיים מותאמים אישית");
    assert.ok(!("image_uncrop" in JSON.parse(calls[7].body.degrees_of_freedom_spec).creative_features_spec));
    assert.equal(calls[8].body.status, "PAUSED");
  });
  test("a Graph error stops the run, is scrubbed of the token, and is recorded", async () => {
    resetCampaign();
    const { http, calls } = fakeGraph({ failAt: "/adcreatives" });
    const r = await runCli(["--approvals", makeApprovals(["a1", "a2"]), "--create"], http);
    assert.equal(r.code, 1);
    assert.ok(!r.out.includes(TOKEN));
    assert.match(r.out, /stopped at a1: POST .*adcreatives: HTTP 400 code 100/);
    assert.equal(calls.filter((c) => c.path.endsWith("/ads")).length, 0);
    assert.equal(calls.filter((c) => c.path.endsWith("/adimages")).length, 1);
    const doc = JSON.parse(Object.values(r.writes)[0]);
    assert.equal(doc.runs[0].ok, false);
    assert.equal(doc.runs[0].results.length, 1);
    assert.ok(!JSON.stringify(doc).includes(TOKEN));
  });
  test("needs every key in meta.env", async () => {
    resetCampaign();
    const f = makeApprovals(["a1"]);
    const bad = path.join(dir, "partial.env");
    fs.writeFileSync(bad, `META_ADS_TOKEN=${TOKEN}\nMETA_AD_ACCOUNT_ID=${ACCOUNT_DIGITS}\n`);
    const lines: string[] = [];
    const code = await run(["--approvals", f, "--create", "--secrets", bad], { fetch: fakeGraph().http, log: (s) => lines.push(s), repoRoot: dir, checkEnvMode: false });
    assert.equal(code, 2);
    assert.match(lines.join("\n"), /missing PAGE_ID, IG_USER_ID/);
    assert.ok(!lines.join("\n").includes(TOKEN));
  });
});

describe("helpers", () => {
  test("parseArgs requires one mode, and --create only with --approvals", () => {
    assert.throws(() => parseArgs([]), /exactly one/);
    assert.throws(() => parseArgs(["--approve-hash", "x", "--create"]), /--create needs --approvals/);
    assert.equal(parseArgs(["--approvals", "x"]).create, false);
    assert.equal(parseArgs(["--approvals", "x", "--create"]).create, true);
  });
  test("parseCsv handles BOM, quotes, commas and newlines in fields", () => {
    const rows = parseCsv('﻿"a","b"\r\n"x, ""y""","line1\nline2"\r\n');
    assert.deepEqual(rows, [{ a: 'x, "y"', b: "line1\nline2" }]);
  });
  test("iframeSrc decodes the preview link", () => {
    assert.equal(iframeSrc({ data: [{ body: '<iframe src="https://f.com/p?a=1&amp;b=2"></iframe>' }] }), "https://f.com/p?a=1&b=2");
    assert.equal(iframeSrc({ data: [] }), null);
  });
});

function resetCampaign(): void {
  const names = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];
  writeCampaign([...names.map((nm) => csvRow(nm)), csvRow("r1", { video: true }), csvRow("notready", { ready: "no" })]);
}

function realFsForTest() {
  return { readFile: (f: string) => fs.readFileSync(f, "utf8"), readBytes: (f: string) => fs.readFileSync(f), exists: (f: string) => fs.existsSync(f) };
}
