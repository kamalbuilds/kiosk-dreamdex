/* Kiosk embed loader.
 *
 *   <script src="https://<host>/embed.js"
 *           data-kiosk="degen-lounge" data-asset="BTC" async></script>
 *
 * Plants a sandboxed iframe where the tag sits and lets the kiosk report its own
 * height back, so it fits a 320px sidebar and a 720px article column alike.
 * ES5 only. No build step, no dependencies, safe to paste into a static page.
 */
(function () {
  "use strict";

  function findSelf() {
    if (document.currentScript) return document.currentScript;
    var all = document.getElementsByTagName("script");
    for (var i = all.length - 1; i >= 0; i--) {
      var src = all[i].getAttribute("src") || "";
      if (src.indexOf("embed.js") !== -1 && all[i].getAttribute("data-kiosk")) {
        return all[i];
      }
    }
    return null;
  }

  var self = findSelf();
  if (!self || self.getAttribute("data-kiosk-mounted")) return;
  self.setAttribute("data-kiosk-mounted", "1");

  var code = self.getAttribute("data-kiosk") || "";
  if (!code) {
    if (window.console) console.error("[kiosk] missing data-kiosk attribute");
    return;
  }
  var asset = self.getAttribute("data-asset") || "BTC";

  var a = document.createElement("a");
  a.href = self.src;
  var origin = a.protocol + "//" + a.host;
  var id = "k" + Math.random().toString(36).slice(2, 10);

  var frame = document.createElement("iframe");
  frame.src =
    origin +
    "/embed?code=" +
    encodeURIComponent(code) +
    "&asset=" +
    encodeURIComponent(asset) +
    "&kid=" +
    id;
  frame.title = "Kiosk prediction market for " + asset;
  frame.setAttribute("loading", "lazy");
  frame.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
  );
  frame.setAttribute("allowtransparency", "true");
  frame.style.cssText =
    "display:block;width:100%;max-width:520px;border:0;height:520px;color-scheme:dark;";

  var slot = document.createElement("div");
  slot.className = "kiosk-slot";
  slot.setAttribute("data-kiosk-code", code);
  slot.style.cssText = "width:100%;margin:0 auto;";
  slot.appendChild(frame);

  if (self.parentNode) self.parentNode.insertBefore(slot, self);

  function onMessage(event) {
    if (event.origin !== origin) return;
    var d = event.data;
    if (!d || d.source !== "kiosk" || d.kid !== id) return;
    if (d.type === "height") {
      var h = parseInt(d.height, 10);
      if (h > 0 && h < 4000) frame.style.height = h + "px";
    }
    if (d.type === "open" && d.url) {
      window.open(String(d.url), "_blank", "noopener,noreferrer");
    }
  }

  if (window.addEventListener) window.addEventListener("message", onMessage, false);
  else window.attachEvent("onmessage", onMessage);
})();
