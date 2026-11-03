"""Browser publishing path: no X API, no keys, no per-post cost.

The X API is pay-per-use with no free tier for new developers
($0.015/post, $0.20 with a URL, 2026 rates), so this module replaces the
API transport with the browser the owner already uses.

Two modes, in safety order:
- prepare(record, out_dir): always safe. Writes a publish package with the
  exact post text, the provenance-stamped visual files, and a receipt
  template. A human posts it by hand: zero automation risk, zero cost, and
  publishing stays literally a human decision.
- drive(page, package, final_click=False): fills the X composer with the
  exact text and attaches the exact media through a page adapter. Clicks
  Post only when ALL hold: the draft is approved, final_click=True was
  passed explicitly, and AEGEAN_SOCIAL_BROWSER=1 is set. Default is
  compose-only: the human reviews and clicks.

Risk note (also ADR-066): driving the Post click by automation may breach
X automation rules and can cost the account locks or captchas. Prefer
prepare() + manual click. Full-auto is eyes-open only.

The page adapter is duck-typed so tests use a FakePage and no test touches
the network: goto(url), fill_composer(text) -> echoed text,
attach_media(paths), click_post(). Only the PlaywrightPage adapter imports
playwright, and only inside its constructor.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from . import disclosure, queue

X_HOME = "https://x.com/home"


class BrowserError(ValueError):
    """Raised when the browser path is unsafe or the page misbehaves."""


def _record(state_dir, draft_id: str) -> dict:
    record = queue.require_approval(queue.get(draft_id, state_dir))
    if not disclosure.has_marker(record["draft"]["text"]):
        raise BrowserError("Why: disclosure marker missing; it is un-droppable.\nFix: keep the automation marker.")
    return record


def prepare(draft_id: str, out_dir: str | Path, state_dir=None) -> dict:
    """Write the publish package; returns the package manifest (never posts)."""
    record = _record(state_dir, draft_id)
    dest = Path(out_dir)
    dest.mkdir(parents=True, exist_ok=True)
    text = record["draft"]["text"]
    (dest / "post.txt").write_text(text + "\n", encoding="utf-8")
    media: list[str] = []
    visual = record["draft"].get("visual") or {}
    src = visual.get("src", "")
    if src and Path(src).is_file():
        target = dest / Path(src).name
        shutil.copyfile(src, target)
        media.append(target.name)
    manifest = {
        "draft_id": record["id"],
        "repo": record["draft"]["repo"],
        "text_file": "post.txt",
        "media": media,
        "visual_digest": visual.get("digest", ""),
        "approved_by": record["approver"],
        "approved_at": record["approved_at"],
        "checklist": [
            "Confirm the text matches the approved draft exactly.",
            "Confirm the attached visual carries its provenance footer and AI mark.",
            "Press Post yourself, or re-run drive() with final_click=True and AEGEAN_SOCIAL_BROWSER=1.",
        ],
    }
    (dest / "package.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def drive(page, draft_id: str, state_dir=None, final_click: bool = False) -> dict:
    """Compose the approved draft in the browser; clicks Post only if armed."""
    record = _record(state_dir, draft_id)
    text = record["draft"]["text"]
    visual = record["draft"].get("visual") or {}
    page.goto(X_HOME)
    echoed = page.fill_composer(text)
    if echoed.strip() != text.strip():
        raise BrowserError(
            "Why: composer echo differs from the approved text; the page may have altered it.\n"
            "Fix: abort, keep the approved draft byte-identical."
        )
    attached: list[str] = []
    src = visual.get("src", "")
    if src:
        if not Path(src).is_file():
            raise BrowserError(f"Why: visual file is missing: {src}.\nFix: re-render it from the run.")
        attached = page.attach_media([src])
    clicked = False
    posted = False
    if final_click:
        if os.environ.get("AEGEAN_SOCIAL_BROWSER") != "1":
            raise BrowserError(
                "Why: final click needs AEGEAN_SOCIAL_BROWSER=1.\n"
                "Fix: compose-only is the default; arm the flag only to post."
            )
        page.click_post()
        clicked = True
        posted = page.confirm_posted()
    return {
        "draft_id": record["id"],
        "composed": True,
        "media_attached": attached,
        "clicked": clicked,
        "posted": posted,
        "receipt": {"mode": "browser", "clicked": clicked, "live": posted},
    }


class PlaywrightPage:
    """Real adapter over a Playwright page on x.com (imported lazily)."""

    COMPOSER_IDS = ("tweetTextarea_0",)
    POST_IDS = ("tweetButtonInline", "tweetButton")
    FILE_IDS = ("fileInput",)

    def __init__(self, page) -> None:
        try:
            import playwright  # noqa: F401, PLC0415 - optional driver dep
        except ImportError as error:
            raise BrowserError(
                "Why: playwright is not installed.\nFix: install it to drive a real browser; prepare() needs nothing."
            ) from error
        self._page = page

    def goto(self, url: str) -> None:
        self._page.goto(url, wait_until="domcontentloaded", timeout=30000)

    def _first(self, test_ids: tuple[str, ...]):
        failures: list[str] = []
        for test_id in test_ids:
            try:
                self._page.wait_for_selector(f'[data-testid="{test_id}"]', timeout=20000)
                return self._page.get_by_test_id(test_id).first
            except Exception as error:  # noqa: BLE001 - selector probe; every failure is reported below
                failures.append(f"{test_id}: {error}".split("Call log")[0][:200])
                continue
        raise BrowserError(
            f"Why: x.com composer element not found (tried {', '.join(test_ids)}); the page markup moved.\n"
            f"Page said: {'; '.join(failures)[:300]}\n"
            "Fix: update PlaywrightPage selectors; never guess-click."
        )

    def fill_composer(self, text: str) -> str:
        box = self._first(self.COMPOSER_IDS)
        box.click()
        box.fill(text)
        try:
            echoed = box.input_value()
        except Exception:  # noqa: BLE001 - rich-text editors expose inner_text instead
            echoed = box.inner_text()
        return echoed.strip()

    def attach_media(self, paths: list[str]) -> list[str]:
        picker = self._first(self.FILE_IDS)
        picker.set_input_files(paths)
        try:
            self._page.wait_for_selector('[data-testid="tweetPhoto"]', timeout=20000)
        except Exception as error:  # noqa: BLE001 - upload never completed
            raise BrowserError(
                f"Why: attached media never appeared in the composer: {error}.\n"
                "Fix: retry; if it persists, post text-only through a new approved draft."
            ) from error
        return [Path(path).name for path in paths]

    def confirm_posted(self, timeout_ms: int = 30000) -> bool:
        """True only when X shows the sent confirmation; never assume."""
        try:
            self._page.get_by_text("Your post was sent", exact=False).wait_for(timeout=timeout_ms)
            return True
        except Exception:  # noqa: BLE001 - no confirmation, no claim
            return False

    def click_post(self) -> None:
        self._first(self.POST_IDS).click()
