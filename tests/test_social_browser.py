"""Tests for the browser publishing path (tools/social/browser_post.py).

A FakePage stands in for the browser: no test touches the network.
Proves compose-only is the default, the Post click needs approval AND
the env flag AND an explicit argument, and only exact text ships.
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from social import browser_post, disclosure, draft, queue

COMMIT = "ea26791d52722e78af0a87b25d3268e72d52836"
RUN = "run-2026-11-03-browser"
DATE = "2026-11-03"
DATA_FILE = "docs/live.json"


class FakePage:
    """Minimal page adapter double: records calls, never clicks by itself."""

    def __init__(self, echo_ok: bool = True, confirmed: bool = True,
                 found_tweet: str = "/test/status/1", thread_has_link: bool = False) -> None:
        self.calls: list = []
        self.composed = ""
        self.media: list[str] = []
        self.clicks = 0
        self.echo_ok = echo_ok
        self.confirmed = confirmed
        self.found_tweet = found_tweet
        self.thread_has_link = thread_has_link

    def find_tweet(self, snippet: str) -> str:
        self.calls.append(("find", snippet[:20]))
        return self.found_tweet

    def open_tweet(self, url: str) -> None:
        self.calls.append(("open", url))

    def thread_contains(self, text: str) -> bool:
        self.calls.append(("thread_has", text[:20]))
        return self.thread_has_link

    def click_reply(self) -> None:
        self.calls.append(("reply-click",))
        self.clicks += 1

    def goto(self, url: str) -> None:
        self.calls.append(("goto", url))

    def fill_composer(self, text: str) -> str:
        self.calls.append(("fill", len(text)))
        self.composed = text
        return text if self.echo_ok else text + " [mutated by page]"

    def attach_media(self, paths: list[str]) -> list[str]:
        self.calls.append(("attach", list(paths)))
        self.media = [Path(path).name for path in paths]
        return self.media

    def click_post(self) -> None:
        self.calls.append(("click",))
        self.clicks += 1

    def confirm_posted(self) -> bool:
        self.calls.append(("confirm",))
        return self.confirmed


def approved_draft(state: str, text: str = "AIKit dossier carries its social card") -> dict:
    from social import evidence  # noqa: PLC0415 - local import keeps module import light

    assert evidence.require_evidence("AIKit", COMMIT, DATA_FILE, True)
    record = draft.build_post(
        repo="AIKit",
        text=text,
        kind="notice",
        commit=COMMIT,
        data_file=DATA_FILE,
        suite_ok=True,
        visual=None,
        run_id=RUN,
        date=DATE,
        state_dir=state,
    )
    return queue.approve(record["id"], "owner", state)


class BrowserPostTests(unittest.TestCase):
    def setUp(self):
        self._saved_key = os.environ.pop("MODEL_API_KEY", None)

    def tearDown(self):
        if self._saved_key is not None:
            os.environ.update({"MODEL_API_KEY": self._saved_key})  # hygiene: allow test restores the prior environment value

    def test_prepare_writes_exact_package(self):
        with tempfile.TemporaryDirectory() as state, tempfile.TemporaryDirectory() as out:
            record = approved_draft(state)
            manifest = browser_post.prepare(record["id"], out, state)
            self.assertEqual(Path(out, "post.txt").read_text(encoding="utf-8"), record["draft"]["text"] + "\n")
            self.assertTrue(disclosure.has_marker(Path(out, "post.txt").read_text(encoding="utf-8")))
            saved = json.loads(Path(out, "package.json").read_text(encoding="utf-8"))
            self.assertEqual(saved["draft_id"], record["id"])
            self.assertEqual(saved["approved_by"], "owner")
            self.assertEqual(manifest["draft_id"], record["id"])

    def test_prepare_needs_approval(self):
        with tempfile.TemporaryDirectory() as state, tempfile.TemporaryDirectory() as out:
            record = draft.build_post("AIKit", "hello", "notice", COMMIT, DATA_FILE, True, None, RUN, DATE, state)
            with self.assertRaises(queue.QueueError):
                browser_post.prepare(record["id"], out, state)

    def test_prepare_checklist_names_metadata_not_burned_footer(self):
        # ADR-074: pixels stay clean; provenance rides in metadata + sidecar.
        with tempfile.TemporaryDirectory() as state, tempfile.TemporaryDirectory() as out:
            record = approved_draft(state)
            manifest = browser_post.prepare(record["id"], out, state)
            checklist = " ".join(manifest["checklist"]).lower()
            self.assertNotIn("footer", checklist)
            self.assertNotIn("burned", checklist)
            self.assertIn("metadata", checklist)

    def test_drive_compose_only_by_default(self):
        with tempfile.TemporaryDirectory() as state:
            record = approved_draft(state)
            page = FakePage()
            result = browser_post.drive(page, record["id"], state)
            self.assertTrue(result["composed"])
            self.assertFalse(result["clicked"])
            self.assertEqual(page.composed, record["draft"]["text"])
            self.assertEqual(page.clicks, 0)

    def test_drive_click_needs_env_flag(self):
        with tempfile.TemporaryDirectory() as state:
            record = approved_draft(state)
            page = FakePage()
            backup = os.environ.get("AEGEAN_SOCIAL_BROWSER")
            os.environ.pop("AEGEAN_SOCIAL_BROWSER", None)
            try:
                with self.assertRaises(browser_post.BrowserError):
                    browser_post.drive(page, record["id"], state, final_click=True)
                self.assertEqual(page.clicks, 0)
                os.environ.update({"AEGEAN_SOCIAL_BROWSER": "1"})
                result = browser_post.drive(page, record["id"], state, final_click=True)
                self.assertTrue(result["clicked"])
                self.assertEqual(page.clicks, 1)
            finally:
                os.environ.pop("AEGEAN_SOCIAL_BROWSER", None)
                if backup is not None:
                    os.environ.update({"AEGEAN_SOCIAL_BROWSER": backup})

    def test_drive_needs_approval(self):
        with tempfile.TemporaryDirectory() as state:
            record = draft.build_post("AIKit", "hello", "notice", COMMIT, DATA_FILE, True, None, RUN, DATE, state)
            with self.assertRaises(queue.QueueError):
                browser_post.drive(FakePage(), record["id"], state, final_click=False)

    def test_drive_rejects_mutated_echo(self):
        with tempfile.TemporaryDirectory() as state:
            record = approved_draft(state)
            with self.assertRaises(browser_post.BrowserError):
                browser_post.drive(FakePage(echo_ok=False), record["id"], state)

    def test_drive_unconfirmed_click_claims_nothing(self):
        with tempfile.TemporaryDirectory() as state:
            record = approved_draft(state)
            page = FakePage(confirmed=False)
            backup = os.environ.get("AEGEAN_SOCIAL_BROWSER")
            os.environ.update({"AEGEAN_SOCIAL_BROWSER": "1"})
            try:
                result = browser_post.drive(page, record["id"], state, final_click=True)
                self.assertTrue(result["clicked"])
                self.assertFalse(result["posted"])
                self.assertFalse(result["receipt"]["live"])
            finally:
                os.environ.pop("AEGEAN_SOCIAL_BROWSER", None)
                if backup is not None:
                    os.environ.update({"AEGEAN_SOCIAL_BROWSER": backup})

    def test_drive_missing_visual_file_blocked(self):
        with tempfile.TemporaryDirectory() as state:
            record = draft.build_post(
                "AIKit", "AIKit is crash-resilient governance for AI coding agents. Look", "screenshot",
                COMMIT, DATA_FILE, True,
                {"digest": "sha256:" + "c" * 64, "run": RUN, "commit": COMMIT,
                 "data_file": DATA_FILE, "src": str(Path(state) / "gone.png")},
                RUN, DATE, state,
                explainer="AIKit is crash-resilient governance for AI coding agents.",
            )
            queue.approve(record["id"], "owner", state)
            with self.assertRaises(browser_post.BrowserError):
                browser_post.drive(FakePage(), record["id"], state)

    def test_drive_attaches_multiple_visuals(self):
        from PIL import Image, ImageDraw  # noqa: PLC0415 - fixture pixels only

        def _png(path: Path) -> Path:
            image = Image.new("RGB", (1200, 630), (4, 6, 12))
            draw = ImageDraw.Draw(image)
            for y in range(40, 590, 24):
                draw.rectangle([40, y, 1160, y + 10], fill=(103, 232, 249))
            image.save(path, format="PNG")
            return path

        with tempfile.TemporaryDirectory() as state, tempfile.TemporaryDirectory() as temp:
            first = _png(Path(temp) / "one.png")
            second = _png(Path(temp) / "two.png")
            visual = {
                "digest": "sha256:" + "e" * 64, "run": RUN, "commit": COMMIT,
                "data_file": DATA_FILE, "src": str(first), "extra_srcs": [str(second)],
            }
            record = draft.build_post(
                "AIKit", "AIKit is crash-resilient governance for AI coding agents. Look", "screenshot",
                COMMIT, DATA_FILE, True, visual, RUN, DATE, state,
                explainer="AIKit is crash-resilient governance for AI coding agents.",
            )
            queue.approve(record["id"], "owner", state)
            page = FakePage()
            result = browser_post.drive(page, record["id"], state)
            self.assertEqual(result["media_attached"], ["one.png", "two.png"])
            self.assertFalse(result["clicked"])


class LinkReplyTests(unittest.TestCase):
    def test_reply_posts_bare_repo_url(self):
        with tempfile.TemporaryDirectory() as state:
            record = approved_draft(state)
            queue.approve(record["id"], "owner", state)
            page = FakePage()
            backup = os.environ.get("AEGEAN_SOCIAL_BROWSER")
            os.environ.update({"AEGEAN_SOCIAL_BROWSER": "1"})
            try:
                result = browser_post.drive(page, record["id"], state, final_click=True, link_reply=True)
                self.assertTrue(result["posted"])
                self.assertTrue(result["reply"]["posted"])
                self.assertEqual(result["reply"]["link_reply"], "https://github.com/AegeanWorks/AIKit")
                self.assertEqual(page.composed, "https://github.com/AegeanWorks/AIKit")
            finally:
                os.environ.pop("AEGEAN_SOCIAL_BROWSER", None)
                if backup is not None:
                    os.environ.update({"AEGEAN_SOCIAL_BROWSER": backup})

    def test_reply_skipped_when_duplicate(self):
        with tempfile.TemporaryDirectory() as state:
            record = approved_draft(state)
            queue.approve(record["id"], "owner", state)
            page = FakePage(thread_has_link=True)
            backup = os.environ.get("AEGEAN_SOCIAL_BROWSER")
            os.environ.update({"AEGEAN_SOCIAL_BROWSER": "1"})
            try:
                result = browser_post.drive(page, record["id"], state, final_click=True, link_reply=True)
                self.assertTrue(result["posted"])
                self.assertTrue(result["reply"].get("duplicate"))
                self.assertEqual(page.clicks, 1)
            finally:
                os.environ.pop("AEGEAN_SOCIAL_BROWSER", None)
                if backup is not None:
                    os.environ.update({"AEGEAN_SOCIAL_BROWSER": backup})

    def test_reply_needs_parent_on_profile(self):
        with tempfile.TemporaryDirectory() as state:
            record = approved_draft(state)
            queue.approve(record["id"], "owner", state)
            page = FakePage(found_tweet="")
            backup = os.environ.get("AEGEAN_SOCIAL_BROWSER")
            os.environ.update({"AEGEAN_SOCIAL_BROWSER": "1"})
            try:
                with self.assertRaises(browser_post.BrowserError):
                    browser_post.drive(page, record["id"], state, final_click=True, link_reply=True)
            finally:
                os.environ.pop("AEGEAN_SOCIAL_BROWSER", None)
                if backup is not None:
                    os.environ.update({"AEGEAN_SOCIAL_BROWSER": backup})

    def test_reply_needs_approval(self):
        with tempfile.TemporaryDirectory() as state:
            record = draft.build_post("AIKit", "hello", "notice", COMMIT, DATA_FILE, True, None, RUN, DATE, state)
            with self.assertRaises(queue.QueueError):
                browser_post.post_link_reply(record["id"], FakePage(), state, final_click=True)

    def test_compose_only_reports_reply_for_manual(self):
        with tempfile.TemporaryDirectory() as state:
            record = approved_draft(state)
            queue.approve(record["id"], "owner", state)
            result = browser_post.drive(FakePage(), record["id"], state)
            self.assertEqual(result["reply"]["link_reply"], "manual (post the repo URL as a reply by hand)")


if __name__ == "__main__":
    unittest.main()
