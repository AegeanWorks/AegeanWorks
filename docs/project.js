import {
  licenseFamily,
  licenseLabel,
  normalizeRepo,
  relativeAge,
  visibleTopics,
} from "./atlas-core.js";
import {
  findRepo,
  normalizeMedia,
  readmeToBlocks,
  screenshotMeta,
  validRepoName,
} from "./project-core.js";
import { createLightbox } from "./lightbox.js";
import { findApp } from "./live-core.js";

const params = new URLSearchParams(window.location.search);
const requested = (params.get("repo") || "").trim();
const statusEl = document.getElementById("project-status");
const errorEl = document.getElementById("project-error");
const errorText = document.getElementById("project-error-text");
const detailEl = document.getElementById("project-detail");
const readmeEl = document.getElementById("readme-content");
const readmeStatus = document.getElementById("readme-status");
const readmeLink = document.getElementById("readme-link");
const galleryEl = document.getElementById("project-gallery");
const galleryNote = document.getElementById("gallery-note");
const previewCard = document.getElementById("project-preview-card");
const previewImage = document.getElementById("project-preview");
const previewLink = document.getElementById("project-preview-link");
const previewMeta = document.getElementById("project-preview-meta");
const viewer = createLightbox(document.getElementById("gallery-lightbox"));

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setMeta(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.setAttribute("content", value);
}

function isSocialHomepage(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "twitter.com" ||
      host === "www.twitter.com" ||
      host === "x.com" ||
      host === "www.x.com"
    );
  } catch (error) {
    return false;
  }
}

function fail(message, githubUrl) {
  if (detailEl) detailEl.hidden = true;
  if (errorEl) errorEl.hidden = false;
  if (errorText) {
    errorText.textContent = message;
    if (githubUrl) {
      const link = document.createElement("a");
      link.href = githubUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Open it on GitHub instead.";
      errorText.append(" ", link);
    }
  }
  if (statusEl) statusEl.textContent = message;
  document.title = "Project not found — AegeanWorks";
}

async function fetchJson(url) {
  const response = await window.fetch(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
  });
  if (response.status === 403 || response.status === 429) {
    throw new Error("GitHub rate limit reached. Try again later.");
  }
  if (!response.ok) throw new Error("GitHub returned HTTP " + response.status + ".");
  return response.json();
}

async function lookupRepository() {
  try {
    const snapshot = await fetchJson("atlas-snapshot.json");
    const found = findRepo(snapshot.repositories, requested);
    if (found) return found;
  } catch (error) {
    /* fall through to the live API */
  }
  // hygiene: allow canonical repository lookup, not a loaded third-party resource
  return fetchJson("https://api.github.com/repos/AegeanWorks/" + encodeURIComponent(requested));
}

