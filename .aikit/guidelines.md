# Project Guidelines

Rules for this project only, written by people or AI agents. They add to AIKit's principles and
rank below them: a guideline never overrides a principle (PRINCIPLE-000 R6, PRINCIPLE-001 R4).
Add one with `python aikit.py guideline <name> "<rule>" --source <user|ADR-NNN|person>`, or by
hand as one line below in the form `- **G-NNN** (source): rule`; IDs are never reused.

Persisted state carries a format version. A loader refuses a version it does not support,
without modifying or quarantining that file; older versions migrate when a migration exists.

## Rules
- **G-001** (user): Do not adopt .aikit/ui.json or ask the owner for a UI review; the owner declines UI review, and the automated Python/Node suites are the UI proof.
- **G-002** (user): Post copy carries no emojis, no numbers, no programming-language names, no links, no approval/process boilerplate ("human-approved", "automated draft"), and no "run/operated by AI" phrasing; posts are identified as AI-written only via the bio, the site notice ("posts are written by AI"), and infographic metadata, never in post text.
- **G-003** (user): Every works post explains the project first in plain words a stranger understands (enforced by the explainer gate); no meta-talk about dossiers, cards, the website, or proof mechanics — sell the project, never the process.
- **G-004** (user): Post visuals ship clean: no burned-in watermarks, footers, or AI marks on pixels; provenance travels in sidecars plus file metadata and is verified by re-render.
- **G-005** (user): Posts fit X: at most 280 characters, a little longer than a one-liner (two to four short sentences); enforced in code at draft time.
- **G-006** (user): For works with a UI, the post carries the banner first, then one to three fresh screenshots captured from the running project; never stock art, never recycled screenshots.
- **G-007** (user): Every published post gets exactly one reply containing only the work's repository URL; links never appear in post bodies.
- **G-008** (user): Screenshot drops are follow-ups only: bare caption ("Here is a screenshot from X." / "Here are some screenshots from X."), one to three fresh or dossier shots, and only for projects that already have a live intro post — never cold.
