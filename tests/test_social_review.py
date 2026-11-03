"""Tests for the aesthetic review gate (tools/social/media_review.py).

Proves automation refuses ugly visuals: stretched tiles, tiny renders,
blur. A pluggable reviewer seam carries future AI judges.
"""

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from social import browser_post, draft, media_review, queue  # noqa: E402

COMMIT = "ea26791d52722e78af0a87b25d3268e72d52836"
RUN = "run-2026-11-03-review"
DATE = "2026-11-03"
DATA_FILE = "docs/live.json"


def make_png(path: Path, width: int = 1200, height: int = 630, blur: bool = False) -> Path:
    from PIL import Image, ImageDraw, ImageFilter  # noqa: PLC0415

    image = Image.new("RGB", (width, height), (4, 6, 12))
    draw = ImageDraw.Draw(image)
    for y in range(40, height - 40, 24):
        draw.rectangle([40, y, width - 40, y + 10], fill=(103, 232, 249))
        draw.rectangle([40, y + 14, width - 120, y + 18], fill=(232, 240, 252))
    if blur:
        image = image.filter(ImageFilter.GaussianBlur(8))
    image.save(path, format="PNG")
    return path


class FakePage:
    def __init__(self) -> None:
        self.calls: list = []

    def goto(self, url: str) -> None:
        self.calls.append(("goto", url))

    def fill_composer(self, text: str) -> str:
        return text

    def attach_media(self, paths: list[str]) -> list[str]:
        self.calls.append(("attach", list(paths)))
        return [Path(path).name for path in paths]

    def click_post(self) -> None:
        self.calls.append(("click",))

    def confirm_posted(self) -> bool:
        return True


def visual_for(src: Path) -> dict:
    return {"digest": "sha256:" + "d" * 64, "run": RUN, "commit": COMMIT,
            "data_file": DATA_FILE, "src": str(src)}


class ReviewTests(unittest.TestCase):
    def test_sharp_passes(self):
        with tempfile.TemporaryDirectory() as temp:
            raw = make_png(Path(temp) / "good.png").read_bytes()
            report = media_review.review_bytes(raw)
            self.assertEqual(report["aesthetic"], "pass")
            self.assertGreaterEqual(report["edge_energy"], media_review.MIN_EDGE_ENERGY)

    def test_blurry_blocked(self):
        with tempfile.TemporaryDirectory() as temp:
            raw = make_png(Path(temp) / "blur.png", blur=True).read_bytes()
            with self.assertRaises(media_review.ReviewError):
                media_review.review_bytes(raw)

    def test_tiny_blocked(self):
        with tempfile.TemporaryDirectory() as temp:
            raw = make_png(Path(temp) / "tiny.png", width=200, height=150).read_bytes()
            with self.assertRaises(media_review.ReviewError):
                media_review.review_bytes(raw)

    def test_non_raster_blocked(self):
        with self.assertRaises(media_review.ReviewError):
            media_review.review_bytes(b"<svg>" + b" " * (11 * 1024) + b"</svg>")

    def test_distortion_blocked(self):
        with self.assertRaises(media_review.ReviewError):
            media_review.assert_no_distortion((1200, 630), (588, 248))

    def test_proportional_ok(self):
        media_review.assert_no_distortion((1200, 630), (600, 315))

    def test_pluggable_reviewer(self):
        media_review.register_reviewer("test-judge", lambda raw, kind: "needs more contrast")
        try:
            with tempfile.TemporaryDirectory() as temp:
                raw = make_png(Path(temp) / "good.png").read_bytes()
                report = media_review.review_bytes(raw)
                self.assertEqual(report["reviewer:test-judge"], "needs more contrast")
        finally:
            del media_review.REVIEWERS["test-judge"]


class DriveReviewTests(unittest.TestCase):
    def test_drive_blocks_ugly_attachment(self):
        with tempfile.TemporaryDirectory() as state, tempfile.TemporaryDirectory() as temp:
            bad = make_png(Path(temp) / "bad.png", blur=True)
            record = draft.build_post("AIKit", "look", "screenshot", COMMIT, DATA_FILE, True,
                                      visual_for(bad), RUN, DATE, state)
            queue.approve(record["id"], "owner", state)
            page = FakePage()
            with self.assertRaises(media_review.ReviewError):
                browser_post.drive(page, record["id"], state)
            self.assertNotIn(("click",), page.calls)
            self.assertFalse(any(call[0] == "attach" for call in page.calls))

    def test_drive_attaches_reviewed_visual(self):
        with tempfile.TemporaryDirectory() as state, tempfile.TemporaryDirectory() as temp:
            good = make_png(Path(temp) / "good.png")
            record = draft.build_post("AIKit", "look", "screenshot", COMMIT, DATA_FILE, True,
                                      visual_for(good), RUN, DATE, state)
            queue.approve(record["id"], "owner", state)
            page = FakePage()
            result = browser_post.drive(page, record["id"], state)
            self.assertTrue(result["composed"])
            self.assertFalse(result["clicked"])
            self.assertEqual(result["media_attached"], ["good.png"])


if __name__ == "__main__":
    unittest.main()
