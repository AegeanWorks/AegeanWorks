"""Build and verify the dossier media (logo, social preview, screenshots).

The site ships prebuilt assets; nothing here runs at page load. Regeneration is
a maintenance step, so the only optional dependency is Pillow, used to optimize
and to draw a fallback card when a repository has no assets/ files.

    python tools/build_dossier_media.py fetch [--repo NAME ...] [--force]
    python tools/build_dossier_media.py analyze
    python tools/build_dossier_media.py check
    python tools/build_dossier_media.py ingest --repo NAME --file PATH \
        [--commit SHA] [--date YYYY-MM-DD] [--caption TEXT] [--alt TEXT]

Every asset records the repository commit it was fetched at, the capture date,
its pixel size and a SHA-256 digest, so a dossier can never show media from a
different revision without the mismatch being visible in the manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "docs" / "media"
METADATA = ROOT / "tests" / "metadata" / "repositories.json"
SCHEMA = 2
MAX_BYTES = 8 * 1024 * 1024
NAME = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
COMMIT = re.compile(r"^[0-9a-f]{7,40}$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
USER_AGENT = "AegeanWorks-media/1.0 (+https://aegeanworks.github.io/AegeanWorks/)"
LOGO_CANDIDATES = ("assets/logo.jpg", "assets/logo.png", "assets/logo.webp", "assets/logo.svg")
PREVIEW_CANDIDATES = (
    "assets/social-preview.png",
    "assets/social-preview.jpg",
    "assets/social-preview.webp",
    "assets/social-preview.svg",
)
PREVIEW_MAX_WIDTH = 1200
LOGO_SIZE = 256


class MediaError(RuntimeError):
    pass


# ---------------------------------------------------------------- image facts


def image_facts(data: bytes) -> tuple[str, int, int]:
    """Return (format, width, height) without decoding the pixels."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png", *struct.unpack(">II", data[16:24])
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif", *struct.unpack("<HH", data[6:10])
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp", *_webp_size(data)
    if data[:2] == b"\xff\xd8":
        return "jpeg", *_jpeg_size(data)
    if data[:1] == b"<" and b"<svg" in data[:512].lower():
        return "svg", *_svg_size(data)
    raise MediaError("unrecognised image bytes")


