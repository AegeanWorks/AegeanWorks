import {
  CACHE_KEY,
  CATEGORY_ORDER,
  AtlasFetchError,
  countCards,
  factsText,
  fetchAllRepos,
  inferCategory,
  monogram,
  parseCache,
  planSync,
  selectRepos,
  serializeCache,
  statusText,
  visibleTopics,
} from "./atlas-core.js";

const grid = document.getElementById("project-grid");
const statusEl = document.getElementById("atlas-status");

function readCache() {
  try {
    return parseCache(window.sessionStorage.getItem(CACHE_KEY));
  } catch (error) {
    return null;
  }
}

function writeCache(repos) {
  try {
    window.sessionStorage.setItem(CACHE_KEY, serializeCache(repos));
  } catch (error) {
    /* private browsing can refuse storage; the live result still applies */
  }
}

function fetcher(url) {
  const controller = new AbortController();
  const timer = window.setTimeout(function () {
    controller.abort();
  }, 15000);
  return window
    .fetch(url, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal,
    })
    .finally(function () {
      window.clearTimeout(timer);
    });
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function updateCard(element, repo) {
  element.dataset.repoId = String(repo.id);
  element.dataset.repoUrl = repo.html_url;
  element.dataset.topics = repo.topics.join(",");
  element.dataset.language = repo.language;
  element.dataset.license = repo.license_family || repo.license;
  element.dataset.pushedAt = repo.pushed_at;
  element.dataset.archived = repo.archived ? "true" : "false";
  if (element.getAttribute("href") !== repo.project_url) {
    element.setAttribute("href", repo.project_url);
  }
  setText(element.querySelector("h3"), repo.name);
  setText(element.querySelector("p"), repo.description || "No description yet.");
  let facts = element.querySelector(".project-facts");
  if (!facts) {
    facts = document.createElement("span");
    facts.className = "project-facts";
    const tags = element.querySelector(".project-tags");
    if (tags) element.insertBefore(facts, tags);
    else element.appendChild(facts);
  }
  setText(facts, factsText(repo));
  const tags = element.querySelector(".project-tags");
  if (tags) {
    const desired = visibleTopics(repo);
    const current = Array.from(tags.querySelectorAll(".tag")).map((tag) => tag.textContent);
    if (current.join("\u0000") !== desired.join("\u0000")) {
      tags.replaceChildren(
        ...desired.map((topic) => {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = topic;
          return tag;
        })
      );
    }
  }
}

function createCard(repo) {
  const category = inferCategory(repo.topics);
  const anchor = document.createElement("a");
  anchor.className = "project";
  anchor.dataset.cat = category;
  anchor.dataset.repoId = String(repo.id);
  anchor.dataset.repoUrl = repo.html_url;
  anchor.dataset.topics = repo.topics.join(",");
  anchor.dataset.language = repo.language;
  anchor.dataset.license = repo.license_family || repo.license;
  anchor.dataset.pushedAt = repo.pushed_at;
  anchor.dataset.archived = repo.archived ? "true" : "false";
  anchor.setAttribute("href", repo.project_url);
  anchor.setAttribute("rel", "noopener");

  const mark = document.createElement("span");
  mark.className = "project-mark mark-" + category;
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = monogram(repo.name);
  anchor.appendChild(mark);

  const title = document.createElement("h3");
  title.textContent = repo.name;
  anchor.appendChild(title);

  const description = document.createElement("p");
  description.textContent = repo.description || "No description yet.";
  anchor.appendChild(description);

  const facts = document.createElement("span");
  facts.className = "project-facts";
  facts.textContent = factsText(repo);
  anchor.appendChild(facts);

  const tags = document.createElement("span");
  tags.className = "project-tags";
  for (const topic of visibleTopics(repo)) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = topic;
    tags.appendChild(tag);
  }
  anchor.appendChild(tags);
  return anchor;
}

function existingCards() {
  return Array.from(grid.querySelectorAll(".project")).map((element) => ({
    id: element.dataset.repoId || "",
    name: (element.querySelector("h3") || {}).textContent || "",
    el: element,
  }));
}

function orderCards() {
  const cards = Array.from(grid.querySelectorAll(".project"));
  const groups = new Map(CATEGORY_ORDER.map((category) => [category, []]));
  const extras = [];
  for (const card of cards) {
    const group = groups.get(card.dataset.cat);
    if (group) group.push(card);
    else extras.push(card);
  }
  const desired = Array.from(groups.values()).flat().concat(extras);
  const changed = desired.some((card, index) => card !== cards[index]);
  if (changed) {
    const fragment = document.createDocumentFragment();
    for (const card of desired) fragment.appendChild(card);
    grid.appendChild(fragment);
  }
}

function syncSelectedWork(repos, complete) {
  if (!complete) return;
  const byId = new Map(repos.map((repo) => [String(repo.id), repo]));
  const byName = new Map(repos.map((repo) => [repo.name.toLowerCase(), repo]));
  for (const card of document.querySelectorAll(".work-card")) {
    if (card.dataset.unlinked === "true") {
      card.hidden = false;
      continue;
    }
    const href = card.getAttribute("href") || "";
    const match = href.match(/^https:\/\/github\.com\/AegeanWorks\/([^/?#]+)\/?$/);
    const id = card.dataset.repoId || "";
    const name = match ? decodeURIComponent(match[1]).toLowerCase() : "";
    const repo = id ? byId.get(id) : byName.get(name);
    if (!repo) {
      if (id || name) card.hidden = true;
      continue;
    }
    card.hidden = false;
    if (card.getAttribute("href") !== repo.html_url) {
      card.setAttribute("href", repo.html_url);
    }
    const title = card.querySelector("h3");
    if (title && title.textContent !== repo.name) {
      title.textContent = repo.name;
    }
  }
}

function apply(repos, mode, fetchedAt, complete) {
  const plan = planSync(existingCards(), repos, { complete });
  for (const update of plan.updates) updateCard(update.cardRef.el, update.repo);
  if (complete) {
    for (const removal of plan.removals) removal.cardRef.el.remove();
  }
  for (const repo of plan.additions) grid.appendChild(createCard(repo));
  orderCards();
  syncSelectedWork(repos, complete);
  const counted = countCards(
    Array.from(grid.querySelectorAll(".project"))
  );
  window.dispatchEvent(
    new CustomEvent("atlas:changed", {
      detail: { total: counted.total, counts: counted.counts, mode },
    })
  );
  setStatus(mode, fetchedAt);
}

function setStatus(mode, fetchedAt) {
  if (!statusEl) return;
  statusEl.textContent = statusText(mode, { fetchedAt });
  statusEl.dataset.mode = mode;
}

async function boot() {
  if (!grid) return;
  const cached = readCache();
  if (cached) {
    apply(cached.repos, "cached", cached.fetchedAt, true);
    return;
  }
  try {
    const result = await fetchAllRepos(fetcher);
    const selected = selectRepos(result.raw);
    if (!selected.repos.length) {
      throw new AtlasFetchError("shape", "GitHub returned no public project repositories.");
    }
    if (result.complete) writeCache(selected.repos);
    apply(
      selected.repos,
      result.complete ? "live" : "partial",
      Date.now(),
      result.complete
    );
  } catch (error) {
    const mode = error && error.reason === "rate-limited" ? "rate-limited" : "offline";
    setStatus(mode, null);
  }
}

function whenReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}

if (grid) whenReady(boot);
