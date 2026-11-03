# Project media

Logos, social previews and screenshots for the portfolio and a project dossier
at `project.html?repo=<Name>`. Each project has one manifest,
`media/<Name>.json`, plus the files it points at, and `media/logos.json` is the
small index the portfolio reads to put logos on the cards without fetching 48
manifests. Nothing is generated at build time.

## Where the images come from

- `logo` is the repository's own `assets/logo.jpg` (or `.png`/`.webp`/`.svg`),
  fetched from GitHub at the commit recorded in the manifest and stored as a
  256px square WebP. It appears on the **portfolio card**, not on the dossier;
  the full-size reviewed art stays in the project repository.
- `preview` is the repository's `assets/social-preview.png`, the same card
  GitHub shows for the repository, fetched from the same commit and stored as
  a 1200px-wide WebP. It is the image at the top of the **dossier**.
- `screenshots` come from the repository's `assets/screenshots/` or
  `screenshots/` folders (`fetch --screenshots`, up to three new captures per
  run) or from `ingest`, each tied to the commit it shows. On the dossier they
  open in an in-page viewer with previous/next, captions and commit metadata;
  the original file stays one link away.
- A repository with no `assets/` images gets a generated branded card, marked
  `"generated": true`, so the dossier never falls back to a remote image.

## Manifest schema

```json
{
  "schema": 2,
  "repo": "AIKit",
  "logo": {
    "src": "media/AIKit/logo.webp",
    "alt": "AIKit logo",
    "width": 256,
    "height": 256,
    "digest": "sha256:…",
    "commit": "476c05c0879c922c6bfcc3b16a82cb7bfd7b40ae",
    "taken_at": "2026-10-28",
    "source": "https://raw.githubusercontent.com/AegeanWorks/AIKit/476c05c…/assets/logo.jpg"
  },
  "preview": {
    "src": "media/AIKit/social-preview.webp",
    "alt": "AIKit social preview",
    "width": 1200,
    "height": 600,
    "digest": "sha256:…",
    "commit": "476c05c0879c922c6bfcc3b16a82cb7bfd7b40ae",
    "taken_at": "2026-10-28",
    "source": "https://raw.githubusercontent.com/AegeanWorks/AIKit/476c05c…/assets/social-preview.png"
  },
  "screenshots": [
    {
      "src": "media/AIKit/dashboard-2026-10-28.webp",
      "alt": "Task ledger dashboard with two open milestones",
      "caption": "Ledger view after the reforge audit",
      "commit": "3ec859e",
      "taken_at": "2026-10-27",
      "viewport": "1440x900",
      "width": 1440,
      "height": 900,
      "digest": "sha256:…"
    }
  ]
}
```

- `schema` is `2`; an unknown schema is ignored rather than guessed at.
- `repo` must match the dossier name, case-insensitively.
- `src` is always relative to `docs/` and must start with `media/`; absolute
  URLs, `..` segments and `//` are rejected.
- `commit` is the 7-40 character hexadecimal commit the media was taken from.
- `taken_at` is the calendar date (`YYYY-MM-DD`).
- `digest` is the SHA-256 of the stored bytes, so a swapped file is detectable
  offline.
- `width` and `height` are the stored pixel size, used to reserve layout space.
- At most 12 screenshots per project. `alt` is required; `caption` falls back to
  `alt` for the accessible name. Captions never contain local file paths.

## Tool

`tools/build_dossier_media.py` is the only writer. It uses the standard library
and Pillow for optimization (a maintenance dependency, never shipped to the
site).

```bash
python tools/build_dossier_media.py fetch                      # logos + social previews at HEAD
python tools/build_dossier_media.py fetch --screenshots        # also pull repository capture folders
python tools/build_dossier_media.py fetch --force --screenshots # scheduled refresh
python tools/build_dossier_media.py analyze          # dimensions, size, commit
python tools/build_dossier_media.py check            # manifests, files, digests (offline)
python tools/build_dossier_media.py ingest --repo AIKit --file capture.png \
  --commit 3ec859e --date 2026-10-28 --caption "Ledger view" --viewport 1440x900
```

`fetch` records the repository's HEAD commit, fetches the matching
`assets/logo.*` and `assets/social-preview.*`, writes a 256px logo and a 1200px
preview as WebP, and with `--screenshots` lists the repository's screenshot
folders through the GitHub trees API (authenticated with `GITHUB_TOKEN` in the
workflow) and adds up to three new captures. Unchanged files keep their recorded
date, so a scheduled run is a no-op unless a repository actually changed. The
scheduled `.github/workflows/media.yml` runs this weekly and commits the result. `check` runs in CI: every catalogue repository must have a manifest, every
file must exist, and every digest and dimension must match.

## Adding a capture

1. Record the repository state the capture shows:
   `git -C <repo> rev-parse --short HEAD` and the current date.
2. Run `ingest` with that file, commit, date and a caption.
3. Run `python -m unittest discover -s tests`, `node tests/project/run-tests.mjs`
   and `python tools/build_dossier_media.py check`.

A capture whose `commit` does not resolve in the public repository is worse than
no capture: it claims evidence for code nobody can inspect. Re-shoot or drop it.