def _webp_size(data: bytes) -> tuple[int, int]:
    chunk = data[12:16]
    if chunk == b"VP8X":
        width = int.from_bytes(data[24:27], "little") + 1
        height = int.from_bytes(data[27:30], "little") + 1
        return width, height
    if chunk == b"VP8L":
        bits = int.from_bytes(data[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if chunk == b"VP8 ":
        width = int.from_bytes(data[26:28], "little") & 0x3FFF
        height = int.from_bytes(data[28:30], "little") & 0x3FFF
        return width, height
    raise MediaError("unsupported WebP chunk")


def _jpeg_size(data: bytes) -> tuple[int, int]:
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height, width = struct.unpack(">HH", data[index + 5:index + 9])
            return width, height
        length = struct.unpack(">H", data[index + 2:index + 4])[0]
        index += 2 + length
    raise MediaError("JPEG has no frame header")


def _svg_size(data: bytes) -> tuple[int, int]:
    text = data[:4096].decode("utf-8", "replace")
    width = re.search(r'\bwidth="([0-9.]+)', text)
    height = re.search(r'\bheight="([0-9.]+)', text)
    if width and height:
        return int(float(width.group(1))), int(float(height.group(1)))
    view = re.search(r'viewBox="[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)', text)
    if view:
        return int(float(view.group(1))), int(float(view.group(2)))
    return 1200, 630


def digest(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


# ------------------------------------------------------------- optimization


def _pillow():
    try:
        from PIL import Image  # noqa: PLC0415 - optional maintenance dependency
    except ImportError as error:  # pragma: no cover - environment dependent
        raise MediaError(
            "Pillow is required to optimize or generate media; "
            "install it with `python -m pip install pillow`."
        ) from error
    return Image


def optimize(data: bytes, kind: str) -> tuple[bytes, str, int, int]:
    Image = _pillow()
    try:
        # hygiene: allow in-memory Pillow decode, not a filesystem open
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            if kind == "logo":
                canvas = Image.new("RGBA", (LOGO_SIZE, LOGO_SIZE), (0, 0, 0, 0))
                copy = image.convert("RGBA")
                copy.thumbnail((LOGO_SIZE, LOGO_SIZE), Image.LANCZOS)
                canvas.alpha_composite(
                    copy,
                    ((LOGO_SIZE - copy.width) // 2, (LOGO_SIZE - copy.height) // 2),
                )
                out = canvas
            else:
                out = image.convert("RGB")
                if out.width > PREVIEW_MAX_WIDTH:
                    height = round(out.height * PREVIEW_MAX_WIDTH / out.width)
                    out = out.resize((PREVIEW_MAX_WIDTH, height), Image.LANCZOS)
            buffer = io.BytesIO()
            out.save(buffer, format="WEBP", quality=84, method=6)
            payload = buffer.getvalue()
        return payload, "webp", out.width, out.height
    except Exception as error:
        raise MediaError(f"could not optimize image: {error}") from error


def _font(size: int, bold: bool = True):
    from PIL import ImageFont  # noqa: PLC0415 - optional maintenance dependency

    names = (
        "segoeuib.ttf" if bold else "segoeui.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
    )
    for name in names:
        # hygiene: allow optional system font lookup; a missing font falls back
        for base in (Path("C:/Windows/Fonts"), Path("/usr/share/fonts/truetype/dejavu"), Path("/Library/Fonts")):
            candidate = base / name
            if candidate.exists():
                return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size)


def _wrap(draw, text: str, font, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        candidate = (line + " " + word).strip()
        if draw.textlength(candidate, font=font) <= width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def fallback_card(repo: dict, kind: str) -> tuple[bytes, str, int, int]:
    """Draw a branded card for a repository that ships no assets/ images."""
    Image = _pillow()
    from PIL import ImageDraw  # noqa: PLC0415 - optional maintenance dependency

    name = repo["name"]
    initials = re.sub(r"[^A-Za-z0-9]", "", name)[:2].title() or "AW"
    if kind == "logo":
        width, height = LOGO_SIZE, LOGO_SIZE
    else:
        width, height = PREVIEW_MAX_WIDTH, 600
    image = Image.new("RGB", (width, height), (4, 6, 12))
    draw = ImageDraw.Draw(image)
    step = max(24, width // 24)
    for x in range(0, width, step):
        draw.line([(x, 0), (x, height)], fill=(11, 18, 32), width=1)
    for y in range(0, height, step):
        draw.line([(0, y), (width, y)], fill=(11, 18, 32), width=1)
    draw.rectangle([0, 0, width, 6], fill=(103, 232, 249))
    draw.rectangle([0, 6, int(width * 0.42), 9], fill=(167, 139, 250))

    if kind == "logo":
        box = int(width * 0.16)
        draw.rounded_rectangle(
            [box, box, width - box, height - box],
            radius=int(width * 0.18),
            outline=(103, 232, 249),
            width=4,
        )
        font = _font(int(width * 0.34))
        bounds = draw.textbbox((0, 0), initials, font=font)
        draw.text(
            ((width - (bounds[2] - bounds[0])) / 2, (height - (bounds[3] - bounds[1])) / 2 - bounds[1] * 0.4),
            initials,
            font=font,
            fill=(232, 240, 252),
        )
    else:
        tile = 150
        left = int(width * 0.075)
        top = int(height * 0.18)
        draw.rounded_rectangle(
            [left, top, left + tile, top + tile],
            radius=30,
            fill=(9, 16, 28),
            outline=(103, 232, 249),
            width=3,
        )
        mark = _font(66)
        bounds = draw.textbbox((0, 0), initials, font=mark)
        draw.text(
            (left + (tile - (bounds[2] - bounds[0])) / 2, top + (tile - (bounds[3] - bounds[1])) / 2 - bounds[1] * 0.4),
            initials,
            font=mark,
            fill=(232, 240, 252),
        )
        draw.text((left + tile + 36, top + 2), name, font=_font(84), fill=(232, 240, 252))
        draw.text((left + tile + 38, top + 100), "AegeanWorks project", font=_font(30, bold=False), fill=(103, 232, 249))

        description = (repo.get("description") or "").strip()
        body = _font(40, bold=False)
        lines = _wrap(draw, description, body, int(width * 0.85))[:3]
        y = top + tile + 36
        for line in lines:
            draw.text((left, y), line, font=body, fill=(160, 177, 203))
            y += 54

        facts = [repo.get("language") or "Software"]
        topics = [
            topic
            for topic in (repo.get("topics") or [])
            if topic not in {"aikit", "python", "source-available"}
        ][:3]
        facts.extend(topics)
        draw.text((left, int(height * 0.86)), "  ·  ".join(facts), font=_font(28), fill=(138, 156, 184))

    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=86, method=6)
    return buffer.getvalue(), "webp", width, height


# ------------------------------------------------------------------- network


def fetch(url: str) -> bytes | None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            length = int(response.headers.get("Content-Length") or 0)
            if length > MAX_BYTES:
                raise MediaError(f"{url} is larger than {MAX_BYTES} bytes")
            data = response.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise MediaError(f"{url} returned HTTP {error.code}") from error
    except (urllib.error.URLError, OSError):
        return None
    if len(data) > MAX_BYTES:
        raise MediaError(f"{url} is larger than {MAX_BYTES} bytes")
    return data


def resolve_commit(name: str, branch: str) -> str:
    url = f"https://github.com/AegeanWorks/{name}.git"
    for ref in (f"refs/heads/{branch}", "HEAD"):
        try:
            result = subprocess.run(
                ["git", "ls-remote", url, ref],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            for line in (result.stdout or "").splitlines():
                sha = line.split("	", 1)[0].strip()
                if COMMIT.fullmatch(sha):
                    return sha
        except (OSError, subprocess.TimeoutExpired):  # hygiene: allow best-effort remote probe
            pass
    local_roots = [
        ROOT.parent / name,
        ROOT.parent / name.lower(),
    ]
    if name == "AIKit":
        local_roots.append(ROOT.parent.parent)
    for local_root in local_roots:
        if (local_root / ".git").exists():
            try:
                res = subprocess.run(
                    ["git", "-C", str(local_root), "rev-parse", "HEAD"],
                    capture_output=True,
                    text=True,
                    timeout=10,
                    check=False,
                )
                sha = (res.stdout or "").strip()
                if COMMIT.fullmatch(sha):
                    return sha
            except OSError:  # hygiene: allow best-effort local git check
                pass
    return ""


def raw_url(name: str, ref: str, path: str) -> str:
    return f"https://raw.githubusercontent.com/AegeanWorks/{name}/{ref}/{path}"


# ----------------------------------------------------------------- manifest


def load_repos() -> list[dict]:
    data = json.loads(METADATA.read_text(encoding="utf-8"))
    repos = [repo for repo in data.get("repositories", []) if NAME.fullmatch(repo.get("name", ""))]
    if not repos:
        raise MediaError("the repository metadata has no usable entries")
    return sorted(repos, key=lambda repo: repo["name"].lower())


def previous_local_logo(folder: str, manifest: dict | None = None) -> Path | None:
    """The approved logo art already committed for this repository, if any."""
    if manifest and (manifest.get("logo") or {}).get("generated"):
        return None
    directory = MEDIA / folder
    if not directory.is_dir():
        return None
    for candidate in sorted(directory.glob("logo.*")):
        if candidate.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".svg"}:
            return candidate
    return None


def exact_path(relative: str) -> bool:
    """True when every segment matches on-disk case, which Windows would hide."""
    current = ROOT / "docs"
    for part in relative.split("/"):
        if not current.is_dir():
            return False
        if part not in {entry.name for entry in current.iterdir()}:
            return False
        current = current / part
    return True


def manifest_path(name: str) -> Path:
    """Existing manifests keep their original file name, which may differ in case."""
    direct = MEDIA / f"{name}.json"
    if direct.exists():
        return direct
    wanted = name.lower()
    for candidate in MEDIA.glob("*.json"):
        if candidate.stem.lower() == wanted:
            return candidate
    return direct


def media_folder(name: str, manifest: dict) -> str:
    """Reuse the folder an existing logo points at so paths never churn."""
    logo = manifest.get("logo")
    if isinstance(logo, dict):
        src = logo.get("src", "")
        parts = src.split("/")
        if len(parts) >= 3 and parts[0] == "media" and parts[1]:
            return parts[1]
    folder = MEDIA / name
    if folder.is_dir():
        return name
    for candidate in MEDIA.iterdir():
        if candidate.is_dir() and candidate.name.lower() == name.lower():
            return candidate.name
    return name


def read_manifest(name: str) -> dict:
    path = manifest_path(name)
    if not path.exists():
        return {"schema": SCHEMA, "repo": name, "logo": None, "preview": None, "screenshots": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("screenshots", [])
    return data



def clean_text(value: str, name: str, date: str) -> str:
    """Strip local filesystem paths from captions; manifests are public."""
    text = (value or "").strip()
    if not text:
        return ""
    if "portable_agent_kit" in text or re.search(r"[A-Za-z]:\\", text) or text.startswith(("/", "\\")):
        return f"{name} interface at {date}"
    return text


def sanitize_manifest(manifest: dict, name: str) -> bool:
    changed = False
    for shot in manifest.get("screenshots", []):
        date = shot.get("taken_at", "")
        for field in ("caption", "alt"):
            value = shot.get(field, "")
            cleaned = clean_text(value, name, date)
            if cleaned != value:
                shot[field] = cleaned
                changed = True
    return changed


def write_atomic(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp_", suffix=path.suffix or ".bin")
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def write_logo_index() -> None:
    """One small file the portfolio reads to put real logos on the cards."""
    logos = {}
    for repo in load_repos():
        manifest = read_manifest(repo["name"])
        logo = manifest.get("logo")
        if not isinstance(logo, dict) or not logo.get("src"):
            continue
        logos[repo["name"]] = {
            "src": logo["src"],
            "width": logo.get("width", 0),
            "height": logo.get("height", 0),
        }
    payload = json.dumps({"schema": 1, "logos": logos}, indent=2, ensure_ascii=False) + "\n"
    write_atomic(MEDIA / "logos.json", payload.encode("utf-8"))


def write_manifest(name: str, manifest: dict) -> None:
    payload = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    write_atomic(manifest_path(name), payload.encode("utf-8"))


def asset_entry(folder: str, name: str, kind: str, payload: bytes, fmt: str, width: int, height: int, commit: str, source: str | None, generated: bool) -> dict:
    slug = "logo" if kind == "logo" else "social-preview"
    relative = f"media/{folder}/{slug}.{fmt}"
    write_atomic(ROOT / "docs" / relative, payload)
    entry = {
        "src": relative,
        "alt": f"{name} {'logo' if kind == 'logo' else 'social preview'}",
        "width": width,
        "height": height,
        "digest": digest(payload),
        "commit": commit,
        "taken_at": datetime.now(timezone.utc).date().isoformat(),
    }
    if source:
        entry["source"] = source
    if generated:
        entry["generated"] = True
    return entry


def fetch_asset(name: str, ref: str, candidates: tuple[str, ...]) -> tuple[bytes, str, str] | None:
    for path in candidates:
        url = raw_url(name, ref, path)
        data = fetch(url)
        if data is None:
            local_roots = [
                ROOT.parent / name,
                ROOT.parent / name.lower(),
            ]
            if name == "AIKit":
                local_roots.append(ROOT.parent.parent)
            for local_root in local_roots:
                local_file = local_root / path
                if local_file.is_file():
                    try:
                        candidate_data = local_file.read_bytes()
                        image_facts(candidate_data)
                        data = candidate_data
                        break
                    except (OSError, MediaError):  # hygiene: allow candidate check
                        pass
            if data is None:
                continue
        try:
            image_facts(data)
        except MediaError:
            continue
        return data, url, path
    return None


def build_repo(repo: dict, force: bool) -> list[str]:
    name = repo["name"]
    manifest = read_manifest(name)
    if manifest.get("logo") and manifest.get("preview") and not force:
        return []
    commit = resolve_commit(name, repo.get("default_branch") or "main")
    ref = commit or (repo.get("default_branch") or "main")
    notes: list[str] = []

    folder = media_folder(name, manifest)
    previous = {
        kind: (manifest.get(kind) or {}).get("src")
        for kind in ("logo", "preview")
    }
    for kind, candidates in (("logo", LOGO_CANDIDATES), ("preview", PREVIEW_CANDIDATES)):
        fetched = fetch_asset(name, ref, candidates)
        if fetched is None:
            kept = previous_local_logo(folder, manifest) if kind == "logo" else None
            if kept is not None:
                raw = kept.read_bytes()
                url = (manifest.get(kind) or {}).get("source")
                commit = (manifest.get(kind) or {}).get("commit") or commit
            else:
                payload, fmt, width, height = fallback_card(repo, kind)
                manifest[kind] = asset_entry(folder, name, kind, payload, fmt, width, height, commit, None, True)
                notes.append(f"{name}: generated {kind} (no assets/ file)")
                continue
        else:
            raw, url, _path = fetched

        previous_entry = manifest.get(kind) or {}
        try:
            payload, fmt, width, height = optimize(raw, kind)
        except MediaError:
            fmt, width, height = image_facts(raw)
            payload = raw
        expected = f"media/{folder}/{'logo' if kind == 'logo' else 'social-preview'}.{fmt}"
        if (
            previous_entry.get("digest") == digest(payload)
            and previous_entry.get("commit") == commit
            and previous_entry.get("src") == expected
        ):
            manifest[kind] = previous_entry
            continue
        manifest[kind] = asset_entry(folder, name, kind, payload, fmt, width, height, commit, url, False)
        for stale in (MEDIA / folder).glob(("logo" if kind == "logo" else "social-preview") + ".*"):
            if stale.name != Path(manifest[kind]["src"]).name:
                stale.unlink()

    manifest["schema"] = SCHEMA
    manifest["repo"] = name
    sanitize_manifest(manifest, name)
    write_manifest(name, manifest)
    return notes



# ------------------------------------------------------------ screenshots


SCREENSHOT_DIRS = ("assets/screenshots", "screenshots")
SCREENSHOT_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
SHOT_MAX_WIDTH = 1440
SHOTS_PER_RUN = 3
MAX_SCREENSHOTS = 12


def api_json(url: str):
    headers = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read(MAX_BYTES))


def discover_screenshots(name: str, commit: str) -> list[dict]:
    """List capture files committed under a repository's screenshot folders."""
    url = f"https://api.github.com/repos/AegeanWorks/{name}/git/trees/{commit}?recursive=1"
    payload = api_json(url)
    found = []
    for entry in payload.get("tree", []):
        path = entry.get("path", "")
        if entry.get("type") != "blob":
            continue
        if not any(path.startswith(folder + "/") for folder in SCREENSHOT_DIRS):
            continue
        if ".inspect" in path or "__MACOSX" in path:
            continue
        if Path(path).suffix.lower() not in SCREENSHOT_SUFFIXES:
            continue
        found.append(path)
    return sorted(found)


def optimize_shot(data: bytes) -> tuple[bytes, str, int, int]:
    Image = _pillow()
    # hygiene: allow in-memory Pillow decode, not a filesystem open
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        out = image.convert("RGB")
        if out.width > SHOT_MAX_WIDTH:
            height = round(out.height * SHOT_MAX_WIDTH / out.width)
            out = out.resize((SHOT_MAX_WIDTH, height), Image.LANCZOS)
        buffer = io.BytesIO()
        out.save(buffer, format="WEBP", quality=82, method=6)
        payload = buffer.getvalue()
    return payload, "webp", out.width, out.height


def add_screenshots(repo: dict, commit: str) -> list[str]:
    name = repo["name"]
    manifest = read_manifest(name)
    folder = media_folder(name, manifest)
    known = {
        shot.get("source")
        for shot in manifest.get("screenshots", [])
        if isinstance(shot, dict)
    }
    added: list[str] = []
    try:
        paths = discover_screenshots(name, commit)
    except (MediaError, urllib.error.URLError, json.JSONDecodeError) as error:
        raise MediaError(f"{name}: could not list screenshots ({error})") from error
    for path in paths:
        if len(manifest.get("screenshots", [])) >= MAX_SCREENSHOTS:
            break
        if len(added) >= SHOTS_PER_RUN:
            break
        if path in known:
            continue
        raw = fetch(raw_url(name, commit, path))
        if raw is None:
            continue
        try:
            payload, fmt, width, height = optimize_shot(raw)
        except MediaError:
            continue
        date = datetime.now(timezone.utc).date().isoformat()
        stem = re.sub(r"[^a-z0-9]+", "-", Path(path).stem.lower()).strip("-")
        stem = re.sub(r"^(\d{4}-\d{2}-\d{2}-)+", "", stem)[:40] or "capture"
        existing_stems = {
            re.sub(r"^(\d{4}-\d{2}-\d{2}-)+", "", Path(shot.get("src", "")).stem)
            for shot in manifest.get("screenshots", [])
        }
        if stem in existing_stems:
            known.add(path)
            continue
        relative = f"media/{folder}/{date}-{stem}.{fmt}"
        write_atomic(ROOT / "docs" / relative, payload)
        manifest.setdefault("screenshots", []).append(
            {
                "src": relative,
                "alt": f"{name} screenshot",
                "caption": f"{name} — " + humanize(Path(path).stem),
                "commit": commit,
                "taken_at": date,
                "viewport": "",
                "width": width,
                "height": height,
                "digest": digest(payload),
                "source": f"{name}:{path}",
            }
        )
        known.add(path)
        added.append(relative)
    if added:
        manifest["schema"] = SCHEMA
        manifest["repo"] = name
        write_manifest(name, manifest)
    return added


# ---------------------------------------------------------------- operations


def command_fetch(args: argparse.Namespace) -> int:
    repos = load_repos()
    if args.repo:
        wanted = {value.lower() for value in args.repo}
        repos = [repo for repo in repos if repo["name"].lower() in wanted]
        if not repos:
            print("No matching repository.", file=sys.stderr)
            return 2
    failures = 0
    for repo in repos:
        try:
            notes = build_repo(repo, args.force)
        except MediaError as error:
            failures += 1
            print(f"FAIL {repo['name']}: {error}", file=sys.stderr)
            continue
        if args.screenshots:
            try:
                commit = resolve_commit(repo["name"], repo.get("default_branch") or "main")
                added = add_screenshots(repo, commit) if commit else []
                notes.extend(f"{repo['name']}: added {shot}" for shot in added)
            except MediaError as error:
                # Logos and previews are already refreshed; capture listing is optional.
                print(f"WARN {repo['name']}: {error}", file=sys.stderr)
        for note in notes:
            print(note)
        print(f"ok   {repo['name']}")
    if not failures:
        write_logo_index()
    print(f"{len(repos) - failures}/{len(repos)} repositories have media")
    return 0 if failures == 0 else 1


def command_analyze(args: argparse.Namespace) -> int:
    repos = load_repos()
    if args.repo:
        wanted = {value.lower() for value in args.repo}
        repos = [repo for repo in repos if repo["name"].lower() in wanted]
    for repo in repos:
        manifest = read_manifest(repo["name"])
        facts = []
        for kind in ("logo", "preview"):
            entry = manifest.get(kind)
            if not entry:
                facts.append(f"{kind}=missing")
                continue
            path = ROOT / "docs" / entry["src"]
            size = path.stat().st_size if path.exists() else 0
            facts.append(f"{kind}={entry['width']}x{entry['height']} {round(size / 1024)}KB {entry.get('commit', '')[:7]}")
        print(f"{repo['name']:<32} " + "  ".join(facts))
    return 0


def command_check(args: argparse.Namespace) -> int:
    problems: list[str] = []
    for repo in load_repos():
        name = repo["name"]
        path = manifest_path(name)
        if not path.exists():
            problems.append(f"{name}: missing media/{name}.json")
            continue
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            problems.append(f"{name}: manifest is not JSON ({error})")
            continue
        if manifest.get("schema") != SCHEMA:
            problems.append(f"{name}: schema is {manifest.get('schema')!r}, expected {SCHEMA}")
        if manifest.get("repo") != name:
            problems.append(f"{name}: manifest repo is {manifest.get('repo')!r}")
        for kind in ("logo", "preview"):
            entry = manifest.get(kind)
            if not isinstance(entry, dict):
                problems.append(f"{name}: {kind} is missing")
                continue
            src = entry.get("src", "")
            if not isinstance(src, str) or not src.startswith(f"media/{name}/") or ".." in src:
                problems.append(f"{name}: {kind} src is unsafe: {src!r}")
                continue
            file = ROOT / "docs" / src
            if not file.exists() or not exact_path(src):
                problems.append(f"{name}: {kind} file is missing: {src}")
                continue
            data = file.read_bytes()
            if digest(data) != entry.get("digest"):
                problems.append(f"{name}: {kind} digest does not match {src}")
            try:
                _fmt, width, height = image_facts(data)
            except MediaError as error:
                problems.append(f"{name}: {kind} is not a readable image ({error})")
                continue
            if (width, height) != (entry.get("width"), entry.get("height")):
                problems.append(f"{name}: {kind} size is {width}x{height}, manifest says {entry.get('width')}x{entry.get('height')}")
            if entry.get("commit") and not COMMIT.fullmatch(str(entry["commit"])):
                problems.append(f"{name}: {kind} commit is not a SHA: {entry['commit']!r}")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(entry.get("taken_at", ""))):
                problems.append(f"{name}: {kind} taken_at is not a date")
            if kind == "logo" and entry.get("generated"):
                problems.append(f"{name}: logo is a fallback placeholder card, not authentic project artwork")
        for index, shot in enumerate(manifest.get("screenshots", [])):
            if not isinstance(shot, dict):
                problems.append(f"{name}: screenshot {index} is not an object")
                continue
            src = shot.get("src", "")
            if (
                not src.startswith(f"media/{name}/")
                or not (ROOT / "docs" / src).exists()
                or not exact_path(src)
            ):
                problems.append(f"{name}: screenshot {index} file is missing: {src!r}")
                continue
            data = (ROOT / "docs" / src).read_bytes()
            if not DIGEST.fullmatch(str(shot.get("digest", ""))):
                problems.append(f"{name}: screenshot {index} digest is missing or malformed: {src!r}")
            elif digest(data) != shot.get("digest"):
                problems.append(f"{name}: screenshot {index} digest does not match {src}")
            try:
                _fmt, width, height = image_facts(data)
            except MediaError as error:
                problems.append(f"{name}: screenshot {index} is not a readable image ({error})")
                continue
            if (width, height) != (shot.get("width"), shot.get("height")):
                problems.append(f"{name}: screenshot {index} size is {width}x{height}, manifest says {shot.get('width')}x{shot.get('height')}")
            if shot.get("commit") and not COMMIT.fullmatch(str(shot["commit"])):
                problems.append(f"{name}: screenshot {index} commit is not a SHA: {shot['commit']!r}")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(shot.get("taken_at", ""))):
                problems.append(f"{name}: screenshot {index} taken_at is not a date")
    known = {repo["name"].lower() for repo in load_repos()}
    for extra in sorted(MEDIA.glob("*.json")):
        if extra.name != "logos.json" and extra.stem.lower() not in known:
            problems.append(f"{extra.name}: not a catalogue repository")
    for extra in sorted(p for p in MEDIA.iterdir() if p.is_dir()):
        if extra.name.lower() not in known:
            problems.append(f"{extra.name}/: not a catalogue repository")

    index_path = MEDIA / "logos.json"
    if not index_path.exists():
        problems.append("media/logos.json is missing; run fetch")
    else:
        try:
            index = json.loads(index_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            index = {}
            problems.append(f"media/logos.json is not JSON ({error})")
        logos = index.get("logos", {}) if isinstance(index, dict) else {}
        if index.get("schema") != 1:
            problems.append("media/logos.json schema is not 1")
        for repo in load_repos():
            name = repo["name"]
            entry = logos.get(name)
            if not isinstance(entry, dict) or not entry.get("src"):
                problems.append(f"{name}: logos.json entry is missing")
                continue
            if not (ROOT / "docs" / entry["src"]).exists() or not exact_path(entry["src"]):
                problems.append(f"{name}: logos.json src does not resolve exactly: {entry['src']}")

    for problem in problems:
        print(f"FAIL {problem}", file=sys.stderr)
    print(f"{len(problems)} media problem(s)")
    return 0 if not problems else 1


def humanize(value: str) -> str:
    words = re.split(r"[-_\s]+", value.strip())
    pretty = []
    for word in words:
        if not word:
            continue
        pretty.append(word.upper() if word.lower() in {"ui", "api", "cli", "db", "id"} else word.capitalize())
    return " ".join(pretty)


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:40] or "capture"


def command_ingest(args: argparse.Namespace) -> int:
    name = args.repo
    if not NAME.fullmatch(name):
        print("Invalid repository name.", file=sys.stderr)
        return 2
    source = Path(args.file)
    if not source.is_file():
        print(f"File not found: {source}", file=sys.stderr)
        return 2
    raw = source.read_bytes()
    if len(raw) > MAX_BYTES:
        print("Image is larger than 8 MiB.", file=sys.stderr)
        return 2
    image_facts(raw)
    if not COMMIT.fullmatch(args.commit or ""):
        print("--commit must be a 7-40 character hexadecimal SHA.", file=sys.stderr)
        return 2
    try:
        payload, fmt, width, height = optimize(raw, "shot")
    except MediaError:
        fmt, width, height = image_facts(raw)
        payload = raw
    date = args.date or datetime.now(timezone.utc).date().isoformat()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        print("--date must be YYYY-MM-DD.", file=sys.stderr)
        return 2
    slug = re.sub(r"^(\d{4}-\d{2}-\d{2}-)+", "", safe_slug(Path(args.file).stem)) or "capture"
    relative = f"media/{name}/{date}-{slug}.{fmt}"
    write_atomic(ROOT / "docs" / relative, payload)
    manifest = read_manifest(name)
    manifest["schema"] = SCHEMA
    manifest["repo"] = name
    manifest.setdefault("screenshots", []).append(
        {
            "src": relative,
            "alt": args.alt or args.caption or f"{name} screenshot",
            "caption": args.caption or "",
            "commit": args.commit,
            "taken_at": date,
            "viewport": args.viewport or "",
            "width": width,
            "height": height,
            "digest": digest(payload),
        }
    )
    sanitize_manifest(manifest, name)
    write_manifest(name, manifest)
    print(f"Added {relative} ({width}x{height})")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    fetch_parser = sub.add_parser("fetch", help="fetch logos and social previews at each repository's HEAD")
    fetch_parser.add_argument("--repo", action="append", help="limit to one repository (repeatable)")
    fetch_parser.add_argument("--force", action="store_true", help="refetch even when a manifest is complete")
    fetch_parser.add_argument("--screenshots", action="store_true", help="also pull captures from the repository screenshot folders")
    fetch_parser.set_defaults(func=command_fetch)

    analyze_parser = sub.add_parser("analyze", help="print stored image dimensions, sizes and commits")
    analyze_parser.add_argument("--repo", action="append", help="limit to one repository (repeatable)")
    analyze_parser.set_defaults(func=command_analyze)

    check_parser = sub.add_parser("check", help="verify manifests, files, digests and dimensions offline")
    check_parser.set_defaults(func=command_check)

    ingest_parser = sub.add_parser("ingest", help="add a screenshot with its commit and date")
    ingest_parser.add_argument("--repo", required=True)
    ingest_parser.add_argument("--file", required=True)
    ingest_parser.add_argument("--commit", required=True)
    ingest_parser.add_argument("--date")
    ingest_parser.add_argument("--caption", default="")
    ingest_parser.add_argument("--alt", default="")
    ingest_parser.add_argument("--viewport", default="")
    ingest_parser.set_defaults(func=command_ingest)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except MediaError as error:
        print(f"Why: {error}", file=sys.stderr)
        print("Fix: check the repository name and network access, then retry.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
