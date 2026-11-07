import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseTouch, classifyTouch, mergeTouch, mergeState, emptyState, mergeServerAttribution, legacyState,
  creditOrder, encodeAttCookie, decodeAttCookie, toCompact, sanitizeTouch, touchDetail, selfReportChannel,
  TOUCH_ID_RE, type Touch, type TouchLike,
  toSheetColumns, SHEET_ATTRIBUTION_HEADERS, SHEET_EXISTING_TRACKING_HEADERS,
  normalizeIsraeliMobile, isIsraeliMobile, israeliMobileE164Digits, parseGaClientId, buildFbc, fbcClickId,
} from "../../api/_attribution_core.ts";
import { readFileSync } from "node:fs";

const SITE = "https://www.beshaa-tova.co.il";
const OWN = ["www.beshaa-tova.co.il", "beshaa-tova.co.il"];
const touch = (path: string, referrer: string | null = null, opts = {}) => parseTouch(SITE + path, referrer, OWN, opts);
const must = (t: Touch | null): Touch => { assert.ok(t, "expected a touch"); return t; };
const at = (iso: string) => ({ ts: iso });

const J1 = "/?ref=meta-120200000000000003&utm_source=ig&utm_medium=paid_social&utm_campaign=2611_zugot&utm_term=eng-sec" +
  "&utm_content=2611_eng-sec_s1_a&utm_id=120200000000000001&cid=120200000000000001&asid=120200000000000002" +
  "&aid=120200000000000003&plc=Instagram_Stories&fbclid=IwAR_TEST_J1";

describe("parseTouch", () => {
  test("direct load (no keys, no referrer) is not a touch", () => {
    assert.equal(touch("/"), null);
    assert.equal(touch("/about", ""), null);
  });
  test("own host as referrer (with or without www) is not a touch", () => {
    assert.equal(touch("/order", "https://www.beshaa-tova.co.il/about"), null);
    assert.equal(touch("/order", "https://beshaa-tova.co.il/"), null);
  });
  test("external referrer alone is a touch", () => {
    const t = must(touch("/", "https://www.google.co.il/"));
    assert.equal(t.referrer_host, "www.google.co.il");
    assert.equal(t.channel, "organic_search");
    assert.equal(t.kind, "landing");
    assert.match(t.touch_id, TOUCH_ID_RE);
  });
  test("Meta ad URL with every dynamic parameter (J1)", () => {
    const t = must(touch(J1, "https://l.instagram.com/"));
    assert.equal(t.channel, "paid_meta");
    assert.equal(t.meta_campaign_id, "120200000000000001");
    assert.equal(t.meta_adset_id, "120200000000000002");
    assert.equal(t.meta_ad_id, "120200000000000003");
    assert.equal(t.placement, "Instagram_Stories");
    assert.equal(t.utm_term, "eng-sec");
    assert.equal(t.utm_campaign, "2611_zugot");
    assert.equal(t.fbclid, "IwAR_TEST_J1");
    assert.equal(t.landing_path, "/");
  });
  test("meta-<digits> ref gives the ad id; utm_id gives the campaign id for Meta sources", () => {
    const t = must(touch("/?ref=meta-1234567&utm_source=fb&utm_id=999888"));
    assert.equal(t.meta_ad_id, "1234567");
    assert.equal(t.meta_campaign_id, "999888");
    const g = must(touch("/?utm_source=newsletter&utm_id=999888"));
    assert.equal(g.meta_campaign_id, null);
  });
  test("legacy adset= maps to meta_adset_id", () => {
    assert.equal(must(touch("/?adset=555")).meta_adset_id, "555");
  });
  test("values are sanitised; click ids keep their full length", () => {
    const long = "IwZXh0bgNhZW0CMTEAAR" + "x".repeat(120);
    const t = must(touch(`/cafe/tre?utm_campaign=${encodeURIComponent("2611 zugot<script>")}&fbclid=${long}`));
    assert.equal(t.utm_campaign, "2611zugotscript");
    assert.equal(t.fbclid, long);
    assert.equal(t.landing_path, "/cafe/tre");
  });
  test("a return from the payment page is never a touch", () => {
    assert.equal(touch("/order/thanks/BT2611K7Q3XA", "https://secure.meshulam.co.il/"), null);
    assert.equal(touch("/order/thanks/BT2611K7Q3XA?response=success", "http://127.0.0.1:3001/"), null);
    assert.equal(touch("/", "https://pay.grow.link/x"), null);
  });
  test("internal navigation: only with tracked keys, never carries a referrer", () => {
    assert.equal(touch("/order", SITE + "/", { internal: true }), null);
    const t = must(touch("/order?ref=tre", SITE + "/cafe/tre", { internal: true }));
    assert.equal(t.kind, "internal_param");
    assert.equal(t.referrer_host, null);
  });
  test("server-built /q touch: allowed without keys, registry channel override", () => {
    const t = must(touch("/", null, { kind: "qr_scan", q_code: "cafe-tre-table", channel: "partner" }));
    assert.equal(t.q_code, "cafe-tre-table");
    assert.equal(t.channel, "partner");
    const noOverride = must(touch("/?ref=cafe-tre-table", null, { kind: "qr_scan", q_code: "cafe-tre-table" }));
    assert.equal(noOverride.channel, "cafe_partner");
  });
  test("explicit ts is kept (normalised to ISO)", () => {
    assert.equal(must(touch("/?ref=x", null, at("2026-10-30T10:00:00Z"))).ts, "2026-10-30T10:00:00.000Z");
  });
});

