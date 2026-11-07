"""Draft builder: the single choke point (topic -> evidence -> media -> marker -> spam)."""

from __future__ import annotations

from . import disclosure, evidence, provenance, published, queue, spam_guard
from .topic_gate import require_on_topic

RULES = (
    "R1: every post is about one catalogue work (topic gate).",
    "R2: every post traces to a verified state (evidence gate).",
    "R3: every visible/measured subject ships a reviewed visual with provenance.",
    "R4: no naked name-drops: a post that mentions a project says what it "
    "is first (explainer gate — cold audiences have never heard of it).",
    "R5: no post publishes without explicit human approval.",
    "R6: UI works ship the banner first, then 1-3 fresh screenshots from the running project.",
    "R7: every published post gets one bare-URL link-reply; provenance lives in receipts and sidecars, never in post or reply text.",
    "R8: screenshot drops are follow-ups only: bare caption plus fresh captures (never dossier cards), "
    "allowed solely for projects that already have a live post.",
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


def require_posted_first(repo: str, state_dir) -> str:
    """Enforce R8: screenshot drops only build on an already-posted project."""
    from . import published as _published

    if not _published.has_repo_post(state_dir, repo):
        raise DraftError(
            f"Why: {repo} has no live post yet; a screenshot drop with no intro post confuses cold followers.\n"
            "Fix: publish the explainer post first, then drop screenshots."
        )
    return repo


def require_shots_caption(text: str, name: str, visual: dict) -> int:
    """Enforce the drop caption: singular for one shot, plural for 2-3."""
    total = (1 if (visual or {}).get("src") else 0) + len((visual or {}).get("extra_srcs", []) or [])
    if not total or total > 3:
        raise DraftError(
            f"Why: a screenshot drop carries 1-3 shots, not {total}.\nFix: attach one, two or three reviewed shots."
        )
    if total == 1:
        want = f"Here is a screenshot from {name}."
    else:
        want = f"Here are some screenshots from {name}."
    if _squash(text) != _squash(want):
        raise DraftError(
            "Why: a screenshot drop says exactly '{0}'.\nFix: use the canonical caption for {1} shot(s).".format(want, total)
        )
    return total


def require_fresh_shots(repo: str, visual: dict) -> None:
    """Enforce that shots are captures, not dossier cards passed off as screenshots."""
    from pathlib import Path as _Path

    manifest_path = _Path(__file__).resolve().parents[2] / "docs" / "media" / f"{repo}.json"
    if not manifest_path.is_file():
        return
    try:
        import json as _json

        manifest = _json.loads(manifest_path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return
    banned = set()
    for key in ("preview", "logo", "social_card"):
        entry = manifest.get(key)
        if isinstance(entry, dict) and entry.get("src"):
            banned.add(str(entry["src"]).lower())
    used = [str((visual or {}).get("src", "") or "").lower()] + [
        str(s or "").lower() for s in ((visual or {}).get("extra_srcs") or [])
    ]
    for src in used:
        if not src:
            continue
        if src in banned or _Path(src).name.lower() in {b.split("/")[-1] for b in banned}:
            raise DraftError(
                "Why: a dossier card is marketing art, not a screenshot; passing one off as a shot "
                "breaks the visual-proof promise.\nFix: capture the running project (or art) fresh instead."
            )


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
    if kind not in ("screenshot", "chart", "infographic", "notice", "shots"):
        raise DraftError(f"Why: unknown post kind {kind!r}.\nFix: use screenshot, chart, infographic, notice or shots.")
    if len(text) > 280:
        raise DraftError(
            f"Why: post is {len(text)} chars; X fits 280.\nFix: shorten to two to four short sentences."
        )
    subject = require_on_topic(repo)
    if kind in ("screenshot", "chart", "infographic"):
        require_explainer(text, explainer)
    if kind == "shots":
        require_posted_first(subject, state_dir)
        require_shots_caption(text, subject, visual)
        require_fresh_shots(subject, visual)
    record = evidence.require_evidence(subject, commit, data_file, suite_ok)
    if kind in ("screenshot", "chart", "infographic", "shots"):
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
