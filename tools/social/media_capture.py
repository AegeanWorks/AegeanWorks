"""Fresh screenshot capture with ingest-equivalent provenance semantics.

Mirrors tools/build_dossier_media.py: every capture records the commit it
shows, the date, the viewport and a SHA-256 digest. Recycled screenshots
(same bytes claimed for a different commit) are refused.
"""

from __future__ import annotations

import hashlib
import re
import struct
from datetime import datetime, timezone
from pathlib import Path

COMMIT = re.compile(r"^[0-9a-f]{7,40}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class CaptureError(ValueError):
    """Raised when a capture cannot prove what it shows."""


def digest(data: bytes) -> str:
    """SHA-256 digest in the house format."""
    return "sha256:" + hashlib.sha256(data).hexdigest()


def image_size(data: bytes) -> tuple[int, int]:
    """Return (width, height) for PNG/JPEG/WebP without decoding pixels."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:2] == b"\xff\xd8":
        index = 2
        while index + 9 < len(data):
            if data[index] != 0xFF:
                index += 1
                continue
            marker = data[index + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                height, width = struct.unpack(">HH", data[index + 5:index + 9])
                return width, height
            index += 2 + struct.unpack(">H", data[index + 2:index + 4])[0]
        raise CaptureError("Why: JPEG has no frame header.\nFix: re-shoot the capture.")
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        chunk = data[12:16]
        if chunk == b"VP8X":
            w = int.from_bytes(data[24:27], "little") + 1
            h = int.from_bytes(data[27:30], "little") + 1
            return w, h
        if chunk == b"VP8 ":
            return int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF
    raise CaptureError("Why: unrecognised image bytes.\nFix: capture PNG, JPEG or WebP.")


def record_capture(
    raw: bytes,
    repo: str,
    commit: str,
    viewport: str = "1440x900",
    known_digests: dict[str, str] | None = None,
    taken_at: str = "",
) -> dict:
    """Validate raw pixels and return the capture manifest entry (no file I/O)."""
    if not COMMIT.fullmatch(commit or ""):
        raise CaptureError("Why: capture commit is not a 7-40 hex SHA.\nFix: pass the commit the screen shows.")
    date = taken_at or datetime.now(timezone.utc).date().isoformat()
    if not DATE.fullmatch(date):
        raise CaptureError("Why: taken_at is not YYYY-MM-DD.\nFix: pass the capture date.")
    width, height = image_size(raw)
    entry_digest = digest(raw)
    for other_commit, other_digest in (known_digests or {}).items():
        if other_digest == entry_digest and other_commit != commit:
            raise CaptureError(
                "Why: these exact pixels are already claimed for another commit; "
                "recycled screenshots are forbidden.\nFix: re-shoot from the running project."
            )
    return {
        "repo": repo,
        "src": "",
        "alt": f"{repo} screenshot",
        "commit": commit,
        "taken_at": date,
        "viewport": viewport,
        "width": width,
        "height": height,
        "digest": entry_digest,
    }


def save_capture(raw: bytes, dest: Path, entry: dict) -> dict:
    """Write pixels atomically and fill in src; mirrors the house writer."""
    import os
    import tempfile

    dest.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=str(dest.parent), prefix=".tmp_", suffix=dest.suffix or ".bin")
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, dest)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    entry = dict(entry)
    entry["src"] = str(dest)
    if entry["digest"] != digest(raw):
        raise CaptureError("Why: digest mismatch after write.\nFix: retry the capture.")
    return entry
