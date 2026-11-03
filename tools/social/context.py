"""Post context built only from in-repo sources (atlas, dossiers, live builds)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _read_json(relative: str) -> dict | list | None:
    target = ROOT / relative
    if not target.is_file():
        return None
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def load_context(repo: str) -> dict:
    """Assemble the verified context for a repo; raises on off-topic."""
    from .topic_gate import require_on_topic

    subject = require_on_topic(repo)
    wanted = subject.lower()
    snapshot = _read_json("docs/atlas-snapshot.json") or {}
    repos = snapshot.get("repositories", []) if isinstance(snapshot, dict) else []
    meta = next((r for r in repos if str(r.get("name", "")).lower() == wanted), {"name": subject})
    media = _read_json(f"docs/media/{meta.get('name', subject)}.json")
    if media is None:
        for candidate in (ROOT / "docs" / "media").glob("*.json"):
            if candidate.stem.lower() == wanted:
                media = json.loads(candidate.read_text(encoding="utf-8"))
                break
    live = _read_json("docs/live.json") or {}
    apps = live.get("apps", []) if isinstance(live, dict) else []
    live_entry = next((a for a in apps if str(a.get("source_url", "")).lower().endswith("/" + wanted)), None)
    return {"repo": meta.get("name", subject), "meta": meta, "media": media, "live": live_entry}
