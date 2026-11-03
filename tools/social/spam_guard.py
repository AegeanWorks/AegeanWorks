"""Spam guards: cadence caps, exact-hash duplicates, similarity near-dupes."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone

DATA = __import__("pathlib").Path(__file__).resolve().parent / "data" / "cadence.json"


def load_cadence() -> dict:
    """Read the reviewed cadence rules."""
    return json.loads(DATA.read_text(encoding="utf-8"))


def normalize(text: str) -> str:
    """Lowercase, strip the automation marker, collapse whitespace."""
    text = re.sub(r"🤖.*$", "", text, flags=re.S)
    text = re.sub(r"\s+", " ", text.lower()).strip()
    return text


def content_hash(text: str) -> str:
    """Exact-duplicate identity (marker-insensitive)."""
    return "sha256:" + hashlib.sha256(normalize(text).encode("utf-8")).hexdigest()


def _tokens(text: str) -> set[str]:
    return set(normalize(text).split())


def jaccard(left: str, right: str) -> float:
    """Token Jaccard similarity in [0, 1]."""
    a, b = _tokens(left), _tokens(right)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def levenshtein_ratio(left: str, right: str) -> float:
    """Normalized similarity from edit distance (bounded inputs only)."""
    a, b = normalize(left), normalize(right)
    if not a or not b:
        return 0.0
    if len(a) > 2000 or len(b) > 2000:
        return jaccard(left, right)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            curr.append(min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = curr
    return 1.0 - prev[len(b)] / max(len(a), len(b))


def is_near_duplicate(left: str, right: str, rules: dict | None = None) -> bool:
    """True when a rephrased repost would slip past exact hashing."""
    rules = rules or load_cadence()
    return (
        jaccard(left, right) >= float(rules["near_duplicate_jaccard"])
        or levenshtein_ratio(left, right) >= float(rules["near_duplicate_levenshtein"])
    )


def cadence_ok(published_at: list[str], now: str, rules: dict | None = None) -> tuple[bool, str]:
    """Enforce max/day, min gap, quiet hours and max/week."""
    rules = rules or load_cadence()
    moment = datetime.fromisoformat(now)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    start, end = rules["quiet_hours_utc"]
    if start <= moment.hour < end:
        return False, "quiet hours"
    stamps = sorted(datetime.fromisoformat(s) for s in published_at)
    day = [s for s in stamps if (moment - s).total_seconds() < 86400]
    if len(day) >= int(rules["max_posts_per_day"]):
        return False, "daily cap reached"
    week = [s for s in stamps if (moment - s).total_seconds() < 7 * 86400]
    if len(week) >= int(rules["max_posts_per_week"]):
        return False, "weekly cap reached"
    if stamps and (moment - stamps[-1]).total_seconds() < float(rules["min_gap_hours"]) * 3600:
        return False, "minimum gap not met"
    return True, "ok"
