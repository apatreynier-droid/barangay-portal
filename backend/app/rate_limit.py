"""In-memory rate limiting for authentication endpoints.

Design notes:
- All state lives in this process's memory (plain dicts guarded by a lock);
  no Redis or other external storage is required. This is intentional for
  the current single-backend / single-server deployment.
- ``LoginRateLimiter`` tracks CONSECUTIVE failed login attempts per client
  (IP + normalized account email) using a sliding window: failures older
  than ``failure_window_seconds`` are forgotten. Reaching
  ``max_failed_attempts`` within the window starts a block that lasts
  ``block_duration_seconds``. A successful login clears the counter.
- ``IPRateLimiter`` is a coarser guard that caps the raw number of login
  requests allowed per client IP in a sliding window, protecting the
  endpoint against brute-force flooding.
- Every limit is configured in ``app.config.settings`` and can be changed
  through environment variables (see ``.env.example``) without touching
  this module.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict

from fastapi import Request

from .config import settings


@dataclass(frozen=True)
class RateLimitConfig:
    """All rate-limit values in a single place, sourced from settings."""

    # -- Failed-login (consecutive attempts) limiter -----------------------
    max_failed_attempts: int = settings.login_max_failed_attempts
    failure_window_seconds: int = settings.login_failure_window_seconds
    block_duration_seconds: int = settings.login_block_duration_seconds
    # -- Per-IP request limiter (flood / brute-force protection) -----------
    ip_max_requests: int = settings.login_ip_max_requests
    ip_window_seconds: int = settings.login_ip_window_seconds


@dataclass
class _AttemptState:
    failures: Deque[float] = field(default_factory=deque)
    blocked_until: float = 0.0


class _InMemoryLimiter:
    """Shared plumbing for the in-memory limiters (thread-safe)."""

    _CLEANUP_INTERVAL_SECONDS = 60.0

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: Dict[str, _AttemptState] = {}
        self._next_cleanup = time.monotonic() + self._CLEANUP_INTERVAL_SECONDS

    def _maybe_cleanup(self, now: float) -> None:
        """Drop stale entries so the store cannot grow without bound."""
        if now < self._next_cleanup:
            return
        self._next_cleanup = now + self._CLEANUP_INTERVAL_SECONDS
        for key in [
            key for key, state in self._entries.items() if self._is_stale(state, now)
        ]:
            del self._entries[key]

    def _is_stale(self, state: _AttemptState, now: float) -> bool:
        raise NotImplementedError


class LoginRateLimiter(_InMemoryLimiter):
    """Tracks consecutive failed login attempts per key (IP + account)."""

    def __init__(self, config: RateLimitConfig) -> None:
        super().__init__()
        self._config = config

    def remaining_block(self, key: str) -> float:
        """Seconds left in an active block for ``key``, or ``0.0`` if free."""
        now = time.monotonic()
        with self._lock:
            self._maybe_cleanup(now)
            state = self._entries.get(key)
            if state is None:
                return 0.0
            self._forget_old_failures(state, now)
            return max(0.0, state.blocked_until - now)

    def record_failure(self, key: str) -> float:
        """Register a failed attempt.

        Returns the seconds ``key`` is blocked for after this failure
        (``0.0`` when the failure does not trigger a block).
        """
        now = time.monotonic()
        with self._lock:
            self._maybe_cleanup(now)
            state = self._entries.setdefault(key, _AttemptState())
            self._forget_old_failures(state, now)
            state.failures.append(now)
            if len(state.failures) >= self._config.max_failed_attempts:
                state.blocked_until = now + self._config.block_duration_seconds
                state.failures.clear()
                return self._config.block_duration_seconds
            return 0.0

    def record_success(self, key: str) -> None:
        """Clear the failed-attempt counter after a successful login."""
        with self._lock:
            self._entries.pop(key, None)

    def _forget_old_failures(self, state: _AttemptState, now: float) -> None:
        window = self._config.failure_window_seconds
        while state.failures and now - state.failures[0] > window:
            state.failures.popleft()

    def _is_stale(self, state: _AttemptState, now: float) -> bool:
        window = self._config.failure_window_seconds
        no_recent_failures = not state.failures or now - state.failures[-1] > window
        return state.blocked_until <= now and no_recent_failures



class IPRateLimiter(_InMemoryLimiter):
    """Sliding-window request cap per client IP for login requests."""

    def __init__(self, config: RateLimitConfig) -> None:
        super().__init__()
        self._config = config

    def hit(self, key: str) -> float:
        """Register one request from ``key``.

        Returns ``0.0`` when the request is allowed, otherwise the number
        of seconds the client must wait before retrying.
        """
        now = time.monotonic()
        window = self._config.ip_window_seconds
        with self._lock:
            self._maybe_cleanup(now)
            state = self._entries.setdefault(key, _AttemptState())
            while state.failures and now - state.failures[0] > window:
                state.failures.popleft()
            if len(state.failures) >= self._config.ip_max_requests:
                # Retry once the oldest request in the window expires.
                return max(0.5, window - (now - state.failures[0]))
            state.failures.append(now)
            return 0.0

    def _is_stale(self, state: _AttemptState, now: float) -> bool:
        window = self._config.ip_window_seconds
        return not state.failures or now - state.failures[-1] > window


def get_client_ip(request: Request) -> str:
    """Best-effort client IP for the current deployment.

    The backend is normally reached directly (uvicorn), so the socket
    address is used. When a reverse proxy is placed in front of the API it
    should set ``X-Forwarded-For`` (or ``X-Real-IP``); those headers are
    honoured here so the limiter keeps working behind such a setup.
    """
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        first_hop = forwarded_for.split(",")[0].strip()
        if first_hop:
            return first_hop
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()
    if request.client is not None and request.client.host:
        return request.client.host
    return "unknown"


# Shared single instances so all login traffic is tracked in one place.
_rate_limit_config = RateLimitConfig()
login_attempt_limiter = LoginRateLimiter(_rate_limit_config)
login_ip_limiter = IPRateLimiter(_rate_limit_config)
