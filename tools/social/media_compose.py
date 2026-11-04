"""Infographic composer: title + numbers, clean pixels.

Deterministic SVG so re-render is byte-comparable for audit.
Provenance (run, commit, data file, date, AI mark) travels in the SVG
<metadata> block and the sidecar — never burned over the image, per owner
rule: no watermarks in photos from 2026-11-04 onward.
"""

from __future__ import annotations

import hashlib
import html


def compose_svg(
    title: str,
    lines: list[str],
    run_id: str,
    commit: str,
    data_file: str,
    date: str,
    ai_mark: str,
) -> str:
    """Compose the infographic SVG; raises if any provenance slot is empty."""
    missing = [name for name, value in (("run", run_id), ("commit", commit), ("data_file", data_file), ("date", date)) if not value]
    if missing:
        raise ValueError(f"Why: infographic lacks provenance: {', '.join(missing)}.\nFix: cite the run that produced it.")
    if not ai_mark:
        raise ValueError("Why: infographic lacks the made-by-AI mark.\nFix: pass the disclosure AI mark.")
    if not lines:
        raise ValueError("Why: infographic has no facts.\nFix: add 1-4 measured lines.")
    facts = "\n".join(
        f'<text x="48" y="{140 + index * 34}">{html.escape(line)}</text>' for index, line in enumerate(lines[:4])
    )
    meta = (
        "<metadata>"
        f"run={html.escape(run_id)} commit={html.escape(commit)} "
        f"data_file={html.escape(data_file)} date={html.escape(date)} "
        f"ai={html.escape(ai_mark)}"
        "</metadata>"
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" role="img">'
        f"<title>{html.escape(title)}</title>"
        f"{meta}"
        f'<text x="48" y="80">{html.escape(title)}</text>'
        f"{facts}"
        "</svg>"
    )


def svg_digest(svg: str) -> str:
    """Deterministic digest for audit comparison."""
    return "sha256:" + hashlib.sha256(svg.encode("utf-8")).hexdigest()
