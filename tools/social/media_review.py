"""Aesthetic review: no ugly visual ships through automation.

Every attached visual is pixel-checked before the browser touches it:
dimensions, aspect honesty (no stretched tiles), sharpness (edge energy),
and sane file size. A human can still post a flagged image by hand via
prepare() (the report travels in the package); automation refuses.

AI seam: register_reviewer(name, fn) adds an extra judge that runs after
the heuristics. Wire a vision model here when the owner provides the
endpoint; heuristics stay as the offline floor.
"""

from __future__ import annotations

from pathlib import Path

from .media_capture import image_size

MIN_WIDTH = 800
MIN_HEIGHT = 350
MIN_EDGE_ENERGY = 2.0
MIN_BYTES = 2 * 1024
MAX_BYTES = 8 * 1024 * 1024
MAX_ASPECT_DRIFT = 0.04

REVIEWERS: dict[str, object] = {}


class ReviewError(ValueError):
    """Raised when a visual fails aesthetic review."""


def register_reviewer(name: str, fn) -> None:
    """Add an extra judge (e.g. a vision model) run after the heuristics."""
    REVIEWERS[name] = fn


def edge_energy(raw: bytes) -> tuple[int, int, float]:
    """Mean FIND_EDGES response on a downscaled luminance copy."""
    from PIL import ImageFile, ImageFilter, ImageStat  # noqa: PLC0415 - maintenance dep

    from .media_capture import image_size as _size

    width, height = _size(raw)
    parser = ImageFile.Parser()
    parser.feed(raw)
    image = parser.close().convert("L")
    image.thumbnail((720, 720))
    energy = ImageStat.Stat(image.filter(ImageFilter.FIND_EDGES)).mean[0]
    return width, height, energy


def assert_no_distortion(src_size: tuple[int, int], dst_size: tuple[int, int]) -> None:
    """Fail when a resize stretches content (crop-to-fill instead)."""
    src_ratio = src_size[0] / src_size[1]
    dst_ratio = dst_size[0] / dst_size[1]
    drift = abs(src_ratio - dst_ratio) / src_ratio
    if drift > MAX_ASPECT_DRIFT:
        raise ReviewError(
            f"Why: resize would stretch {src_size} into {dst_size} (drift {drift:.2%}).\n"
            "Fix: crop-to-fill, never stretch."
        )


def review_bytes(raw: bytes, kind: str = "photo") -> dict:
    """Review pixels; return the report or raise ReviewError."""
    if len(raw) < MIN_BYTES:
        raise ReviewError(
            f"Why: visual is only {len(raw)} bytes; likely a placeholder or broken render.\n"
            "Fix: re-render at full quality."
        )
    if len(raw) > MAX_BYTES:
        raise ReviewError(
            f"Why: visual is {len(raw) // 1024} KB; X will recompress it into mush.\n"
            "Fix: export under 8 MB."
        )
    try:
        width, height, energy = edge_energy(raw)
    except Exception as error:
        raise ReviewError(
            f"Why: visual is not raster-reviewable ({error}); SVGs cannot be pixel-checked.\n"
            "Fix: rasterize first, then review."
        ) from error
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        raise ReviewError(
            f"Why: visual is {width}x{height}; below the {MIN_WIDTH}x{MIN_HEIGHT} floor, "
            "text turns to mush on timelines.\nFix: render bigger."
        )
    if energy < MIN_EDGE_ENERGY:
        raise ReviewError(
            f"Why: edge energy {energy:.2f} < {MIN_EDGE_ENERGY}; the visual reads as blurry or flat.\n"
            "Fix: re-shoot/re-render sharper."
        )
    report: dict = {"width": width, "height": height, "bytes": len(raw),
                     "edge_energy": round(energy, 2), "kind": kind, "aesthetic": "pass"}
    for name, fn in REVIEWERS.items():
        verdict = fn(raw, kind)
        if verdict:
            report[f"reviewer:{name}"] = verdict
    return report


def review_file(path: str | Path) -> dict:
    """Review a visual file by path."""
    return review_bytes(Path(path).read_bytes())
