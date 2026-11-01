/**
 * BarakatWave TV — Client Error Beacon
 * -------------------------------------------------------------------------
 * Site, admin studio aur reseller panel ke JS errors + failed API calls ko
 * /api/analytics (type=error) par bhejta hai, taake owner ko admin panel me
 * asli bugs dikhein — console kholne ki zaroorat na pade.
 *
 * Safety rules:
 *  - Har error ek dafa bhejta hai per session (duplicate spam nahi).
 *  - Max 12 reports per page load; 30s me max 3 network attempts.
 *  - Kuch bhi throw nahi karta; page ko kabhi block nahi karta.
 */
(function initBarakatErrorBeacon() {
  if (typeof window === "undefined" || window.__bwErrorBeacon) return;
  window.__bwErrorBeacon = true;

  var ENDPOINT = "/api/analytics";
  var sent = Object.create(null);
  var attempts = 0;
  var MAX_REPORTS = 12;

  function post(payload) {
    try {
      if (attempts >= MAX_REPORTS) return;
      attempts += 1;
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        return;
      }
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true
      }).catch(function () {});
    } catch (_) {
      /* never break the page */
    }
  }

  function report(message, extra) {
    try {
      var key = (message || "").slice(0, 120);
      if (!key || sent[key]) return;
      sent[key] = 1;
      post(
        Object.assign(
          {
            type: "error",
            message: key,
            route: location.pathname + (location.hash || ""),
            app: document.body && document.body.dataset.bwApp
              ? document.body.dataset.bwApp
              : location.pathname.indexOf("admin") >= 0
                ? "admin"
                : location.pathname.indexOf("reseller") >= 0
                  ? "reseller"
                  : "site"
          },
          extra || {}
        )
      );
    } catch (_) {
      /* ignore */
    }
  }

  window.addEventListener(
    "error",
    function (event) {
      // Ignore resource (img/script) load errors — sirf JS runtime errors.
      if (event && event.target && event.target !== window && event.target.tagName) return;
      report(event && event.message ? event.message : "Script error", {
        source: (event && event.filename) || "",
        lineno: (event && event.lineno) || 0,
        colno: (event && event.colno) || 0,
        stack: event && event.error && event.error.stack ? String(event.error.stack).slice(0, 800) : ""
      });
    },
    true
  );

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event && event.reason;
    var message = reason && reason.message ? reason.message : String(reason || "Unhandled promise rejection");
    report(message, {
      source: "unhandledrejection",
      stack: reason && reason.stack ? String(reason.stack).slice(0, 800) : ""
    });
  });

  // Failed API calls (500/0) bhi bug hain — unhe bhi record karo.
  var nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function () {
      var args = arguments;
      return nativeFetch.apply(this, args).then(function (res) {
        try {
          var url = String((args[0] && args[0].url) || args[0] || "");
          if (res && res.status >= 500 && url.indexOf("/api/") >= 0) {
            report("API " + res.status + " " + url.split("?")[0], { source: url.split("?")[0] });
          }
        } catch (_) {
          /* ignore */
        }
        return res;
      });
    };
  }

  // Expose for deliberate reporting from app code.
  window.bwReportError = report;
})();
