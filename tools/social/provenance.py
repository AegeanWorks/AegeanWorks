"""Provenance stamp + sidecar + verify (re-capture / re-plot audit)."""

from __future__ import annotations

import hashlib
import json


class ProvenanceError(ValueError):
    """Raised when a visual cannot prove its run."""


def stamp(run_id: str, commit: str, data_file: str, date: str) -> str:
    """Return the provenance record string for visual metadata and sidecar (pixels stay clean)."""
    if not all((run_id, commit, data_file, date)):
        raise ProvenanceError(
            "Why: provenance needs run, commit and data file.\nFix: cite the run that produced the visual."
        )
    return f"run {run_id} · commit {commit} · {data_file} · {date}"


def sidecar(src: str, digest_value: str, run_id: str, commit: str, data_file: str, produced_at: str) -> dict:
    """Return the visual sidecar record."""
    if not all((src, digest_value, run_id, commit, data_file, produced_at)):
        raise ProvenanceError("Why: sidecar has an empty slot.\nFix: fill every provenance field.")
    return {
        "src": src,
        "digest": digest_value,
        "run": run_id,
        "commit": commit,
        "data_file": data_file,
        "produced_at": produced_at,
    }


def verify_digest(payload: bytes, expected: str) -> None:
    """Raise unless the payload digest equals the recorded digest."""
    actual = "sha256:" + hashlib.sha256(payload).hexdigest()
    if actual != expected:
        raise ProvenanceError(
            f"Why: re-render digest {actual[:19]}… != recorded {expected[:19]}…; "
            "the visual is unproven.\nFix: re-capture/re-plot from the data file."
        )


def write_sidecar(path: str, record: dict) -> str:
    """Write the sidecar JSON atomically."""
    import os
    import tempfile
    from pathlib import Path

    dest = Path(path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=str(dest.parent), prefix=".tmp_", suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(record, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return path
