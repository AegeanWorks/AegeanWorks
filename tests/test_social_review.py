"""Tests for the aesthetic review gate (tools/social/media_review.py).

Proves automation refuses ugly visuals: stretched tiles, tiny renders,
blur. A pluggable reviewer seam carries future AI judges.
"""

import base64
import io
import json
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from social import browser_post, draft, media_review, meta_image, queue  # noqa: E402

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
    def __init__(self, confirmed: bool = True) -> None:
        self.calls: list = []
        self.confirmed = confirmed

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
        self.calls.append(("confirm",))
        return self.confirmed


class FakeHTTPResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


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

    def test_duplicate_bytes_rejected(self):
        import shutil  # noqa: PLC0415 - test fixture copy

        with tempfile.TemporaryDirectory() as temp:
            first = make_png(Path(temp) / "one.png")
            shutil.copyfile(first, Path(temp) / "one_copy.png")
            with self.assertRaises(media_review.ReviewError):
                media_review.assert_no_duplicates([str(first), str(Path(temp) / "one_copy.png")])
            other = make_png(Path(temp) / "other.png", width=1000)
            media_review.assert_no_duplicates([str(first), str(other)])

    def test_pluggable_reviewer(self):
        media_review.register_reviewer("test-judge", lambda raw, kind: "needs more contrast")
        try:
            with tempfile.TemporaryDirectory() as temp:
                raw = make_png(Path(temp) / "good.png").read_bytes()
                report = media_review.review_bytes(raw)
                self.assertEqual(report["reviewer:test-judge"], "needs more contrast")
        finally:
            del media_review.REVIEWERS["test-judge"]


EXPLAINER = "AIKit is crash-resilient governance for AI coding agents."
EXPLAINED_LOOK = EXPLAINER + " Look."


class DriveReviewTests(unittest.TestCase):
    def setUp(self):
        import os as _os

        self._saved_key = _os.environ.pop("MODEL_API_KEY", None)

    def tearDown(self):
        import os as _os

        if self._saved_key is not None:
            _os.environ["MODEL_API_KEY"] = self._saved_key

    def test_drive_blocks_ugly_attachment(self):
        with tempfile.TemporaryDirectory() as state, tempfile.TemporaryDirectory() as temp:
            bad = make_png(Path(temp) / "bad.png", blur=True)
            record = draft.build_post("AIKit", EXPLAINED_LOOK, "screenshot", COMMIT, DATA_FILE, True,
                                      visual_for(bad), RUN, DATE, state, explainer=EXPLAINER)
            queue.approve(record["id"], "owner", state)
            page = FakePage()
            with self.assertRaises(media_review.ReviewError):
                browser_post.drive(page, record["id"], state)
            self.assertNotIn(("click",), page.calls)
            self.assertFalse(any(call[0] == "attach" for call in page.calls))

    def test_drive_attaches_reviewed_visual(self):
        with tempfile.TemporaryDirectory() as state, tempfile.TemporaryDirectory() as temp:
            good = make_png(Path(temp) / "good.png")
            record = draft.build_post("AIKit", EXPLAINED_LOOK, "screenshot", COMMIT, DATA_FILE, True,
                                      visual_for(good), RUN, DATE, state, explainer=EXPLAINER)
            queue.approve(record["id"], "owner", state)
            page = FakePage()
            result = browser_post.drive(page, record["id"], state)
            self.assertTrue(result["composed"])
            self.assertFalse(result["clicked"])
            self.assertEqual(result["media_attached"], ["good.png"])


