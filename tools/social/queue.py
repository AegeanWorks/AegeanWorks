"""File-backed draft queue. Drafts are unapproved by default; approval is explicit."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


class QueueError(ValueError):
    """Raised for unknown drafts or bad approvals."""


def _state_dir(state_dir: str | Path | None) -> Path:
    return Path(state_dir) if state_dir else Path(__file__).resolve().parent / "state"


def _path(state_dir) -> Path:
    return _state_dir(state_dir) / "queue.json"


def _read(state_dir) -> dict:
    path = _path(state_dir)
    if not path.is_file():
        return {"drafts": []}
    return json.loads(path.read_text(encoding="utf-8"))


def _write(state_dir, data: dict) -> None:
    dest = _path(state_dir)
    dest.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=str(dest.parent), prefix=".tmp_", suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(data, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, dest)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def add_draft(draft: dict, state_dir: str | Path | None = None) -> dict:
    """Store a draft as unapproved and return it with its id."""
    data = _read(state_dir)
    digest = hashlib.sha256(
        json.dumps(draft, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()[:16]
    record = {
        "id": f"draft-{digest}",
        "draft": draft,
        "approved": False,
        "approver": "",
        "approved_at": "",
        "receipt": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if not any(d["id"] == record["id"] for d in data["drafts"]):
        data["drafts"].append(record)
        _write(state_dir, data)
    return record


def approve(draft_id: str, approver: str, state_dir: str | Path | None = None) -> dict:
    """Mark a draft human-approved; approver name is required."""
    if not approver or not approver.strip():
        raise QueueError("Why: approval needs a named human approver.\nFix: pass approver=<name>.")
    data = _read(state_dir)
    for record in data["drafts"]:
        if record["id"] == draft_id:
            record["approved"] = True
            record["approver"] = approver.strip()
            record["approved_at"] = datetime.now(timezone.utc).isoformat()
            _write(state_dir, data)
            return record
    raise QueueError(f"Why: unknown draft {draft_id}.\nFix: add the draft first.")


def get(draft_id: str, state_dir: str | Path | None = None) -> dict:
    """Return one draft record or raise."""
    for record in _read(state_dir)["drafts"]:
        if record["id"] == draft_id:
            return record
    raise QueueError(f"Why: unknown draft {draft_id}.\nFix: add the draft first.")


def require_approval(record: dict) -> dict:
    """Raise unless the record carries explicit human approval."""
    if not record.get("approved") or not record.get("approver") or not record.get("approved_at"):
        raise QueueError(
            "Why: no explicit human approval on this draft; drafting is automation, "
            "publishing is a decision.\nFix: run queue.approve with a named approver."
        )
    return record