async function fetchOptionalJson(url) {
  try {
    const response = await window.fetch(url, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function loadMedia(repo) {
  const raw = await fetchOptionalJson(
    "media/" + encodeURIComponent(repo.name) + ".json?v=19"
  );
  const media = normalizeMedia(raw, repo.name);
  if (media.logo) renderLogo(repo, media.logo);
  if (media.preview) renderPreview(repo, media.preview);
  if (!media.screenshots.length) return;
  renderGallery(repo, media.screenshots);
}

async function loadLive(repo) {
  const raw = await fetchOptionalJson("live.json");
  const apps = raw && Array.isArray(raw.apps) ? raw.apps : [];
  const app = findApp(apps, repo.name.toLowerCase());
  if (!app || !app.available) return;
  const actions = document.querySelector(".dossier-body .hero-actions");
  if (!actions) return;
  const link = document.createElement("a");
  link.className = "btn btn-primary";
  link.href = "play.html?app=" + encodeURIComponent(app.slug);
  link.textContent = "Open in browser";
  actions.insertBefore(link, actions.firstChild);
}

function commitHref(repo, commit) {
  return (
    // hygiene: allow canonical commit link, not a loaded dependency
    "https://github.com/AegeanWorks/" +
    encodeURIComponent(repo.name) +
    "/commit/" +
    commit
  );
}

function viewerItem(repo, shot, fallback) {
  const meta = screenshotMeta(shot);
  return {
    src: shot.src,
    alt: shot.alt || fallback,
    caption: shot.caption || fallback,
    width: shot.width,
    height: shot.height,
    meta: meta,
    commit: shot.commit,
    commitHref: shot.commit ? commitHref(repo, shot.commit) : "",
    rest: shot.commit ? screenshotMeta({ ...shot, commit: "" }) : "",
  };
}

function renderLogo(repo, logo) {
  const image = document.getElementById("project-logo");
  if (!image || !logo) return;
  image.src = logo.src;
  image.alt = logo.alt || repo.name + " logo";
  image.width = 40;
  image.height = 40;
  image.hidden = false;
}

function renderPreview(repo, preview) {
  if (!previewCard || !previewImage) return;
  previewImage.src = preview.src;
  previewImage.alt = preview.alt || repo.name + " social preview";
  previewImage.width = preview.width || 1200;
  previewImage.height = preview.height || 600;
  if (previewLink) {
    previewLink.href = preview.src;
    previewLink.setAttribute("aria-label", "Open social preview");
    if (viewer) {
      previewLink.setAttribute("aria-haspopup", "dialog");
      previewLink.setAttribute("aria-controls", "gallery-lightbox");
      previewLink.addEventListener("click", function (event) {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        viewer.open([viewerItem(repo, preview, "Social preview")], 0);
      });
    }
  }
  if (previewMeta) {
    // hygiene: allow canonical commit link, not a loaded dependency
    previewMeta.textContent = screenshotMeta(preview) || "Social preview";
  }
  previewCard.hidden = false;
}

function galleryButton(id, className, label, glyph) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = id;
  button.className = className;
  button.setAttribute("aria-label", label);
  if (glyph) button.textContent = glyph;
  return button;
}

function buildGallerySlider(gallery) {
  const legacy = document.getElementById("gallery-grid");
  if (legacy) legacy.remove();
  const slider = document.createElement("div");
  slider.className = "gallery-slider";
  slider.id = "gallery-slider";
  slider.tabIndex = 0;

  const stage = document.createElement("div");
  stage.className = "gallery-stage";
  const open = galleryButton("gallery-open", "gallery-open", "Open screenshot");
  const image = document.createElement("img");
  image.id = "gallery-image";
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  open.appendChild(image);
  stage.append(
    open,
    galleryButton("gallery-prev", "gallery-nav gallery-prev", "Previous screenshot", "\u2039"),
    galleryButton("gallery-next", "gallery-nav gallery-next", "Next screenshot", "\u203a"),
  );

  const dots = document.createElement("div");
  dots.className = "gallery-dots";
  dots.id = "gallery-dots";

  const captionRow = document.createElement("div");
  captionRow.className = "gallery-caption-row";
  const caption = document.createElement("p");
  caption.className = "gallery-caption";
  caption.id = "gallery-caption";
  const meta = document.createElement("p");
  meta.className = "gallery-meta";
  meta.id = "gallery-meta";
  captionRow.append(caption, meta);

  slider.append(stage, dots, captionRow);
  gallery.appendChild(slider);
  return slider;
}

function renderGallery(repo, shots) {
  if (!galleryEl || !shots.length) return;
  let slider = document.getElementById("gallery-slider");
  if (!slider) slider = buildGallerySlider(galleryEl);
  const image = document.getElementById("gallery-image");
  const open = document.getElementById("gallery-open");
  const previous = document.getElementById("gallery-prev");
  const next = document.getElementById("gallery-next");
  const dots = document.getElementById("gallery-dots");
  const caption = document.getElementById("gallery-caption");
  const meta = document.getElementById("gallery-meta");
  if (!slider || !image || !dots) return;

  const viewerItems = shots.map(function (shot) {
    return viewerItem(repo, shot, "Screenshot");
  });
  let active = 0;
  dots.replaceChildren();
  const dotButtons = shots.map(function (_, index) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "gallery-dot";
    dot.setAttribute("aria-label", "Show screenshot " + (index + 1));
    dot.addEventListener("click", function () {
      show(index);
    });
    dots.appendChild(dot);
    return dot;
  });
  if (shots.length < 2) {
    if (previous) previous.hidden = true;
    if (next) next.hidden = true;
    dots.hidden = true;
  }
  function show(index) {
    active = (index + shots.length) % shots.length;
    const shot = shots[active];
    image.src = shot.src;
    image.alt = shot.alt || "Screenshot";
    if (shot.width && shot.height) {
      image.width = shot.width;
      image.height = shot.height;
    }
    if (caption) caption.textContent = shot.caption || shot.alt || "";
    if (meta) {
      meta.replaceChildren();
      if (shot.commit) {
        const source = document.createElement("a");
        source.href = commitHref(repo, shot.commit);
        source.target = "_blank";
        source.rel = "noopener";
        source.textContent = "commit " + shot.commit;
        meta.appendChild(source);
        const rest = screenshotMeta({ ...shot, commit: "" });
        if (rest) meta.append(" \u00b7 " + rest);
      } else {
        meta.textContent = screenshotMeta(shot);
      }
    }
    dotButtons.forEach(function (dot, index) {
      dot.classList.toggle("is-active", index === active);
      if (index === active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
    if (galleryNote) {
      galleryNote.textContent =
        active + 1 + " / " + shots.length + (viewer ? " \u00b7 open to enlarge" : "");
    }
    if (open) {
      open.setAttribute("aria-haspopup", "dialog");
      open.setAttribute("aria-controls", "gallery-lightbox");
      const label = shot.caption || shot.alt;
      open.setAttribute("aria-label", label ? "Open " + label : "Open screenshot");
    }
  }
  if (previous) {
    previous.addEventListener("click", function () {
      show(active - 1);
    });
  }
  if (next) {
    next.addEventListener("click", function () {
      show(active + 1);
    });
  }
  slider.addEventListener("keydown", function (event) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(active - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      show(active + 1);
    }
  });
  if (open) {
    open.addEventListener("click", function () {
      if (viewer) viewer.open(viewerItems, active);
      else window.open(shots[active].src, "_blank", "noopener");
    });
  }
  show(0);
  galleryEl.hidden = false;
}

async function fetchReadme(name) {
  // hygiene: allow canonical README lookup, not a loaded third-party resource
  const data = await fetchJson("https://api.github.com/repos/AegeanWorks/" + encodeURIComponent(name) + "/readme");
  if (typeof data.content !== "string") throw new Error("README payload is missing content.");
  const binary = window.atob(data.content.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function appendTopic(repo, topic) {
  const container = document.getElementById("project-topics");
  if (!container) return;
  const link = document.createElement("a");
  link.className = "project-topic";
  link.href = "index.html?topic=" + encodeURIComponent(topic) + "#projects";
  link.textContent = topic;
  container.appendChild(link);
}

function render(repo) {
  if (statusEl) statusEl.hidden = true;
  if (detailEl) detailEl.hidden = false;
  document.title = repo.name + " — AegeanWorks";
  const description = repo.description || "A public project from the AegeanWorks studio.";
  setText("project-title", repo.name);
  setText("project-description", description);
  setText("project-language", repo.language || "Unknown");
  const family = licenseFamily(repo.name);
  setText("project-license-name", family ? family.name : licenseLabel(repo.license, repo.name));
  setText("project-license-code", family ? "(" + family.short + ")" : "");
  setText("project-pushed", relativeAge(repo.pushed_at) || "Unknown");
  setText("project-branch", repo.default_branch || "main");
  const pushed = document.getElementById("project-pushed");
  if (pushed) pushed.title = repo.pushed_at || "";
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", repo.name + " — " + description);
  const pageUrl =
    // hygiene: allow canonical page URL metadata, not a loaded resource
    "https://aegeanworks.github.io/AegeanWorks/project.html?repo=" +
    encodeURIComponent(repo.name);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = pageUrl;
  setMeta('meta[property="og:title"]', repo.name + " \u2014 AegeanWorks");
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', pageUrl);
  setMeta('meta[name="twitter:title"]', repo.name + " \u2014 AegeanWorks");
  setMeta('meta[name="twitter:description"]', description);
  const repoLink = document.getElementById("project-repo");
  if (repoLink) repoLink.href = repo.html_url;
  const homepage = document.getElementById("project-homepage");
  if (homepage) {
    if (repo.homepage && !isSocialHomepage(repo.homepage)) {
      homepage.href = repo.homepage;
      homepage.hidden = false;
    } else {
      homepage.hidden = true;
    }
  }
  const topics = document.getElementById("project-topics");
  if (topics) topics.replaceChildren();
  const shown = visibleTopics(repo, 10);
  shown.forEach((topic) => appendTopic(repo, topic));
  if (repo.topics.length > shown.length) {
    const rest = document.createElement("a");
    rest.className = "project-topic project-topic-more";
    rest.href = repo.html_url + "#topics";
    rest.textContent = "+" + (repo.topics.length - shown.length) + " more on GitHub";
    rest.target = "_blank";
    rest.rel = "noopener";
    if (topics) topics.appendChild(rest);
  }
}

function appendBlock(block) {
  if (!readmeEl) return;
  if (block.type === "heading") {
    const heading = document.createElement("h" + String(block.level));
    heading.textContent = block.text;
    readmeEl.appendChild(heading);
  } else if (block.type === "paragraph") {
    const paragraph = document.createElement("p");
    paragraph.textContent = block.text;
    readmeEl.appendChild(paragraph);
  } else if (block.type === "list") {
    const list = document.createElement(block.ordered ? "ol" : "ul");
    block.items.forEach((item) => {
      const bullet = document.createElement("li");
      bullet.textContent = item;
      list.appendChild(bullet);
    });
    readmeEl.appendChild(list);
  } else if (block.type === "code") {
    const pre = document.createElement("pre");
    pre.tabIndex = 0;
    const code = document.createElement("code");
    code.textContent = block.text;
    pre.appendChild(code);
    readmeEl.appendChild(pre);
  } else if (block.type === "quote") {
    const quote = document.createElement("blockquote");
    quote.textContent = block.text;
    readmeEl.appendChild(quote);
  } else if (block.type === "rule") {
    readmeEl.appendChild(document.createElement("hr"));
  }
}

async function loadReadme(repo) {
  if (readmeLink) readmeLink.href = repo.html_url + "#readme";
  try {
    const markdown = await fetchReadme(repo.name);
    const parsed = readmeToBlocks(markdown);
    if (!parsed.blocks.length) {
      if (readmeStatus) readmeStatus.textContent = "No README excerpt is available.";
      return;
    }
    if (readmeEl) readmeEl.replaceChildren();
    parsed.blocks.forEach(appendBlock);
    if (readmeStatus) {
      readmeStatus.textContent = parsed.truncated
        ? "Showing the first part of the README."
        : "";
    }
  } catch (error) {
    if (readmeStatus) readmeStatus.textContent = error.message;
  }
}

async function boot() {
  if (!validRepoName(requested)) {
    fail("Choose a project from the portfolio.");
    return;
  }
  if (statusEl) statusEl.textContent = "Loading project…";
  try {
    const raw = await lookupRepository();
    const repo = normalizeRepo(raw);
    render(repo);
    await Promise.all([loadReadme(repo), loadMedia(repo), loadLive(repo)]);
  } catch (error) {
    // hygiene: allow outbound fallback link, not a loaded dependency
    const github = "https://github.com/AegeanWorks/" + encodeURIComponent(requested);
    fail(error.message || "The project could not be loaded.", github);
  }
}

if (detailEl) boot();
