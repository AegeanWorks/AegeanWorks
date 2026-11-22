import assert from "node:assert/strict";

import {
  AtlasFetchError,
  CACHE_KEY,
  CATEGORY_ORDER,
  countCards,
  displayDescription,
  factsText,
  fetchAllRepos,
  inferCategory,
  licenseFamily,
  licenseLabel,
  licenseShort,
  monogram,
  normalizeRepo,
  parseCache,
  planSync,
  safeNextLink,
  selectRepos,
  serializeCache,
  statusText,
  visibleTopics,
} from "../../docs/atlas-core.js";

let assertions = 0;

function check(value, message) {
  assert.ok(value, message);
  assertions += 1;
}

function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

function repo(id, name, extra = {}) {
  return {
    id,
    name,
    description: extra.description || "A public project.",
    topics: extra.topics || ["ai"],
    fork: extra.fork === true,
    ...extra,
  };
}

const one = normalizeRepo(repo(101, "NeuroCore", { topics: ["ai", "ai", "rag"] }));
equal(one.html_url, "https://github.com/AegeanWorks/NeuroCore", "URL is rebuilt");
equal(one.topics, ["ai", "rag"], "topics deduplicate");
equal(normalizeRepo(repo(102, "Old", { archived: true })).archived, true, "archived flag is kept");
equal(normalizeRepo(repo(103, "New")).archived, false, "missing archived flag is false");
assert.throws(() => normalizeRepo(repo(0, "Bad")), AtlasFetchError);
assertions += 1;
assert.throws(() => normalizeRepo(repo(1, "../escape")), AtlasFetchError);
assertions += 1;
assert.throws(() => normalizeRepo({ name: "NoId" }), AtlasFetchError);
assertions += 1;
equal(
  normalizeRepo(repo(3, "Name", { description: 7 })).description,
  "",
  "a wrong-typed description is ignored"
);

const selected = selectRepos([
  repo(1, "AIKit", { description: 7 }),
  repo(2, "Forked", { fork: true }),
  repo(3, "AegeanWorks"),
  repo(4, ".github"),
  repo(5, "Good", { topics: ["cli"] }),
  repo(5, "GoodAgain", { topics: ["cli"] }),
  repo(6, "../bad"),
]);
equal(
  selected.repos.map((item) => item.name),
  ["AIKit", "Good"],
  "forks, profile, ignored, invalid and duplicates are dropped"
);
equal(selected.rejected, 1, "one malformed entry is counted");

equal(visibleTopics(normalizeRepo(repo(1, "X", { topics: ["aikit", "python", "aikit-integrated", "aegeanworks", "aegean-license", "ai", "cli"] }))), ["ai", "cli"], "boilerplate and housekeeping topics hidden");
equal(visibleTopics(normalizeRepo(repo(1, "X", { topics: ["a", "b", "c", "d", "e", "f", "g"] }))), ["a", "b", "c", "d", "e", "f"], "six shown");

equal(inferCategory(["game", "ai"]), "play", "games first");
equal(inferCategory(["ai", "puzzle"]), "play", "puzzle is play");
equal(inferCategory(["health-tracking", "ai"]), "health", "health before ai");
equal(inferCategory(["neuroscience"]), "health", "neuroscience is health");
equal(inferCategory(["particle-physics"]), "research", "physics is research");
equal(inferCategory(["ai-agents"]), "ai", "agents are ai");
equal(inferCategory(["cli"]), "tools", "tools is the fallback");

equal(monogram("UI-Sandbox"), "Us", "two words");
equal(monogram("PNN"), "Pn", "single word");
equal(monogram("x"), "Xx", "single letter");
equal(monogram("---"), "Aw", "empty");

const live = [repo(10, "Old"), repo(11, "New")].map(normalizeRepo);
const existing = [
  { id: "10", name: "Old", el: "kept" },
  { id: "9", name: "Gone", el: "removed" },
];
const full = planSync(existing, live, { complete: true });
equal(full.updates.length, 1, "matched card updates");
equal(full.removals.map((item) => item.cardId), ["9"], "complete sync removes missing cards");
equal(full.additions.map((item) => item.name), ["New"], "missing repository is added");
const partial = planSync(existing, live, { complete: false });
equal(partial.removals, [], "partial sync never removes");
const legacy = planSync([{ id: "", name: "New", el: "legacy" }], live, { complete: true });
equal(legacy.updates.length, 1, "legacy card matches by name");
equal(legacy.removals, [], "matched legacy card is not removed");

equal(safeNextLink('<https://api.github.com/users/AegeanWorks/repos?page=2>; rel="next"'), "https://api.github.com/users/AegeanWorks/repos?page=2", "safe next");
equal(safeNextLink('<https://evil.example/x>; rel="next"'), "", "external next rejected");
equal(safeNextLink(""), "", "empty next");

function response(status, body, link = null) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() === "link" ? link : null) },
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  };
}