describe("classifyTouch: one case per rule A-R", () => {
  const cases: Array<[string, TouchLike, string]> = [
    ["A aff- ref", { ref: "aff-testcreator" }, "affiliate"],
    ["A ref_link kind", { kind: "ref_link" }, "affiliate"],
    ["A affiliate medium", { utm_medium: "affiliate" }, "affiliate"],
    ["B frd- ref", { ref: "frd-tamar-roi" }, "referral"],
    ["B kit- ref", { ref: "kit-tamar-roi" }, "referral"],
    ["B referral medium", { utm_medium: "referral" }, "referral"],
    ["C gift_voucher source (beats referral medium)", { utm_source: "gift_voucher", utm_medium: "referral" }, "gift_voucher"],
    ["D meta ad id", { meta_ad_id: "1" }, "paid_meta"],
    ["D meta campaign id", { meta_campaign_id: "1" }, "paid_meta"],
    ["D meta- ref", { ref: "meta-1" }, "paid_meta"],
    ["D paid + fb", { utm_source: "fb", utm_medium: "paid" }, "paid_meta"],
    ["D paid_social + ig", { utm_source: "ig", utm_medium: "paid_social" }, "paid_meta"],
    ["D legacy meta/paid", { ref: "202611-v3-e1", utm_source: "meta", utm_medium: "paid" }, "paid_meta"],
    ["E ttclid", { ttclid: "x" }, "paid_tiktok"],
    ["E paid tiktok", { utm_source: "tiktok", utm_medium: "paid" }, "paid_tiktok"],
    ["F gclid", { gclid: "x" }, "paid_google"],
    ["F gbraid", { gbraid: "x" }, "paid_google"],
    ["F wbraid", { wbraid: "x" }, "paid_google"],
    ["F cpc", { utm_medium: "cpc" }, "paid_google"],
    ["F ppc", { utm_medium: "ppc" }, "paid_google"],
    ["G cafe- ref", { ref: "cafe-tre-table" }, "cafe_partner"],
    ["G cafe slug ref", { ref: "tre" }, "cafe_partner"],
    ["G cafe source", { utm_source: "cafe" }, "cafe_partner"],
    ["G /cafe/ landing", { landing_path: "/cafe/barcafe" }, "cafe_partner"],
    ["G cafe QR beats q_code (rule H)", { ref: "cafe-tre-table", q_code: "cafe-tre-table" }, "cafe_partner"],
    ["H q_code", { q_code: "pst-v5-eng-1a-biulib" }, "offline_print"],
    ["H pst- ref", { ref: "pst-v5-eng-1a-biulib" }, "offline_print"],
    ["H fly- ref", { ref: "fly-uni26-r2v3a-unk" }, "offline_print"],
    ["H print medium", { utm_medium: "print" }, "offline_print"],
    ["I partner medium", { utm_medium: "partner" }, "partner"],
    ["I hr- ref", { ref: "hr-testco" }, "partner"],
    ["I ins- ref", { ref: "ins-dana" }, "partner"],
    ["I plat- ref", { ref: "plat-buyme" }, "partner"],
    ["J grp- ref", { ref: "grp-p4-g07" }, "community_group"],
    ["J fbgroup- ref", { ref: "fbgroup-4b" }, "community_group"],
    ["J community medium", { utm_source: "fb_group", utm_medium: "community" }, "community_group"],
    ["K wa- ref", { ref: "wa-status" }, "messaging"],
    ["K messaging medium", { utm_medium: "messaging" }, "messaging"],
    ["L poster medium", { utm_source: "print", utm_medium: "poster", utm_campaign: "barcafe_hires" }, "offline_print"],
    ["L qr medium", { utm_source: "print", utm_medium: "qr" }, "offline_print"],
    ["L collab medium (Pure/Terra signs)", { utm_source: "print", utm_medium: "collab", utm_campaign: "pure_coffee_counter" }, "offline_print"],
    ["L pdf medium (HR one-pager)", { ref: "hr_onepager", utm_source: "hr", utm_medium: "pdf" }, "offline_print"],
    ["L flyer source", { utm_source: "flyer", utm_campaign: "students" }, "offline_print"],
    ["L poster source", { utm_source: "poster" }, "offline_print"],
    ["L print source", { utm_source: "print" }, "offline_print"],
    ["L cafe_flyer source", { utm_source: "cafe_flyer", utm_campaign: "cafe_collab" }, "offline_print"],
    ["L organic medium (LinkedIn post)", { ref: "li_story", utm_source: "linkedin", utm_medium: "organic" }, "organic_social"],
    ["L company_page medium", { ref: "li_page", utm_source: "linkedin", utm_medium: "company_page" }, "organic_social"],
    ["L 202610-* Meta ref without medium", { ref: "202610-e1_shachar", utm_source: "meta" }, "paid_meta"],
    ["L 202611-meta-* with fb", { ref: "202611-meta-gift-s1f", utm_source: "fb" }, "paid_meta"],
    ["L 202611-v3-* with meta", { ref: "202611-v3-e2", utm_source: "meta" }, "paid_meta"],
    ["L 202610-poster* ref", { ref: "202610-poster-biu_library" }, "offline_print"],
    ["L 202610-poster5 ref", { ref: "202610-poster5-engaged" }, "offline_print"],
    ["L _grp_ ref", { ref: "202610-engaged_grp_mazal_almog" }, "community_group"],
    ["L group ref", { ref: "202610-gift_givers_group_rec_shachar" }, "community_group"],
    ["L v3 group variant beats v3 Meta ref", { ref: "202611-v3-grp-money", utm_source: "meta" }, "community_group"],
    ["M organic_social medium", { utm_medium: "organic_social" }, "organic_social"],
    ["M org- ref", { ref: "org-ig-post34" }, "organic_social"],
    ["M li- ref", { ref: "li-page" }, "organic_social"],
    ["N email medium", { utm_medium: "email" }, "email"],
    ["N nl- ref", { ref: "nl-2611" }, "email"],
    ["O google referrer", { referrer_host: "www.google.co.il" }, "organic_search"],
    ["O bing referrer", { referrer_host: "bing.com" }, "organic_search"],
    ["O duckduckgo referrer", { referrer_host: "duckduckgo.com" }, "organic_search"],
    ["P l.instagram.com", { referrer_host: "l.instagram.com" }, "organic_social"],
    ["P lm.facebook.com", { referrer_host: "lm.facebook.com" }, "organic_social"],
    ["P t.co", { referrer_host: "t.co" }, "organic_social"],
    ["P linkedin", { referrer_host: "www.linkedin.com" }, "organic_social"],
    ["P tiktok", { referrer_host: "www.tiktok.com" }, "organic_social"],
    ["Q other site", { referrer_host: "some-wedding-blog.co.il" }, "referral_site"],
    ["R nothing", {}, "direct"],
    ["fbclid alone never makes a touch paid", { fbclid: "IwAR_X", referrer_host: "l.facebook.com" }, "organic_social"],
    ["fbclid on a group post stays community", { ref: "grp-p4-g07", utm_source: "facebook", utm_medium: "community", fbclid: "IwAR_J3" }, "community_group"],
    ["madricha one-pager (print medium)", { ref: "madricha", utm_source: "bride_instructors", utm_medium: "print" }, "offline_print"],
    ["Tom's QR on /cafe/toms", { landing_path: "/cafe/toms", utm_source: "print", utm_medium: "qr", utm_campaign: "toms" }, "cafe_partner"],
    ["student poster (J8)", { landing_path: "/flyer/students", utm_source: "flyer", utm_medium: "print", utm_campaign: "uni2026_r2_v3a" }, "offline_print"],
    ["old July carousel (fb, no medium)", { utm_source: "fb", utm_campaign: "carousel_a" }, "direct"],
  ];
  for (const [name, t, expected] of cases) {
    test(name, () => assert.equal(classifyTouch(t), expected));
  }
  test("case-insensitive", () => {
    assert.equal(classifyTouch({ utm_source: "IG", utm_medium: "Paid_Social" }), "paid_meta");
    assert.equal(classifyTouch({ ref: "AFF-x" }), "affiliate");
  });
});

