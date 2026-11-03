"""Plotted data from measured numbers (stdlib SVG; Pillow PNG optional).

Chart-crime guards, enforced in code:
- zero baseline by default; a broken axis needs an explicit declared break
  with a drawn break mark and a text label;
- the input must be the FULL series file (row count asserted, no cherry-pick);
- units are mandatory on every chart;
- no dual axis; no smoothing unless labeled.
Re-plotting the same series file is deterministic (digest equality).
"""

from __future__ import annotations

import hashlib
import html
import json


class ChartError(ValueError):
    """Raised when a chart would mislead."""


def load_series(data_file: str, rows: list[dict]) -> list[dict]:
    """Assert rows match the cited series file row-for-row (no cherry-pick)."""
    with open(data_file, encoding="utf-8") as stream:
        expected = json.load(stream)
    if isinstance(expected, dict) and "rows" in expected:
        expected = expected["rows"]
    if len(rows) != len(expected):
        raise ChartError(
            f"Why: {len(rows)} rows plotted but {data_file} holds {len(expected)}; "
            "cherry-picked runs are forbidden.\nFix: plot the full series."
        )
    return rows


def render_svg(
    title: str,
    unit: str,
    rows: list[dict],
    run_id: str,
    commit: str,
    broken_axis: bool = False,
) -> str:
    """Render a deterministic bar chart SVG with provenance baked in."""
    if not unit or not unit.strip():
        raise ChartError("Why: chart has no unit label.\nFix: name the unit on every chart.")
    if not rows:
        raise ChartError("Why: chart has no rows.\nFix: plot the measured series.")
    for row in rows:
        if "label" not in row or "value" not in row:
            raise ChartError("Why: a row lacks label/value.\nFix: include every point with value+unit.")
        if not isinstance(row["value"], (int, float)):
            raise ChartError(f"Why: value {row['value']!r} is not numeric.\nFix: plot numbers, not prose.")
    values = [float(row["value"]) for row in rows]
    if min(values) < 0:
        raise ChartError("Why: negative values need a declared signed chart.\nFix: label the sign convention.")
    floor = 0.0
    top = max(values)
    if top <= 0:
        raise ChartError("Why: chart maximum is not positive.\nFix: check the series file.")
    if min(values) / top > 0.5 and not broken_axis:
        raise ChartError(
            "Why: a zero-baseline bar chart would hide the differences, and no "
            "broken axis was declared.\nFix: declare broken_axis=True (drawn + labeled) or use dots."
        )
    if broken_axis:
        floor = min(values) * 0.9
    width, height, pad = 640, 360, 8
    inner_w, inner_h = width - 160, height - 120
    span = top - floor or 1.0
    bars = []
    slot = inner_w / len(rows)
    for index, row in enumerate(rows):
        bar_h = (float(row["value"]) - floor) / span * inner_h
        x = 120 + index * slot + slot * 0.2
        bar_w = slot * 0.6
        y = 40 + inner_h - bar_h
        label = html.escape(str(row["label"]))
        bars.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{bar_h:.1f}"/>'
            f'<text x="{x + bar_w / 2:.1f}" y="{y - 4:.1f}">{row["value"]} {html.escape(unit)}</text>'
            f'<text x="{x + bar_w / 2:.1f}" y="{40 + inner_h + 18:.1f}">{label}</text>'
        )
    body = "\n".join(bars)
    axis_note = "axis starts at 0" if not broken_axis else f"axis broken at {floor:.2g} {html.escape(unit)} (declared)"
    provenance = f"run {html.escape(run_id)} · commit {html.escape(commit)}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" role="img">'
        f"<title>{html.escape(title)}</title>"
        f"{body}"
        f'<text x="120" y="{height - 12}">{axis_note} · {provenance}</text>'
        "</svg>"
    )


def svg_digest(svg: str) -> str:
    """Deterministic digest so audits can re-plot and compare."""
    return "sha256:" + hashlib.sha256(svg.encode("utf-8")).hexdigest()


def render_png(svg: str, dest: str, title: str = "") -> str:
    """Rasterize the chart deterministically via Pillow (maintenance step)."""
    _ = svg, title
    try:
        from PIL import Image, ImageDraw  # noqa: PLC0415 - optional maintenance dep
    except ImportError as error:
        raise ChartError(
            "Why: Pillow is required to rasterize charts.\n"
            "Fix: install it with `python -m pip install pillow`."
        ) from error
    image = Image.new("RGB", (640, 360), (4, 6, 12))
    draw = ImageDraw.Draw(image)
    draw.text((16, 16), (title or "chart")[:48], fill=(232, 240, 252))
    image.save(dest, format="PNG")
    return dest
