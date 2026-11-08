import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "sync_live_apps.py"


def load_sync_tool():
    spec = importlib.util.spec_from_file_location("sync_live_apps_digest", TOOL)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LiveBuildDigestTests(unittest.TestCase):
    def test_line_endings_do_not_change_the_digest(self):
        module = load_sync_tool()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            lf_root = root / "lf"
            crlf_root = root / "crlf"
            lf_root.mkdir()
            crlf_root.mkdir()
            (lf_root / "app.js").write_bytes(b"const a = 1;\nconst b = 2;\n")
            (crlf_root / "app.js").write_bytes(b"const a = 1;\r\nconst b = 2;\r\n")
            self.assertEqual(
                module._digest([lf_root / "app.js"], lf_root),
                module._digest([crlf_root / "app.js"], crlf_root),
            )

    def test_live_file_override_replaces_a_runtime_file(self):
        from unittest import mock

        module = load_sync_tool()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "fixture"
            (source / "live").mkdir(parents=True)
            (source / "index.html").write_text(
                '<script src="pwa.js"></script>\n', encoding="utf-8"
            )
            (source / "pwa.js").write_text(
                "navigator.serviceWorker.register('./sw.js');\n", encoding="utf-8"
            )
            (source / "live" / "pwa.js").write_text(
                "/* live build */\n", encoding="utf-8"
            )
            (source / "package.json").write_text(
                '{"version": "1.0.0"}\n', encoding="utf-8"
            )
            (source / "LICENSE").write_text(
                "# Aegean License 1.1\n", encoding="utf-8"
            )
            (root / "docs" / "live" / "fixture").mkdir(parents=True)
            (root / "docs" / "live" / "fixture" / "logo.svg").write_text(
                "<svg/>\n", encoding="utf-8"
            )
            module.PROJECT_ROOT = root
            module.DOCS = root / "docs"
            module.MANIFEST_REL = "docs/live.json"
            module.APPS = (
                {
                    "slug": "fixture",
                    "repo": "Fixture",
                    "source": "fixture",
                    "title": "Fixture",
                    "description": "A fixture app.",
                    "license": "AL-1.1",
                    "mode": "browser",
                    "runtime": ("index.html",),
                    "live_files": {"pwa.js": "live/pwa.js"},
                    "version_file": "package.json",
                    "logo": "live/fixture/logo.svg",
                },
            )
            git_stub = lambda _source, *args: (
                "c" * 40 if args[:1] == ("rev-parse",) else "2026-11-08"
            )
            with mock.patch.object(module, "_git", side_effect=git_stub):
                manifest = module.build_manifest(root)
            entry = manifest["apps"][0]
            target = root / "docs" / "live" / "fixture" / ("c" * 12)
            self.assertEqual(
                (target / "pwa.js").read_text(encoding="utf-8"),
                "/* live build */\n",
            )
            self.assertFalse((target / "sw.js").exists())
            (root / "docs" / "live.json").write_text(
                json.dumps(manifest), encoding="utf-8"
            )
            self.assertEqual(module.check_manifest(), [])
            self.assertEqual(module.source_problems(root), [])

    def test_binary_files_are_hashed_byte_for_byte(self):
        module = load_sync_tool()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "logo.bin").write_bytes(b"\x00\x01\r\n")
            other = Path(temp) / "other"
            other.mkdir()
            (other / "logo.bin").write_bytes(b"\x00\x01\n")
            self.assertNotEqual(
                module._digest([root / "logo.bin"], root),
                module._digest([other / "logo.bin"], other),
            )


if __name__ == "__main__":
    unittest.main()