describe("mergeTouch", () => {
  const T0 = "2026-10-30T10:00:00.000Z", T1 = "2026-10-30T10:05:00.000Z", T2 = "2026-10-30T11:00:00.000Z";
  test("first is set once; another touch replaces last", () => {
    const a = must(touch("/?ref=grp-p4-g07", null, at(T0)));
    const b = must(touch("/?ref=meta-123456", null, at(T2)));
    let s = mergeTouch(emptyState("v_x"), a);
    s = mergeTouch(s, b);
    assert.equal(s.first?.touch_id, a.touch_id);
    assert.equal(s.last?.touch_id, b.touch_id);
    assert.equal(s.touches.length, 2);
  });
  test("a direct load (null) never overwrites anything", () => {
    const a = must(touch("/?ref=grp-p4-g07", null, at(T0)));
    const s = mergeTouch(mergeTouch(emptyState(), a), touch("/"));
    assert.equal(s.last?.touch_id, a.touch_id);
    assert.equal(s.touches.length, 1);
  });
  test("internal_param merges key by key into last (cafe overwrite fix)", () => {
    const land = must(touch("/cafe/tre?utm_source=print&utm_medium=collab&utm_campaign=tre_bialik", null, at(T0)));
    const internal = must(touch("/order?ref=tre", null, { internal: true, ts: T1 }));
    const s = mergeTouch(mergeTouch(emptyState(), land), internal);
    assert.equal(s.last?.ref, "tre");
    assert.equal(s.last?.utm_campaign, "tre_bialik");
    assert.equal(s.last?.ts, T0, "keeps last.ts");
    assert.equal(s.last?.kind, "landing");
    assert.equal(s.last?.landing_path, "/cafe/tre");
    assert.equal(s.last?.channel, "cafe_partner");
    assert.equal(s.first?.ref, null, "first stays frozen");
    assert.equal(s.touches.length, 2);
  });
  test("internal_param with no prior state becomes first and last", () => {
    const internal = must(touch("/order?promo=STUDENT2026", null, { internal: true, ts: T1 }));
    const s = mergeTouch(emptyState(), internal);
    assert.equal(s.first?.touch_id, internal.touch_id);
    assert.equal(s.last?.touch_id, internal.touch_id);
  });
  test("internal_param keeps the channel of a /q touch (registry override)", () => {
    const q = must(touch("/?ref=x1", null, { kind: "qr_scan", q_code: "x1", channel: "partner", ts: T0 }));
    const s = mergeTouch(mergeTouch(emptyState(), q), must(touch("/order?ref=tre", null, { internal: true, ts: T1 })));
    assert.equal(s.last?.channel, "partner");
    assert.equal(s.last?.ref, "tre");
  });
  test("same landing + keys within 30 minutes counts once; after 30 minutes it counts again", () => {
    const a = must(touch("/?ref=grp-p4-g07", null, at(T0)));
    const again = must(touch("/?ref=grp-p4-g07", null, at(T1)));
    const later = must(touch("/?ref=grp-p4-g07", null, at(T2)));
    let s = mergeTouch(mergeTouch(emptyState(), a), again);
    assert.equal(s.touches.length, 1);
    s = mergeTouch(s, later);
    assert.equal(s.touches.length, 2);
  });
  test("the SPA landing after a /q redirect duplicates the qr_scan touch and is dropped", () => {
    const url = "/?ref=pst-v5-eng-1a-biulib&utm_source=poster&utm_medium=print&utm_campaign=2610_posters_v5";
    const q = must(touch(url, null, { kind: "qr_scan", q_code: "pst-v5-eng-1a-biulib", ts: T0 }));
    const land = must(touch(url, null, at(T1)));
    const s = mergeTouch(mergeTouch(emptyState(), q), land);
    assert.equal(s.touches.length, 1);
    assert.equal(s.last?.kind, "qr_scan");
    assert.equal(s.last?.q_code, "pst-v5-eng-1a-biulib");
  });
  test("touches are capped at 10 (oldest dropped)", () => {
    let s = emptyState();
    for (let i = 0; i < 12; i++) {
      s = mergeTouch(s, must(touch(`/?ref=grp-p${i}`, null, at(new Date(Date.parse(T0) + i * 60000).toISOString()))));
    }
    assert.equal(s.touches.length, 10);
    assert.equal(s.touches[0].ref, "grp-p2");
    assert.equal(s.first?.ref, "grp-p0");
    assert.equal(s.last?.ref, "grp-p11");
  });
  test("does not mutate its input", () => {
    const s0 = emptyState();
    mergeTouch(s0, must(touch("/?ref=x", null, at(T0))));
    assert.equal(s0.first, null);
    assert.equal(s0.touches.length, 0);
  });
});

