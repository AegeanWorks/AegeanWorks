"""Draft builder: the single choke point (topic -> evidence -> media -> marker -> spam)."""

from __future__ import annotations

from . import disclosure, evidence, provenance, queue, spam_guard
from .topic_gate import require_on_topic

RULES = (
    "R1: every post is about one catalogue work (topic gate).",
    "R2: every post traces to a verified state (evidence gate).",
    "R3: every visible/measured subject ships a reviewed visual with provenance.",
    "R4: no naked name-drops: a post that mentions a project explains what it "
    "is first (explainer gate — cold audiences have never heard of it).",
    "R5: no post publishes without explicit human approval.",
)


class DraftError(ValueError):
    """Raised when a draft cannot be built."""


def _squash(text: str) -> str:
    import re  # noqa: PLC0415 - tiny local normalizer

    return re.sub(r"\s+", " ", text.lower()).strip()


def require_explainer(text: str, explainer: str | None) -> str:
    """Enforce R4: the post must say what the project is, in its own words."""
    if not explainer or not explainer.strip():
        raise DraftError(
            "Why: the post names a project but never says what it is; cold audiences bounce.\n"
            "Fix: pass explainer=<one or two sentences a stranger would understand>."
        )
    if _squash(explainer) not in _squash(text):
        raise DraftError(
            "Why: the explainer is missing from the post text; the gate checks words, not intent.\n"
            "Fix: include the explainer verbatim in the post."
        )
    return explainer.strip()


def build_post(
    repo: str,
    text: str,
    kind: str,
    commit: str,
    data_file: str,
    suite_ok: bool,
    visual: dict | None,
    run_id: str,
    date: str,
    state_dir=None,
    existing_texts: list[str] | None = None,
    explainer: str | None = None,
) -> dict:
    """Build, gate and queue a draft; returns the queue record (unapproved)."""
    if kind not in ("screenshot", "chart", "infographic", "notice"):
        raise DraftError(f"Why: unknown post kind {kind!r}.\nFix: use screenshot, chart, infographic or notice.")
    if len(text) > 280:
        raise DraftError(
            f"Why: post is {len(text)} chars; X fits 280.\nFix: shorten to two to four short sentences."
        )
    subject = require_on_topic(repo)
    if kind in ("screenshot", "chart", "infographic"):
        require_explainer(text, explainer)
    record = evidence.require_evidence(subject, commit, data_file, suite_ok)
    if kind in ("screenshot", "chart", "infographic"):
        if not visual:
            raise DraftError(
                "Why: a visible or measured subject needs a visual; text-only is blocked.\n"
                "Fix: attach a screenshot, chart or infographic."
            )
        if not visual.get("digest") or not visual.get("run") or not visual.get("commit") or not visual.get("data_file"):
            raise DraftError(
                "Why: visual ships without provenance (no run, commit or data file).\n"
                "Fix: stamp every visual with run, commit and data file."
            )
        provenance.stamp(visual["run"], visual["commit"], visual["data_file"], date)
    marked = disclosure.apply_marker(text)
    if not disclosure.has_marker(marked):
        raise DraftError("Why: disclosure marker could not be applied.\nFix: keep the automation marker.")
    digest = spam_guard.content_hash(marked)
    for other in existing_texts or []:
        if spam_guard.content_hash(other) == digest:
            raise DraftError("Why: exact duplicate of a shipped post.\nFix: write a new post.")
        if spam_guard.is_near_duplicate(marked, other):
            raise DraftError("Why: near-duplicate of a shipped post.\nFix: wait for new evidence before posting.")
    draft = {
        "repo": subject,
        "text": marked,
        "kind": kind,
        "evidence": record,
        "visual": visual,
        "hash": digest,
        "run_id": run_id,
        "date": date,
    }
    return queue.add_draft(draft, state_dir)
