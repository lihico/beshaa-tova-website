/* Test mode only (ATTR_TEST=1): served by scripts/dev-api.ts at /__test/fbevents-stub.js in place of
   https://connect.facebook.net/en_US/fbevents.js (00_DESIGN.md section 4.6). Records every fbq call
   to /__test/pixel (-> .test-data/pixel.jsonl) and mimics the Pixel's _fbp cookie. Never sends to Meta. */
(function () {
  var f = window.fbq;
  if (!f) return;
  var pageLoad = String(window.performance && performance.timeOrigin ? performance.timeOrigin : Date.now());
  var send = function (args) {
    var body = JSON.stringify({ args: args, url: location.href, ts: Date.now(), page_load: pageLoad });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/__test/pixel", body)) return;
    } catch (e) { /* fall through */ }
    try { fetch("/__test/pixel", { method: "POST", body: body, keepalive: true }); } catch (e) { /* ignore */ }
  };
  f.callMethod = function () { send(Array.prototype.slice.call(arguments)); };
  var queued = f.queue || [];
  f.queue = [];
  for (var i = 0; i < queued.length; i++) send(Array.prototype.slice.call(queued[i]));
  if (!/(^| )_fbp=/.test(document.cookie)) {
    document.cookie = "_fbp=fb.1." + Date.now() + "." + Math.floor(Math.random() * 1e10) + "; path=/; max-age=7776000; SameSite=Lax";
  }
  window.__fbeventsStub = true;
})();
