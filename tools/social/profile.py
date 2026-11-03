"""Profile maintenance: bio + site-notice proposals, approval-gated like posts."""

from __future__ import annotations

from . import disclosure, queue


def propose_bio() -> dict:
    """Return the reviewed bio proposal (apply on X by hand)."""
    return {"bio": disclosure.bio_text(), "approved": False}


def propose_site_notice() -> dict:
    """Return the reviewed site-notice proposal (applied to the shared footer)."""
    return {"notice": disclosure.site_notice(), "approved": False}


def apply_profile_change(change: str, record: dict) -> dict:
    """Apply a bio/site-notice change only with explicit human approval."""
    queue.require_approval(record)
    if change == "bio":
        return {"applied": "bio", "bio": disclosure.bio_text(), "by": record["approver"]}
    if change == "site-notice":
        return {"applied": "site-notice", "notice": disclosure.site_notice(), "by": record["approver"]}
    raise ValueError(f"Why: unknown profile change {change!r}.\nFix: use bio or site-notice.")