describe("mergeState / mergeServerAttribution / legacyState", () => {
  const T0 = "2026-10-01T10:00:00.000Z", T1 = "2026-10-20T10:00:00.000Z";
  test("earliest first and latest last win; ties go to the second (server) state", () => {
    const old = must(touch("/?ref=grp-p1", null, at(T0)));
    const recent = must(touch("/?ref=meta-123456", null, at(T1)));
    const local = { visitor_id: "v_local_local_local_local1", first: recent, last: recent, touches: [recent] };
    const server = { visitor_id: "", first: old, last: old, touches: [old] };
    const m = mergeState(local, server);
    assert.equal(m.first?.touch_id, old.touch_id);
    assert.equal(m.last?.touch_id, recent.touch_id);
    assert.equal(m.touches.length, 2);
    const tieA = { ...old, touch_id: "t_AAAAAAAAAAAA", ref: "grp-a" };
    const tieB = { ...old, touch_id: "t_BBBBBBBBBBBB", ref: "grp-b" };
    const t = mergeState({ ...emptyState(), first: tieA, last: tieA }, { ...emptyState(), first: tieB, last: tieB });
    assert.equal(t.first?.ref, "grp-b");
    assert.equal(t.last?.ref, "grp-b");
  });
  test("the same landing parsed by client and server (different ids) counts once", () => {
    const c = must(touch("/?ref=grp-p1", null, at(T0)));
    const s = must(touch("/?ref=grp-p1", null, at("2026-10-01T10:00:01.000Z")));
    assert.notEqual(c.touch_id, s.touch_id);
    assert.equal(mergeState({ ...emptyState(), touches: [c] }, { ...emptyState(), touches: [s] }).touches.length, 1);
  });
  test("server merge: client channel is never trusted; cookie survives a localStorage purge (J3)", () => {
    const grp = must(touch("/?ref=grp-p4-g07&utm_medium=community&fbclid=IwAR_TEST_J3", null, at(T0)));
    const forged = { ...toCompact(grp), channel: "paid_meta" };
    const fromBody = mergeServerAttribution({ first: forged, last: forged, touches: [forged] }, null, null);
    assert.equal(fromBody.last?.channel, "community_group");
    const purged = mergeServerAttribution({ visitor_id: "", first: null, last: null, touches: [] }, { first: grp, last: grp }, "v_AAAAAAAAAAAAAAAAAAAAAA");
    assert.equal(purged.first?.ref, "grp-p4-g07");
    assert.equal(purged.last?.ref, "grp-p4-g07");
    assert.equal(purged.touches.length, 1);
    assert.equal(purged.visitor_id, "v_AAAAAAAAAAAAAAAAAAAAAA");
  });
  test("server merge: visitor id falls back to the body's when the cookie is missing or invalid", () => {
    const m = mergeServerAttribution({ visitor_id: "123e4567-e89b-12d3-a456-426614174000", touches: [] }, null, "nope");
    assert.equal(m.visitor_id, "123e4567-e89b-12d3-a456-426614174000");
    assert.equal(mergeServerAttribution(null, null, null).visitor_id, "");
    assert.equal(mergeServerAttribution("garbage", null, null).first, null);
  });
  test("sanitizeTouch rejects a touch without a valid ts and fixes a bad id", () => {
    assert.equal(sanitizeTouch({ ref: "x" }), null);
    const t = must(sanitizeTouch({ ts: T0, touch_id: "evil<script>", ref: "grp-<b>x", landing_path: "/a?b=c" }));
    assert.match(t.touch_id, TOUCH_ID_RE);
    assert.equal(t.ref, "grp-bx");
    assert.equal(t.landing_path, "/a");
  });
  test("legacyState builds one touch from the old ref/utm body (old cached bundle)", () => {
    const s = legacyState("tre", { utm_source: "print", utm_medium: "collab", utm_campaign: "tre_bialik" });
    assert.equal(s?.last?.ref, "tre");
    assert.equal(s?.last?.utm_campaign, "tre_bialik");
    assert.equal(s?.last?.channel, "cafe_partner");
    assert.equal(s?.touches.length, 1);
    assert.equal(legacyState(null, {}), null);
  });
});

