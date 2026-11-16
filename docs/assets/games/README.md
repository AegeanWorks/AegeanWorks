Private game teaser slots live in `docs/assets/games/`. Each private game gets its
own subdirectory and an entry in `docs/assets/games/teasers.json`; nothing here is
linked to a public dossier.

Manage this tree with `tools/build_game_teasers.py` (run from the project root):

1. `python tools/build_game_teasers.py register --game <Name> --title "..." [--pitch "..."] [--status "..."]`
2. `python tools/build_game_teasers.py ingest --game <Name> --file shot.png [--alt "..."] [--date YYYY-MM-DD]`
   - optimizes to webp and records the digest; files are not referenced by hand
3. `python tools/build_game_teasers.py check` - offline manifest/file verification
4. `python tools/build_game_teasers.py sync` - re-renders the workshop block in `docs/index.html`

The block between the `aegean:games-teasers` markers in `docs/index.html` is owned
by `sync`; edit the manifest, never that block by hand. While the manifest has no
games with screenshots, `sync` renders the `placeholder.svg` card.
