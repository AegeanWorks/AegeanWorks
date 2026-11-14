"""Regression tests for the AegeanWorks profile, site and licensing integrity."""

import base64
import hashlib
import json
import re
import subprocess
import sys
import unittest
from html import escape as html_escape, unescape as html_unescape
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PUBLIC_REPOS = {
    "Aegean-Licensing",
    "Pocket-Planner",
    "ModelDuck",
    "Dustline",
    "Dupefinder",
    "Driftwood",
    "Cairn",
    "Iris",
    "Tessera",
    "Weft",
    "Aegean-Reforge",
    "Afterimage",
    "AIKit",
    "Aldervale",
    "Assay",
    "Chronos",
    "Crypt-Crawler",
    "Cyberpulse",
    "Fluid-Universe",
    "Fold",
    "Gauge",
    "Lacon",
    "Lattice",
    "MemoryReconstruction",
    "Meridian",
    "Mnemo",
    "Muse",
    "N1-Engine",
    "NeuralBeat",
    "NeuralDeck",
    "NeuroCore",
    "NeurologyClinicTemplates-TR",
    "NeuroOptic",
    "NobetWizard",
    "NoMoreClutter",
    "Orrery",
    "Palette",
    "Pebble",
    "Photo-Harbor",
    "PNN",
    "Primordia",
    "Prism-Relay",
    "Tally",
    "Tempo",
    "UI-Sandbox",
    "Voidfarer",
    "Research-Engine",
    "Aegean-TGE",
    "ChatDuck",
    "Atlas",
    "Keystone",
    "AegeanWorks",
}

CATEGORY_LABELS = {
    "ai": "AI &amp; Agents",
    "research": "Research",
    "health": "Health &amp; Neuro",
    "tools": "Developer Tools",
    "play": "Games &amp; Experiments",
}


def read_readme() -> str:
    return (ROOT / "README.md").read_text(encoding="utf-8")


def read_site() -> str:
    return (ROOT / "docs" / "index.html").read_text(encoding="utf-8")


def read_verify() -> str:
    return (ROOT / "docs" / "verify.html").read_text(encoding="utf-8")


def read_license_families() -> dict:
    """The site's license ledger is the single source of truth for family codes."""
    source = (ROOT / "docs" / "atlas-core.js").read_text(encoding="utf-8")
    families_block = source.split("export const LICENSE_FAMILIES", 1)[1].split("});", 1)[0]
    short = dict(re.findall(r'(\w+): \{ short: "([^"]+)"', families_block))
    ledger = source.split("export const REPO_LICENSES", 1)[1].split("});", 1)[0]
    families = dict(re.findall(r'\n  "?([A-Za-z0-9._-]+)"?: "(\w+)",', ledger))
    return {name.lower(): short[family] for name, family in families.items()}


def read_metadata() -> dict:
    return json.loads(
        (ROOT / "tests" / "metadata" / "repositories.json").read_text(encoding="utf-8")
    )


