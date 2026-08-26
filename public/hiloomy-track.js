/*!
 * Hiloomy affiliate tracking — storefront snippet.
 *
 * Runs on the STORE's domain (installed via ScriptTag or pasted into
 * theme.liquid), which is what makes cross-session attribution possible:
 * the aff_click_id cookie set by hiloomy.com/r/... lives on hiloomy.com and
 * is invisible here, so this script re-captures the link params Shopify
 * lands with and persists them FIRST-PARTY on the shop domain.
 *
 * What it does:
 *   1. Reads ?agent_click_id / ?ref (+ BixGrow's ?bg_ref, ?coupon) from the
 *      landing URL — exactly the params hiloomy.com/r/{slug}/{code} appends.
 *   2. Stores them in a 30-day first-party cookie (last click wins).
 *   3. Copies them into Shopify cart attributes, which arrive on the order
 *      webhook as note_attributes — the exact names the Hiloomy webhook
 *      already parses (agent_click_id / ref / coupon). No server changes.
 *
 * Fails silent by design: nothing here may ever break a storefront.
 */
(function () {
  "use strict";
  var COOKIE = "hloom_aff";
  var MAX_AGE = 30 * 24 * 60 * 60; // 30 days, matches the attribution window

  function readUrlSignals() {
    try {
      var qs = new URLSearchParams(window.location.search);
      var clickId = qs.get("agent_click_id") || qs.get("click_id") || "";
      var ref = qs.get("ref") || qs.get("bg_ref") || "";
      var coupon = qs.get("coupon") || "";
      if (!clickId && !ref) return null;
      return { c: clickId, r: ref, p: coupon };
    } catch (e) {
      return null;
    }
  }

  function readCookie() {
    try {
      var match = document.cookie.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]*)"));
      if (!match) return null;
      var parsed = JSON.parse(decodeURIComponent(match[1]));
      return parsed && (parsed.c || parsed.r) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function writeCookie(value) {
    try {
      document.cookie =
        COOKIE + "=" + encodeURIComponent(JSON.stringify(value)) +
        "; path=/; max-age=" + MAX_AGE + "; SameSite=Lax; Secure";
    } catch (e) { /* ignore */ }
  }

  function syncCartAttributes(signals) {
    var attrs = {};
    if (signals.c) attrs.agent_click_id = signals.c;
    if (signals.r) attrs.ref = signals.r;
    if (signals.p) attrs.coupon = signals.p;

    fetch("/cart.js", { credentials: "same-origin" })
      .then(function (res) { return res.json(); })
      .then(function (cart) {
        var current = (cart && cart.attributes) || {};
        var stale = Object.keys(attrs).some(function (key) {
          return current[key] !== attrs[key];
        });
        if (!stale) {
          try { sessionStorage.setItem(COOKIE + "_synced", JSON.stringify(signals)); } catch (e) { /* ignore */ }
          return;
        }
        return fetch("/cart/update.js", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attributes: attrs })
        }).then(function () {
          try { sessionStorage.setItem(COOKIE + "_synced", JSON.stringify(signals)); } catch (e) { /* ignore */ }
        });
      })
      .catch(function () { /* never break the storefront */ });
  }

  var fromUrl = readUrlSignals();
  if (fromUrl) writeCookie(fromUrl); // last click wins
  var signals = fromUrl || readCookie();
  if (!signals) return;

  // Skip the network round-trip when this session already synced this value.
  try {
    if (!fromUrl && sessionStorage.getItem(COOKIE + "_synced") === JSON.stringify(signals)) return;
  } catch (e) { /* ignore */ }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { syncCartAttributes(signals); });
  } else {
    syncCartAttributes(signals);
  }
})();
