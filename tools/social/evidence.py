"""Verified-state gate: every post traces to a verified repo state.

A claim needs a suite result, a commit SHA and an in-repo data file.
Numbers additionally need the measured series file + row count.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMMIT = re.compile(r"^[0-9a-f]{7,40}$")


class UnverifiedError(ValueError):
    """Raised when evidence does not support a post."""


def check_commit(commit: str) -> str:
    """Validate a 7-40 hex commit SHA."""
    if not isinstance(commit, str) or not COMMIT.fullmatch(commit):
        raise UnverifiedError(
            f"Why: commit {commit!r} is not a 7-40 hex SHA.\n"
            "Fix: cite the commit the run was measured at."
        )
    return commit


def check_data_file(relative: str) -> str:
    """Validate that the cited data file exists inside the repo."""
    if not relative or ".." in relative or relative.startswith(("/", "\\")):
        raise UnverifiedError(f"Why: data file {relative!r} is unsafe.\nFix: cite an in-repo path.")
    target = ROOT / relative
    if not target.is_file():
        raise UnverifiedError(
            f"Why: data file {relative!r} does not exist in the repo.\n"
            "Fix: ingest the measurement first, or drop the numeric claim."
        )
    return relative


def require_evidence(repo: str, commit: str, data_file: str, suite_ok: bool) -> dict:
    """Return the evidence record or raise UnverifiedError."""
    from .topic_gate import require_on_topic

    require_on_topic(repo)
    check_commit(commit)
    check_data_file(data_file)
    if not suite_ok:
        raise UnverifiedError(
            f"Why: suite is not green for {repo} at {commit}.\n"
            "Fix: run the suite and cite the green run."
        )
    return {"repo": repo.strip(), "commit": commit, "data_file": data_file, "suite_ok": True}
