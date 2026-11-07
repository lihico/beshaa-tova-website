/* Test mode only (ATTR_TEST=1): served by scripts/dev-api.ts at /__test/gtag-stub.js in place of
   https://www.googletagmanager.com/gtag/js (00_DESIGN.md section 4.6). Records every dataLayer push
   to /__test/gtag (-> .test-data/gtag.jsonl). Never sends to Google. */
(function () {
  var dl = (window.dataLayer = window.dataLayer || []);
  if (dl.__attrStub) return;
  var pageLoad = String(window.performance && performance.timeOrigin ? performance.timeOrigin : Date.now());
  var toArgs = function (entry) {
    if (entry && typeof entry === "object" && typeof entry.length === "number") return Array.prototype.slice.call(entry);
    return [entry];
  };
  var send = function (entry) {
    var body;
    try { body = JSON.stringify({ args: toArgs(entry), url: location.href, ts: Date.now(), page_load: pageLoad }); }
    catch (e) { body = JSON.stringify({ args: ["unserialisable"], url: location.href, ts: Date.now(), page_load: pageLoad }); }
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/__test/gtag", body)) return;
    } catch (e) { /* fall through */ }
    try { fetch("/__test/gtag", { method: "POST", body: body, keepalive: true }); } catch (e) { /* ignore */ }
  };
  for (var i = 0; i < dl.length; i++) send(dl[i]);
  var originalPush = dl.push;
  dl.push = function () {
    for (var j = 0; j < arguments.length; j++) send(arguments[j]);
    return originalPush.apply(dl, arguments);
  };
  dl.__attrStub = true;
  window.__gtagStub = true;
})();
