"""Meta Model API wiring: AI image generation + AI aesthetic review.

Auth: MODEL_API_KEY from the environment only (Bearer token, never logged,
never stored). Base: https://api.meta.ai/v1. Stdlib urllib only, no new deps.

- generate_image(prompt, ...): muse-image-1.0, single-shot generations
  endpoint. Returns PNG bytes. Used for decorative post art only: any claim
  in the post text still traces to repo evidence via the normal gates.
- ai_review(image_bytes): muse-spark-1.3 vision verdict PASS / FLAGGED.
  Called by the browser publisher after heuristics; a flag blocks the click.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.request

BASE = "https://api.meta.ai/v1"
IMAGE_MODEL = "muse-image-1.0"
VISION_MODEL = "muse-spark-1.3"
TIMEOUT = 120

REVIEW_RUBRIC = (
    "You are an art director reviewing a social media visual for a software studio. "
    "Judge composition, breathing room, text legibility at timeline size, color harmony, "
    "and visible defects (stretching, blur, muddy contrast, cramped margins). "
    "Reply with exactly PASS if it is post-worthy, or FLAGGED: <one-line reason> if not."
)


class MetaImageError(RuntimeError):
    """Raised for key, network or API failures (key never included)."""


def _key() -> str:
    key = os.environ.get("MODEL_API_KEY")
    if not key:
        raise MetaImageError(
            "Why: MODEL_API_KEY is not set in the environment.\n"
            "Fix: export it where the agent runs; it never lives in the repo."
        )
    return key


def _post(path: str, payload: dict) -> dict:
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer " + _key(), "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")[:300]
        if error.code == 401:
            raise MetaImageError(
                "Why: the API rejected the key (401).\nFix: check MODEL_API_KEY, rotate if leaked."
            ) from error
        if error.code == 429:
            raise MetaImageError(
                "Why: rate limited (429).\nFix: back off and retry; cadence caps already space posts out."
            ) from error
        raise MetaImageError(f"Why: API error {error.code}: {body}.\nFix: retry; 5xx backs off.") from error
    except urllib.error.URLError as error:
        raise MetaImageError(f"Why: network unreachable: {error}.\nFix: retry when online.") from error


def generate_image(prompt: str, size: str = "1536x1024") -> bytes:
    """Generate one PNG image; returns raw bytes."""
    if not prompt or not prompt.strip():
        raise MetaImageError("Why: empty prompt.\nFix: describe the visual to generate.")
    data = _post(
        "/images/generations",
        {"model": IMAGE_MODEL, "prompt": prompt, "n": 1, "size": size,
         "response_format": "b64_json", "output_format": "png"},
    )
    try:
        return base64.b64decode(data["data"][0]["b64_json"])
    except (KeyError, IndexError, ValueError) as error:
        raise MetaImageError(
            "Why: generation response had no image payload.\nFix: retry; check the model name."
        ) from error


def ai_review(image_bytes: bytes) -> str:
    """Vision verdict: 'pass' or 'flagged: <reason>' (raises without a key)."""
    _key()  # fail fast on missing key before touching pixels
    import io  # noqa: PLC0415 - sniff format without touching disk

    from PIL import ImageFile  # noqa: PLC0415 - maintenance dep

    parser = ImageFile.Parser()
    parser.feed(image_bytes)
    image = parser.close()
    image.thumbnail((1024, 1024))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    verdict = None
    # Reasoning models spend budget thinking: one roomy call, not small retries.
    data = _post(
        "/chat/completions",
        {"model": VISION_MODEL,
         "messages": [{"role": "user", "content": [
             {"type": "text", "text": REVIEW_RUBRIC},
             {"type": "image_url", "image_url": {"url": data_url}}]}],
         "max_tokens": 4000},
    )
    try:
        verdict = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as error:
        raise MetaImageError(
            "Why: review response had no verdict.\nFix: retry; check the model name."
        ) from error
    if not verdict:
        raise MetaImageError(
            "Why: the vision model returned no text.\n"
            "Fix: retry later; heuristics still gate the visual."
        )
    verdict = verdict.strip()
    if verdict.upper().startswith("PASS"):
        return "pass"
    return "flagged: " + verdict[:200]
