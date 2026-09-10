"""Client version gate for the proxy API.

The client sends its app version in the X-App-Version header (semver,
e.g. "1.21.0"). The proxy compares it against the minimum supported
version configured via the MIN_APP_VERSION env var. Outdated clients
get a 426 Upgrade Required response so they can show an
"update the app" screen.

If MIN_APP_VERSION is unset or empty, version checking is disabled
entirely — same rollout pattern as APP_TOKENS: deploy the proxy first,
release clients that send the header, then enable checking on the server.
"""

import os


def parse_version(version: str) -> tuple[int, ...] | None:
    """
    Parse a strict semver string "x.y.z" into a tuple of ints.

    Args:
        version: Version string to parse.

    Returns:
        Tuple of (major, minor, patch) or None if the string is not
        a valid strict semver.
    """
    parts = version.strip().split(".")
    if len(parts) != 3:
        return None
    try:
        return tuple(int(p) for p in parts)
    except ValueError:
        return None


class VersionGate:
    """Checks the X-App-Version header against a minimum version."""

    def __init__(self, env_var: str = "MIN_APP_VERSION"):
        self._env_var = env_var
        self._min_version: tuple[int, ...] | None = None
        self.reload()

    def reload(self) -> None:
        """Re-read the minimum version from the environment (also usable in tests)."""
        raw = os.getenv(self._env_var, "").strip()
        self._min_version = parse_version(raw) if raw else None

    @property
    def enabled(self) -> bool:
        """True when a minimum version is configured."""
        return self._min_version is not None

    @property
    def min_version(self) -> str | None:
        """Configured minimum version as a string, or None when disabled."""
        if self._min_version is None:
            return None
        return ".".join(str(p) for p in self._min_version)

    def is_supported(self, version: str | None) -> bool:
        """
        Check whether the client version is supported.

        Args:
            version: Value of the X-App-Version header (or None if missing).

        Returns:
            True if checking is disabled, or the version is valid and
            greater than or equal to the minimum. Missing or unparseable
            versions are treated as outdated.
        """
        if not self.enabled:
            return True
        if not version:
            return False
        parsed = parse_version(version)
        if parsed is None:
            return False
        return parsed >= self._min_version