describe("creditOrder", () => {
  const meta = must(touch(J1, null, at("2026-10-30T10:00:00Z")));
  const qr = must(touch("/?ref=pst-v5-eng-1a-biulib", null, { kind: "qr_scan", q_code: "pst-v5-eng-1a-biulib" }));
  const grp = must(touch("/?ref=grp-p4-g07", null));
  test("1 partner code wins over everything", () => {
    assert.deepEqual(creditOrder({ first: meta, last: meta }, { partner_id: "testcreator", referral: null }, "instagram"),
      { credit_rule: "code", credited_channel: "affiliate", credited_detail: "testcreator" });
  });
  test("2 friend code", () => {
    assert.deepEqual(creditOrder({ first: null, last: null }, { partner_id: null, referral: "frd-tamar-roi" }, null),
      { credit_rule: "code", credited_channel: "referral", credited_detail: "frd-tamar-roi" });
  });
  test("3 last non-direct touch; detail = most specific id", () => {
    assert.deepEqual(creditOrder({ first: grp, last: meta }, null, null),
      { credit_rule: "last_touch", credited_channel: "paid_meta", credited_detail: "120200000000000003" });
    assert.equal(creditOrder({ first: null, last: qr }, null, null).credited_detail, "pst-v5-eng-1a-biulib");
    assert.equal(creditOrder({ first: null, last: grp }, null, null).credited_detail, "grp-p4-g07");
  });
  test("a promo that is not a partner (STUDENT2026) does not take the credit", () => {
    assert.equal(creditOrder({ first: grp, last: grp }, { partner_id: null, referral: null }, null).credit_rule, "last_touch");
  });
  test("4 first touch when last is direct", () => {
    const direct = { ...grp, channel: "direct" as const };
    assert.equal(creditOrder({ first: grp, last: direct }, null, null).credit_rule, "first_touch");
  });
  test("5 self report mapped", () => {
    assert.deepEqual(creditOrder({ first: null, last: null }, null, "friend"),
      { credit_rule: "self_report", credited_channel: "referral", credited_detail: "friend" });
    assert.equal(selfReportChannel("בית קפה - טרה"), "cafe_partner");
    assert.equal(selfReportChannel("whatsapp"), "messaging");
    assert.equal(selfReportChannel("event"), "partner");
    assert.equal(selfReportChannel("newsletter"), "email");
    assert.equal(selfReportChannel("print"), "offline_print");
    assert.equal(selfReportChannel("סתם טקסט"), null);
  });
  test("6 nothing", () => {
    assert.deepEqual(creditOrder({ first: null, last: null }, null, "אחר"),
      { credit_rule: "none", credited_channel: "direct", credited_detail: null });
  });
  test("organic referrer touch falls back to its host as the detail", () => {
    assert.equal(touchDetail(must(touch("/", "https://www.google.com/"))), "www.google.com");
  });
});

