"""Disclosure copy loader + marker application (un-droppable by construction).

Copy lives in data/disclosure.json so it is reviewed like code.
publish() asserts marker presence; tests pin the exact strings.
"""

from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data" / "disclosure.json"


def load_disclosure() -> dict:
    """Read the reviewed disclosure copy."""
    return json.loads(DATA.read_text(encoding="utf-8"))


def bio_text() -> str:
    """Exact X bio stating AI operation."""
    return load_disclosure()["bio"]


def site_notice() -> str:
    """Exact website AI-run notice."""
    return load_disclosure()["site_notice"]


def post_marker() -> str:
    """Consistent per-post automation marker."""
    return load_disclosure()["post_marker"]


def ai_mark() -> str:
    """Made-by-AI mark burned into generated infographics."""
    return load_disclosure()["infographic_ai_mark"]


def apply_marker(text: str) -> str:
    """Append the automation marker unless already present."""
    marker = post_marker()
    if marker in text:
        return text
    return text.rstrip() + "\n\n" + marker


def has_marker(text: str) -> bool:
    """True when the automation marker is present."""
    return post_marker() in text
