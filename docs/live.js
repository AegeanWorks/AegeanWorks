import {
  findApp,
  appFrameUrl,
  appStatus,
  appsFromManifest,
  frameLooksStarted,
  versionLabel,
} from "./live-core.js";

const grid = document.getElementById("live-grid");
const player = document.getElementById("live-player");
const frame = document.getElementById("live-frame");
const title = document.getElementById("live-title-current");
const version = document.getElementById("live-version");
const note = document.getElementById("live-note");
const source = document.getElementById("live-source");
const newTab = document.getElementById("live-newtab");
const back = document.getElementById("live-back");
const fullscreen = document.getElementById("live-fullscreen");
const frameStatus = document.getElementById("live-frame-status");
const frameMessage = document.getElementById("live-frame-message");
const retryButton = document.getElementById("live-retry");
const errorNewTab = document.getElementById("live-error-newtab");

let apps = [];
let activeSlug = "";
let activeApp = null;
let loadSerial = 0;
let loadTimer = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function initials(app) {
  return String(app.title || app.repo || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(function (part) {
      return part[0];
    })
    .join("")
    .toUpperCase();
}

function sourceLink(app, label) {
  if (!app.source_url) return null;
  const link = element("a", "btn btn-ghost", label);
  link.href = app.source_url;
  link.target = "_blank";
  link.rel = "noopener";
  return link;
}

function dossierLink(app) {
  const href = app.dossier || app.source_url;
  if (!href) return null;
  const link = element("a", "btn btn-ghost", "Dossier");
  link.href = href;
  if (/^https?:/i.test(href)) {
    link.target = "_blank";
    link.rel = "noopener";
  }
  return link;
}

function appendLink(actions, link) {
  if (link) actions.appendChild(link);
}

function renderCard(app) {
  const card = element("article", "live-card");
  card.dataset.slug = app.slug;

  const head = element("div", "live-card-head");
  const mark = element("span", "live-card-logo");
  mark.setAttribute("aria-hidden", "true");
  if (app.logo) {
    const image = document.createElement("img");
    image.src = app.logo;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", function () {
      mark.replaceChildren(document.createTextNode(initials(app)));
    });
    mark.appendChild(image);
  } else {
    mark.textContent = initials(app);
  }
  const heading = element("div", "live-card-heading");
  heading.appendChild(element("h2", "", app.title));
  heading.appendChild(element("p", "live-status", appStatus(app)));
  head.append(mark, heading);

  card.appendChild(head);
  card.appendChild(element("p", "live-description", app.description));
  const meta = element("p", "live-meta", versionLabel(app));
  if (app.updated) meta.append(" \u00b7 " + app.updated);
  card.appendChild(meta);

  const actions = element("div", "live-card-actions");
  if (app.available) {
    const open = element("button", "btn btn-primary", "Open");
    open.type = "button";
    open.addEventListener("click", function () {
      openApp(app.slug, true);
    });
    actions.appendChild(open);
    appendLink(actions, sourceLink(app, "Source"));
    appendLink(actions, dossierLink(app));
  } else {
    appendLink(actions, sourceLink(app, "Get the app"));
    appendLink(actions, dossierLink(app));
    const command = element("code", "live-command", app.command || "python run.py --open");
    card.appendChild(actions);
    card.appendChild(command);
    card.appendChild(element("p", "live-reason", app.reason || "This app runs locally."));
    grid.appendChild(card);
    return;
  }
  card.appendChild(actions);
  grid.appendChild(card);
}

function renderCatalog() {
  grid.replaceChildren();
  if (!apps.length) {
    grid.appendChild(
      element("p", "live-empty", "The live catalog is unavailable right now.")
    );
    return;
  }
  apps.forEach(renderCard);
}

function updateFullscreen() {
  if (!fullscreen) return;
  const active = document.fullscreenElement === player;
  fullscreen.textContent = active ? "Exit fullscreen" : "Fullscreen";
  fullscreen.setAttribute("aria-pressed", active ? "true" : "false");
}

function clearFrameError() {
  if (frameStatus) frameStatus.hidden = true;
}

function showFrameError(app, message, url) {
  if (!frameStatus) return;
  frameStatus.hidden = false;
  if (frameMessage) frameMessage.textContent = message;
  if (errorNewTab) errorNewTab.href = url;
  if (retryButton) {
    retryButton.onclick = function () {
      openApp(app.slug, false, true);
    };
  }
}

