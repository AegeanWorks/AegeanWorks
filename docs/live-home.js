import { appsFromManifest, versionLabel } from "./live-core.js";

const grid = document.getElementById("live-home-grid");

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function navButton(className, label, text) {
  const node = element("button", className, text);
  node.type = "button";
  node.setAttribute("aria-label", label);
  return node;
}

function slider(shots, title) {
  const wrap = document.createElement("div");
  wrap.className = "live-home-slider";
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", title + " screenshots");

  const track = document.createElement("div");
  track.className = "live-home-track";
  shots.forEach(function (shot, index) {
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = shot.src;
    image.alt = shot.alt || title + " screenshot " + (index + 1);
    image.loading = index === 0 ? "eager" : "lazy";
    image.decoding = "async";
    figure.appendChild(image);
    track.appendChild(figure);
  });
  wrap.appendChild(track);

  if (shots.length < 2) return wrap;

  const previous = navButton("live-home-nav live-home-prev", "Previous screenshot", "\u2039");
  const next = navButton("live-home-nav live-home-next", "Next screenshot", "\u203a");
  const dots = element("div", "live-home-dots");
  const dotButtons = shots.map(function (_, index) {
    const dot = navButton("live-home-dot", "Show screenshot " + (index + 1), "");
    dot.addEventListener("click", function () {
      go(index);
    });
    dots.appendChild(dot);
    return dot;
  });
  wrap.append(previous, next, dots);

  let active = 0;
  let frame = 0;

  function update() {
    dotButtons.forEach(function (dot, index) {
      dot.classList.toggle("is-active", index === active);
      if (index === active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }

  function go(index) {
    active = (index + shots.length) % shots.length;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({
      left: active * track.clientWidth,
      behavior: reduce ? "auto" : "smooth",
    });
    update();
  }

  previous.addEventListener("click", function () {
    go(active - 1);
  });
  next.addEventListener("click", function () {
    go(active + 1);
  });
  wrap.addEventListener("keydown", function (event) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(active - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(active + 1);
    }
  });
  track.addEventListener(
    "scroll",
    function () {
      if (frame) return;
      frame = window.requestAnimationFrame(function () {
        frame = 0;
        const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
        if (index !== active && index >= 0 && index < shots.length) {
          active = index;
          update();
        }
      });
    },
    { passive: true }
  );
  update();
  return wrap;
}

function card(app, shots) {
  const article = element("article", "live-home-card");
  if (shots.length) article.appendChild(slider(shots, app.title));

  const body = element("div", "live-home-body");
  const heading = document.createElement("h3");
  heading.className = "live-home-name";
  const titleLink = element("a", "", app.title);
  titleLink.href = "play.html?app=" + encodeURIComponent(app.slug);
  heading.appendChild(titleLink);
  body.appendChild(heading);
  const meta = element("span", "live-home-meta", versionLabel(app));
  if (app.archived) meta.append(" \u00b7 archived");
  body.appendChild(meta);
  body.appendChild(element("span", "live-home-description", app.description));

  const links = element("div", "live-home-links");
  const open = element("a", "live-home-open", "Open app");
  open.href = "play.html?app=" + encodeURIComponent(app.slug);
  links.appendChild(open);
  const dossierHref = app.dossier || app.source_url;
  if (dossierHref) {
    const dossier = element("a", "live-home-dossier", "Dossier");
    dossier.href = dossierHref;
    if (/^https?:/i.test(dossierHref)) {
      dossier.target = "_blank";
      dossier.rel = "noopener";
    }
    links.appendChild(dossier);
  }
  body.appendChild(links);

  article.appendChild(body);
  return article;
}

async function boot() {
  if (!grid) return;
  try {
    const responses = await Promise.all([
      window.fetch(grid.dataset.catalog || "live.json", { cache: "no-cache" }),
      window.fetch("live/shots.json", { cache: "no-cache" }).catch(function () {
        return null;
      }),
    ]);
    const catalog = responses[0];
    const shotsResponse = responses[1];
    if (!catalog || !catalog.ok) return;
    const apps = appsFromManifest(await catalog.json())
      .filter(function (app) {
        return app.available;
      });
    let shotsBySlug = {};
    if (shotsResponse && shotsResponse.ok) {
      const raw = await shotsResponse.json();
      if (raw && raw.schema === 1 && raw.apps && typeof raw.apps === "object") {
        shotsBySlug = raw.apps;
      }
    }
    if (!apps.length) return;
    grid.replaceChildren();
    apps.forEach(function (app) {
      const entry = shotsBySlug[app.slug];
      const shots =
        entry && Array.isArray(entry.screenshots)
          ? entry.screenshots.filter(function (shot) {
              return shot && typeof shot.src === "string" && shot.src;
            })
          : [];
      grid.appendChild(card(app, shots));
    });
  } catch (error) {
    // Keep the static fallback link when the catalog cannot be loaded.
  }
}

boot();
