(function () {
  "use strict";

  var APP_VERSION = "43";
  var RECOVERY_KEY = "aegean:sw-recovery";

  if (!("serviceWorker" in navigator)) return;

  var hadController = Boolean(navigator.serviceWorker.controller);
  var reloading = false;

  function readRecovery() {
    try {
      return window.sessionStorage.getItem(RECOVERY_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function writeRecovery(value) {
    try {
      if (value) window.sessionStorage.setItem(RECOVERY_KEY, "1");
      else window.sessionStorage.removeItem(RECOVERY_KEY);
    } catch (error) {
      /* private browsing can refuse storage; the page still works */
    }
  }

  function expectedVersion() {
    var tag = document.querySelector('script[src*="app.js?v="]');
    if (!tag) return APP_VERSION;
    var match = /[?&]v=(\d+)/.exec(tag.getAttribute("src") || "");
    return match ? match[1] : APP_VERSION;
  }

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  function checkForUpdate() {
    if (!navigator.serviceWorker.getRegistration) return;
    navigator.serviceWorker
      .getRegistration()
      .then(function (registration) {
        if (registration) return registration.update();
        return null;
      })
      .catch(function () {
        /* an update check must never break the page */
      });
  }

  checkForUpdate();

  // A page can be restored with the new HTML and an older app.js from the
  // previous shell cache. If the version marker never arrives, drop the stale
  // worker once so the versioned script is fetched from the network.
  window.addEventListener("load", function () {
    window.setTimeout(function () {
      if (document.documentElement.dataset.appVersion === expectedVersion()) {
        writeRecovery(false);
        return;
      }
      if (readRecovery()) return;
      writeRecovery(true);
      if (!navigator.serviceWorker.getRegistrations) {
        window.location.reload();
        return;
      }
      navigator.serviceWorker
        .getRegistrations()
        .then(function (registrations) {
          return Promise.all(
            registrations.map(function (registration) {
              return registration.unregister();
            })
          );
        })
        .then(function () {
          window.location.reload();
        })
        .catch(function () {
          writeRecovery(false);
        });
    }, 2500);
  });
})();
