"""Thin X API client: mock transport by default, live only if explicitly enabled."""

from __future__ import annotations

import hashlib


class MockTransport:
    """Dry-run transport: records posts, publishes nothing."""

    def __init__(self) -> None:
        self.sent: list[dict] = []

    def post(self, text: str, idempotency_key: str, media: list[str] | None = None) -> dict:
        """Record a post and return a mock receipt."""
        for prior in self.sent:
            if prior["idempotency_key"] == idempotency_key:
                return prior["receipt"]
        receipt = {"id": f"mock-{idempotency_key[:12]}", "idempotency_key": idempotency_key, "live": False}
        self.sent.append({"text": text, "idempotency_key": idempotency_key, "media": media or [], "receipt": receipt})
        return receipt


class LiveTransport:
    """Real transport placeholder: enabled only with env credentials + live flag."""

    def __init__(self, credentials: dict) -> None:
        self.credentials = credentials
        self.redacted = {key: "***" for key in credentials}

    def post(self, text: str, idempotency_key: str, media: list[str] | None = None) -> dict:
        """Live posting is implemented when a human approves a live test."""
        raise RuntimeError(
            "Why: live posting is not wired until a human approves a live test.\n"
            "Fix: keep AEGEAN_SOCIAL_LIVE unset (dry-run) until then."
        )


def idempotency_key(text: str, visual_digest: str) -> str:
    """Idempotency key binding text to its visual."""
    return "sha256:" + hashlib.sha256((text + "\0" + (visual_digest or "")).encode("utf-8")).hexdigest()