const calls = [];
const first = await fetchAllRepos(async (url) => {
  calls.push(url);
  if (calls.length === 1) {
    return response(200, [repo(1, "One")], '<https://api.github.com/users/AegeanWorks/repos?page=2>; rel="next"');
  }
  return response(200, [repo(2, "Two")]);
});
equal(first.raw.length, 2, "pagination collects both pages");
equal(first.complete, true, "pagination is complete");
check(calls[0].includes("per_page=100") && calls[0].includes("type=public"), "API query keeps public type");
await assert.rejects(() => fetchAllRepos(async () => response(403, [])), (error) => error.reason === "rate-limited");
assertions += 1;
await assert.rejects(() => fetchAllRepos(async () => response(500, [])), (error) => error.reason === "http");
assertions += 1;
await assert.rejects(() => fetchAllRepos(async () => response(200, new Error("bad json"))), (error) => error.reason === "shape");
assertions += 1;

const cache = serializeCache([normalizeRepo(repo(1, "Cached", { topics: ["cli"] }))], 1000);
const cached = parseCache(cache, 2000, 5000);
equal(cached.repos[0].name, "Cached", "cache roundtrip");
equal(parseCache(cache, 9000, 5000), null, "expired cache ignored");
const bumped = JSON.parse(cache);
bumped.version = 2;
equal(parseCache(JSON.stringify(bumped), 2000, 5000), null, "older cache version rejected");
equal(parseCache("not json", 2000, 5000), null, "bad cache ignored");
equal(JSON.parse(cache).version, 3, "cache version stored");
equal(CACHE_KEY, "aegean:atlas:v3", "cache key");

const counted = countCards([
  { cat: "ai" },
  { dataset: { cat: "play" } },
  { el: { dataset: { cat: "ai" } } },
  { cat: "unknown" },
]);
equal(counted.total, 4, "total counts every card");
equal(counted.counts.ai, 2, "ai counts");
equal(counted.counts.play, 1, "play counts");
equal(Object.keys(counted.counts), CATEGORY_ORDER, "category order is explicit");

check(statusText("live", { fetchedAt: Date.UTC(2026, 9, 27, 12, 34) }).includes("Live from GitHub"), "live status");
check(statusText("cached", { fetchedAt: Date.UTC(2026, 9, 27, 12, 34) }).includes("Cached"), "cached status");
check(statusText("rate-limited").includes("rate limit"), "rate limit status");
check(statusText("offline").includes("unreachable"), "offline status");
check(statusText("partial").includes("removals held back"), "partial status");
equal(statusText("snapshot", { total: 33 }), "Built-in snapshot", "snapshot status is count-free");


equal(licenseLabel("NOASSERTION", "AIKit"), "AL-1.1", "Aegean software family named");
equal(licenseLabel("NOASSERTION", "aikit"), "AL-1.1", "family lookup is case-insensitive");
equal(licenseLabel("NOASSERTION", "Voidfarer"), "AGL-1.1", "game family named");
equal(licenseLabel("NOASSERTION", "Orrery"), "ASL-1.1", "science family named");
equal(
  licenseLabel("NOASSERTION", "AIKit", { full: true }),
  "Aegean License 1.1 (AL-1.1)",
  "full dossier label"
);
equal(licenseLabel("NOASSERTION", "Unknown-Repo"), "Custom license", "unknown repo stays generic");
equal(licenseLabel("MIT", "Unknown-Repo"), "MIT", "SPDX identifier passes through");
equal(licenseLabel("", "Unknown-Repo"), "No license", "absent license");
equal(licenseShort("PNN"), "ASL-1.1", "short helper");
equal(licenseFamily("nope"), null, "unknown family is null");
equal(normalizeRepo(repo(7, "Voidfarer", { license: "NOASSERTION" })).license_family, "AGL-1.1", "normalize adds family");
equal(normalizeRepo(repo(8, "NotMine", { license: "MIT" })).license_family, "", "non-Aegean repo has no family");
check(factsText(normalizeRepo(repo(9, "Tally")), Date.UTC(2026, 9, 27)).includes("AL-1.1"), "facts name the family");

equal(displayDescription({ archived: true, description: "[ARCHIVED] A tiny CLI." }), "A tiny CLI.", "archived prefix trimmed for display");
equal(displayDescription({ archived: false, description: "[ARCHIVED] A tiny CLI." }), "[ARCHIVED] A tiny CLI.", "active descriptions keep their text");
equal(displayDescription({ archived: true, description: "Archived: A tiny CLI." }), "A tiny CLI.", "legacy Archived prefix trimmed too");

const privatePlan = planSync(
  [{ id: "1", name: "AIKit" }, { id: "2", name: "Cairn" }],
  [],
  { complete: true }
);
equal(privatePlan.removals.length, 1, "only the public card is removed when the live list omits both");
equal(privatePlan.removals[0].cardId, "2", "the private repo keeps its card and dossier link");

console.log(`ok ${assertions} atlas assertions`);

