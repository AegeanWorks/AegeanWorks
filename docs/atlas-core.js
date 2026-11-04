/* Pure helpers for the live GitHub project atlas.
 * No DOM and no network here so Node can test the same rules the browser uses.
 */

/* hygiene: allow canonical public API fetch, not a loaded third-party resource */
export const API_ROOT = "https://api.github.com/users/AegeanWorks/repos";
export const CACHE_KEY = "aegean:atlas:v3";
export const CACHE_VERSION = 3;
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const MAX_PAGES = 5;
export const CATEGORY_ORDER = ["ai", "research", "health", "tools", "play"];
export const CATEGORY_LABELS = {
  ai: "AI & Agents",
  research: "Research",
  health: "Health & Neuro",
  tools: "Developer Tools",
  play: "Games & Experiments",
};
export const BOILERPLATE_TOPICS = new Set(["aikit", "python", "source-available"]);
export const IGNORED_REPOS = new Set(["aegeanworks", ".github", "idea-catcher"]);

const NAME = /^[A-Za-z0-9._-]{1,100}$/;
/* hygiene: allow canonical public API page, not a loaded resource */
const SAFE_PAGE = /^https:\/\/api\.github\.com\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/;

export class AtlasFetchError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "AtlasFetchError";
    this.reason = reason;
  }
}

export function normalizeRepo(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AtlasFetchError("shape", "Repository entry is not an object.");
  }
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!NAME.test(name)) {
    throw new AtlasFetchError("shape", "Repository name is not a safe GitHub name.");
  }
  const id = raw.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    throw new AtlasFetchError("shape", "Repository id is not a positive integer.");
  }
  const topics = Array.isArray(raw.topics)
    ? raw.topics.filter((topic) => typeof topic === "string" && topic.trim()).map((topic) => topic.trim())
    : [];
  const license =
    typeof raw.license === "string"
      ? raw.license.trim()
      : raw.license && typeof raw.license === "object" && typeof raw.license.spdx_id === "string"
        ? raw.license.spdx_id.trim()
        : "";
  const pushedAt =
    typeof raw.pushed_at === "string" && Number.isFinite(Date.parse(raw.pushed_at))
      ? raw.pushed_at
      : "";
  const homepage = safeUrl(raw.homepage);
  const defaultBranch =
    typeof raw.default_branch === "string" && /^[A-Za-z0-9._/-]{1,100}$/.test(raw.default_branch)
      ? raw.default_branch
      : "main";
  return {
    id,
    name,
    description: typeof raw.description === "string" ? raw.description.trim() : "",
    topics: Array.from(new Set(topics)),
    language: typeof raw.language === "string" ? raw.language.trim() : "",
    license,
    license_family: licenseShort(name),
    pushed_at: pushedAt,
    homepage,
    default_branch: defaultBranch,
    archived: raw.archived === true,
    // hygiene: allow outbound link, not a loaded dependency
    html_url: "https://github.com/AegeanWorks/" + encodeURIComponent(name),
    project_url: "project.html?repo=" + encodeURIComponent(name),
  };
}

function safeUrl(value) {
  if (typeof value !== "string" || value.length > 500) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch (error) {
    return "";
  }
}

/* GitHub reports every Aegean license as NOASSERTION because the family is not
 * an OSI identifier, so the family per repository is recorded here. Update this
 * ledger when a repository changes license; tests pin its coverage.
 */
export const LICENSE_FAMILIES = Object.freeze({
  AL: { short: "AL-1.1", name: "Aegean License 1.1" },
  AGL: { short: "AGL-1.1", name: "Aegean Game License 1.1" },
  ASL: { short: "ASL-1.1", name: "Aegean Science License 1.1" },
});

