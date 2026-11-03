"""Environment-only credential loader. No defaults, no logging, no disk reads."""

from __future__ import annotations

import os

KEYS = ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET")


class MissingCredentialsError(RuntimeError):
    """Raised when live credentials are absent."""


def load_x_credentials() -> dict:
    """Return live X credentials from the environment or raise."""
    values = {key: os.environ.get(key) for key in KEYS}
    missing = [key for key, value in values.items() if not value]
    if missing:
        raise MissingCredentialsError(
            "Why: live X credentials are missing for "
            + ", ".join(missing)
            + ".\nFix: export them in the environment; they never live in the repo."
        )
    return values


def live_enabled() -> bool:
    """True only when the explicit live flag is set."""
    return os.environ.get("AEGEAN_SOCIAL_LIVE") == "1"
