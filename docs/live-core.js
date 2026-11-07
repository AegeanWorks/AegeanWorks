/**
 * Pure helpers for the live app catalog and labels.
 *
 * DOM-free so the Live page rules stay testable in Node.
 */

export function appsFromManifest(raw) {
  if (!raw || raw.schema !== 2 || !Array.isArray(raw.apps)) return [];
  return raw.apps.filter(function (app) {
    return (
      app &&
      typeof app === "object" &&
      typeof app.slug === "string" &&
      /^[a-z0-9-]+$/.test(app.slug) &&
      typeof app.title === "string" &&
      app.title.trim().length > 0
    );
  });
}

export function findApp(apps, slug) {
  if (!Array.isArray(apps)) return null;
  const wanted = String(slug || "").trim().toLowerCase();
  if (!wanted) return null;
  return (
    apps.find(function (app) {
      return app && String(app.slug || "").toLowerCase() === wanted;
    }) || null
  );
}

export function versionLabel(app) {
  if (!app) return "";
  const version = String(app.version || "").trim();
  const commit = String(app.commit || "").trim();
  const short = commit.slice(0, 7);
  if (version && short) return "v" + version + " \u00b7 " + short;
  if (version) return "v" + version;
  if (short) return "commit " + short;
  return "";
}

export function appStatus(app) {
  const status = app && app.available ? "Runs in browser" : "Run locally";
  if (!app || !app.archived) return status;
  return "Archived \u00b7 " + status.charAt(0).toLowerCase() + status.slice(1);
}

/**
 * Build a cache-busted iframe URL. The commit keeps normal loads versioned;
 * an optional nonce forces a retry past a cached 404.
 */
export function appFrameUrl(app, nonce) {
  const path = String((app && app.path) || "").trim();
  if (!path) return "";
  const params = new URLSearchParams();
  const commit = String((app && app.commit) || "").trim().slice(0, 12);
  if (commit) params.set("v", commit);
  if (nonce) params.set("r", String(nonce));
  const query = params.toString();
  if (!query) return path;
  return path + (path.includes("?") ? "&" : "?") + query;
}
