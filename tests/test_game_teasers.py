"""Contract tests for tools/build_game_teasers.py.

Proves the private-game teaser pipeline behaves like the dossier media
one: optimize-then-record ingest, offline consistency checks, and
manifest-owned sync of the workshop markup between markers.
"""

import io
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import build_game_teasers as teasers  # noqa: E402

START, END = teasers.MARKERS

GAME = "Slipgate"
TITLE = "Slipgate"
PITCH = "A pocket-sized corridor shooter held together by_FORCE feedback."
DATE = "2026-11-16"


def make_png(width: int = 480, height: int = 300) -> bytes:
    from PIL import Image  # noqa: PLC0415 - optional maintenance dependency

    image = Image.new("RGB", (width, height), (20, 22, 34))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class TempRootTest(unittest.TestCase):
    """Each test gets an isolated project root mimicking the repo layout."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="aikit_teasers_"))
        self.addCleanup(self._cleanup)
        self.docs = self.root / "docs"
        self.docs.mkdir(parents=True)
        (self.docs / "index.html").write_text(
            f"<html><body>{START}\nold workshop contents\n{END}</body></html>",
            encoding="utf-8",
        )

    def _cleanup(self):
        import shutil

        shutil.rmtree(self.root, ignore_errors=True)

    def run_tool(self, *args: str) -> int:
        return teasers.main(["--root", str(self.root), *args])

    def register(self, **overrides) -> int:
        title = overrides.get("title", TITLE)
        pitch = overrides.get("pitch", PITCH)
        argv = ["register", "--game", overrides.get("game", GAME)]
        if title is not None:
            argv += ["--title", title]
        if pitch is not None:
            argv += ["--pitch", pitch]
        if overrides.get("status") is not None:
            argv += ["--status", overrides["status"]]
        return self.run_tool(*argv)

    def ingest(self, payload: bytes, **overrides) -> int:
        source = self.root / overrides.get("file", "shot.png")
        source.write_bytes(payload)
        argv = [
            "ingest",
            "--game", overrides.get("game", GAME),
            "--file", str(source),
            "--date", overrides.get("date", DATE),
            "--alt", overrides.get("alt", "corridor start"),
        ]
        if overrides.get("caption"):
            argv += ["--caption", overrides["caption"]]
        return self.run_tool(*argv)

    def manifest(self) -> dict:
        return json.loads((self.root / "docs/assets/games/teasers.json").read_text(encoding="utf-8"))

    def synced_block(self) -> str:
        html = (self.docs / "index.html").read_text(encoding="utf-8")
        return re.search(re.escape(START) + r".*?" + re.escape(END), html, re.S).group(0)


class RegisterContract(TempRootTest):
    def test_register_creates_a_single_entry(self):
        self.assertEqual(self.register(), 0)
        manifest = self.manifest()
        self.assertEqual(manifest["schema"], 1)
        self.assertEqual(len(manifest["games"]), 1)
        game = manifest["games"][0]
        self.assertEqual(game["name"], GAME)
        self.assertEqual(game["title"], TITLE)
        self.assertEqual(game["status"], "in development")

    def test_register_updates_instead_of_duplicating(self):
        self.register()
        self.register(title="Slipgate II")
        games = self.manifest()["games"]
        self.assertEqual(len(games), 1)
        self.assertEqual(games[0]["title"], "Slipgate II")

    def test_register_rejects_bad_names(self):
        self.assertNotEqual(self.register(game="../escape", title="x"), 0)

    def test_register_requires_a_title(self):
        with self.assertRaises(SystemExit):
            self.register(title=None)


class IngestContract(TempRootTest):
    def test_ingest_requires_a_registered_game(self):
        self.assertEqual(self.ingest(make_png()), 2)

    def test_ingest_optimizes_records_and_writes(self):
        self.register()
        self.assertEqual(self.ingest(make_png(width=400, height=250)), 0)
        game = self.manifest()["games"][0]
        shots = game["screenshots"]
        self.assertEqual(len(shots), 1)
        shot = shots[0]
        self.assertEqual(shot["alt"], "corridor start")
        self.assertEqual(shot["taken_at"], DATE)
        self.assertTrue(shot["src"].startswith(f"assets/games/{GAME}/"))
        self.assertTrue(shot["src"].endswith(".webp"))
        self.assertEqual(shot["width"], 400)
        self.assertEqual(shot["height"], 250)
        payload = (self.docs / shot["src"]).read_bytes()
        self.assertEqual(shot["digest"], f"sha256:{__import__('hashlib').sha256(payload).hexdigest()}")

    def test_ingest_appends_in_order(self):
        self.register()
        self.ingest(make_png())
        self.ingest(make_png(width=320, height=200), file="second.png", alt="second")
        shots = self.manifest()["games"][0]["screenshots"]
        self.assertEqual([shot["alt"] for shot in shots], ["corridor start", "second"])
        self.assertNotEqual(shots[0]["src"], shots[1]["src"])

    def test_ingest_rejects_oversize_files(self):
        self.register()
        self.assertEqual(self.ingest(b"\x00" * (teasers.MAX_BYTES + 1)), 2)


class CheckContract(TempRootTest):
    def setUp(self):
        super().setUp()
        self.register()
        self.ingest(make_png())
        self.shot = self.manifest()["games"][0]["screenshots"][0]

    def test_check_passes_on_a_consistent_tree(self):
        self.assertEqual(self.run_tool("check"), 0)

    def test_check_catches_digest_tampering(self):
        target = self.docs / self.shot["src"]
        target.write_bytes(target.read_bytes() + b"x")
        self.assertNotEqual(self.run_tool("check"), 0)

    def test_check_catches_missing_files(self):
        (self.docs / self.shot["src"]).unlink()
        self.assertNotEqual(self.run_tool("check"), 0)

    def test_check_catches_orphan_images(self):
        (self.docs / f"assets/games/{GAME}").mkdir(exist_ok=True)
        (self.docs / f"assets/games/{GAME}/2026-11-01-stray.png").write_bytes(make_png())
        self.assertNotEqual(self.run_tool("check"), 0)

    def test_check_catches_src_escaping_the_games_folder(self):
        manifest = self.manifest()
        manifest["games"][0]["screenshots"][0]["src"] = "media/Elsewhere/shot.webp"
        (self.root / "docs/assets/games/teasers.json").write_text(json.dumps(manifest), encoding="utf-8")
        self.assertNotEqual(self.run_tool("check"), 0)

    def test_check_catches_corrupt_manifests(self):
        (self.root / "docs/assets/games/teasers.json").write_text("{not json", encoding="utf-8")
        self.assertNotEqual(self.run_tool("check"), 0)


class SyncContract(TempRootTest):
    def test_sync_renders_placeholder_when_the_manifest_is_empty(self):
        self.assertEqual(self.run_tool("sync"), 0)
        block = self.synced_block()
        self.assertIn("assets/games/placeholder.svg", block)
        self.assertIn("class=\"game-teaser\"", block)
        self.assertNotIn("github.com", block)

    def test_sync_renders_registered_games_with_their_first_shot(self):
        self.register()
        self.ingest(make_png(), alt="corridor start")
        first_src = self.manifest()["games"][0]["screenshots"][0]["src"]
        self.ingest(make_png(width=320, height=200), file="second.png", alt="second")
        second_src = self.manifest()["games"][0]["screenshots"][1]["src"]
        self.assertEqual(self.run_tool("sync"), 0)
        block = self.synced_block()
        self.assertIn(f"<h3>Slipgate <span class=\"tag\">in development</span></h3>", block)
        self.assertIn(f'src="{first_src}"', block)  # src stays docs-relative
        self.assertIn(PITCH, block)
        self.assertIn("corridor start", block)
        self.assertNotIn(second_src, block)  # first shot leads, extras wait for the dossier

    def test_sync_is_idempotent(self):
        self.register()
        self.ingest(make_png())
        self.run_tool("sync")
        first = self.synced_block()
        self.assertEqual(self.run_tool("sync"), 0)
        self.assertEqual(self.synced_block(), first)

    def test_sync_requires_markers_in_the_replacement_file(self):
        (self.docs / "index.html").write_text("<html><body>no markers</body></html>", encoding="utf-8")
        self.assertNotEqual(self.run_tool("sync"), 0)

    def test_sync_replacement_is_atomic_and_ignores_outer_markup(self):
        self.register()
        self.ingest(make_png())
        self.run_tool("sync")
        html = (self.docs / "index.html").read_text(encoding="utf-8")
        self.assertTrue(html.startswith("<html><body>"))
        self.assertTrue(html.endswith("</body></html>"))
        self.assertNotIn("old workshop contents", html)  # block fully owned by sync


if __name__ == "__main__":
    unittest.main()