export const REPO_LICENSES = Object.freeze({
  "aegean-licensing": "AL",
  "weft": "AGL",
  "tessera": "AL",
  "pocket-planner": "AL",
  "modelduck": "AL",
  "iris": "AGL",
  "dustline": "AGL",
  "dupefinder": "AL",
  "driftwood": "AL",
  "cairn": "AL",
  "aegean-reforge": "AL",
  aikit: "AL",
  aldervale: "AGL",
  afterimage: "AGL",
  assay: "AL",
  atlas: "AL",
  chronos: "AL",
  "crypt-crawler": "AGL",
  cyberpulse: "AGL",
  "fluid-universe": "ASL",
  fold: "AGL",
  gauge: "AL",
  keystone: "AL",
  lacon: "AL",
  lattice: "AL",
  memoryreconstruction: "AGL",
  meridian: "AL",
  mnemo: "AL",
  muse: "AL",
  "n1-engine": "AL",
  neuralbeat: "AL",
  neuraldeck: "AL",
  neurocore: "AL",
  "neurologyclinictemplates-tr": "AL",
  neurooptic: "AL",
  nobetwizard: "AL",
  nomoreclutter: "AL",
  orrery: "ASL",
  palette: "AL",
  pebble: "AL",
  "photo-harbor": "AL",
  pnn: "ASL",
  primordia: "AL",
  "prism-relay": "AGL",
  "research-engine": "ASL",
  tally: "AL",
  tempo: "AL",
  "ui-sandbox": "AL",
  voidfarer: "AGL",
  "chatduck": "AL",
});

/* The family short code for a repository, or "" when it is not an Aegean one. */
export function licenseShort(repoName) {
  const family = licenseFamily(repoName);
  return family ? family.short : "";
}

export function licenseFamily(repoName) {
  if (typeof repoName !== "string") return null;
  return LICENSE_FAMILIES[REPO_LICENSES[repoName.trim().toLowerCase()]] || null;
}

export function licenseLabel(license, repoName = "", { full = false } = {}) {
  const family = licenseFamily(repoName);
  if (family) return full ? family.name + " (" + family.short + ")" : family.short;
  if (!license) return "No license";
  if (license === "NOASSERTION") return "Custom license";
  return license;
}

export function relativeAge(pushedAt, now = Date.now()) {
  const timestamp = Date.parse(pushedAt);
  if (!Number.isFinite(timestamp)) return "";
  const days = Math.floor((now - timestamp) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + " days ago";
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months + (months === 1 ? " month ago" : " months ago");
  }
  const years = Math.floor(days / 365);
  return years + (years === 1 ? " year ago" : " years ago");
}

export function factsText(repo, now = Date.now()) {
  const facts = [
    repo.language || "Unknown language",
    licenseLabel(repo.license, repo.name),
  ];
  const age = relativeAge(repo.pushed_at, now);
  if (age) facts.push("Updated " + age);
  return facts.join(" · ");
}

export function selectRepos(rawRepos) {
  if (!Array.isArray(rawRepos)) {
    throw new AtlasFetchError("shape", "GitHub returned a non-list repository payload.");
  }
  const repos = [];
  const seen = new Set();
  let rejected = 0;
  for (const raw of rawRepos) {
    if (raw && typeof raw === "object" && typeof raw.name === "string") {
      if (IGNORED_REPOS.has(raw.name.toLowerCase()) || raw.fork === true) continue;
    }
    try {
      const repo = normalizeRepo(raw);
      if (seen.has(repo.id)) continue;
      seen.add(repo.id);
      repos.push(repo);
    } catch (error) {
      rejected += 1;
    }
  }
  return { repos, rejected };
}

export function visibleTopics(repo, limit = 6) {
  if (!repo || !Array.isArray(repo.topics)) return [];
  const visible = repo.topics.filter(
    (topic) => !BOILERPLATE_TOPICS.has(topic.toLowerCase())
  );
  return Array.from(new Set(visible)).slice(0, limit);
}

export function inferCategory(topics) {
  const values = new Set(
    (Array.isArray(topics) ? topics : []).map((topic) => String(topic).toLowerCase())
  );
  const has = (...keys) => keys.some((key) => values.has(key));
  if (
    has(
      "game", "games", "roguelike", "ascii-game", "rpg", "puzzle",
      "interactive-fiction", "music", "entertainment"
    )
  ) {
    return "play";
  }
  if (
    has(
      "health", "medical", "clinic", "neurology", "brain", "sleep", "anki",
      "binaural-beats", "cognitive-enhancement", "health-tracking", "neuroscience"
    )
  ) {
    return "health";
  }
  if (
    has(
      "research", "science", "physics", "biology", "astronomy", "experiment",
      "n-of-1", "falsification", "particle-physics", "computational-biology",
      "artificial-life", "knowledge-graph"
    )
  ) {
    return "research";
  }
  if (
    has(
      "ai", "llm", "agent", "agents", "ai-agents", "rag", "mcp",
      "machine-learning", "deep-learning", "neural-network", "agentic-coding",
      "local-llm", "agent-framework"
    )
  ) {
    return "ai";
  }
  return "tools";
}