describe("bsh_att cookie encoding", () => {
  const f = must(touch("/?ref=grp-p4-g07&utm_medium=community&fbclid=IwAR_TEST_J3", "https://lm.facebook.com/", at("2026-10-01T10:00:00Z")));
  const l = must(touch(J1, "https://l.instagram.com/", at("2026-10-20T10:00:00Z")));
  test("round trip keeps first and last (ids, channel, kind)", () => {
    const v = encodeAttCookie({ first: f, last: l });
    assert.ok(v && /^[A-Za-z0-9_-]+$/.test(v));
    const d = decodeAttCookie(v);
    assert.deepEqual(d?.first, f);
    assert.deepEqual(d?.last, l);
  });
  test("over the limit: referrers go first, then utm_content/term, then first", () => {
    const full = encodeAttCookie({ first: f, last: l }) as string;
    const tight = encodeAttCookie({ first: f, last: l }, full.length - 10) as string;
    const d = decodeAttCookie(tight);
    assert.equal(d?.last?.referrer_host, null);
    assert.equal(d?.last?.meta_ad_id, l.meta_ad_id);
    const tiny = encodeAttCookie({ first: f, last: l }, 650);   // full is ~990, last alone ~690
    const dt = decodeAttCookie(tiny);
    assert.equal(dt?.first ?? null, null);
    assert.equal(dt?.last?.meta_ad_id, l.meta_ad_id);
    assert.equal(encodeAttCookie({ first: f, last: l }, 50), null);
  });
  test("empty state, tampering and junk decode to null", () => {
    assert.equal(encodeAttCookie({ first: null, last: null }), null);
    assert.equal(decodeAttCookie(""), null);
    assert.equal(decodeAttCookie("not base64!"), null);
    assert.equal(decodeAttCookie("eyJ2IjoyfQ"), null);           // {"v":2}
    assert.equal(decodeAttCookie(null), null);
  });
  test("a decoded cookie touch is re-sanitised (forged channel recomputed)", () => {
    const forged = Buffer.from(JSON.stringify({ v: 1, l: { ...toCompact(f), channel: "paid_meta" } })).toString("base64url");
    assert.equal(decodeAttCookie(forged)?.last?.channel, "community_group");
  });
});

