"""Posted-post log: which repos already have a live post.

Grounds follow-up formats (screenshot drops are only for posted projects).
Stored in the gitignored queue state dir; append-only, idempotent per draft.
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def _path(state_dir) -> Path:
    root = Path(state_dir) if state_dir else Path(__file__).resolve().parent / "state"
    return root / "published.json"


def _read(state_dir) -> dict:
    path = _path(state_dir)
    if not path.is_file():
        return {"posts": []}
    return json.loads(path.read_text(encoding="utf-8"))


def _write(state_dir, data: dict) -> None:
    dest = _path(state_dir)
    dest.parent.mkdir(parents=True, exist_ok=True)
    handle, tmp = tempfile.mkstemp(dir=str(dest.parent), prefix=".tmp_", suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(data, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, str(dest))
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def record(state_dir, draft_id: str, repo: str, text: str, kind: str) -> dict:
    """Record a posted tweet; idempotent per draft id."""
    data = _read(state_dir)
    for entry in data["posts"]:
        if entry["draft_id"] == draft_id:
            return entry
    entry = {
        "draft_id": draft_id,
        "repo": repo.strip(),
        "text": text,
        "kind": kind,
        "posted_at": datetime.now(timezone.utc).isoformat(),
    }
    data["posts"].append(entry)
    _write(state_dir, data)
    return entry


def has_repo_post(state_dir, repo: str) -> bool:
    """True when the repo already has at least one recorded live post."""
    if not repo:
        return False
    wanted = repo.strip().lower()
    return any(entry.get("repo", "").lower() == wanted for entry in _read(state_dir)["posts"])