export function monogram(name) {
  const words = String(name).split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0].toUpperCase() + words[1][0].toLowerCase());
  }
  const compact = String(name).replace(/[^A-Za-z0-9]/g, "");
  if (!compact) return "Aw";
  if (compact.length === 1) return compact.toUpperCase() + "x";
  return compact[0].toUpperCase() + compact[1].toLowerCase();
}

export function planSync(existingCards, liveRepos, { complete = true } = {}) {
  const byId = new Map(liveRepos.map((repo) => [String(repo.id), repo]));
  const byName = new Map(liveRepos.map((repo) => [repo.name.toLowerCase(), repo]));
  const existingIds = new Set(existingCards.map((card) => String(card.id || "")));
  const updates = [];
  const removals = [];
  for (const card of existingCards) {
    const id = String(card.id || "");
    const repo = id
      ? byId.get(id)
      : byName.get(String(card.name || "").toLowerCase());
    if (repo) {
      updates.push({ cardId: id || String(repo.id), repo, cardRef: card });
    } else if (complete) {
      removals.push({ cardId: id || String(card.name || ""), cardRef: card });
    }
  }
  const additions = liveRepos
    .filter((repo) => !existingIds.has(String(repo.id)))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { updates, removals, additions };
}

export function safeNextLink(headerValue) {
  if (typeof headerValue !== "string" || !headerValue) return "";
  for (const part of headerValue.split(",")) {
    if (!/rel\s*=\s*"?next"?/.test(part)) continue;
    const match = part.match(/<([^>]+)>/);
    if (match && SAFE_PAGE.test(match[1])) return match[1];
  }
  return "";
}

export async function fetchAllRepos(fetcher, { maxPages = MAX_PAGES } = {}) {
  let url = API_ROOT + "?per_page=100&type=public&sort=updated";
  const raw = [];
  let complete = true;
  for (let page = 0; page < maxPages && url; page += 1) {
    const response = await fetcher(url);
    if (response.status === 403 || response.status === 429) {
      throw new AtlasFetchError("rate-limited", "GitHub rate limit reached.");
    }
    if (!response.ok) {
      throw new AtlasFetchError("http", "GitHub returned HTTP " + response.status + ".");
    }
    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new AtlasFetchError("shape", "GitHub returned invalid JSON.");
    }
    if (!Array.isArray(data)) {
      throw new AtlasFetchError("shape", "GitHub returned a non-list repository payload.");
    }
    raw.push(...data);
    url = safeNextLink(response.headers.get("Link"));
  }
  if (url) complete = false;
  return { raw, complete };
}

export function parseCache(rawText, now = Date.now(), ttl = CACHE_TTL_MS) {
  if (typeof rawText !== "string" || !rawText) return null;
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (error) {
    return null;
  }
  if (
    !data ||
    data.version !== CACHE_VERSION ||
    typeof data.savedAt !== "number" ||
    !Array.isArray(data.repos) ||
    now - data.savedAt < 0 ||
    now - data.savedAt > ttl
  ) {
    return null;
  }
  try {
    const selected = selectRepos(data.repos);
    if (!selected.repos.length) return null;
    return { repos: selected.repos, fetchedAt: data.savedAt };
  } catch (error) {
    return null;
  }
}

export function serializeCache(repos, savedAt = Date.now()) {
  return JSON.stringify({ version: CACHE_VERSION, savedAt, repos });
}

export function countCards(cards) {
  const counts = {};
  for (const category of CATEGORY_ORDER) counts[category] = 0;
  for (const card of cards) {
    const category =
      card.cat ||
      (card.dataset ? card.dataset.cat : "") ||
      (card.el && card.el.dataset ? card.el.dataset.cat : "");
    if (Object.prototype.hasOwnProperty.call(counts, category)) counts[category] += 1;
  }
  return { total: cards.length, counts };
}

export function statusText(mode, { fetchedAt = null } = {}) {
  const time = fetchedAt
    ? new Date(fetchedAt).toISOString().slice(11, 16) + " UTC"
    : "";
  switch (mode) {
    case "live":
      return "Live from GitHub" + (time ? " · " + time : "");
    case "cached":
      return "Cached atlas" + (time ? " · " + time : "");
    case "partial":
      return "Partial GitHub sync · removals held back";
    case "rate-limited":
      return "GitHub rate limit reached · showing the built-in snapshot";
    case "offline":
      return "GitHub unreachable · showing the built-in snapshot";
    case "stale":
      return "GitHub unreachable · showing the cached atlas";
    default:
      return "Built-in snapshot";
  }
}