function frameLooksLoaded(app) {
  try {
    return frameLooksStarted(frame.contentDocument, app);
  } catch (error) {
    return false;
  }
}

async function loadApp(app, retry) {
  const serial = ++loadSerial;
  clearTimeout(loadTimer);
  clearFrameError();
  const url = appFrameUrl(app, retry ? Date.now() : 0, window.location.search);
  if (!url) {
    showFrameError(app, "This app has no build path in the catalog.", "");
    return;
  }
  newTab.href = url;
  frame.title = app.title + " app";
  frame.src = "about:blank";
  try {
    const response = await window.fetch(url, { cache: "no-store" });
    if (serial !== loadSerial) return;
    if (!response.ok) {
      showFrameError(
        app,
        "The " + app.title + " build returned HTTP " + response.status + ".",
        url
      );
      return;
    }
  } catch (error) {
    if (serial !== loadSerial) return;
    showFrameError(
      app,
      "The " + app.title + " build could not be reached. Check the connection, then retry.",
      url
    );
    return;
  }
  frame.src = url;
  loadTimer = setTimeout(function () {
    if (serial !== loadSerial) return;
    if (!frameLooksLoaded(app)) {
      showFrameError(
        app,
        "The app frame loaded but did not start. Open it in a new tab or retry.",
        url
      );
    }
  }, 10000);
}

function openApp(slug, push, retry) {
  const app = findApp(apps, slug);
  if (!app || !app.available) return;
  activeSlug = app.slug;
  activeApp = app;
  title.textContent = app.title;
  version.textContent = versionLabel(app) + (app.updated ? " \u00b7 updated " + app.updated : "");
  if (app.source_url) {
    source.href = app.source_url;
    source.hidden = false;
  } else {
    source.removeAttribute("href");
    source.hidden = true;
  }
  note.textContent = "Synced from " + app.repo + " at commit " + String(app.commit).slice(0, 12) + ".";
  player.hidden = false;
  grid.hidden = true;
  if (push) {
    window.history.pushState(
      { app: app.slug },
      "",
      "play.html?app=" + encodeURIComponent(app.slug)
    );
  }
  title.focus({ preventScroll: true });
  player.scrollIntoView({ block: "start", behavior: "smooth" });
  loadApp(app, Boolean(retry));
}

function closeApp(push) {
  const previous = activeSlug;
  if (push) window.history.pushState({}, "", "play.html");
  loadSerial += 1;
  clearTimeout(loadTimer);
  activeApp = null;
  clearFrameError();
  frame.src = "about:blank";
  player.hidden = true;
  grid.hidden = false;
  activeSlug = "";
  const card = previous
    ? grid.querySelector('.live-card[data-slug="' + previous + '"]')
    : null;
  if (card) {
    const open = card.querySelector("button");
    if (open) open.focus();
  }
}

function initialApp() {
  const params = new URLSearchParams(window.location.search);
  return findApp(apps, params.get("app") || params.get("game"));
}

async function boot() {
  if (!grid || !player) return;
  if (!("requestFullscreen" in Element.prototype) && fullscreen) fullscreen.hidden = true;
  try {
    const response = await window.fetch(grid.dataset.catalog || "live.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("The live catalog could not be loaded.");
    apps = appsFromManifest(await response.json());
  } catch (error) {
    apps = [];
    grid.replaceChildren(element("p", "live-empty", error.message));
    return;
  }
  renderCatalog();
  const requested = initialApp();
  if (requested) openApp(requested.slug, false);
}

if (frame) frame.addEventListener("load", function () {
  if (!activeApp) return;
  if (frameLooksLoaded(activeApp)) {
    clearTimeout(loadTimer);
    clearFrameError();
  }
});
if (back) back.addEventListener("click", function () { closeApp(true); });
if (fullscreen) fullscreen.addEventListener("click", function () {
  if (document.fullscreenElement === player) {
    document.exitFullscreen();
  } else if (player.requestFullscreen) {
    player.requestFullscreen().catch(function () {});
  }
});
document.addEventListener("fullscreenchange", updateFullscreen);
window.addEventListener("popstate", function () {
  const app = initialApp();
  if (app && app.available) openApp(app.slug, false);
  else closeApp(false);
});
updateFullscreen();
boot();