class MetaImageTests(unittest.TestCase):
    def test_key_required(self):
        backup = __import__("os").environ.pop("MODEL_API_KEY", None)
        try:
            with self.assertRaises(meta_image.MetaImageError):
                meta_image.generate_image("a fox")
            with self.assertRaises(meta_image.MetaImageError):
                meta_image.ai_review(b"bytes")
        finally:
            if backup is not None:
                __import__("os").environ.update({"MODEL_API_KEY": backup})

    def test_unauthorized_maps_to_key_error(self):
        __import__("os").environ.update({"MODEL_API_KEY": "TEST_ONLY_KEY"})
        original = urllib.request.urlopen
        fp = io.BytesIO(b"{}")

        def fake_401(*args, **kwargs):
            raise urllib.error.HTTPError("http://x", 401, "bad", {}, fp)

        urllib.request.urlopen = fake_401
        try:
            with self.assertRaises(meta_image.MetaImageError) as ctx:
                meta_image.generate_image("a fox")
            self.assertIn("key", str(ctx.exception).lower())
        finally:
            urllib.request.urlopen = original
            __import__("os").environ.pop("MODEL_API_KEY", None)

    def test_generate_decodes_payload(self):
        __import__("os").environ.update({"MODEL_API_KEY": "TEST_ONLY_KEY"})
        original = urllib.request.urlopen
        payload = {"data": [{"b64_json": base64.b64encode(b"PNGDATA").decode()}]}

        def fake_ok(*args, **kwargs):
            return FakeHTTPResponse(payload)

        urllib.request.urlopen = fake_ok
        try:
            self.assertEqual(meta_image.generate_image("a fox"), b"PNGDATA")
        finally:
            urllib.request.urlopen = original
            __import__("os").environ.pop("MODEL_API_KEY", None)

    def test_ai_review_parses_verdict(self):
        __import__("os").environ.update({"MODEL_API_KEY": "TEST_ONLY_KEY"})
        original = urllib.request.urlopen

        def fake_ok(*args, **kwargs):
            return FakeHTTPResponse({"choices": [{"message": {"content": "PASS"}}]})

        urllib.request.urlopen = fake_ok
        try:
            with tempfile.TemporaryDirectory() as temp:
                raw = make_png(Path(temp) / "v.png").read_bytes()
                self.assertEqual(meta_image.ai_review(raw), "pass")
        finally:
            urllib.request.urlopen = original
            __import__("os").environ.pop("MODEL_API_KEY", None)

    def test_drive_ai_flag_blocks_click(self):
        with tempfile.TemporaryDirectory() as state, tempfile.TemporaryDirectory() as temp:
            good = make_png(Path(temp) / "good.png")
            record = draft.build_post("AIKit", EXPLAINED_LOOK, "screenshot", COMMIT, DATA_FILE, True,
                                      visual_for(good), RUN, DATE, state, explainer=EXPLAINER)
            queue.approve(record["id"], "owner", state)
            __import__("os").environ.update({"MODEL_API_KEY": "TEST_ONLY_KEY",
                                             "AEGEAN_SOCIAL_BROWSER": "1"})
            original = meta_image.ai_review
            meta_image.ai_review = lambda raw: "flagged: muddy contrast"
            try:
                page = FakePage()
                with self.assertRaises(browser_post.BrowserError):
                    browser_post.drive(page, record["id"], state, final_click=True)
                self.assertFalse(any(call[0] == "click" for call in page.calls))
            finally:
                meta_image.ai_review = original
                __import__("os").environ.pop("MODEL_API_KEY", None)
                __import__("os").environ.pop("AEGEAN_SOCIAL_BROWSER", None)

    def test_drive_ai_pass_records_verdict(self):
        with tempfile.TemporaryDirectory() as state, tempfile.TemporaryDirectory() as temp:
            good = make_png(Path(temp) / "good.png")
            record = draft.build_post("AIKit", EXPLAINED_LOOK, "screenshot", COMMIT, DATA_FILE, True,
                                      visual_for(good), RUN, DATE, state, explainer=EXPLAINER)
            queue.approve(record["id"], "owner", state)
            __import__("os").environ.update({"MODEL_API_KEY": "TEST_ONLY_KEY",
                                             "AEGEAN_SOCIAL_BROWSER": "1"})
            original = meta_image.ai_review
            meta_image.ai_review = lambda raw: "pass"
            try:
                page = FakePage()
                result = browser_post.drive(page, record["id"], state, final_click=True)
                self.assertTrue(result["posted"])
                self.assertEqual(result["ai_review"], "pass")
            finally:
                meta_image.ai_review = original
                __import__("os").environ.pop("MODEL_API_KEY", None)
                __import__("os").environ.pop("AEGEAN_SOCIAL_BROWSER", None)


if __name__ == "__main__":
    unittest.main()