class ProfileIntegrityTests(unittest.TestCase):
    """Guard the profile structure, links, voice and configuration."""

    def test_readme_exists_and_non_empty(self):
        readme_path = ROOT / "README.md"
        self.assertTrue(readme_path.is_file())
        self.assertGreater(len(read_readme()), 100)

    def test_readme_sections_present(self):
        text = read_readme()
        for heading in (
            "What we build",
            "Featured systems",
            "Public project atlas",
            "Research threads",
            "Philosophy",
            "Toolbox",
            "License",
            "Connect",
            "Cold-Start Quick Reference",
        ):
            with self.subTest(heading=heading):
                self.assertIn(heading, text)

    def test_readme_categories_are_title_cased(self):
        text = read_readme()
        for label in (
            "Cognitive AI &amp; Agent Infrastructure",
            "Research &amp; Simulation",
            "Health, Neuro &amp; Personal Tools",
            "Developer Tools &amp; Utilities",
            "Games &amp; Playable Experiments",
        ):
            with self.subTest(label=label):
                self.assertIn(label, text)
        self.assertNotIn("Health, neuro", text)

    def test_readme_speaks_as_the_company(self):
        body = re.sub(r"```.*?```", "", read_readme(), flags=re.S)
        body = re.sub(r"https?://\S+", "", body)
        body = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "", body)
        self.assertNotRegex(body, r"\b(I|I'm|I’m|my|me|mine)\b")

    def test_brand_assets_are_present(self):
        for name in ("social-preview.png", "logo.jpg"):
            with self.subTest(asset=name):
                path = ROOT / "assets" / name
                self.assertTrue(path.is_file())
                self.assertGreater(path.stat().st_size, 0)
        self.assertFalse((ROOT / "assets" / "banner.svg").exists())

    def test_funding_configuration(self):
        funding_path = ROOT / ".github" / "FUNDING.yml"
        self.assertTrue(funding_path.is_file())
        content = funding_path.read_text(encoding="utf-8")
        self.assertIn("github: [AegeanWorks]", content)
        self.assertIn("patreon: Aegean-E", content)

    def test_only_public_repositories_are_linked(self):
        linked = set(
            re.findall(r"https://github\.com/AegeanWorks/([A-Za-z0-9._-]+)", read_readme())
        )
        self.assertTrue(linked)
        # README may link this repository itself (screenshots, source), never another private repo.
        self.assertTrue(linked.issubset(PUBLIC_REPOS | {"AegeanWorks"}), linked - PUBLIC_REPOS - {"AegeanWorks"})

    def test_readme_atlas_lists_every_public_repository(self):
        linked = set(
            re.findall(r"https://github\.com/AegeanWorks/([A-Za-z0-9._-]+)", read_readme())
        )
        self.assertEqual(linked, PUBLIC_REPOS)

    def test_license_matches_the_aikit_family(self):
        license_path = ROOT / "LICENSE"
        self.assertTrue(license_path.is_file())
        text = license_path.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("# Aegean License 1.1 (AL-1.1)"))
        self.assertIn("SPDX identifier**: `LicenseRef-AL-1.1`", text)

        commercial = (ROOT / "COMMERCIAL.md").read_text(encoding="utf-8")
        self.assertIn("ACL-1.0", commercial)
        self.assertIn("AL-1.1", commercial)
        self.assertNotIn("AWCL", commercial)
        self.assertNotIn("AegeanWorks Commercial License (AWCL)", commercial)

        readme = read_readme()
        self.assertIn("AL-1.1 for software", readme)
        self.assertIn("AGL-1.1 for games", readme)
        self.assertIn("ASL-1.1 for research", readme)
        self.assertIn("Aegean Commercial License 1.0 (ACL-1.0)", readme)
        self.assertIn("licenses/CATALOG.md", readme)
        self.assertNotIn("badge/licensing-AGPL", readme)

    def test_site_entry_points_exist(self):
        docs = ROOT / "docs"
        for name in (
            "index.html",
            "styles.css",
            "app.js",
            "sw-client.js",
            "play.html",
            "live.js",
            "live-core.js",
            "live-home.js",
            "live.json",
            "live/shots.json",
            "favicon.svg",
            "404.html",
            "robots.txt",
            "sitemap.xml",
            "site.webmanifest",
            "apple-touch-icon.png",
            "icon-192.png",
            "icon-512.png",
            ".nojekyll",
            "og.png",
        ):
            with self.subTest(file=name):
                self.assertTrue((docs / name).is_file())

    def test_project_dossier_page_is_wired(self):
        page = (ROOT / "docs" / "project.html").read_text(encoding="utf-8")
        for token in (
            'id="project-detail"',
            'id="project-title"',
            'id="project-logo"',
            'id="project-language"',
            'id="project-license"',
            'id="project-pushed"',
            'id="project-topics"',
            'id="readme-content"',
            'id="readme-status"',
            'id="project-preview"',
            'id="project-preview-link"',
            'id="project-preview-meta"',
            'id="project-license-name"',
            'id="project-license-code"',
            'id="project-gallery"',
            'id="gallery-slider"',
            'id="gallery-image"',
            'id="gallery-prev"',
            'id="gallery-next"',
            'id="gallery-dots"',
            'id="gallery-caption"',
            'id="gallery-meta"',
            'id="gallery-note"',
            "project.js",
        ):
            with self.subTest(token=token):
                self.assertIn(token, page)
        self.assertIn("connect-src 'self' https://api.github.com", page)
        self.assertNotIn("unsafe-inline'", page.split("script-src", 1)[1].split(";", 1)[0])
        self.assertIn("<noscript>", page)
        self.assertIn(".project-status{display:none!important}", page)
        for asset in re.findall(r'(?:src|href)="([^"]+)"', page):
            if asset.startswith(("http://", "https://", "#", "mailto:")):
                continue
            with self.subTest(asset=asset):
                self.assertTrue((ROOT / "docs" / asset.split("#")[0].split("?")[0]).exists())
        script = (ROOT / "docs" / "project.js").read_text(encoding="utf-8")
        self.assertIn('from "./project-core.js"', script)
        self.assertIn('from "./atlas-core.js"', script)
        self.assertIn('fetchJson("atlas-snapshot.json")', script)
        self.assertIn('"media/" + encodeURIComponent(repo.name) + ".json?v=19"', script)
        self.assertIn("normalizeMedia", script)
        self.assertIn("renderLogo", script)
        self.assertIn("/commit/", script)
        self.assertIn("pre.tabIndex = 0;", script)
        for token in ("og:title", "og:description", "og:url", "twitter:title", "twitter:description"):
            with self.subTest(meta=token):
                self.assertIn(token, script)
                self.assertIn(token, page)
        verify_script = (ROOT / "docs" / "verify.js").read_text(encoding="utf-8")
        self.assertIn("MAX_TERMS_BYTES,", verify_script)
        self.assertNotIn("524288", verify_script)
        self.assertIn("/readme", script)
        for token in ("textContent", "replaceChildren"):
            self.assertIn(token, script)
        for token in ("innerHTML", "document.write", "eval(", "new Function"):
            with self.subTest(token=token):
                self.assertNotIn(token, script)
        core = (ROOT / "docs" / "project-core.js").read_text(encoding="utf-8")
        self.assertIn("export function readmeToBlocks", core)
        self.assertIn("export function findRepo", core)
        self.assertIn("export function validRepoName", core)

    def test_screenshot_viewer_is_in_page_and_keyboard_ready(self):
        page = (ROOT / "docs" / "project.html").read_text(encoding="utf-8")
        for token in (
            '<dialog class="gallery-lightbox" id="gallery-lightbox"',
            'aria-labelledby="lightbox-caption"',
            'aria-describedby="lightbox-meta"',
            'id="lightbox-image"',
            'id="lightbox-caption"',
            'id="lightbox-meta"',
            'id="lightbox-counter"',
            'id="lightbox-prev"',
            'id="lightbox-next"',
            'id="lightbox-close"',
            'id="lightbox-original"',
            'id="lightbox-announcer"',
            'aria-live="polite"',
            'aria-atomic="true"',
        ):
            with self.subTest(token=token):
                self.assertIn(token, page)
        script = (ROOT / "docs" / "project.js").read_text(encoding="utf-8")
        for token in (
            'from "./lightbox.js"',
            "createLightbox",
            "viewerItem",
            "gallery-open",
            "aria-controls",
        ):
            with self.subTest(token=token):
                self.assertIn(token, script)
        viewer = (ROOT / "docs" / "lightbox.js").read_text(encoding="utf-8")
        for token in (
            'from "./lightbox-core.js"',
            "showModal",
            "previouslyFocused",
            "lightbox-open",
            "lightbox-announcer",
            "viewerAnnouncement",
            "addEventListener(\"cancel\"",
            "addEventListener(\"keydown\"",
            "ArrowRight",
            "ArrowLeft",
            "Home",
            "End",
            "replaceChildren",
            "textContent",
        ):
            with self.subTest(token=token):
                self.assertIn(token, viewer)
        for source in (script, viewer):
            for token in ("innerHTML", "outerHTML", "document.write", "eval(", "new Function"):
                with self.subTest(source=source[:16], token=token):
                    self.assertNotIn(token, source)
        core = (ROOT / "docs" / "lightbox-core.js").read_text(encoding="utf-8")
        for token in (
            "export function clampIndex",
            "export function counterText",
            "export function stepIndex",
            "export function viewerAnnouncement",
        ):
            with self.subTest(token=token):
                self.assertIn(token, core)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        for token in (
            ".gallery-lightbox",
            ".lightbox-stage",
            ".gallery-lightbox::backdrop",
            ".gallery-lightbox:not([open])",
            "body.lightbox-open",
            ".gallery-open",
        ):
            with self.subTest(token=token):
                self.assertIn(token, css)

    def test_live_apps_are_wired_and_current(self):
        manifest_path = ROOT / "docs" / "live.json"
        self.assertTrue(manifest_path.is_file())
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["schema"], 2)
        apps = {app["slug"]: app for app in manifest["apps"]}
        self.assertEqual(
            set(apps),
            {
                "prism-relay",
                "weft",
                "iris",
                "tessera",
                "meridian",
                "palette",
                "afterimage",
                "orrery",
            },
        )

        prism = apps["prism-relay"]
        self.assertTrue(prism["available"])
        self.assertEqual(prism["mode"], "browser")
        self.assertEqual(prism["license"], "AGL-1.1")
        self.assertRegex(prism["path"], r"^live/prism-relay/[0-9a-f]{7,40}/index\.html$")
        self.assertTrue((ROOT / "docs" / prism["path"]).is_file())
        self.assertTrue((ROOT / "docs" / prism["license_path"]).is_file())
        self.assertTrue((ROOT / "LICENSES" / "LicenseRef-AGL-1.1.txt").is_file())
        self.assertRegex(prism["commit"], r"^[0-9a-f]{7,40}$")
        self.assertRegex(prism["updated"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertRegex(prism["digest"], r"^sha256:[0-9a-f]{64}$")
        game_dir = (ROOT / "docs" / prism["path"]).parent
        self.assertTrue((game_dir / "src" / "styles.css").is_file())
        self.assertTrue((game_dir / "src" / "game" / "engine.js").is_file())
        self.assertEqual(prism["builds"][0], prism["path"])
        self.assertLessEqual(len(prism["builds"]), 3)
        for build in prism["builds"]:
            with self.subTest(build=build):
                self.assertTrue((ROOT / "docs" / build).is_file())

        weft = apps["weft"]
        self.assertTrue(weft["available"])
        self.assertEqual(weft["mode"], "browser")
        self.assertEqual(weft["license"], "AGL-1.1")
        self.assertEqual(prism["dossier"], "project.html?repo=Prism-Relay")
        self.assertFalse(weft.get("dossier"))
        self.assertRegex(weft["path"], r"^live/weft/[0-9a-f]{7,40}/index\.html$")
        self.assertTrue((ROOT / "docs" / weft["path"]).is_file())
        self.assertTrue((ROOT / "docs" / weft["license_path"]).is_file())
        self.assertRegex(weft["commit"], r"^[0-9a-f]{7,40}$")
        self.assertRegex(weft["updated"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertRegex(weft["digest"], r"^sha256:[0-9a-f]{64}$")
        self.assertTrue((ROOT / "docs" / weft["logo"]).is_file())
        weft_dir = (ROOT / "docs" / weft["path"]).parent
        self.assertTrue((weft_dir / "src" / "ui" / "app.js").is_file())
        self.assertTrue((weft_dir / "src" / "game" / "engine.js").is_file())
        self.assertTrue((weft_dir / "assets" / "favicon.svg").is_file())
        self.assertEqual(weft["builds"][0], weft["path"])
        self.assertLessEqual(len(weft["builds"]), 3)
        for build in weft["builds"]:
            with self.subTest(build=build):
                self.assertTrue((ROOT / "docs" / build).is_file())

        iris = apps["iris"]
        self.assertTrue(iris["available"])
        self.assertEqual(iris["mode"], "browser")
        self.assertEqual(iris["license"], "AGL-1.1")
        self.assertFalse(iris.get("dossier"))
        self.assertEqual(
            iris.get("source_url"),
            "https://github.com/AegeanWorks/Iris",
        )
        self.assertRegex(iris["path"], r"^live/iris/[0-9a-f]{7,40}/index\.html$")
        self.assertTrue((ROOT / "docs" / iris["path"]).is_file())
        self.assertTrue((ROOT / "docs" / iris["license_path"]).is_file())
        self.assertRegex(iris["commit"], r"^[0-9a-f]{7,40}$")
        self.assertRegex(iris["updated"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertRegex(iris["digest"], r"^sha256:[0-9a-f]{64}$")
        self.assertTrue((ROOT / "docs" / iris["logo"]).is_file())
        iris_dir = (ROOT / "docs" / iris["path"]).parent
        self.assertTrue((iris_dir / "src" / "ui" / "app.js").is_file())
        self.assertTrue((iris_dir / "src" / "game" / "engine.js").is_file())
        self.assertTrue((iris_dir / "src" / "game" / "levels.js").is_file())
        self.assertTrue((iris_dir / "assets" / "favicon.svg").is_file())
        self.assertEqual(iris["builds"][0], iris["path"])
        self.assertLessEqual(len(iris["builds"]), 3)
        for build in iris["builds"]:
            with self.subTest(build=build):
                self.assertTrue((ROOT / "docs" / build).is_file())

        tessera = apps["tessera"]
        self.assertTrue(tessera["available"])
        self.assertEqual(tessera["mode"], "browser")
        self.assertEqual(tessera["license"], "AL-1.1")
        self.assertFalse(tessera.get("dossier"))
        self.assertEqual(
            tessera.get("source_url"),
            "https://github.com/AegeanWorks/Tessera",
        )
        self.assertRegex(tessera["path"], r"^live/tessera/[0-9a-f]{7,40}/index\.html$")
        self.assertTrue((ROOT / "docs" / tessera["path"]).is_file())
        self.assertTrue((ROOT / "docs" / tessera["license_path"]).is_file())
        self.assertTrue((ROOT / "LICENSES" / "LicenseRef-AL-1.1.txt").is_file())
        self.assertRegex(tessera["commit"], r"^[0-9a-f]{7,40}$")
        self.assertRegex(tessera["updated"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertRegex(tessera["digest"], r"^sha256:[0-9a-f]{64}$")
        self.assertTrue((ROOT / "docs" / tessera["logo"]).is_file())
        tessera_dir = (ROOT / "docs" / tessera["path"]).parent
        self.assertTrue((tessera_dir / "src" / "studio" / "svg.js").is_file())
        self.assertTrue((tessera_dir / "src" / "ui" / "app.js").is_file())
        self.assertTrue((tessera_dir / "src" / "theme.css").is_file())
        self.assertEqual(tessera["builds"][0], tessera["path"])
        self.assertLessEqual(len(tessera["builds"]), 3)
        for build in tessera["builds"]:
            with self.subTest(build=build):
                self.assertTrue((ROOT / "docs" / build).is_file())

        meridian = apps["meridian"]
        self.assertTrue(meridian["available"])
        self.assertEqual(meridian["mode"], "browser")
        self.assertEqual(meridian["license"], "AL-1.1")
        self.assertEqual(meridian["dossier"], "project.html?repo=Meridian")
        self.assertEqual(
            meridian.get("source_url"),
            "https://github.com/AegeanWorks/Meridian",
        )
        self.assertRegex(meridian["path"], r"^live/meridian/[0-9a-f]{7,40}/index\.html$")
        self.assertTrue((ROOT / "docs" / meridian["path"]).is_file())
        self.assertTrue((ROOT / "docs" / meridian["license_path"]).is_file())
        self.assertRegex(meridian["commit"], r"^[0-9a-f]{7,40}$")
        self.assertRegex(meridian["updated"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertRegex(meridian["digest"], r"^sha256:[0-9a-f]{64}$")
        self.assertTrue((ROOT / "docs" / meridian["logo"]).is_file())
        meridian_dir = (ROOT / "docs" / meridian["path"]).parent
        self.assertTrue((meridian_dir / "src" / "ui" / "main.js").is_file())
        self.assertTrue((meridian_dir / "src" / "core" / "schedule.js").is_file())
        self.assertTrue((meridian_dir / "assets" / "logo.svg").is_file())
        self.assertTrue((meridian_dir / "LICENSE").is_file())
        self.assertEqual(meridian["builds"][0], meridian["path"])
        self.assertLessEqual(len(meridian["builds"]), 3)
        for build in meridian["builds"]:
            with self.subTest(build=build):
                self.assertTrue((ROOT / "docs" / build).is_file())

        afterimage = apps["afterimage"]
        self.assertTrue(afterimage["available"])
        self.assertEqual(afterimage["mode"], "browser")
        self.assertEqual(afterimage["license"], "AGL-1.1")
        self.assertEqual(afterimage["dossier"], "project.html?repo=Afterimage")
        self.assertEqual(
            afterimage.get("source_url"),
            "https://github.com/AegeanWorks/Afterimage",
        )
        self.assertRegex(afterimage["path"], r"^live/afterimage/[0-9a-f]{7,40}/index\.html$")
        self.assertTrue((ROOT / "docs" / afterimage["path"]).is_file())
        self.assertTrue((ROOT / "docs" / afterimage["license_path"]).is_file())
        self.assertRegex(afterimage["commit"], r"^[0-9a-f]{7,40}$")
        self.assertRegex(afterimage["updated"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertRegex(afterimage["digest"], r"^sha256:[0-9a-f]{64}$")
        self.assertRegex(afterimage["version"], r"^\d+\.\d+\.\d+")
        self.assertTrue((ROOT / "docs" / afterimage["logo"]).is_file())
        afterimage_dir = (ROOT / "docs" / afterimage["path"]).parent
        for asset in ("styles.css", "game.js", "manifest.json", "favicon.svg", "pwa.js"):
            with self.subTest(asset=asset):
                self.assertTrue((afterimage_dir / asset).is_file())
        self.assertTrue((afterimage_dir / "icons" / "icon-192.png").is_file())
        self.assertFalse((afterimage_dir / "sw.js").exists())
        self.assertNotIn(
            "serviceWorker",
            (afterimage_dir / "pwa.js").read_text(encoding="utf-8"),
        )
        self.assertEqual(afterimage["builds"][0], afterimage["path"])
        self.assertLessEqual(len(afterimage["builds"]), 3)
        for build in afterimage["builds"]:
            with self.subTest(build=build):
                self.assertTrue((ROOT / "docs" / build).is_file())

        orrery = apps["orrery"]
        self.assertTrue(orrery["available"])
        self.assertEqual(orrery["mode"], "browser")
        self.assertEqual(orrery["license"], "ASL-1.1")
        self.assertEqual(orrery["dossier"], "project.html?repo=Orrery")
        self.assertEqual(orrery.get("source_url"), "https://github.com/AegeanWorks/Orrery")
        self.assertRegex(orrery["path"], r"^live/orrery/[0-9a-f]{7,40}/index\.html$")
        self.assertTrue((ROOT / "docs" / orrery["path"]).is_file())
        self.assertTrue((ROOT / "docs" / orrery["license_path"]).is_file())
        self.assertRegex(orrery["commit"], r"^[0-9a-f]{7,40}$")
        self.assertRegex(orrery["updated"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertRegex(orrery["digest"], r"^sha256:[0-9a-f]{64}$")
        self.assertRegex(orrery["version"], r"^\d+\.\d+\.\d+")
        self.assertTrue((ROOT / "docs" / orrery["logo"]).is_file())
        orrery_dir = (ROOT / "docs" / orrery["path"]).parent
        for asset in ("src/orrery.js", "data/scenarios.js", "favicon.svg"):
            with self.subTest(asset=asset):
                self.assertTrue((orrery_dir / asset).is_file())
        orrery_index = (orrery_dir / "index.html").read_text(encoding="utf-8")
        for source in re.findall(r'(?:src|href)="([^"]+)"', orrery_index):
            if source.startswith(("http://", "https://", "#", "mailto:")):
                continue
            with self.subTest(source=source):
                self.assertTrue((orrery_dir / source.split("#")[0].split("?")[0]).is_file())
        self.assertEqual(orrery["builds"][0], orrery["path"])
        self.assertLessEqual(len(orrery["builds"]), 3)
        for build in orrery["builds"]:
            with self.subTest(build=build):
                self.assertTrue((ROOT / "docs" / build).is_file())

        tool = ROOT / "tools" / "sync_live_apps.py"
        self.assertTrue(tool.is_file())
        result = subprocess.run(
            [sys.executable, str(tool), "--check"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=120,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

        page = (ROOT / "docs" / "play.html").read_text(encoding="utf-8")
        for token in (
            'id="live-grid"',
            'id="live-frame"',
            'id="live-player"',
            'id="live-version"',
            'id="live-frame-status"',
            'id="live-retry"',
            "live.js",
            "live.json",
            "frame-src 'self'",
            "Each live build keeps its own license",
            "AL-1.1 for apps",
        ):
            with self.subTest(token=token):
                self.assertIn(token, page)
        script = (ROOT / "docs" / "live.js").read_text(encoding="utf-8")
        for token in (
            'from "./live-core.js"',
            "live.json",
            "appFrameUrl",
            "showFrameError",
            "versionLabel",
            "requestFullscreen",
            "URLSearchParams",
            "Dossier",
            "app.dossier",
        ):
            with self.subTest(token=token):
                self.assertIn(token, script)
        project_script = (ROOT / "docs" / "project.js").read_text(encoding="utf-8")
        for token in ("live.json", "play.html?app=", "Open"):
            with self.subTest(token=token):
                self.assertIn(token, project_script)
        for name in ("index.html", "project.html"):
            with self.subTest(page=name):
                self.assertIn('href="play.html"', (ROOT / "docs" / name).read_text(encoding="utf-8"))
        home = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="live"', home)
        self.assertIn('id="live-home-grid"', home)
        self.assertIn("live-home.js", home)
        self.assertLess(home.index('id="work"'), home.index('id="live"'))
        self.assertLess(home.index('id="live"'), home.index('id="projects"'))
        primary = re.search(r'<nav class="site-nav".*?</nav>', home, re.S).group(0)
        self.assertLess(primary.index(">Work</a>"), primary.index(">Live</a>"))
        self.assertLess(primary.index(">Live</a>"), primary.index(">Projects</a>"))
        live_page = (ROOT / "docs" / "play.html").read_text(encoding="utf-8")
        live_nav = re.search(r'<nav class="site-nav".*?</nav>', live_page, re.S).group(0)
        self.assertLess(live_nav.index(">Work</a>"), live_nav.index(">Live</a>"))
        self.assertLess(live_nav.index(">Live</a>"), live_nav.index(">Projects</a>"))
        shots = json.loads((ROOT / "docs" / "live" / "shots.json").read_text(encoding="utf-8"))
        self.assertEqual(shots["schema"], 1)
        for slug in ("prism-relay", "weft", "iris", "tessera"):
            entry = shots["apps"][slug]
            self.assertGreaterEqual(len(entry["screenshots"]), 5)
            for shot in entry["screenshots"]:
                with self.subTest(slug=slug, shot=shot["src"]):
                    self.assertTrue(shot.get("alt"))
                    self.assertTrue((ROOT / "docs" / shot["src"]).is_file())
        meridian = shots["apps"]["meridian"]
        self.assertGreaterEqual(len(meridian["screenshots"]), 1)
        for shot in meridian["screenshots"]:
            with self.subTest(slug="meridian", shot=shot["src"]):
                self.assertTrue(shot.get("alt"))
                self.assertTrue((ROOT / "docs" / shot["src"]).is_file())
        home_script = (ROOT / "docs" / "live-home.js").read_text(encoding="utf-8")
        self.assertNotIn("slice(0, 3)", home_script)
        for token in ("live-home-slider", "live-home-nav", "live/shots.json", "Dossier", "app.dossier", "app.archived"):
            with self.subTest(token=token):
                self.assertIn(token, home_script)
        redirect = (ROOT / "docs" / "live.html").read_text(encoding="utf-8")
        self.assertIn('content="0; url=play.html"', redirect)
        self.assertIn('name="robots" content="noindex"', redirect)
        self.assertIn("play.html", redirect)
        sw = (ROOT / "docs" / "sw.js").read_text(encoding="utf-8")
        for entry in ("play.html", "live.html", "live.js", "live-core.js", "live-home.js", "live.json"):
            with self.subTest(entry=entry):
                self.assertIn(f'"{entry}"', sw)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        for token in (".live-grid", ".live-player", ".live-frame"):
            with self.subTest(token=token):
                self.assertIn(token, css)
        workflow = (ROOT / ".github" / "workflows" / "live.yml").read_text(
            encoding="utf-8"
        )
        for token in (
            "Prism-Relay",
            "Weft",
            "Iris",
            "Tessera",
            "Meridian",
            "Afterimage",
            "sync_live_apps.py",
            "--check-source",
            "actions/checkout@v7",
        ):
            with self.subTest(token=token):
                self.assertIn(token, workflow)

        catalog = json.loads((ROOT / "docs" / "live.json").read_text(encoding="utf-8"))
        palette = next(app for app in catalog["apps"] if app.get("slug") == "palette")
        self.assertTrue(palette["available"])
        self.assertEqual(palette["path"], "editor/index.html")
        self.assertEqual(palette["builds"], ["editor/index.html"])
        self.assertEqual(palette["license"], "AL-1.1")
        self.assertEqual(palette["source_url"], "https://github.com/AegeanWorks/Palette")
        self.assertTrue((ROOT / "docs" / palette["path"]).is_file())

    def test_editor_page_is_wired_and_synced(self):
        docs = ROOT / "docs"
        page = (docs / "editor.html").read_text(encoding="utf-8")
        for token in (
            'id="main"',
            'id="palette-frame"',
            'src="editor/index.html"',
            'title="Palette — a local-first image editor"',
            "frame-src 'self'",
            'class="skip"',
        ):
            with self.subTest(token=token):
                self.assertIn(token, page)
        for asset in re.findall(r'(?:src|href)="([^"]+)"', page):
            if asset.startswith(("http://", "https://", "#", "mailto:", "editor/")):
                continue
            with self.subTest(asset=asset):
                self.assertTrue((docs / asset.split("#")[0].split("?")[0]).exists())

        manifest = json.loads((docs / "editor" / "build.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["schema"], 1)
        self.assertEqual(manifest["name"], "palette")
        self.assertTrue(manifest["source_sha256"])
        files = manifest["files"]
        self.assertGreaterEqual(len(files), 16)
        for relative, digest in files.items():
            with self.subTest(file=relative):
                target = docs / "editor" / relative
                self.assertTrue(target.is_file())
                self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), digest)

        shell = (docs / "editor" / "index.html").read_text(encoding="utf-8")
        for token in ('src="./src/ui/main.js"', "Content-Security-Policy", "Palette"):
            with self.subTest(shell=token):
                self.assertIn(token, shell)
        self.assertNotRegex(shell, r'(?:src|href)="https?://(?:fonts|cdn|unpkg|jsdelivr)')

        for name in (
            "index.html",
            "play.html",
            "project.html",
            "verify.html",
            "security.html",
            "privacy.html",
            "accessibility.html",
        ):
            with self.subTest(page=name):
                self.assertIn('href="play.html?app=palette"', (docs / name).read_text(encoding="utf-8"))
                primary = re.search(r'<nav class="site-nav".*?</nav>', (docs / name).read_text(encoding="utf-8"), re.S)
                self.assertNotIn(">Editor</a>", primary.group(0))
        sitemap = (docs / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("https://aegeanworks.github.io/AegeanWorks/editor.html", sitemap)
        webmanifest = json.loads((docs / "site.webmanifest").read_text(encoding="utf-8"))
        shortcut_urls = {shortcut["url"] for shortcut in webmanifest["shortcuts"]}
        self.assertIn("/AegeanWorks/editor.html", shortcut_urls)

        sw = (docs / "sw.js").read_text(encoding="utf-8")
        block = sw.split("const PRECACHE = [", 1)[1].split("];", 1)[0]
        entries = set(re.findall(r'"([^"]+)"', block))
        self.assertIn("editor.html", entries)
        for relative in files:
            with self.subTest(precache=relative):
                self.assertIn(f"editor/{relative}", entries)

        css = (docs / "styles.css").read_text(encoding="utf-8")
        for token in (".editor-page", ".editor-frame", ".editor-noscript"):
            with self.subTest(css=token):
                self.assertIn(token, css)
        self.assertTrue((ROOT / "tools" / "sync_editor.py").is_file())

    def test_source_validator_covers_every_runtime_file(self):
        import importlib.util
        import tempfile

        tool = ROOT / "tools" / "sync_live_apps.py"
        spec = importlib.util.spec_from_file_location("sync_live_apps", tool)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        game = {
            "slug": "fixture",
            "repo": "Fixture",
            "source": "fixture",
            "runtime": ("index.html", "src", "assets"),
            "version_file": "package.json",
        }
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "fixture"
            (source / "src").mkdir(parents=True)
            (source / "assets").mkdir()
            (source / "index.html").write_text(
                '<script type="module" src="./src/main.js"></script>\n'
                '<script src="https://cdn.example/app.js?www.w3.org"></script>\n',
                encoding="utf-8",
            )
            (source / "package.json").write_text('{"version": "1.0.0"}\n', encoding="utf-8")
            (source / "LICENSE").write_text("# Aegean Game License 1.1\n", encoding="utf-8")
            (source / "src" / "main.js").write_text("export const ready = true;\n", encoding="utf-8")
            (source / "assets" / "logo.svg").write_text(
                '<svg xmlns="http://www.w3.org/2000/svg">'
                '<image href="https://cdn.example/logo.png"/></svg>\n',
                encoding="utf-8",
            )
            problems = module.validate_source(game, root)
        self.assertTrue(
            any("assets/logo.svg" in problem for problem in problems), problems
        )
        self.assertTrue(
            any("cdn.example/app.js?www.w3.org" in problem for problem in problems), problems
        )
        self.assertFalse(
            any("www.w3.org/2000/svg" in problem for problem in problems), problems
        )

    def test_optional_live_source_can_be_absent(self):
        import importlib.util
        import tempfile

        tool = ROOT / "tools" / "sync_live_apps.py"
        spec = importlib.util.spec_from_file_location("sync_live_apps_optional", tool)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.APPS = (
            {
                "slug": "optional",
                "repo": "Optional",
                "source": "optional",
                "license": "AL-1.1",
                "mode": "browser",
                "runtime": ("index.html", "src"),
                "version_file": "package.json",
                "logo": "live/optional/logo.svg",
                "optional": True,
            },
        )
        with tempfile.TemporaryDirectory() as temp:
            self.assertEqual(module.source_problems(Path(temp)), [])
            (Path(temp) / "optional").mkdir()
            problems = module.source_problems(Path(temp))
        self.assertTrue(any("no root index.html" in problem for problem in problems), problems)

    def _live_sync_module(self, name):
        import importlib.util

        tool = ROOT / "tools" / "sync_live_apps.py"
        spec = importlib.util.spec_from_file_location(name, tool)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def _live_fixture(self, root, archived):
        source = root / ("archive" if archived else "") / "fixture"
        (source / "src").mkdir(parents=True)
        (source / "index.html").write_text("<!doctype html>\n", encoding="utf-8")
        (source / "src" / "app.js").write_text("export const ready = true;\n", encoding="utf-8")
        (source / "package.json").write_text('{"version": "1.0.0"}\n', encoding="utf-8")
        (source / "LICENSE").write_text("# Aegean License 1.1\n", encoding="utf-8")
        if archived:
            (source / ".aikit").mkdir()
            (source / ".aikit" / "project.json").write_text(
                '{"name": "fixture", "archived": true}\n', encoding="utf-8"
            )
        return source

    def _live_fixture_app(self):
        return {
            "slug": "fixture",
            "repo": "Fixture",
            "source": "fixture",
            "title": "Fixture",
            "description": "A fixture app.",
            "license": "AL-1.1",
            "mode": "browser",
            "runtime": ("index.html", "src"),
            "version_file": "package.json",
            "logo": "live/fixture/logo.svg",
        }

    def test_archived_live_source_is_retained_after_the_folder_moves(self):
        import shutil
        import tempfile
        from unittest import mock

        module = self._live_sync_module("sync_live_apps_archived")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self._live_fixture(root, archived=True)
            (root / "docs" / "live" / "fixture").mkdir(parents=True)
            (root / "docs" / "live" / "fixture" / "logo.svg").write_text(
                "<svg/>\n", encoding="utf-8"
            )
            module.PROJECT_ROOT = root
            module.DOCS = root / "docs"
            module.MANIFEST_REL = "docs/live.json"
            module.APPS = (self._live_fixture_app(),)
            git_stub = lambda _source, *args: (
                "a" * 40 if args[:1] == ("rev-parse",) else "2026-11-07"
            )
            with mock.patch.object(module, "_git", side_effect=git_stub):
                manifest = module.build_manifest(root)
            entry = manifest["apps"][0]
            self.assertTrue(entry["archived"], entry)
            self.assertTrue(entry["available"])
            self.assertEqual(
                entry["path"], "live/fixture/aaaaaaaaaaaa/index.html"
            )
            manifest_path = root / "docs" / "live.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            self.assertEqual(module.check_manifest(), [])
            shutil.rmtree(source)
            self.assertEqual(module.source_problems(root), [])
            self.assertEqual(module.build_manifest(root), manifest)
            self.assertEqual(module.check_manifest(), [])

    def test_missing_unarchived_live_source_still_refuses(self):
        import shutil
        import tempfile
        from unittest import mock

        module = self._live_sync_module("sync_live_apps_unarchived")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self._live_fixture(root, archived=False)
            (root / "docs" / "live" / "fixture").mkdir(parents=True)
            (root / "docs" / "live" / "fixture" / "logo.svg").write_text(
                "<svg/>\n", encoding="utf-8"
            )
            module.PROJECT_ROOT = root
            module.DOCS = root / "docs"
            module.MANIFEST_REL = "docs/live.json"
            module.APPS = (self._live_fixture_app(),)
            git_stub = lambda _source, *args: (
                "b" * 40 if args[:1] == ("rev-parse",) else "2026-11-07"
            )
            with mock.patch.object(module, "_git", side_effect=git_stub):
                manifest = module.build_manifest(root)
            (root / "docs" / "live.json").write_text(
                json.dumps(manifest), encoding="utf-8"
            )
            shutil.rmtree(source)
            self.assertTrue(module.source_problems(root))
            with self.assertRaises(module.SyncError):
                module.build_manifest(root)

    def test_build_digest_is_stable_across_platforms(self):
        import importlib.util
        import tempfile

        tool = ROOT / "tools" / "sync_live_apps.py"
        spec = importlib.util.spec_from_file_location("sync_live_apps_digest", tool)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "assets").mkdir()
            (root / "index.html").write_text("<!doctype html>\n", encoding="utf-8", newline="\n")
            (root / "LICENSE").write_text("# Aegean License 1.1\n", encoding="utf-8", newline="\n")
            (root / "assets" / "logo.svg").write_text("<svg/>\n", encoding="utf-8", newline="\n")
            files = module._runtime_files(root)
            expected = hashlib.sha256()
            for name in sorted(
                ["assets/logo.svg", "index.html", "LICENSE"]
            ):
                expected.update(name.encode("utf-8"))
                expected.update(b"\0")
                expected.update((root / name).read_bytes())
                expected.update(b"\0")
            self.assertEqual(module._digest(files, root), "sha256:" + expected.hexdigest())

    def test_portfolio_cards_use_repository_logos(self):
        index = (ROOT / "docs" / "media" / "logos.json").read_text(encoding="utf-8")
        data = json.loads(index)
        self.assertEqual(data["schema"], 1)
        self.assertEqual(set(data["logos"]), PUBLIC_REPOS)
        for name, entry in data["logos"].items():
            with self.subTest(repo=name):
                self.assertTrue((ROOT / "docs" / entry["src"]).is_file(), entry["src"])
                manifest_file = ROOT / "docs" / "media" / f"{name}.json"
                if manifest_file.is_file():
                    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
                    self.assertFalse(
                        bool((manifest.get("logo") or {}).get("generated")),
                        f"{name} logo is a fallback placeholder card; authentic project artwork is required",
                    )
        script = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn('window.fetch("media/logos.json"', script)
        self.assertIn("applyCardLogos", script)
        self.assertIn('window.addEventListener("atlas:changed", applyCardLogos)', script)
        self.assertIn("has-logo", script)
        project_page = (ROOT / "docs" / "project.html").read_text(encoding="utf-8")
        self.assertIn('id="project-logo"', project_page)
        self.assertIn('id="project-preview"', project_page)

    def test_dossier_media_manifests_are_consistent(self):
        tool = ROOT / "tools" / "build_dossier_media.py"
        self.assertTrue(tool.is_file())
        result = subprocess.run(
            [sys.executable, str(tool), "check"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            cwd=str(ROOT),
            timeout=120,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_dossier_media_manifest_is_documented(self):
        docs = (ROOT / "docs" / "media" / "README.md").read_text(encoding="utf-8")
        for token in ("schema", "repo", "logo", "preview", "screenshots", "commit", "taken_at", "viewport", "digest"):
            with self.subTest(token=token):
                self.assertIn(token, docs)
        self.assertIn("media/<Name>.json", docs)
        page = (ROOT / "docs" / "project.html").read_text(encoding="utf-8")
        self.assertIn("img-src 'self' data:", page)
        script = (ROOT / "docs" / "project.js").read_text(encoding="utf-8")
        for token in (
            "await Promise.all([loadReadme(repo), loadMedia(repo), loadLive(repo)])",
            "hidden = false",
        ):
            with self.subTest(token=token):
                self.assertIn(token, script)

    def test_site_is_self_contained(self):
        html = read_site()
        for asset in re.findall(r'(?:src|href)="([^"]+)"', html):
            if asset.startswith(("http://", "https://", "#", "mailto:")):
                continue
            with self.subTest(asset=asset):
                self.assertTrue((ROOT / "docs" / asset.split("#")[0].split("?")[0]).exists())
        self.assertNotRegex(html, r'(?:src|href)="https?://(?:fonts|cdn|unpkg|jsdelivr)')

    def test_node_suites_are_esm(self):
        manifest = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertTrue(manifest["private"])
        self.assertEqual(manifest["type"], "module")
        self.assertNotIn("dependencies", manifest)
        self.assertIn("package.json", read_readme())
        workflow = (ROOT / ".github" / "workflows" / "tests.yml").read_text(encoding="utf-8")
        self.assertIn('node-version: "20"', workflow)

    def test_verifier_conveniences_are_wired(self):
        page = read_verify()
        for token in (
            'id="certificate-id"',
            'id="lookup-id"',
            'id="copy-result"',
            'id="download-result"',
            'id="export-status"',
            "drop the file anywhere",
            "Only have a certificate ID?",
        ):
            with self.subTest(token=token):
                self.assertIn(token, page)
        script = (ROOT / "docs" / "verify.js").read_text(encoding="utf-8")
        for token in (
            "handleIdLookup",
            "lookupRegister",
            "validCertificateId",
            "renderRegisterLookup",
            "copyResult",
            "downloadResult",
            "navigator.clipboard.writeText",
            "URL.createObjectURL",
            'addEventListener("drop"',
            '["dragenter", "dragover"]',
            "is-dragging",
        ):
            with self.subTest(token=token):
                self.assertIn(token, script)
        core = (ROOT / "docs" / "verify-core.js").read_text(encoding="utf-8")
        self.assertIn("export function validCertificateId", core)
        self.assertIn("export function lookupRegister", core)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".verify-form.is-dragging", css)
        self.assertIn(".verify-id-row", css)

    def test_service_worker_shell_is_complete(self):
        sw = (ROOT / "docs" / "sw.js").read_text(encoding="utf-8")
        for token in (
            "skipWaiting",
            "clients.claim",
            "navigationFirst",
            "shellFirst",
            "apiFirst",
            "api.github.com",
            "offline.html",
        ):
            with self.subTest(token=token):
                self.assertIn(token, sw)
        block = sw.split("const PRECACHE = [", 1)[1].split("];", 1)[0]
        entries = re.findall(r'"([^"]+)"', block)
        for needed in (
            "index.html",
            "project.html",
            "verify.html",
            "security.html",
            "privacy.html",
            "accessibility.html",
            "offline.html",
            "atlas-snapshot.json",
            "styles.css",
            "app.js",
            "sw-client.js",
            "atlas.js",
            "project.js",
            "lightbox.js",
            "lightbox-core.js",
            "play.html",
            "live.html",
            "live.js",
            "live-core.js",
            "live-home.js",
            "live.json",
            "live/shots.json",
            "verify.js",
        ):
            with self.subTest(entry=needed):
                self.assertIn(needed, entries)
        for entry in entries:
            with self.subTest(file=entry):
                self.assertTrue((ROOT / "docs" / entry).exists())
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn('navigator.serviceWorker.register("sw.js")', app)
        manifest = json.loads(
            (ROOT / "docs" / "site.webmanifest").read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["scope"], "/AegeanWorks/")
        offline = (ROOT / "docs" / "offline.html").read_text(encoding="utf-8")
        self.assertIn("You are offline.", offline)
        self.assertIn('href="/AegeanWorks/"', offline)
        self.assertIn("/AegeanWorks/styles.css", offline)
        self.assertNotIn("<script", offline)

    def test_trust_pages_are_published_and_linked(self):
        docs = ROOT / "docs"
        for name in ("security.html", "privacy.html", "accessibility.html"):
            with self.subTest(page=name):
                page = (docs / name).read_text(encoding="utf-8")
                self.assertIn("<main id=\"main\" tabindex=\"-1\">", page)
                self.assertIn('class="skip"', page)
                self.assertIn("Content-Security-Policy", page)
                self.assertIn("connect-src 'self'", page)
                self.assertNotRegex(page, r"<script(?![^>]*\bsrc=)[^>]*>")
                for asset in re.findall(r'(?:src|href)="([^"]+)"', page):
                    if asset.startswith(("http://", "https://", "#", "mailto:")):
                        continue
                    with self.subTest(asset=asset):
                        self.assertTrue((docs / asset.split("#")[0].split("?")[0]).exists())
        security = (docs / "security.html").read_text(encoding="utf-8")
        self.assertIn("HMAC signing key is never published", security)
        self.assertIn("register is the public proof", security)
        self.assertIn("90 days", security)
        privacy = (docs / "privacy.html").read_text(encoding="utf-8")
        self.assertIn("never uploaded", privacy)
        self.assertIn("api.github.com", privacy)
        self.assertIn("raw.githubusercontent.com", privacy)
        self.assertIn("sessionStorage", privacy)
        self.assertIn("no accounts, cookies, analytics", privacy)
        access = (docs / "accessibility.html").read_text(encoding="utf-8")
        self.assertIn("WCAG 2.2 Level AA", access)
        self.assertIn("Known limitations", access)
        self.assertIn("axe-core", access)
        for name in ("index.html", "verify.html", "project.html", "play.html"):
            page = (docs / name).read_text(encoding="utf-8")
            for link in ("security.html", "privacy.html", "accessibility.html"):
                with self.subTest(page=name, link=link):
                    self.assertIn(f'href="{link}"', page)
        not_found = (docs / "404.html").read_text(encoding="utf-8")
        for link in (
            "/AegeanWorks/?focus=search#projects",
            "/AegeanWorks/verify.html",
            "/AegeanWorks/security.html",
            "/AegeanWorks/privacy.html",
            "/AegeanWorks/accessibility.html",
        ):
            with self.subTest(link=link):
                self.assertIn(link, not_found)
        sitemap = (docs / "sitemap.xml").read_text(encoding="utf-8")
        for page in ("security.html", "privacy.html", "accessibility.html", "play.html"):
            self.assertIn(f"https://aegeanworks.github.io/AegeanWorks/{page}", sitemap)

    def test_trust_pages_share_the_full_legal_footer(self):
        docs = ROOT / "docs"
        expected = ("Commercial terms", "License catalog", "AL-1.1", "Source")
        for name in (
            "index.html",
            "project.html",
            "verify.html",
            "play.html",
            "security.html",
            "privacy.html",
            "accessibility.html",
        ):
            page = (docs / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                for label in expected:
                    self.assertIn(">" + label + "</a>", page)

    def test_privacy_table_labels_its_cells_for_narrow_screens(self):
        privacy = (ROOT / "docs" / "privacy.html").read_text(encoding="utf-8")
        self.assertEqual(privacy.count('data-label="Request"'), 4)
        self.assertEqual(privacy.count('data-label="Why"'), 4)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".trust-table td + td::before", css)
        self.assertIn("scrollbar-width: thin", css)
        self.assertIn("white-space: pre-wrap", css)
        self.assertIn(".error-links", css)
        self.assertIn(".footer-slim", css)
        offline = (ROOT / "docs" / "offline.html").read_text(encoding="utf-8")
        self.assertIn("site-footer footer-slim", offline)
        not_found = (ROOT / "docs" / "404.html").read_text(encoding="utf-8")
        self.assertNotIn("</a> \u00b7", not_found)
        self.assertIn("content: attr(data-label)", css)
        self.assertNotIn(".topic-bar", css)
        self.assertNotIn(".topic-label", css)

    def test_security_txt_is_valid(self):
        text = (ROOT / "docs" / ".well-known" / "security.txt").read_text(encoding="utf-8")
        fields = {}
        for line in text.splitlines():
            if ": " in line:
                key, value = line.split(": ", 1)
                fields[key.strip()] = value.strip()
        self.assertTrue(fields["Contact"].startswith("mailto:"))
        self.assertEqual(
            fields["Canonical"],
            "https://aegeanworks.github.io/AegeanWorks/.well-known/security.txt",
        )
        self.assertEqual(
            fields["Policy"], "https://aegeanworks.github.io/AegeanWorks/security.html"
        )
        self.assertRegex(fields["Expires"], r"^\d{4}-\d{2}-\d{2}T")
        self.assertGreaterEqual(fields["Expires"][:10], "2027-10-27")

    def test_atlas_search_topic_sort_and_url_state(self):
        html = read_site()
        self.assertIn('id="project-search"', html)
        self.assertIn('id="project-sort"', html)
        for value in ("curated", "recent", "name"):
            self.assertIn(f'<option value="{value}">', html)
        self.assertIn('id="clear-filters"', html)
        self.assertIn('id="topic-filters"', html)
        self.assertIn('id="project-archive"', html)
        for value in ("all", "active", "archived"):
            self.assertIn(f'<option value="{value}">', html)
        self.assertIn('aria-label="Filter by topic"', html)
        self.assertIn("Search projects, topics, languages", html)
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        for token in (
            "URLSearchParams",
            "history.replaceState",
            'params.get("q")',
            'params.get("topic")',
            'params.get("archive")',
            'params.get("sort")',
            "dataset.pushedAt",
            "card.dataset.topics",
            "card.dataset.archived",
            "archiveSelect",
            "function buildTopicChips",
            "showAllTopics",
            "topic-more",
            "is-expanded",
            'button.setAttribute("aria-expanded"',
            "aria-pressed",
            'event.key !== "/"',
        ):
            with self.subTest(token=token):
                self.assertIn(token, app)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        for token in (
            ".project-toolbar",
            ".topic-filters",
            ".topic-filters.is-expanded",
            ".topic-chip.is-active",
            ".visually-hidden",
        ):
            with self.subTest(token=token):
                self.assertIn(token, css)

    def test_portfolio_scripts_are_cache_coherent(self):
        """A new Status control must never run against an older cached app.js."""
        html = read_site()
        app_tag = re.search(r'<script src="app\.js\?v=(\d+)" defer></script>', html)
        self.assertIsNotNone(app_tag, "index.html must request a versioned app.js")
        atlas_tag = re.search(r'<script type="module" src="atlas\.js\?v=(\d+)"></script>', html)
        self.assertIsNotNone(atlas_tag, "index.html must request a versioned atlas.js")
        client_tag = re.search(r'<script src="sw-client\.js\?v=(\d+)" defer></script>', html)
        self.assertIsNotNone(client_tag, "index.html must request a versioned sw-client.js")
        version = app_tag.group(1)
        self.assertEqual(atlas_tag.group(1), version)
        self.assertEqual(client_tag.group(1), version)
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn(f'root.dataset.appVersion = "{version}";', app)
        client = (ROOT / "docs" / "sw-client.js").read_text(encoding="utf-8")
        for token in (
            f'var APP_VERSION = "{version}";',
            "expectedVersion",
            'script[src*="app.js?v="]',
            "controllerchange",
            "registration.update()",
            "registration.unregister()",
            "window.location.reload()",
        ):
            with self.subTest(token=token):
                self.assertIn(token, client)
        sw = (ROOT / "docs" / "sw.js").read_text(encoding="utf-8")
        self.assertIn(f'const VERSION = "aegeanworks-shell-v{version}";', sw)
        self.assertIn('"sw-client.js"', sw)
        self.assertIn("versionedFirst", sw)
        self.assertIn('url.searchParams.has("v")', sw)

    def test_live_atlas_is_wired_to_the_github_api(self):
        html = read_site()
        app_tag = re.search(r'<script src="app\.js\?v=(\d+)" defer></script>', html)
        self.assertIsNotNone(app_tag, "index.html must request a versioned app.js")
        self.assertIn(f'<script type="module" src="atlas.js?v={app_tag.group(1)}"></script>', html)
        self.assertIn('id="atlas-status"', html)
        self.assertIn('data-mode="snapshot"', html)
        self.assertEqual(html.count("data-project-count"), 2)
        self.assertIn("Project metadata is read from the public GitHub API.", html)
        core = (ROOT / "docs" / "atlas-core.js").read_text(encoding="utf-8")
        ui = (ROOT / "docs" / "atlas.js").read_text(encoding="utf-8")
        self.assertIn(
            'export const API_ROOT = "https://api.github.com/users/AegeanWorks/repos";', core
        )
        self.assertIn('export const CACHE_KEY = "aegean:atlas:v3";', core)
        self.assertIn("CACHE_TTL_MS = 10 * 60 * 1000", core)
        self.assertIn("export function planSync", core)
        self.assertIn("export async function fetchAllRepos", core)
        self.assertIn("export function inferCategory", core)
        self.assertIn('credentials: "omit"', ui)
        self.assertIn('referrerPolicy: "no-referrer"', ui)
        self.assertIn("controller.abort()", ui)
        self.assertIn("window.clearTimeout(timer)", ui)
        self.assertIn("title.textContent = repo.name", ui)
        self.assertIn('element.dataset.archived = repo.archived ? "true" : "false";', ui)
        self.assertIn('anchor.dataset.archived = repo.archived ? "true" : "false";', ui)
        self.assertIn(
            'window.addEventListener("atlas:changed"',
            (ROOT / "docs" / "app.js").read_text(encoding="utf-8"),
        )
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn("updateProjectCounts();", app)
        self.assertIn("This never reveals every card at once", app)
        self.assertIn("sessionStorage", ui)
        for token in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"):
            with self.subTest(token=token):
                self.assertNotIn(token, core)
                self.assertNotIn(token, ui)
        self.assertIn("connect-src 'self' https://api.github.com", html)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".work-card[hidden] { display: none !important; }", css)

    def test_site_lists_every_public_repository_once(self):
        html = read_site()
        cards = re.findall(
            r'class="project reveal"[^>]*data-repo-url="https://github\.com/AegeanWorks/([A-Za-z0-9._-]+)"',
            html,
        )
        self.assertEqual(len(cards), len(PUBLIC_REPOS))
        self.assertEqual(set(cards), PUBLIC_REPOS)
        for name in PUBLIC_REPOS:
            with self.subTest(repo=name):
                self.assertIn(f'href="project.html?repo={name}"', html)

    def test_site_filters_are_topics_only(self):
        html = read_site()
        self.assertNotIn('data-filter="', html)
        for _category, label in CATEGORY_LABELS.items():
            with self.subTest(label=label):
                self.assertNotIn(f">{label}</button>", html)
        filters = html.split('<div class="filters"', 1)[1].split("</div>", 1)[0]
        self.assertIn('id="topic-filters"', filters)
        self.assertNotIn("<span>", filters)

    def test_project_cards_carry_an_immutable_repository_id(self):
        html = read_site()
        snapshot = {repo["name"]: repo for repo in read_metadata()["repositories"]}
        cards = re.findall(
            r'<a class="project reveal" data-repo-id="(\d+)"[^>]*data-repo-url="https://github\.com/AegeanWorks/([^"]+)"',
            html,
        )
        self.assertEqual(len(cards), len(PUBLIC_REPOS))
        ids = [card[0] for card in cards]
        self.assertEqual(len(ids), len(set(ids)))
        for repo_id, name in cards:
            with self.subTest(repo=name):
                self.assertEqual(str(snapshot[name]["id"]), repo_id)
        snapshot_ids = [str(repo["id"]) for repo in snapshot.values()]
        self.assertEqual(len(snapshot_ids), len(set(snapshot_ids)))
        self.assertTrue(all(int(repo_id) > 0 for repo_id in snapshot_ids))
        for repo in snapshot.values():
            with self.subTest(repo=repo["name"]):
                self.assertIn("language", repo)
                self.assertIn("license", repo)
                self.assertIn("pushed_at", repo)
                self.assertTrue(repo["pushed_at"])

    def test_project_cards_show_language_license_and_recency(self):
        html = read_site()
        families = read_license_families()
        snapshot = {str(repo["id"]): repo for repo in read_metadata()["repositories"]}
        self.assertEqual(set(families), {name.lower() for name in PUBLIC_REPOS})
        for repo_id, repo in snapshot.items():
            with self.subTest(repo=repo["name"]):
                language = html_escape(repo["language"], quote=True)
                family = html_escape(families[repo["name"].lower()], quote=True)
                pushed = html_escape(repo["pushed_at"], quote=True)
                self.assertIn(f'data-language="{language}"', html)
                self.assertIn(f'data-license="{family}"', html)
                self.assertIn(f'data-pushed-at="{pushed}"', html)
                self.assertIn(f" · {family} · Updated ", html)
        self.assertNotIn("Custom license", html)
        self.assertEqual(html.count('class="project-facts"'), len(PUBLIC_REPOS))
        self.assertIn(" · Updated ", html)
        self.assertIn(f"<span data-project-count>{len(PUBLIC_REPOS)}</span>", html)
        public = json.loads((ROOT / "docs" / "atlas-snapshot.json").read_text(encoding="utf-8"))
        self.assertEqual(public["repositories"], read_metadata()["repositories"])
        self.assertEqual(public["profile"], read_metadata()["profile"])

    def test_featured_work_cards_carry_an_immutable_repository_id(self):
        html = read_site()
        snapshot = {str(repo["id"]): repo for repo in read_metadata()["repositories"]}
        cards = re.findall(
            r'<a class="work-card[^"]*" data-repo-id="(\d+)"[^>]*href="https://github\.com/AegeanWorks/([^"]+)"',
            html,
        )
        self.assertEqual(len(cards), 4)
        for repo_id, name in cards:
            with self.subTest(repo=name):
                self.assertEqual(snapshot[repo_id]["name"], name)
        self.assertIn('data-mode="snapshot"', html)
        self.assertIn("Built-in snapshot", html)

    def test_site_licensing_copy_is_current(self):
        html = read_site()
        for token in ("AL-1.1", "AGL-1.1", "ASL-1.1", "ACL-1.0"):
            with self.subTest(token=token):
                self.assertIn(token, html)
        self.assertIn("Aegean Commercial License 1.0", html)
        self.assertNotIn("GNU AGPL-3.0</h3>", html)
        self.assertNotIn("AGPL-3.0 with a commercial waiver", html)

    def test_licensing_copy_names_the_agpl_transition(self):
        html = read_site()
        self.assertIn("publishes source-available and open-source projects", html)
        self.assertIn("each repository's LICENSE governs", html)
        self.assertIn("including its commercial permissions", html)
        self.assertIn("Commercial terms where they apply.", html)
        readme = read_readme()
        self.assertIn("publishes source-available and open-source projects", readme)
        self.assertIn("each repository's LICENSE governs", readme)
        self.assertIn("including its commercial permissions", readme)

    def test_project_count_names_project_repositories(self):
        html = read_site()
        self.assertIn(
            f"<span data-project-count>{len(PUBLIC_REPOS)}</span> public project repositories. "
            "Search them, or filter by topic.",
            html,
        )
        self.assertNotIn("Thirty-three repositories, all public.", html)
        self.assertIn("Every project repository below is public.", read_readme())

    def test_site_license_tiers_link_to_canonical_texts(self):
        html = read_site()
        for name in ("AL-1.1.md", "AGL-1.1.md", "ASL-1.1.md"):
            with self.subTest(name=name):
                self.assertIn(
                    "https://github.com/AegeanWorks/Aegean-Licensing/blob/master/licenses/"
                    + name,
                    html,
                )
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".license-card li a {", css)

    def test_external_links_are_safe(self):
        html = read_site()
        for match in re.finditer(r"<a\b[^>]*target=\"_blank\"[^>]*>", html):
            with self.subTest(tag=match.group(0)[:80]):
                self.assertIn('rel="noopener"', match.group(0))

    def test_site_accessibility_basics(self):
        html = read_site()
        self.assertIn('<html lang="en"', html)
        self.assertIn('name="viewport"', html)
        self.assertIn('name="description"', html)
        self.assertIn('class="skip"', html)
        self.assertIn('aria-live="polite"', html)
        self.assertIn('role="status"', html)
        self.assertIn('<main id="main" tabindex="-1">', html)

    def test_site_works_without_javascript(self):
        html = read_site()
        self.assertNotIn('class="no-js"', html)
        self.assertIn('<noscript>', html)
        self.assertIn('class="noscript-nav"', html)
        self.assertIn('.nav-toggle{display:none!important}', html)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".noscript-nav {\n  display: none;", css)
        self.assertIn(".noscript-nav { display: flex; }", css)
        self.assertIn(".js .site-nav {", css)
        self.assertIn(".js .nav-toggle { display: block; }", css)
        self.assertIn(".js .reveal {", css)

    def test_site_degrades_open_when_the_script_fails(self):
        script = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn('root.classList.add("js")', script)
        self.assertLess(
            script.index('root.classList.add("js")'),
            script.index('var reduceMotion'),
            "the js class must be added only after navigation and filtering setup",
        )
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("  .js .site-nav {", css)
        self.assertIn("  .js .site-header[data-open=\"true\"] .site-nav {", css)
        reduced = css.split("@media (prefers-reduced-motion: reduce)")[1]
        self.assertIn(".js .reveal", reduced)

    def test_hero_chip_is_exposed_to_assistive_tech(self):
        html = read_site()
        self.assertIn('<div class="hero-visual">', html)
        self.assertIn('<svg class="orbit" viewBox="0 0 520 520" aria-hidden="true">', html)
        self.assertIn("Local runtime", html)

    def test_social_metadata_is_complete(self):
        html = read_site()
        for token in (
            'property="og:image:type" content="image/png"',
            'property="og:locale" content="en_US"',
            'name="twitter:image:alt"',
            'name="twitter:creator" content="@AegeanWorks"',
            'property="og:image:alt"',
            'name="twitter:card"',
            'name="robots" content="index,follow,max-image-preview:large"',
        ):
            with self.subTest(token=token):
                self.assertIn(token, html)

    def test_structured_data_describes_the_organization(self):
        html = read_site()
        match = re.search(
            r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>', html, re.S
        )
        self.assertIsNotNone(match)
        data = json.loads(match.group(1))
        self.assertEqual(data["@context"], "https://schema.org")
        nodes = {node["@type"]: node for node in data["@graph"]}
        organization = nodes["Organization"]
        website = nodes["WebSite"]
        self.assertEqual(organization["name"], "AegeanWorks")
        self.assertEqual(organization["url"], "https://aegeanworks.github.io/AegeanWorks/")
        self.assertIn("https://github.com/AegeanWorks", organization["sameAs"])
        self.assertEqual(website["publisher"]["@id"], organization["@id"])
        self.assertEqual(website["inLanguage"], "en")

    def test_topic_filter_region_controls_the_project_grid(self):
        html = read_site()
        self.assertNotIn('class="chip"', html)
        self.assertIn('<div class="topic-filters" id="topic-filters" role="group" aria-label="Filter by topic"></div>', html)
        self.assertIn('<div class="project-grid" id="project-grid">', html)
        script = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn('querySelectorAll(".topic-chip")', script)
        self.assertNotIn("state.cat", script)

    def test_anchor_navigation_clears_the_sticky_header(self):
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("scroll-margin-top: 88px", css)
        self.assertIn("body.nav-open { overflow: hidden; }", css)
        self.assertIn("#main:focus { outline: none; }", css)
        self.assertIn("text-wrap: balance;", css)
        self.assertIn("text-wrap: pretty;", css)

    def test_discovery_files(self):
        docs = ROOT / "docs"
        robots = (docs / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("User-agent: *", robots)
        self.assertIn(
            "Sitemap: https://aegeanworks.github.io/AegeanWorks/sitemap.xml", robots
        )
        sitemap = (docs / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("<loc>https://aegeanworks.github.io/AegeanWorks/</loc>", sitemap)
        self.assertIsNotNone(ET.fromstring(sitemap))

    def test_social_image_has_the_expected_dimensions(self):
        png = (ROOT / "docs" / "og.png").read_bytes()
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        width = int.from_bytes(png[16:20], "big")
        height = int.from_bytes(png[20:24], "big")
        self.assertEqual((width, height), (1200, 630))

    def test_not_found_page_is_noindexed(self):
        page = (ROOT / "docs" / "404.html").read_text(encoding="utf-8")
        self.assertIn('name="robots" content="noindex"', page)
        self.assertIn('href="/AegeanWorks/"', page)
        self.assertIn('name="description"', page)

    def test_web_app_manifest(self):
        manifest = json.loads(
            (ROOT / "docs" / "site.webmanifest").read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["name"], "AegeanWorks")
        self.assertEqual(manifest["start_url"], "/AegeanWorks/")
        self.assertEqual(manifest["id"], "/AegeanWorks/")
        self.assertEqual(manifest["lang"], "en")
        self.assertEqual(manifest["dir"], "ltr")
        self.assertIn("productivity", manifest["categories"])
        self.assertEqual(manifest["display"], "standalone")
        shortcut_urls = {shortcut["url"] for shortcut in manifest["shortcuts"]}
        self.assertIn("/AegeanWorks/play.html", shortcut_urls)
        self.assertIn("/AegeanWorks/verify.html", shortcut_urls)
        sources = {icon["src"] for icon in manifest["icons"]}
        for expected in ("favicon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"):
            with self.subTest(expected=expected):
                self.assertIn(expected, sources)
        for icon in manifest["icons"]:
            with self.subTest(icon=icon["src"]):
                self.assertTrue((ROOT / "docs" / icon["src"]).is_file())

        html = read_site()
        self.assertIn('rel="manifest" href="site.webmanifest"', html)
        self.assertIn('rel="apple-touch-icon" sizes="180x180"', html)
        self.assertIn('sizes="192x192" href="icon-192.png"', html)

    def test_verify_page_has_a_no_javascript_path(self):
        page = read_verify()
        self.assertIn(".verify-form,.verify-register{display:none!important}", page)
        self.assertIn('<div class="verify-card verify-noscript">', page)
        self.assertIn("The public Python verifier below performs", page)
        self.assertIn('id="verify-submit" disabled', page)
        script = (ROOT / "docs" / "verify.js").read_text(encoding="utf-8")
        self.assertIn("submitButton.disabled = true", script)
        self.assertIn("submitButton.disabled = false", script)
        self.assertIn("refreshButton.disabled = false", script)

    def test_verifier_caps_fetches_before_reading(self):
        ui = (ROOT / "docs" / "verify.js").read_text(encoding="utf-8")
        self.assertIn("function readCapped", ui)
        self.assertIn("response.body.getReader()", ui)
        self.assertIn('response.headers.get("content-length")', ui)
        self.assertIn('credentials: "omit"', ui)
        self.assertIn('referrerPolicy: "no-referrer"', ui)
        self.assertIn("reader.cancel()", ui)

    def test_verifier_checks_types_before_canonicalization(self):
        core = (ROOT / "docs" / "verify-core.js").read_text(encoding="utf-8")
        self.assertIn("function typeError(certificate)", core)
        self.assertLess(core.index("const malformed = typeError(certificate)"), core.index("computed = await computeDigest(certificate)"))
        self.assertIn("Certificate payload cannot be canonicalized", core)

    def test_verifier_canonical_numbers_and_del_are_bounded(self):
        core = (ROOT / "docs" / "verify-core.js").read_text(encoding="utf-8")
        self.assertIn("Number.isSafeInteger(value)", core)
        self.assertIn("codePoint === 0x7f", core)
        self.assertIn('replace(/^\\uFEFF/, "")', core)
        self.assertIn("stringList(raw.scopes", core)
        self.assertIn("Terms registry must list at least one license", core)

    def test_verifier_explains_a_disabled_browser_crypto_path(self):
        script = (ROOT / "docs" / "verify.js").read_text(encoding="utf-8")
        self.assertIn("window.crypto", script)
        self.assertIn("crypto.subtle", script)
        self.assertIn("Web Crypto is not available", script)
        self.assertIn("state.termTexts.clear()", script)
        self.assertIn('"No canonical registry loaded."', script)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".btn:disabled", css)
        self.assertIn("cursor: not-allowed", css)

    def test_icon_dimensions(self):
        for name, expected in (
            ("apple-touch-icon.png", (180, 180)),
            ("icon-192.png", (192, 192)),
            ("icon-512.png", (512, 512)),
        ):
            with self.subTest(icon=name):
                png = (ROOT / "docs" / name).read_bytes()
                self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
                width = int.from_bytes(png[16:20], "big")
                height = int.from_bytes(png[20:24], "big")
                self.assertEqual((width, height), expected)

    def test_mobile_orbit_labels_are_large_enough(self):
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".orbit .node text { font-size: 14px; }", css)
        self.assertIn("max-height: calc(100vh - 72px);", css)

    def test_print_media_reveals_every_section(self):
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("@media print {", css)
        block = css.split("@media print {", 1)[1]
        self.assertIn(".reveal,", block)
        self.assertIn("opacity: 1; transform: none; transition: none !important;", block)
        self.assertIn("print-color-adjust: exact", block)
        self.assertIn(".site-header,", block)
        self.assertIn(".filters,", block)

    def test_mobile_menu_is_opaque_and_single_github_entry(self):
        html = read_site()
        primary = re.search(r'<nav class="site-nav".*?</nav>', html, re.S).group(0)
        footer = re.search(
            r'<nav class="footer-col" aria-label="Site">.*?</nav>', html, re.S
        ).group(0)
        self.assertEqual(primary.count('class="nav-github"'), 1)
        self.assertEqual(footer.count('class="nav-github"'), 0)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn("background: #05080f;", css)
        self.assertIn("box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);", css)
        self.assertIn("body.nav-open::after", css)
        self.assertIn(".orbit { width: min(100%, 440px); }", css)

    def test_mobile_scrim_absorbs_taps(self):
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        block = css.split("body.nav-open::after {")[1].split("}")[0]
        self.assertIn("z-index: 40;", block)
        self.assertIn("pointer-events: auto;", block)
        self.assertNotIn("pointer-events: none;", block)

    def test_open_menu_makes_the_page_behind_inert(self):
        script = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn('document.querySelectorAll("main, .site-footer")', script)
        self.assertIn("region.inert = inert;", script)
        self.assertIn("setBackgroundInert(open);", script)

    def test_open_menu_contains_keyboard_focus(self):
        script = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn("function menuFocusables()", script)
        self.assertIn("header.contains(active)", script)
        self.assertIn('event.key !== "Tab"', script)

    def test_header_links_close_the_open_menu(self):
        script = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        header_block = script.split("if (header) {")[1].split("}")[0]
        self.assertIn('event.target.closest("a")', header_block)
        self.assertIn("setNav(false);", header_block)

    def test_license_identifiers_do_not_break_at_hyphens(self):
        html = read_site()
        self.assertIn('<span class="nw">ACL-1.0</span>', html)
        for identifier in ("AL-1.1", "AGL-1.1", "ASL-1.1"):
            with self.subTest(identifier=identifier):
                self.assertIn(f'<span class="nw">{identifier}</span>', html)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".nw { white-space: nowrap; }", css)

    def test_site_recovers_when_app_js_fails(self):
        html = read_site()
        self.assertIn("script-failed", html)
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".script-failed .site-nav {", css)
        self.assertIn(".script-failed .nav-toggle { display: none; }", css)

    def test_noscript_nav_is_inside_the_sticky_header(self):
        html = read_site()
        header_start = html.index("<header")
        header_end = html.index("</header>")
        nav = html.index('class="noscript-nav"')
        self.assertLess(header_start, nav)
        self.assertLess(nav, header_end)

    def test_orbit_animation_is_centred(self):
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        self.assertIn(".orbit-nodes", css)
        self.assertIn("transform-box: view-box", css)
        self.assertIn("transform-box: fill-box", css)
        self.assertIn("@keyframes spin-reverse", css)
        self.assertNotIn("transform-origin: 260px 260px", css)

    def test_hero_mark_is_centred_in_its_square(self):
        html = read_site()
        square = re.search(
            r'<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="26"', html
        )
        self.assertIsNotNone(square)
        x, y, width, height = (int(value) for value in square.groups())
        self.assertEqual(x + width / 2, 260)
        self.assertEqual(y + height / 2, 260)

        waves = re.findall(r'<path d="M(\d+) (\d+)c7-6 15 6 23 0s15 6 23 0"', html)
        self.assertEqual(len(waves), 3)
        for start_x, _ in waves:
            self.assertEqual(int(start_x) + 23, 260)

    def test_aikit_memory_intact(self):
        aikit_dir = ROOT / ".aikit"
        for name in ("project.json", "guidelines.md", "decisions.md", "task_ledger.json"):
            with self.subTest(file=name):
                self.assertTrue((aikit_dir / name).is_file())

        project_json = json.loads((aikit_dir / "project.json").read_text(encoding="utf-8"))
        self.assertEqual(project_json.get("name"), "aegeanworks")

    def test_ci_workflow_runs_the_suite(self):
        workflow = ROOT / ".github" / "workflows" / "tests.yml"
        self.assertTrue(workflow.is_file())
        text = workflow.read_text(encoding="utf-8")
        self.assertIn("branches: [main]", text)
        self.assertIn("python -m unittest discover -s tests", text)
        self.assertIn("permissions:", text)
        self.assertIn("contents: read", text)

    def test_ci_workflow_runs_the_node_parity_suite(self):
        workflow = (ROOT / ".github" / "workflows" / "tests.yml").read_text(encoding="utf-8")
        self.assertIn("actions/setup-node", workflow)
        self.assertIn("node tests/verify/run-tests.mjs", workflow)
        self.assertIn("node tests/atlas/run-tests.mjs", workflow)
        self.assertIn("node tests/project/run-tests.mjs", workflow)
        self.assertIn("node tests/live/run-tests.mjs", workflow)

    def test_snapshot_covers_every_public_repository(self):
        metadata = read_metadata()
        self.assertEqual({repo["name"] for repo in metadata["repositories"]}, PUBLIC_REPOS)
        self.assertGreaterEqual(len(metadata["profile"]["description"]), 80)
        self.assertIn("local-first", metadata["profile"]["description"])

    def test_site_metadata_matches_the_github_profile(self):
        description = read_metadata()["profile"]["description"]
        html = read_site()
        self.assertIn(f'<meta name="description" content="{description}">', html)
        self.assertIn(f'<meta property="og:description" content="{description}">', html)
        self.assertIn(f'<meta name="twitter:description" content="{description}">', html)
        match = re.search(r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>', html, re.S)
        data = json.loads(match.group(1))
        organization = {node["@type"]: node for node in data["@graph"]}["Organization"]
        self.assertEqual(organization["description"], description)
        website = {node["@type"]: node for node in data["@graph"]}["WebSite"]
        self.assertIn("{search_term_string}", website["potentialAction"]["target"])
        item_lists = [node for node in data["@graph"] if node["@type"] == "ItemList"]
        self.assertEqual(len(item_lists), 1)
        item_list = item_lists[0]
        self.assertEqual(item_list["numberOfItems"], len(PUBLIC_REPOS))
        self.assertEqual(len(item_list["itemListElement"]), len(PUBLIC_REPOS))
        code_repositories = {
            item["item"]["codeRepository"] for item in item_list["itemListElement"]
        }
        self.assertEqual(len(code_repositories), len(PUBLIC_REPOS))
        for name in PUBLIC_REPOS:
            self.assertIn(f"https://github.com/AegeanWorks/{name}", code_repositories)
        self.assertIn("connect-src 'self' https://api.github.com", html)

    def test_project_cards_match_github_metadata(self):
        html = read_site()
        blocks = re.findall(r'<a class="project reveal".*?</a>', html, re.S)
        self.assertEqual(len(blocks), len(PUBLIC_REPOS))
        omitted = {"aikit", "python", "source-available"}
        for repo in read_metadata()["repositories"]:
            with self.subTest(repo=repo["name"]):
                marker = f'data-repo-url="https://github.com/AegeanWorks/{repo["name"]}"'
                block = next((item for item in blocks if marker in item), None)
                self.assertIsNotNone(block)
                self.assertIn(f'<h3>{repo["name"]}</h3>', block)
                self.assertIn(
                    f'<p>{html_escape(repo["description"], quote=False)}</p>', block
                )
                self.assertIn('data-topics="' + ",".join(repo["topics"]) + '"', block)
                archived = "true" if repo.get("archived") else "false"
                self.assertIn(f'data-archived="{archived}"', block)
                pushed = re.search(r'data-pushed-at="(\d{4}-\d{2}-\d{2})', block)
                self.assertIsNotNone(pushed, repo["name"])
                self.assertIn(f"Updated {pushed.group(1)}", block, repo["name"])
                expected = [topic for topic in repo["topics"] if topic not in omitted][:6]
                self.assertEqual(
                    re.findall(r'<span class="tag">([^<]+)</span>', block), expected
                )

    def test_readme_atlas_matches_github_metadata(self):
        rows = dict(
            re.findall(
                r"\| \[([^\]]+)\]\(https://github\.com/AegeanWorks/[^)]+\) \| ([^|]+) \|",
                read_readme(),
            )
        )
        self.assertEqual(set(rows), PUBLIC_REPOS)
        for repo in read_metadata()["repositories"]:
            with self.subTest(repo=repo["name"]):
                self.assertEqual(rows[repo["name"]].strip(), repo["description"].strip())

    def test_verify_page_is_linked_and_complete(self):
        index = read_site()
        page = read_verify()
        self.assertIn('href="verify.html"', index)
        self.assertIn("Verify a license", index)
        self.assertIn(
            "aegeanworks.github.io/AegeanWorks/verify.html", read_readme()
        )
        for token in (
            'id="verify-form"',
            'id="certificate-input"',
            'id="verify-result"',
            "verify.js",
            "app.js",
            "styles.css",
        ):
            with self.subTest(token=token):
                self.assertIn(token, page)
        script = (ROOT / "docs" / "verify.js").read_text(encoding="utf-8")
        self.assertIn('from "./verify-core.js"', script)
        self.assertIn('aria-live="polite"', page)
        self.assertIn('role="status"', page)
        self.assertIn("certificate never leaves it", page)

    def test_verify_page_is_self_contained(self):
        page = read_verify()
        for asset in re.findall(r'(?:src|href)="([^"]+)"', page):
            if asset.startswith(("http://", "https://", "#", "mailto:")):
                continue
            with self.subTest(asset=asset):
                self.assertTrue((ROOT / "docs" / asset.split("#")[0].split("?")[0]).exists())
        self.assertNotRegex(page, r'<script[^>]+src="https?://')
        self.assertNotRegex(page, r'<link[^>]+href="https?://(?:fonts|cdn|unpkg|jsdelivr)')
        self.assertIn('class="skip"', page)
        self.assertIn('<main id="main" tabindex="-1">', page)

    def test_verifier_reads_only_the_canonical_registry(self):
        core = (ROOT / "docs" / "verify-core.js").read_text(encoding="utf-8")
        hosts = set(re.findall(r"https?://([^/\"]+)", core))
        self.assertEqual(hosts, {"raw.githubusercontent.com"})
        self.assertIn("AegeanWorks/Aegean-Licensing/master/licenses/issued.json", core)
        self.assertIn("AegeanWorks/Aegean-Licensing/master/licenses/terms.json", core)
        self.assertIn("register.get(cert.cert_id)", core)

    def test_verifier_cannot_check_signatures(self):
        core = (ROOT / "docs" / "verify-core.js").read_text(encoding="utf-8")
        ui = (ROOT / "docs" / "verify.js").read_text(encoding="utf-8")
        for token in ("computeSignature", "crypto.subtle.sign", "secret_key", "signing.key"):
            with self.subTest(token=token):
                self.assertNotIn(token, core)
        self.assertIn("signature_verified: false", core)
        self.assertNotIn("X-Ops-Token", ui)

    def test_verifier_never_uploads_the_certificate(self):
        ui = (ROOT / "docs" / "verify.js").read_text(encoding="utf-8")
        for token in ('method: "POST"', "FormData", "XMLHttpRequest", "sendBeacon"):
            with self.subTest(token=token):
                self.assertNotIn(token, ui)

    def test_verifier_form_cannot_natively_submit(self):
        page = read_verify()
        self.assertIn('id="verify-form"', page)
        block = page.split('<script>', 1)[1]
        self.assertIn('verifyForm.addEventListener("submit"', block)
        self.assertIn("event.preventDefault();", block)
        self.assertIn('id="verify-submit"', page)

    def test_verifier_uses_text_nodes_only(self):
        ui = (ROOT / "docs" / "verify.js").read_text(encoding="utf-8")
        core = (ROOT / "docs" / "verify-core.js").read_text(encoding="utf-8")
        for token in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"):
            with self.subTest(token=token):
                self.assertNotIn(token, ui)
                self.assertNotIn(token, core)
        self.assertIn("textContent", ui)

    def test_site_ships_no_signing_material(self):
        for path in (ROOT / "docs").iterdir():
            if path.suffix not in {".html", ".js", ".css", ".json", ".xml", ".txt", ".webmanifest"}:
                continue
            text = path.read_text(encoding="utf-8")
            with self.subTest(file=path.name):
                self.assertNotRegex(text, r"-----BEGIN [A-Z ]*PRIVATE KEY-----")
                self.assertNotIn("AEGEAN_SIGNING_KEY", text)
                self.assertNotIn("ops-secret", text)

    def test_verification_vector_is_pinned(self):
        vector = json.loads(
            (ROOT / "tests" / "vectors" / "verification-vector.json").read_text(encoding="utf-8")
        )
        self.assertEqual(vector["certificate"]["digest"], vector["expected_digest"])
        self.assertRegex(vector["expected_digest"], r"^[0-9a-f]{64}$")
        self.assertIn("not an issued certificate", vector["note"])

    def test_sitemap_lists_the_verify_page(self):
        sitemap = (ROOT / "docs" / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn(
            "<loc>https://aegeanworks.github.io/AegeanWorks/verify.html</loc>", sitemap
        )
        self.assertIsNotNone(ET.fromstring(sitemap))

    def test_external_links_are_safe_on_every_page(self):
        play = (ROOT / "docs" / "play.html").read_text(encoding="utf-8")
        for page in (read_site(), read_verify(), play):
            for match in re.finditer(r"<a\b[^>]*target=\"_blank\"[^>]*>", page):
                with self.subTest(tag=match.group(0)[:80]):
                    self.assertIn('rel="noopener"', match.group(0))

    def test_pages_send_a_content_security_policy(self):
        for name in (
            "index.html",
            "verify.html",
            "project.html",
            "security.html",
            "privacy.html",
            "accessibility.html",
            "offline.html",
            "404.html",
            "play.html",
            "editor.html",
        ):
            page = (ROOT / "docs" / name).read_text(encoding="utf-8")
            with self.subTest(page=name):
                self.assertIn('http-equiv="Content-Security-Policy"', page)
                policy = re.search(
                    r'http-equiv="Content-Security-Policy" content="([^"]*)"', page
                ).group(1)
                self.assertIn("form-action 'none'", policy)
                self.assertIn("object-src 'none'", policy)
                self.assertIn("base-uri 'none'", policy)
                script_src = re.search(r"script-src ([^;]*)", policy).group(1)
                self.assertNotIn("'unsafe-inline'", script_src)
                self.assertNotIn("https://", script_src)
                inline = re.findall(
                    r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", page, re.S
                )
                for body in inline:
                    digest = base64.b64encode(
                        hashlib.sha256(body.encode("utf-8")).digest()
                    ).decode("ascii")
                    with self.subTest(hash=digest[:12]):
                        self.assertIn("'sha256-" + digest + "'", script_src)
                external = re.findall(r"<script[^>]*\bsrc=\"([^\"]+)\"", page)
                for source in external:
                    with self.subTest(source=source):
                        self.assertTrue(source.startswith("./") or source.startswith("/") or "://" not in source)
        verify = read_verify()
        self.assertIn(
            "connect-src 'self' https://raw.githubusercontent.com", verify
        )


if __name__ == "__main__":
    unittest.main()
