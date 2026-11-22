"""Generate docs/sitemap.xml from the static pages and project catalogue.

Run after the catalogue changes so every public dossier is discoverable:
    python tools/build_sitemap.py
"""

from __future__ import annotations

import json
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://aegeanworks.github.io/AegeanWorks/"
STATIC = (
    ("", "2026-10-27", "monthly", "1.0"),
    ("editor.html", "2026-10-30", "monthly", "0.9"),
    ("play.html", "2026-10-29", "weekly", "0.8"),
    ("verify.html", "2026-10-27", "monthly", "0.7"),
    ("security.html", "2026-10-27", "monthly", "0.6"),
    ("privacy.html", "2026-10-27", "monthly", "0.6"),
    ("accessibility.html", "2026-10-27", "monthly", "0.6"),
)


def url_entry(loc: str, lastmod: str, frequency: str, priority: str) -> str:
    return (
        "  <url>\n"
        f"    <loc>{escape(loc)}</loc>\n"
        f"    <lastmod>{escape(lastmod)}</lastmod>\n"
        f"    <changefreq>{frequency}</changefreq>\n"
        f"    <priority>{priority}</priority>\n"
        "  </url>"
    )


def main() -> int:
    catalogue = json.loads((ROOT / "tests/metadata/repositories.json").read_text(encoding="utf-8"))
    entries = [url_entry(BASE + path, lastmod, frequency, priority)
               for path, lastmod, frequency, priority in STATIC]
    for repo in catalogue["repositories"]:
        lastmod = str(repo.get("pushed_at") or "")[:10] or "2026-11-22"
        entries.append(url_entry(
            BASE + "project.html?repo=" + str(repo["name"]),
            lastmod, "monthly", "0.6",
        ))
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries) + "\n</urlset>\n"
    )
    (ROOT / "docs/sitemap.xml").write_text(xml, encoding="utf-8", newline="\n")
    print(f"sitemap: {len(entries)} URLs ({len(catalogue['repositories'])} dossiers)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