describe("toSheetColumns", () => {
  const l = must(touch(J1, null, at("2026-10-30T10:00:00Z")));
  const order = {
    order_id: "BT2610K7Q3XA", order_kind: "order", created_at: "2026-10-30T10:05:00Z", payment_status: "pending",
    amount_expected: 320, currency: "ILS", price_rule: "base_320", client_displayed_amount: 320,
    promo_code: null, partner_id: null, credit_rule: "last_touch", credited_channel: "paid_meta", credited_detail: "120200000000000003",
    first: l, last: l, touches: [l], self_reported_source: "instagram", not_engaged: false,
    visitor_id: "v_AAAAAAAAAAAAAAAAAAAAAA", session_id: "s1", fbc: "fb.1.1.IwAR_TEST_J1", fbp: "fb.1.2.3", ga_client_id: "1.2",
    client_ip: "127.0.0.1", user_agent: "UA", event_source_url: "http://localhost:5173/order", consent_marketing: "unknown",
    buyer: { name: "יעל כהן", phone: "0501234567", email: "j1@example.test" }, couple: { name1: "יעל", name2: "תומר" },
    lead_event_id: "lead_BT2610K7Q3XA", grow_process_ids: ["p1", "p2"], grow_process_token: "tok", payment_fallback_reason: null,
    paid_at: null, paid_amount: null, grow_transaction_id: null, asmachta: null, payment_method: null,
    payer_name: null, payer_phone: null, payer_email: null, match_method: null,
    capi_purchase_event_id: null, capi_purchase_sent_at: null, capi_purchase_result: null,
    commission_ils: null, commission_status: null, invoice_number: null, invoice_url: null,
  } as const;
  const cols = toSheetColumns(order as unknown as Parameters<typeof toSheetColumns>[0]);
  test("84 new headers (71 + 3 CAPI result columns + ga_session_id + 9 reconciliation columns) + 5 existing tracking columns, every value a string", () => {
    assert.equal(SHEET_ATTRIBUTION_HEADERS.length, 84);
    assert.deepEqual(Object.keys(cols).sort(), [...SHEET_ATTRIBUTION_HEADERS, ...SHEET_EXISTING_TRACKING_HEADERS].sort());
    for (const v of Object.values(cols)) assert.equal(typeof v, "string");
  });
  test("values", () => {
    assert.equal(cols.lt_meta_ad_id, "120200000000000003");
    assert.equal(cols.lt_placement, "Instagram_Stories");
    assert.equal(cols.click_fbclid, "IwAR_TEST_J1");
    assert.equal(cols.touches_count, "1");
    assert.equal(cols.grow_process_ids, "p1,p2");
    assert.equal(cols.not_engaged, "false");
    assert.equal(cols.event_id, "lead_BT2610K7Q3XA");
    assert.equal(cols.paid_at, "");
    assert.equal(JSON.parse(cols.touches_json)[0].id, l.touch_id);
  });
  test("every key exists in tests/e2e/fixtures/sheet_headers.json (addRow would drop nothing)", () => {
    const fx = JSON.parse(readFileSync(new URL("../e2e/fixtures/sheet_headers.json", import.meta.url), "utf8")) as { headers: string[] };
    for (const k of Object.keys(cols)) assert.ok(fx.headers.includes(k), `missing header ${k}`);
    assert.equal(new Set(fx.headers).size, fx.headers.length, "no duplicate headers");
  });
});

