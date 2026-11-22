/* Pure helpers for a local project dossier.
 * Kept separate from the DOM so the README block rules can be tested in Node.
 */

export const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

export function validRepoName(value) {
  return typeof value === "string" && REPO_NAME.test(value.trim());
}

export function findRepo(repos, name) {
  if (!Array.isArray(repos) || !validRepoName(name)) return null;
  const wanted = name.trim().toLowerCase();
  return (
    repos.find((repo) => typeof repo.name === "string" && repo.name.toLowerCase() === wanted) ||
    null
  );
}

function inline(text) {
  return String(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isBadgeLine(line) {
  return /^\s*(\[!\[|!\[|<img|<p\s+align)/i.test(line);
}

export function readmeToBlocks(markdown, { maxChars = 7000, maxLines = 160 } = {}) {
  const source = String(markdown || "").replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  if (lines[0] && lines[0].trim() === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) lines.splice(0, end + 1);
  }
  const limited = [];
  let used = 0;
  for (const line of lines) {
    if (limited.length >= maxLines || used + line.length > maxChars) break;
    limited.push(line);
    used += line.length + 1;
  }
  const blocks = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  let code = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    const text = inline(paragraph.join(" "));
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  }

  function flush() {
    flushParagraph();
    if (list) {
      if (list.items.length) blocks.push(list);
      list = null;
    }
    if (quote.length) {
      const text = inline(quote.join(" "));
      if (text) blocks.push({ type: "quote", text });
      quote = [];
    }
  }

  for (const raw of limited) {
    const line = raw.replace(/\s+$/g, "");
    if (code !== null) {
      if (/^\s*```/.test(line)) {
        blocks.push({ type: "code", text: code.join("\n").replace(/\n+$/, "") });
        code = null;
      } else {
        code.push(raw);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      code = [];
      continue;
    }
    if (isBadgeLine(line) || /^\s*\|/.test(line)) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const text = inline(heading[2]);
      if (text) {
        blocks.push({
          type: "heading",
          level: Math.min(4, heading[1].length + 1),
          text,
        });
      }
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }
    const listItem = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (listItem) {
      flushParagraph();
      if (quote.length) flush();
      const ordered = /^\d/.test(listItem[1]);
      if (!list || list.ordered !== ordered) {
        if (list) blocks.push(list);
        list = { type: "list", ordered, items: [] };
      }
      const text = inline(listItem[2]);
      if (text) list.items.push(text);
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      // A wrapped or new paragraph inside a list item: markdown indents it.
      const text = inline(line.trim());
      if (text && list.items.length) {
        list.items[list.items.length - 1] += " " + text;
      } else if (text) {
        list.items.push(text);
      }
      continue;
    }
    const quoteLine = line.match(/^\s*>\s?(.*)$/);
    if (quoteLine) {
      flushParagraph();
      if (list) {
        blocks.push(list);
        list = null;
      }
      quote.push(quoteLine[1]);
      continue;
    }
    if (!line.trim()) {
      // A blank line may sit between list items or inside one; only a
      // non-indented block after it ends the list.
      if (list) continue;
      flush();
      continue;
    }
    if (/^\s*<\/?(?:p|div|details|summary|picture|source|a|h[1-6])\b/i.test(line)) {
      flush();
      continue;
    }
    if (list) {
      blocks.push(list);
      list = null;
    }
    if (quote.length) flush();
    paragraph.push(line);
  }
  if (code !== null && code.length) blocks.push({ type: "code", text: code.join("\n").replace(/\n+$/, "") });
  flush();
  return {
    blocks,
    truncated: limited.length < lines.length,
  };
}

/* Media manifests: docs/media/<Repo>.json.
 * Every capture names the commit and date it was taken, so a screenshot never
 * silently outlives the code it claims to show. Paths are relative to docs/.
 */
export const MEDIA_SCHEMA = 2;
export const MAX_SCREENSHOTS = 12;
const MEDIA_PATH = /^media\/[A-Za-z0-9._/-]{1,160}$/;
const COMMIT = /^[0-9a-f]{7,40}$/i;
const TAKEN_AT = /^\d{4}-\d{2}-\d{2}$/;
const VIEWPORT = /^\d{2,5}x\d{2,5}$/;

export function mediaPath(value) {
  if (typeof value !== "string") return "";
  const path = value.trim();
  if (!MEDIA_PATH.test(path) || path.includes("..") || path.includes("//")) return "";
  return path;
}

export function commitRef(value) {
  if (typeof value !== "string") return "";
  const ref = value.trim();
  return COMMIT.test(ref) ? ref.slice(0, 7).toLowerCase() : "";
}

export function takenAt(value) {
  if (typeof value !== "string") return "";
  const date = value.trim().slice(0, 10);
  if (!TAKEN_AT.test(date)) return "";
  const parsed = new Date(date + "T00:00:00Z");
  return Number.isNaN(parsed.getTime()) || date !== parsed.toISOString().slice(0, 10)
    ? ""
    : date;
}

function text(value, limit = 240) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function normalizeLogo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const src = mediaPath(raw.src);
  if (!src) return null;
  return { src, alt: text(raw.alt) };
}

function normalizeScreenshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const src = mediaPath(raw.src);
  if (!src) return null;
  const caption = text(raw.caption);
  const alt = text(raw.alt) || caption;
  if (!alt) return null;
  const viewport = VIEWPORT.test(text(raw.viewport, 16)) ? text(raw.viewport, 16) : "";
  const width = Number(raw.width);
  const height = Number(raw.height);
  return {
    src,
    alt,
    caption,
    commit: commitRef(raw.commit),
    taken_at: takenAt(raw.taken_at),
    viewport,
    width: Number.isInteger(width) && width > 0 && width <= 8000 ? width : 0,
    height: Number.isInteger(height) && height > 0 && height <= 8000 ? height : 0,
  };
}

export function normalizeMedia(raw, repoName) {
  const empty = { logo: null, preview: null, screenshots: [] };
  if (!raw || typeof raw !== "object" || raw.schema !== MEDIA_SCHEMA) return empty;
  if (!validRepoName(repoName)) return empty;
  if (typeof raw.repo === "string" && raw.repo.trim().toLowerCase() !== repoName.trim().toLowerCase()) {
    return empty;
  }
  const screenshots = (Array.isArray(raw.screenshots) ? raw.screenshots : [])
    .map(normalizeScreenshot)
    .filter(Boolean)
    .slice(0, MAX_SCREENSHOTS);
  return {
    logo: normalizeLogo(raw.logo),
    preview: normalizeScreenshot(raw.preview),
    screenshots,
  };
}

/* Repositories in this list are intentionally not public. The dossier copy is
   public, so its "View repository" and README links must not lead to a 404. */
export const PRIVATE_REPOS = new Set(["AIKit"]);

export function isPrivateRepo(repo) {
  if (!repo || typeof repo !== "object") return false;
  const name = typeof repo.name === "string" ? repo.name.trim() : "";
  return PRIVATE_REPOS.has(name) || repo.private === true;
}

export function screenshotMeta(shot) {
  if (!shot || typeof shot !== "object") return "";
  return [shot.commit ? "commit " + shot.commit : "", shot.taken_at, shot.viewport]
    .filter(Boolean)
    .join(" \u00b7 ");
}
