"""Manage private-game teaser media under docs/assets/games/.

The private games shown in the site's workshop section have no public
repository, so the dossier media pipeline cannot own their screenshots.
This tool gives teasers the same discipline offline: a manifest as the
single source of truth, optimized captures written atomically, an
offline consistency check, and a sync command that renders the workshop
markup in docs/index.html between markers.

Commands:
    register --game Name --title "..." [--pitch "..."] [--status "..."]
    ingest   --game Name --file shot.png [--alt "..."] [--caption "..."] [--date YYYY-MM-DD]
    check    verify every manifest entry against the files on disk
    sync     re-render the workshop block in docs/index.html from the manifest
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import sys
from html import escape
from pathlib import Path

from build_dossier_media import (
    MAX_BYTES,
    MediaError,
    digest,
    image_facts,
    optimize,
    safe_slug,
    write_atomic,
)

ROOT = Path(__file__).resolve().parents[1]
GAMES_DIR = "assets/games"
MANIFEST_RELATIVE = f"{GAMES_DIR}/teasers.json"
PLACEHOLDER_SRC = f"{GAMES_DIR}/placeholder.svg"
NAME = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
SCHEMA = 1
MARKERS = ("<!-- aegean:games-teasers:start -->", "<!-- aegean:games-teasers:end -->")
ORPHAN_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")


def manifest_path(root: Path) -> Path:
    return Path(root) / "docs" / MANIFEST_RELATIVE


def load_manifest(root: Path) -> dict:
    path = manifest_path(root)
    if not path.exists():
        return {"schema": SCHEMA, "games": []}
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        raise MediaError(
            f"{MANIFEST_RELATIVE} is not readable JSON ({error}); "
            "repair or delete it, then re-register the games."
        ) from error
    if not isinstance(manifest, dict) or manifest.get("schema") != SCHEMA:
        raise MediaError(f"{MANIFEST_RELATIVE} is not schema {SCHEMA}")
    if not isinstance(manifest.get("games"), list):
        raise MediaError(f"{MANIFEST_RELATIVE} has no games list")
    return manifest


def save_manifest(root: Path, manifest: dict) -> None:
    payload = json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8") + b"\n"
    backup = manifest_path(root).with_suffix(".json.bak")
    if manifest_path(root).exists():
        backup.write_bytes(manifest_path(root).read_bytes())
    write_atomic(manifest_path(root), payload)


def find_game(manifest: dict, name: str) -> dict | None:
    return next((game for game in manifest["games"] if game.get("name") == name), None)


def resolve_root(args: argparse.Namespace) -> Path:
    return Path(args.root).resolve() if args.root else ROOT


def command_register(args: argparse.Namespace) -> int:
    if not NAME.fullmatch(args.game):
        print(f"Invalid game name: {args.game!r}", file=sys.stderr)
        print("Fix: use letters, digits, dots, dashes or underscores only.", file=sys.stderr)
        return 2
    root = resolve_root(args)
    manifest = load_manifest(root)
    game = find_game(manifest, args.game)
    if game is None:
        game = {"name": args.game, "screenshots": []}
        manifest["games"].append(game)
    game["title"] = args.title
    game["pitch"] = args.pitch or ""
    game["status"] = args.status or "in development"
    save_manifest(root, manifest)
    print(f"Registered {args.game}: {game['title']} ({game['status']})")
    return 0


def command_ingest(args: argparse.Namespace) -> int:
    if not NAME.fullmatch(args.game):
        print(f"Invalid game name: {args.game!r}", file=sys.stderr)
        print("Fix: use letters, digits, dots, dashes or underscores only.", file=sys.stderr)
        return 2
    root = resolve_root(args)
    manifest = load_manifest(root)
    game = find_game(manifest, args.game)
    if game is None:
        print(
            f"Game {args.game!r} is not registered.",
            file=sys.stderr,
        )
        print(f"Fix: run `register --game {args.game} --title \"...\"` first, then ingest.", file=sys.stderr)
        return 2
    source = Path(args.file)
    if not source.is_file():
        print(f"File not found: {source}", file=sys.stderr)
        return 2
    raw = source.read_bytes()
    if len(raw) > MAX_BYTES:
        print("Image is larger than 8 MiB.", file=sys.stderr)
        return 2
    try:
        payload, fmt, width, height = optimize(raw, "shot")
    except MediaError:
        fmt, width, height = image_facts(raw)
        payload = raw
    date = args.date or datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        print("--date must be YYYY-MM-DD.", file=sys.stderr)
        return 2
    slug = re.sub(r"^(\d{4}-\d{2}-\d{2}-)+", "", safe_slug(source.stem)) or "capture"
    relative = f"{GAMES_DIR}/{args.game}/{date}-{slug}.{fmt}"
    write_atomic(Path(root) / "docs" / relative, payload)
    game.setdefault("screenshots", []).append(
        {
            "src": relative,
            "alt": args.alt or args.caption or f"{game.get('title', args.game)} screenshot",
            "caption": args.caption or "",
            "taken_at": date,
            "width": width,
            "height": height,
            "digest": digest(payload),
        }
    )
    save_manifest(root, manifest)
    print(f"Added {relative} ({width}x{height})")
    return 0


def command_check(args: argparse.Namespace) -> int:
    root = resolve_root(args)
    problems: list[str] = []
    try:
        manifest = load_manifest(root)
    except MediaError as error:
        print(f"[FAIL] {error}", file=sys.stderr)
        return 1
    docs = Path(root) / "docs"
    names: set[str] = set()
    for game in manifest["games"]:
        name = game.get("name", "")
        if name in names:
            problems.append(f"{name}: registered twice")
        names.add(name)
        folder = docs / GAMES_DIR / name
        seen: set[str] = set()
        for index, shot in enumerate(game.get("screenshots") or []):
            src = str(shot.get("src", ""))
            if not src.startswith(f"{GAMES_DIR}/{name}/"):
                problems.append(f"{name}: screenshot {index} escapes {GAMES_DIR}/{name}/: {src!r}")
                continue
            path = docs / src
            seen.add(src)
            if not path.is_file():
                problems.append(f"{name}: screenshot {index} file is missing: {src!r}")
                continue
            data = path.read_bytes()
            if shot.get("digest") != digest(data):
                problems.append(f"{name}: screenshot {index} digest does not match {src}")
            try:
                _fmt, width, height = image_facts(data)
            except MediaError as error:
                problems.append(f"{name}: screenshot {index} is not a readable image ({error})")
                continue
            if (width, height) != (shot.get("width"), shot.get("height")):
                problems.append(
                    f"{name}: screenshot {index} size is {width}x{height}, manifest says "
                    f"{shot.get('width')}x{shot.get('height')}"
                )
        for extra in sorted(folder.iterdir()) if folder.is_dir() else []:
            orphan = extra.relative_to(docs).as_posix()
            if extra.suffix.lower() in ORPHAN_SUFFIXES and not extra.is_dir() and orphan not in seen:
                problems.append(f"{name}: image not in the manifest: {orphan}")
    if problems:
        for problem in problems:
            print(f"[FAIL] {problem}", file=sys.stderr)
        print(
            "Fix: repair or re-ingest the listed files; `ingest` rewrites entries with fresh digests.",
            file=sys.stderr,
        )
        return 1
    print(f"[OK] {manifest_path(root).relative_to(root)} verified ({len(names)} game(s))")
    return 0


def render_game_card(game: dict) -> str:
    shots = game.get("screenshots") or []
    title = escape(str(game.get("title") or game.get("name") or "Untitled"))
    status = str(game.get("status") or "").strip()
    pitch = escape(str(game.get("pitch") or "Screens from a private build; details to follow."))
    parts = ['<article class="game-teaser">']
    if shots:
        shot = shots[0]
        alt = escape(str(shot.get("alt") or title))
        parts.append(f'  <figure><img src="{escape(shot["src"])}" alt="{alt}" loading="lazy"></figure>')
    else:
        parts.append(f'  <figure><img src="{PLACEHOLDER_SRC}" alt="In-development build, screen to come" loading="lazy"></figure>')
    parts.append('  <div class="game-card-body">')
    tag = f' <span class="tag">{escape(status)}</span>' if status else ""
    parts.append(f"    <h3>{title}{tag}</h3>")
    parts.append(f"    <p>{pitch}</p>")
    parts.append("  </div>")
    parts.append("</article>")
    return "\n".join(parts)


def render_workshop(manifest: dict) -> str:
    games = [game for game in manifest["games"] if game.get("screenshots")]
    if not games:
        body = render_game_card({"name": "Placeholder", "title": "Slot 1", "status": ""})
        body = body.replace(
            escape("Screens from a private build; details to follow."),
            escape("Reserved for a private game in development; screenshots and pitch land here later."),
        )
    else:
        body = "\n".join(render_game_card(game) for game in games)
    return '<div class="game-grid">\n' + body + "\n</div>"


def command_sync(args: argparse.Namespace) -> int:
    root = resolve_root(args)
    manifest = load_manifest(root)
    index = Path(root) / "docs" / "index.html"
    html = index.read_text(encoding="utf-8")
    start, end = MARKERS
    begin = html.find(start)
    finish = html.find(end)
    if begin < 0 or finish < 0 or finish < begin:
        print(
            f"docs/index.html is missing its teaser markers.",
            file=sys.stderr,
        )
        print(f"Fix: wrap the workshop grid in `{start}` and `{end}` lines, then rerun.", file=sys.stderr)
        return 2
    replacement = f"{start}\n{render_workshop(manifest)}\n      "
    html = html[: begin + len(start)] + replacement[len(start):] + html[finish:]
    write_atomic(index, html.encode("utf-8"))
    game_count = len([game for game in manifest["games"] if game.get("screenshots")])
    print(f"Synced workshop markup: {game_count or 'placeholder'} card(s)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", help="project root (defaults to the repository this tool lives in)")
    sub = parser.add_subparsers(dest="command", required=True)

    register = sub.add_parser("register", help="declare a private game's teaser text")
    register.add_argument("--game", required=True)
    register.add_argument("--title", required=True)
    register.add_argument("--pitch", default="")
    register.add_argument("--status", default="in development")
    register.set_defaults(func=command_register)

    ingest = sub.add_parser("ingest", help="add an optimized screenshot to a game")
    ingest.add_argument("--game", required=True)
    ingest.add_argument("--file", required=True)
    ingest.add_argument("--alt", default="")
    ingest.add_argument("--caption", default="")
    ingest.add_argument("--date")
    ingest.set_defaults(func=command_ingest)

    check = sub.add_parser("check", help="verify the manifest against the files on disk")
    check.set_defaults(func=command_check)

    sync = sub.add_parser("sync", help="render the workshop block in docs/index.html")
    sync.set_defaults(func=command_sync)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except MediaError as error:
        print(f"Why: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
