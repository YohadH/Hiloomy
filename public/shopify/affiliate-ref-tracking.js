(function () {
  // Client-readable cookie names. These are DISTINCT from the server-side
  // `aff_click_id` cookie set by /api/affiliate-portal/redirect, which is
  // HttpOnly and therefore invisible to this script. We keep our own
  // first-party, JS-readable cookies so Safari ITP users (which prunes
  // localStorage from cross-site contexts after ~7 days and blocks it in some
  // modes) still carry attribution through to checkout.
  var COOKIE_REF = 'affiliate_ref';
  var COOKIE_CLICK_ID = 'affiliate_click_id';
  var COOKIE_MAX_AGE_DAYS = 30;

  function setCookie(name, value) {
    try {
      var expires = new Date(Date.now() + COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie =
        name + '=' + encodeURIComponent(value) +
        '; expires=' + expires +
        '; path=/; SameSite=Lax; Secure';
    } catch (error) {
      console.warn('Affiliate tracking cookie write failed', error);
    }
  }

  function getCookie(name) {
    try {
      var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (error) {
      console.warn('Affiliate tracking cookie read failed', error);
      return null;
    }
  }

  var params = new URLSearchParams(window.location.search);
  var ref = params.get('ref');
  var clickId = params.get('agent_click_id');

  // WRITE path: persist incoming attribution to BOTH localStorage and a
  // first-party cookie so it survives ITP localStorage pruning.
  if (ref || clickId) {
    try {
      if (ref) localStorage.setItem('affiliate_ref', ref);
      if (clickId) localStorage.setItem('affiliate_click_id', clickId);
    } catch (error) {
      console.warn('Affiliate tracking storage failed', error);
    }
    if (ref) setCookie(COOKIE_REF, ref);
    if (clickId) setCookie(COOKIE_CLICK_ID, clickId);
  }

  // READ path: cookie FIRST (survives ITP), then localStorage as fallback.
  function readStored(cookieName, storageKey) {
    var fromCookie = getCookie(cookieName);
    if (fromCookie) return fromCookie;
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  var savedRef = ref || readStored(COOKIE_REF, 'affiliate_ref');
  var savedClickId = clickId || readStored(COOKIE_CLICK_ID, 'affiliate_click_id');
  if (!savedRef && !savedClickId) return;

  // Only cart ATTRIBUTES — never the cart note. Attributes surface as
  // note_attributes on the order (which is what the app's webhook reads);
  // writing `note` here would overwrite anything the customer typed into
  // the "order note" box on every page view.
  var payload = {
    attributes: {
      ref: savedRef || '',
      agent_click_id: savedClickId || ''
    }
  };

  // Skip the cart POST if we already synced these exact values to THIS
  // cart — no point hammering /cart/update.js on every page view. The
  // Shopify 'cart' cookie (the cart token) is part of the key: after
  // checkout Shopify issues a fresh cart, the token changes, and the new
  // cart must receive the attributes again or a repeat purchase in the
  // same tab session would go unattributed.
  var syncKey = 'affiliate_cart_synced';
  var cartToken = getCookie('cart') || '';
  var syncValue = (savedRef || '') + '|' + (savedClickId || '') + '|' + cartToken;
  try {
    if (sessionStorage.getItem(syncKey) === syncValue) return;
  } catch (error) {
    // sessionStorage unavailable — fall through and post anyway.
  }

  fetch('/cart/update.js', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  }).then(function (response) {
    if (response && response.ok) {
      try {
        sessionStorage.setItem(syncKey, syncValue);
      } catch (error) {
        // Best effort only.
      }
    }
  }).catch(function (error) {
    console.warn('Affiliate cart attribution update failed', error);
  });
})();
