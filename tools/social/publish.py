"""Publishing: approval-gated, marker-asserted, topic re-checked, idempotent."""

from __future__ import annotations

from . import disclosure, queue, secrets
from .topic_gate import require_on_topic
from .x_client import LiveTransport, MockTransport, idempotency_key

DEFAULT_TRANSPORT = MockTransport()


class PublishError(ValueError):
    """Raised when publishing is blocked."""


def publish(
    draft_id: str,
    state_dir=None,
    transport: MockTransport | LiveTransport | None = None,
    published_hashes: list[str] | None = None,
) -> dict:
    """Publish a queued draft; default transport is the dry-run mock."""
    record = queue.require_approval(queue.get(draft_id, state_dir))
    draft = record["draft"]
    require_on_topic(draft["repo"])
    if not disclosure.has_marker(draft["text"]):
        raise PublishError("Why: disclosure marker missing; it is un-droppable.\nFix: keep the automation marker.")
    transport = transport or DEFAULT_TRANSPORT
    if isinstance(transport, LiveTransport):
        if not secrets.live_enabled():
            raise PublishError(
                "Why: live transport without AEGEAN_SOCIAL_LIVE=1.\nFix: stay on the dry-run mock until a human approves."
            )
        secrets.load_x_credentials()
    visual = draft.get("visual") or {}
    key = idempotency_key(draft["text"], visual.get("digest", ""))
    for known in published_hashes or []:
        if known == key:
            return {"duplicate": True, "idempotency_key": key, "live": False}
    receipt = transport.post(draft["text"], key, [visual.get("digest", "")] if visual else [])
    return {"receipt": receipt, "idempotency_key": key, "live": bool(receipt.get("live"))}
