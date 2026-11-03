"""On-topic gate: a post is publishable only if it is about an AegeanWorks work.

The allowlist is derived at runtime from tests/metadata/repositories.json
(the pinned GitHub snapshot). A test asserts it stays equal to
test_profile.PUBLIC_REPOS, so there is no third list to drift.
Every entry path (draft, queue, publish, profile) calls require_on_topic.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
METADATA = ROOT / "tests" / "metadata" / "repositories.json"


class OffTopicError(ValueError):
    """Raised when a subject is not an AegeanWorks work."""


def load_works() -> set[str]:
    """Return the lower-cased set of catalogue repository names."""
    data = json.loads(METADATA.read_text(encoding="utf-8"))
    return {str(repo["name"]).lower() for repo in data.get("repositories", []) if repo.get("name")}


def is_on_topic(subject: str) -> bool:
    """True when the subject names an AegeanWorks work (case-insensitive)."""
    if not subject or not subject.strip():
        return False
    return subject.strip().lower() in load_works()


def require_on_topic(subject: str) -> str:
    """Return the canonical subject or raise OffTopicError."""
    if not is_on_topic(subject):
        raise OffTopicError(
            f"Why: {subject!r} is not an AegeanWorks work; only catalogue projects "
            "may be posted about.\nFix: choose a repository from "
            "tests/metadata/repositories.json."
        )
    return subject.strip()
