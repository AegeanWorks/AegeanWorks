import assert from "node:assert/strict";

import {
  appFrameUrl,
  appStatus,
  appsFromManifest,
  findApp,
  frameLooksStarted,
  mirroredPlaySearch,
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
equal(
  appFrameUrl(
    { path: "live/orrery/abc/index.html", commit: "abcdef1234567890" },
    0,
    "?app=orrery&world=figure-eight&rate=4&bogus=1",
  ),
  "live/orrery/abc/index.html?v=abcdef123456&world=figure-eight&rate=4",
  "frame URL forwards allowlisted deep-link params only",
);
equal(
  appFrameUrl({ path: "live/weft/abc/index.html", commit: "abcdef1234567890" }, 0, "?app=weft"),
  "live/weft/abc/index.html?v=abcdef123456",
  "frame URL never forwards the play-page's own params",
);
equal(
  appFrameUrl({ path: "live/weft/abc/index.html", commit: "abcdef1234567890" }, 0),
  "live/weft/abc/index.html?v=abcdef123456",
  "frame URL without a page search is unchanged",
);
equal(
  mirroredPlaySearch("?app=orrery", "?world=figure-eight&rate=4"),
  "?app=orrery&world=figure-eight&rate=4",
  "mirror merges the frame's deep-link state into the page search",
);
equal(
  mirroredPlaySearch("?app=orrery&rate=4", "?rate=8"),
  "?app=orrery&rate=8",
  "mirror replaces stale deep-link keys with fresh frame state",
);
equal(
  mirroredPlaySearch("?app=orrery&theme=dark", "?world=solar"),
  "?app=orrery&theme=dark&world=solar",
  "mirror keeps unknown page params while updating known keys",
);
equal(mirroredPlaySearch("?app=orrery", ""), "?app=orrery", "empty frame state keeps page params");


function fakeDoc(overrides) {
  return Object.assign(
    {
      title: "",
      body: { dataset: {} },
      querySelector: function () {
        return null;
      },
    },
    overrides,
  );
}

equal(
  frameLooksStarted(
    fakeDoc({ title: "ORRERY - Celestial N-Body Laboratory" }),
    { title: "Orrery" },
  ),
  true,
  "stylized uppercase page title matches the catalog title",
);
equal(
  frameLooksStarted(fakeDoc({ body: { dataset: { screen: "menu" } } }), { title: "Orrery" }),
  true,
  "data-screen body attribute marks the app as started",
);
equal(
  frameLooksStarted(
    fakeDoc({ querySelector: function () { return {}; } }),
    { title: "Orrery" },
  )
  , true
  , "known structural selectors mark the app as started");
equal(frameLooksStarted(fakeDoc(), { title: "Orrery" }), false, "blank shell is not started");
equal(frameLooksStarted(null, { title: "Orrery" }), false, "unreadable document is not started");
equal(
  frameLooksStarted(fakeDoc({ title: "Error" }), { title: "Orrery" }),
  false,
  "unrelated page title is not started",
);
equal(frameLooksStarted(fakeDoc({ title: "anything" }), { title: "" }), false, "no catalog title means no title heuristic");

// Handshake apps must announce their boot: a matching title alone is not
// proof that the embedded scripts actually started.
equal(
  frameLooksStarted(
    fakeDoc({ title: "ORRERY - Celestial N-Body Laboratory" }),
    { title: "Orrery", handshake: "screen" },
  ),
  false,
  "a handshake app without its announcement is not started",
);
equal(
  frameLooksStarted(
    fakeDoc({ title: "ORRERY - Celestial N-Body Laboratory", body: { dataset: { screen: "studio" } } }),
    { title: "Orrery", handshake: "screen" },
  ),
  true,
  "a handshake app that announced its boot is started",
);
equal(
  frameLooksStarted(fakeDoc(), { title: "Orrery", handshake: "screen" }),
  false,
  "a handshake app with a blank shell is not started",
);

console.log(`ok ${assertions} live-page assertions`);
