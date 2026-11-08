#!/usr/bin/env python3
"""Sync the live browser apps and their catalog.

Each browser build is self-contained, so its runtime files are copied under
docs/live/ and versioned by commit. The source validator enforces the static
contract the website relies on before anything is copied. The current build and
its two most recent predecessors are retained so a catalog cached by a returning
visitor still resolves after a refresh.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
DEFAULT_SOURCE_ROOT = PROJECT_ROOT.parent

APPS = (
    {
        "slug": "prism-relay",
        "repo": "Prism-Relay",
        "source": "prism-relay",
        "title": "Prism Relay",
        "description": "A neon light-routing puzzle: rotate mirrors and splitters, fold beams through portals, and charge every receiver across three episodes.",
        "license": "AGL-1.1",
        "mode": "browser",
        "runtime": ("index.html", "src"),
        "version_file": "package.json",
        "logo": "media/Prism-Relay/logo.webp",
        "dossier": "project.html?repo=Prism-Relay",
    },
    {
        "slug": "weft",
        "repo": "Weft",
        "source": "weft",
        "title": "Weft",
        "description": "A zero-dependency thread-routing puzzle: connect matching spools, fill every cell of the loom, and restore the tapestry across eighteen chambers.",
        "license": "AGL-1.1",
        "mode": "browser",
        "runtime": ("index.html", "src", "assets"),
        "version_file": "package.json",
        "logo": "live/weft/logo.webp",
    },
    {
        "slug": "iris",
        "repo": "Iris",
        "source": "iris",
        "title": "Iris",
        "description": "A neon color-mixing puzzle: route red, green and blue beams through rotating mirrors and dye cells, blend exact hues, and light every receiver across three episodes.",
        "license": "AGL-1.1",
        "mode": "browser",
        "runtime": ("index.html", "src", "assets"),
        "version_file": "package.json",
        "logo": "live/iris/logo.svg",
    },
    {
        "slug": "tessera",
        "repo": "Tessera",
        "source": "tessera",
        "title": "Tessera",
        "description": "A seamless pattern studio: compose geometric tiles in the browser, tune every line, and export crisp editable SVG.",
        "license": "AL-1.1",
        "mode": "browser",
        "runtime": ("index.html", "src"),
        "version_file": "package.json",
        "logo": "live/tessera/logo.svg",
    },
    {
        "slug": "meridian",
        "repo": "Meridian",
        "source": "meridian",
        "title": "Meridian",
        "description": 'A zero-dependency time zone meeting planner that runs entirely in the browser: add people and cities, compare every local hour side by side, find the overlap that works for everyone, then share it as a link or a calendar file.',
        "license": "AL-1.1",
        "mode": "browser",
        "runtime": ("index.html", "src", "assets/logo.svg", "LICENSE"),
        "version_file": "package.json",
        "logo": "media/Meridian/logo.webp",
        "dossier": "project.html?repo=Meridian",
    },
    {
        "slug": "palette",
        "repo": "Palette",
        "source": "palette",
        "title": "Palette",
        "description": "A local-first image editor in the browser: layers, blend modes, selections, gradients, filters, local autosave recovery and scaled PNG, JPEG or WebP export. Images never leave the device.",
        "license": "AL-1.1",
        "mode": "browser",
        "runtime": ("index.html", "src", "assets", "LICENSE"),
        "version_file": "package.json",
        "local": True,
        "optional": True,
        "path": "editor/index.html",
        "source_url": "https://github.com/AegeanWorks/Palette",
        "logo": "media/Palette/logo.webp",
        "dossier": "project.html?repo=Palette",
    },
    {
        # The standalone PWA keeps its worker; the live copy swaps the
        # registration for a no-op and omits sw.js to meet the static contract.
        "slug": "afterimage",
        "repo": "Afterimage",
        "source": "afterimage",
        "title": "Afterimage",
        "description": "A daily visual perception gauntlet: one tile in every grid is a shade, a size, or an angle off. Find it before the clock runs out.",
        "license": "AGL-1.1",
        "mode": "browser",
        "runtime": (
            "index.html",
            "styles.css",
            "game.js",
            "manifest.json",
            "favicon.svg",
            "icons",
        ),
        "live_files": {"pwa.js": "live/pwa.js"},
        "version_file": "package.json",
        "logo": "live/afterimage/logo.svg",
        "dossier": "project.html?repo=Afterimage",
    },
)

MANIFEST_REL = "docs/live.json"
COMMIT_RE = re.compile(r"^[0-9a-f]{7,40}$")
KEEP_BUILDS = 3
LICENSE_HEADERS = {
    "AGL-1.1": "# Aegean Game License 1.1",
    "AL-1.1": "# Aegean License 1.1",
}


class SyncError(Exception):
    """A user-facing sync failure with a Why/Fix pair."""

    def __init__(self, what: str, why: str, fix: str) -> None:
        super().__init__(what)
        self.what = what
        self.why = why
        self.fix = fix


def _git(source: Path, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(source), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise SyncError(
            f"Could not read the git metadata in {source}.",
            str(error),
            "keep the game source checked out as a git repository, then retry.",
        ) from error
    if result.returncode != 0:
        raise SyncError(
            f"Could not read the git metadata in {source}.",
            result.stderr.strip() or "git returned a non-zero exit code.",
            "check the source checkout, then retry.",
        )
    return result.stdout.strip()


def _version(source: Path, relative: str) -> str:
    path = source / relative
    if not path.is_file():
        return ""
    text = path.read_text(encoding="utf-8")
    if relative.endswith("package.json"):
        try:
            return str(json.loads(text).get("version", "")).strip()
        except json.JSONDecodeError:
            return ""
    match = re.search(r'"version"\s*:\s*"([^"]+)"', text)
    return match.group(1).strip() if match else ""


def _digest(files: list[Path], root: Path) -> str:
    digest = hashlib.sha256()
    # Order by the served relative path, never by the Path object: Windows sorts
    # Path objects case-insensitively while Linux sorts them byte-wise, so a build
    # holding both LICENSE and index.html hashed in a different order per platform
    # and the Linux check rejected a digest Windows had just written (ADR-294).
    for path in sorted(files, key=lambda item: item.relative_to(root).as_posix()):
        digest.update(path.relative_to(root).as_posix().encode("utf-8"))
        digest.update(b"\0")
        data = path.read_bytes()
        # Git stores text as LF, but a Windows checkout can hand the sync a
        # CRLF tree. Hash the served content so Linux CI validates the same
        # digest; binary files keep their exact bytes.
        if b"\0" not in data:
            data = data.replace(b"\r\n", b"\n")
        digest.update(data)
        digest.update(b"\0")
    return "sha256:" + digest.hexdigest()


def _write_atomic(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp_", suffix=path.suffix)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    except OSError:
        try:
            os.unlink(temp)
        # hygiene: allow cleanup of a failed temporary write cannot replace the original error
        except OSError:
            pass
        raise


def _copy_file(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = source.read_bytes()
    if target.is_file() and target.read_bytes() == payload:
        return
    _write_atomic(target, payload)


def _safe_build_path(value: str) -> bool:
    path = Path(value)
    return bool(value) and not path.is_absolute() and ".." not in path.parts


def _copy_overrides(source: Path, target: Path, overrides: dict) -> None:
    """Replace or add named build files from a source-relative path."""
    for destination, relative in sorted(overrides.items()):
        if not _safe_build_path(str(destination)) or not _safe_build_path(str(relative)):
            raise SyncError(
                f"The live build has an unsafe override: {destination} <- {relative}.",
                "a build file could escape its own copied directory.",
                "fix the live_files mapping in tools/sync_live_apps.py.",
            )
        override = source / str(relative)
        if not override.is_file():
            raise SyncError(
                f"The live override is missing: {relative}.",
                "the copied build would reference a file the site never wrote.",
                "add the override to the app source or fix its live_files mapping.",
            )
        _copy_file(override, target / str(destination))


def _copy_runtime(source: Path, target: Path, entries: tuple[str, ...]) -> None:
    for entry in entries:
        path = source / entry
        if path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file():
                    _copy_file(child, target / child.relative_to(source))
        elif path.is_file():
            _copy_file(path, target / entry)
    if not (target / "index.html").is_file():
        raise SyncError(
            f"The browser build in {source} has no index.html.",
            "the copied directory would open as a broken live page.",
            "fix the app's runtime entries in tools/sync_live_apps.py.",
        )


def _runtime_files(target: Path) -> list[Path]:
    return [path for path in target.rglob("*") if path.is_file()]


def _source_path(source: Path, relative: str) -> Path | None:
    """Resolve an index reference inside the source, or None when it escapes it."""
    clean = relative.split("#", 1)[0].split("?", 1)[0].strip()
    if not clean or clean.startswith(("data:", "mailto:", "http://", "https://", "#", "/")):
        return None
    if clean.startswith("../") or "/../" in clean:
        return None
    return (source / clean.lstrip("./")).resolve()


def _allowed_url(value: str) -> bool:
    """Only the W3C SVG and XLink namespaces may be named as external URLs."""
    return value.startswith(("http://www.w3.org/", "https://www.w3.org/"))


def validate_source(game: dict, source_root: Path) -> list[str]:
    """Check the static contract the website relies on before copying a build."""
    problems: list[str] = []
    source = source_root / game["source"]
    index = source / "index.html"
    if not source.is_dir():
        return [f"{game['repo']} source is missing at {source}"]
    if not index.is_file():
        return [f"{game['repo']} has no root index.html"]
    try:
        package = json.loads((source / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        package = {}
        problems.append(f"{game['repo']} needs a readable package.json")
    version = str(package.get("version", "")).strip()
    if not re.match(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$", version):
        problems.append(f"{game['repo']} needs a semver package.json version")
    license_path = source / "LICENSE"
    license_label = str(game.get("license") or "AGL-1.1")
    expected_header = LICENSE_HEADERS.get(license_label)
    if expected_header is None:
        problems.append(f"{game['repo']} has an unknown license label: {license_label}")
    elif not license_path.is_file():
        problems.append(f"{game['repo']} needs its {license_label} LICENSE")
    else:
        header = license_path.read_text(encoding="utf-8").splitlines()[:1]
        if not header or not header[0].startswith(expected_header):
            problems.append(f"{game['repo']} LICENSE is not the {license_label} text")
    forbidden = (
        "fetch(",
        "XMLHttpRequest",
        "WebSocket",
        "navigator.serviceWorker",
        "window.top",
        "window.parent",
        "top.location",
    )
    text = index.read_text(encoding="utf-8")
    for token in forbidden:
        if token in text:
            problems.append(f"{game['repo']} index.html uses {token}; the website build must stay static")
    for reference in re.findall(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", text):
        if reference.startswith(("data:", "#", "mailto:")):
            continue
        if reference.startswith(("http://", "https://")):
            if not _allowed_url(reference):
                problems.append(f"{game['repo']} index.html loads an external resource: {reference}")
            continue
        if reference.startswith("/") or ".." in reference.split("/"):
            problems.append(f"{game['repo']} index.html uses a non-portable path: {reference}")
            continue
        target = _source_path(source, reference)
        if target is None or not target.is_file():
            problems.append(f"{game['repo']} index.html references a missing file: {reference}")
    runtime_files = [index]
    for entry in game["runtime"]:
        path = source / entry
        if path.is_dir():
            runtime_files.extend(child for child in path.rglob("*") if child.is_file())
        elif path.is_file():
            runtime_files.append(path)
    for destination, relative in sorted((game.get("live_files") or {}).items()):
        if not _safe_build_path(str(destination)) or not _safe_build_path(str(relative)):
            problems.append(
                f"{game['repo']} has an unsafe live override: {destination} <- {relative}"
            )
            continue
        override = source / str(relative)
        if not override.is_file():
            problems.append(f"{game['repo']} live override is missing: {relative}")
            continue
        runtime_files.append(override)
    for path in sorted(set(runtime_files)):
        if path == index or path.suffix not in {".js", ".css", ".html", ".svg"}:
            continue
        source_text = path.read_text(encoding="utf-8")
        relative = path.relative_to(source).as_posix()
        for token in forbidden:
            if token in source_text:
                problems.append(f"{game['repo']} {relative} uses {token}; the website build must stay static")
        for url in re.findall(r"https?://[^\s\"'<>)]+", source_text):
            if not _allowed_url(url):
                problems.append(f"{game['repo']} {relative} loads an external URL: {url}")
        if path.suffix == ".css" and re.search(r"@import|url\(\s*['\"]?https?://", source_text):
            problems.append(f"{game['repo']} {relative} imports an external stylesheet")
    return problems


def source_problems(source_root: Path) -> list[str]:
    problems: list[str] = []
    for game in APPS:
        if game.get("optional") and not (source_root / game["source"]).is_dir():
            continue
        problems.extend(validate_source(game, source_root))
    return problems


def _manifest_entry(slug: str) -> dict:
    """The previous manifest entry for one game, or an empty mapping."""
    if not (PROJECT_ROOT / MANIFEST_REL).is_file():
        return {}
    manifest = _read_manifest()
    apps = manifest.get("apps")
    if isinstance(apps, list):
        for app in apps:
            if isinstance(app, dict) and app.get("slug") == slug:
                return app
    return {}


def _build_path_ok(slug: str, relative: str) -> bool:
    return bool(re.match(rf"^live/{re.escape(slug)}/[0-9a-f]{{7,40}}/index\.html$", relative))


def _retained_paths(game: dict, base: Path, current: str) -> list[str]:
    """The current build plus the predecessors the previous catalog recorded.

    A fresh checkout gives every build directory the same mtime, so an mtime sort
    cannot tell which build a cached catalog used. The manifest records the order.
    """
    entry = _manifest_entry(game["slug"])
    recorded = entry.get("builds")
    prior: list[str] = []
    if isinstance(recorded, list) and recorded:
        prior = [path for path in recorded if isinstance(path, str)]
    else:
        legacy = str(entry.get("path", ""))
        if _build_path_ok(game["slug"], legacy):
            prior.append(legacy)
        extras = [
            path
            for path in (base.iterdir() if base.is_dir() else ())
            if path.is_dir() and COMMIT_RE.match(path.name)
        ]
        extras.sort(key=lambda path: path.stat().st_mtime, reverse=True)
        prior.extend(f"live/{game['slug']}/{path.name}/index.html" for path in extras)
    builds = [current]
    for path in prior:
        if path not in builds and _build_path_ok(game["slug"], path) and (DOCS / path).is_file():
            builds.append(path)
    return builds[:KEEP_BUILDS]


def _browser_entry(game: dict, source_root: Path) -> dict:
    source = source_root / game["source"]
    if not source.is_dir():
        raise SyncError(
            f"The {game['repo']} source is missing at {source}.",
            "the live build cannot be copied without its repository.",
            "check out the game beside AegeanWorks or pass --source-root, then retry.",
        )
    commit = _git(source, "rev-parse", "HEAD")
    if not COMMIT_RE.match(commit):
        raise SyncError(
            f"The {game['repo']} commit is not a git SHA: {commit}",
            "the live page would show an unverifiable version.",
            "check the source checkout, then retry.",
        )
    updated = _git(source, "show", "-s", "--format=%cs", "HEAD")
    short = commit[:12]
    base = DOCS / "live" / game["slug"]
    target = base / short
    if target.is_dir():
        shutil.rmtree(target)
    _copy_runtime(source, target, tuple(game["runtime"]))
    _copy_overrides(source, target, game.get("live_files") or {})
    current = f"live/{game['slug']}/{short}/index.html"
    builds = _retained_paths(game, base, current)
    keep = {path.split("/")[2] for path in builds}
    for old in (base.iterdir() if base.is_dir() else ()):
        if old.is_dir() and COMMIT_RE.match(old.name) and old.name not in keep:
            shutil.rmtree(old)
    license_source = source / "LICENSE"
    license_label = str(game.get("license") or "AGL-1.1")
    if license_source.is_file():
        _copy_file(license_source, base / "LICENSE")
        _copy_file(
            license_source,
            PROJECT_ROOT / "LICENSES" / f"LicenseRef-{license_label}.txt",
        )
    files = _runtime_files(target)
    version = _version(source, game["version_file"])
    return {
        "slug": game["slug"],
        "repo": game["repo"],
        "title": game["title"],
        "description": game["description"],
        "available": True,
        "mode": "browser",
        "path": current,
        "source_url": game.get(
            "source_url",
            f"https://github.com/AegeanWorks/{game['repo']}",
        ),
        "version": version,
        "commit": commit,
        "updated": updated,
        "license": game["license"],
        "license_path": f"live/{game['slug']}/LICENSE",
        "digest": _digest(files, target),
        "builds": builds,
        "logo": game["logo"],
        "dossier": game.get("dossier", ""),
    }


def _runtime_entry_files(root: Path, entries: tuple[str, ...]) -> list[Path]:
    files: list[Path] = []
    for entry in entries:
        path = root / entry
        if path.is_dir():
            files.extend(child for child in path.rglob("*") if child.is_file())
        elif path.is_file():
            files.append(path)
    return files


def _local_entry(game: dict, source_root: Path) -> dict:
    """Describe a build that is already vendored inside docs/ (no copy)."""
    source = source_root / game["source"]
    if not source.is_dir():
        raise SyncError(
            f"The {game['repo']} source is missing at {source}.",
            "the live catalog cannot prove the vendored build is current.",
            "check out the app beside AegeanWorks or pass --source-root, then retry.",
        )
    commit = _git(source, "rev-parse", "HEAD")
    if not COMMIT_RE.match(commit):
        raise SyncError(
            f"The {game['repo']} commit is not a git SHA: {commit}",
            "the live page would show an unverifiable version.",
            "check the source checkout, then retry.",
        )
    updated = _git(source, "show", "-s", "--format=%cs", "HEAD")
    relative = str(game["path"])
    target = DOCS / relative
    if not target.is_file():
        raise SyncError(
            f"The vendored {game['repo']} build is missing: {relative}",
            "the live page would open a broken frame.",
            "run `python tools/sync_editor.py --write`, then retry.",
        )
    root = target.parent
    files = _runtime_entry_files(root, tuple(game["runtime"]))
    return {
        "slug": game["slug"],
        "repo": game["repo"],
        "title": game["title"],
        "description": game["description"],
        "available": True,
        "mode": "browser",
        "path": relative,
        "source_url": game.get("source_url", ""),
        "version": _version(source, game["version_file"]),
        "commit": commit,
        "updated": updated,
        "license": game["license"],
        "license_path": (root.relative_to(DOCS) / "LICENSE").as_posix(),
        "digest": _digest(files, root),
        "builds": [relative],
        "logo": game["logo"],
        "dossier": game.get("dossier", ""),
    }


def build_manifest(source_root: Path) -> dict:
    previous = _read_manifest().get("apps", []) if (PROJECT_ROOT / MANIFEST_REL).is_file() else []
    recorded = {
        app.get("slug"): app
        for app in previous
        if isinstance(app, dict) and isinstance(app.get("slug"), str)
    }
    apps = []
    for game in APPS:
        if game.get("optional") and not (source_root / game["source"]).is_dir():
            if game["slug"] in recorded:
                apps.append(recorded[game["slug"]])
            continue
        if game.get("local"):
            apps.append(_local_entry(game, source_root))
        else:
            apps.append(_browser_entry(game, source_root))
    return {"schema": 2, "apps": apps}


def _read_manifest() -> dict:
    path = PROJECT_ROOT / MANIFEST_REL
    if not path.is_file():
        raise SyncError(
            "The live catalog is missing.",
            "the Live page has no catalog to render.",
            "run `python tools/sync_live_apps.py --write`, then retry.",
        )
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SyncError(
            "The live catalog is not valid JSON.",
            str(error),
            "fix docs/live.json or regenerate it with --write.",
        ) from error


def check_manifest() -> list[str]:
    manifest = _read_manifest()
    problems: list[str] = []
    if manifest.get("schema") != 2:
        problems.append("docs/live.json has an unknown schema")
    apps = manifest.get("apps")
    if not isinstance(apps, list) or len(apps) != len(APPS):
        problems.append("docs/live.json does not list every live app")
        return problems
    by_slug = {app.get("slug"): app for app in apps if isinstance(app, dict)}
    for spec in APPS:
        game = by_slug.get(spec["slug"])
        if not game:
            problems.append(f"manifest is missing {spec['slug']}")
            continue
        if not COMMIT_RE.match(str(game.get("commit", ""))):
            problems.append(f"{spec['slug']} has no valid commit")
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(game.get("updated", ""))):
            problems.append(f"{spec['slug']} has no valid commit date")
        if game.get("license") != spec["license"]:
            problems.append(f"{spec['slug']} has the wrong license label")
        if not game.get("available"):
            problems.append(f"{spec['slug']} is not marked available")
            continue
        relative = str(game.get("path", ""))
        if spec.get("local"):
            if relative != spec["path"]:
                problems.append(f"{spec['slug']} has an unsafe or unstable path")
                continue
        elif not re.match(rf"^live/{spec['slug']}/[0-9a-f]{{7,40}}/index\.html$", relative):
            problems.append(f"{spec['slug']} has an unsafe or unstable path")
            continue
        target = DOCS / relative
        if not target.is_file():
            problems.append(f"{spec['slug']} build is missing: {relative}")
            continue
        license_path = DOCS / str(game.get("license_path", ""))
        if not license_path.is_file():
            problems.append(f"{spec['slug']} license is missing")
        if not (PROJECT_ROOT / "LICENSES" / f"LicenseRef-{spec['license']}.txt").is_file():
            problems.append(f"the pinned {spec['license']} license is missing")
        files = (
            _runtime_entry_files(target.parent, tuple(spec["runtime"]))
            if spec.get("local")
            else _runtime_files(target.parent)
        )
        actual = _digest(files, target.parent)
        if actual != game.get("digest"):
            problems.append(f"{spec['slug']} digest does not match the copied build")
        builds = game.get("builds")
        if not isinstance(builds, list) or not builds:
            problems.append(f"{spec['slug']} has no retained-build list")
        elif spec.get("local"):
            if builds != [relative]:
                problems.append(f"{spec['slug']} must list exactly its vendored build")
        else:
            if len(builds) > KEEP_BUILDS:
                problems.append(f"{spec['slug']} retains more than {KEEP_BUILDS} builds")
            if builds[0] != relative:
                problems.append(f"{spec['slug']} retained list does not start with the current build")
            if len(set(map(str, builds))) != len(builds):
                problems.append(f"{spec['slug']} repeats a retained build")
            for build in builds:
                if not isinstance(build, str) or not _build_path_ok(spec["slug"], build):
                    problems.append(f"{spec['slug']} has an unsafe retained build path")
                elif not (DOCS / build).is_file():
                    problems.append(f"{spec['slug']} retained build is missing: {build}")
            listed = {
                build.split("/")[2]
                for build in builds
                if isinstance(build, str) and _build_path_ok(spec["slug"], build)
            }
            actual_dirs = {
                path.name
                for path in (DOCS / "live" / spec["slug"]).iterdir()
                if path.is_dir() and COMMIT_RE.match(path.name)
            }
            if actual_dirs != listed:
                problems.append(f"{spec['slug']} has build directories outside the retained list")
        if not (DOCS / str(game.get("logo", ""))).is_file():
            problems.append(f"{spec['slug']} logo is missing")
    return problems


def command_write(source_root: Path) -> int:
    problems = source_problems(source_root)
    if problems:
        raise SyncError(
            "A live app no longer satisfies the static contract.",
            "; ".join(problems),
            "fix the app build or update tools/sync_live_apps.py, then retry.",
        )
    manifest = build_manifest(source_root)
    payload = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    path = PROJECT_ROOT / MANIFEST_REL
    if path.is_file() and path.read_text(encoding="utf-8") == payload:
        print("[OK] Live apps are already current.")
        return 0
    _write_atomic(path, payload.encode("utf-8"))
    print(f"[OK] Wrote {MANIFEST_REL} with {len(manifest['apps'])} app(s).")
    return 0


def command_check_source(source_root: Path) -> int:
    problems = source_problems(source_root)
    if problems:
        print(f"[FAIL] {len(problems)} source compatibility problem(s):", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print(
            "Fix: keep the build static, relative and self-contained; see each game's README.",
            file=sys.stderr,
        )
        return 1
    print("[OK] Every live app satisfies the static contract.")
    return 0


def command_check() -> int:
    problems = check_manifest()
    if problems:
        print(f"[FAIL] {len(problems)} live-app problem(s):", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print("Fix: run `python tools/sync_live_apps.py --write` after an app update, then retry.", file=sys.stderr)
        return 1
    print("[OK] Live app catalog, copied builds and digests are current.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--write", action="store_true", help="copy the apps and rewrite docs/live.json")
    parser.add_argument("--check", action="store_true", help="verify the committed catalog and copied build")
    parser.add_argument(
        "--check-source",
        action="store_true",
        help="verify a checked-out app build against the static live contract",
    )
    args = parser.parse_args(argv)
    if not args.write and not args.check and not args.check_source:
        parser.error("choose --write, --check or --check-source")
    source_root = args.source_root.resolve()
    try:
        if args.write:
            return command_write(source_root)
        if args.check_source:
            return command_check_source(source_root)
        return command_check()
    except SyncError as error:
        print(f"Error: {error.what}", file=sys.stderr)
        print(f"Why: {error.why}", file=sys.stderr)
        print(f"Fix: {error.fix}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
