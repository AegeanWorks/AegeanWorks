import assert from "node:assert/strict";

import {
  appFrameUrl,
  appStatus,
  appsFromManifest,
  findApp,
  versionLabel,
} from "../../docs/live-core.js";

let assertions = 0;

function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

const apps = [
  {
    slug: "prism-relay",
    title: "Prism Relay",
    available: true,
    version: "0.3.0",
    commit: "abcdef1234567890",
  },
  {
    slug: "crypt-crawler",
    title: "Crypt-Crawler",
    available: false,
    version: "1.0.0",
    commit: "1234567abcdef",
  },
  {
    slug: "weft",
    title: "Weft",
    available: true,
    version: "0.1.1",
    commit: "fedcba9876543210",
  },
  {
    slug: "archived",
    title: "Archived",
    available: true,
    archived: true,
    version: "1.0.0",
    commit: "aaaaaaaaaaaaaaaa",
  },
];

equal(findApp(apps, "prism-relay").title, "Prism Relay", "slug lookup");
equal(findApp(apps, "PRISM-RELAY").title, "Prism Relay", "case-insensitive lookup");
equal(findApp(apps, "../escape"), null, "unsafe slug ignored");
equal(findApp(apps, ""), null, "empty slug ignored");
equal(versionLabel(apps[0]), "v0.3.0 \u00b7 abcdef1", "version and short commit");
equal(versionLabel({ version: "2.0.0" }), "v2.0.0", "version without commit");
equal(versionLabel({ commit: "abcdef123456" }), "commit abcdef1", "commit without version");
equal(versionLabel(null), "", "missing app has no label");
equal(appStatus(apps[0]), "Runs in browser", "browser app status");
equal(appStatus(apps[1]), "Run locally", "local app status");
equal(findApp(apps, "weft").title, "Weft", "second browser app lookup");
equal(versionLabel(apps[2]), "v0.1.1 \u00b7 fedcba9", "second app version and commit");
equal(appStatus(apps[2]), "Runs in browser", "second browser app status");
equal(appStatus(apps[3]), "Archived \u00b7 runs in browser", "archived app stays live");
equal(appsFromManifest({ schema: 2, apps }).length, 4, "manifest apps kept");
equal(appsFromManifest({ schema: 1, apps }), [], "old schema ignored");
equal(appsFromManifest({ schema: 2, apps: [null, { slug: "Bad Slug" }] }), [], "invalid entries dropped");
equal(appsFromManifest(null), [], "missing manifest ignored");
equal(
  appFrameUrl({ path: "live/weft/abc/index.html", commit: "abcdef1234567890" }),
  "live/weft/abc/index.html?v=abcdef123456",
  "frame URL is commit-versioned",
);
equal(
  appFrameUrl({ path: "live/weft/abc/index.html?x=1", commit: "abcdef1234567890" }, 42),
  "live/weft/abc/index.html?x=1&v=abcdef123456&r=42",
  "frame retry adds a nonce",
);
equal(appFrameUrl({}), "", "missing frame path is empty");

console.log(`ok ${assertions} live-page assertions`);
