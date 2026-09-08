"""App token authentication for the proxy API.

A shared secret sent by the client in the X-App-Token header. It filters
out casual abuse (script kiddies, blind scanners) — it is NOT protection
against a targeted attacker, who can extract the token from a client
build. Real abuse protection is provided by quotas and the global budget.

Tokens are configured via the APP_TOKENS env var (comma-separated list,
e.g. APP_TOKENS=token1,token2) to support rotation: ship a new client
release with a new token, add it to the list, remove the old one once
old client versions are gone.

If APP_TOKENS is unset or empty, token checking is disabled entirely —
this keeps backward compatibility during rollout (deploy proxy first,
release clients with the token, then enable checking on the server).
"""

import os
from threading import Lock


class AppTokenAuth:
    """Validates the X-App-Token header against a configured token list."""

    def __init__(self, env_var: str = "APP_TOKENS"):
        self._lock = Lock()
        self._env_var = env_var
        self._tokens: set[str] = set()
        self.reload()

    def reload(self) -> None:
        """Re-read tokens from the environment (also usable in tests)."""
        raw = os.getenv(self._env_var, "")
        tokens = {t.strip() for t in raw.split(",") if t.strip()}
        with self._lock:
            self._tokens = tokens

    @property
    def enabled(self) -> bool:
        """True when at least one token is configured."""
        with self._lock:
            return bool(self._tokens)

    def is_valid(self, token: str | None) -> bool:
        """
        Check whether the provided token matches any configured token.

        Args:
            token: Value of the X-App-Token header (or None if missing).

        Returns:
            True if the token is valid (or checking is disabled).
        """
        if not self.enabled:
            return True
        if not token:
            return False
        with self._lock:
            return token in self._tokens