describe("phones, GA client id, fbc", () => {
  test("isIsraeliMobile", () => {
    for (const p of ["0501234567", "050-123-4567", "+972501234567", "972-50-123-4567", "+972 050 123 4567", "0527654321"]) {
      assert.equal(isIsraeliMobile(p), true, p);
    }
    for (const p of ["035551234", "+14155550123", "050123456", "05012345678", "", "abc"]) assert.equal(isIsraeliMobile(p), false, p);
    assert.equal(isIsraeliMobile(undefined), false);
    assert.equal(normalizeIsraeliMobile("+972-50-123-4567"), "0501234567");
    assert.equal(israeliMobileE164Digits("050-123-4567"), "972501234567");
  });
  test("parseGaClientId", () => {
    assert.equal(parseGaClientId("GA1.1.1234567890.1730000000"), "1234567890.1730000000");
    assert.equal(parseGaClientId("GA1.2.11.22"), "11.22");
    assert.equal(parseGaClientId("junk"), null);
    assert.equal(parseGaClientId(null), null);
  });
  test("fbc", () => {
    const v = buildFbc("IwAR_TEST_J1", 1730000000123);
    assert.equal(v, "fb.1.1730000000123.IwAR_TEST_J1");
    assert.match(v, /^fb\.1\.\d+\.IwAR_TEST_J1$/);
    assert.equal(fbcClickId(v), "IwAR_TEST_J1");
    assert.equal(fbcClickId("fb.1.123.a.b"), "a.b");
    assert.equal(fbcClickId("nope"), null);
  });
});
