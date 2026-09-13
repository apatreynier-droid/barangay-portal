"""Sanity checks for the in-memory login rate limiter.

Run from the backend directory:

    .\\.venv\\Scripts\\python.exe scripts\\test_rate_limit.py

The script exercises the limiter classes directly (with tiny windows so it
finishes fast) and the real ``login`` endpoint function for the HTTP 429
paths. No database is required because blocked requests are rejected before
any database access happens.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from fastapi import HTTPException  # noqa: E402
from starlette.requests import Request as StarletteRequest  # noqa: E402

from app.main import login  # noqa: E402
from app.rate_limit import (  # noqa: E402
    IPRateLimiter,
    LoginRateLimiter,
    RateLimitConfig,
    get_client_ip,
    login_attempt_limiter,
    login_ip_limiter,
)
from app.schemas import LoginInput  # noqa: E402


def check(name: str, condition: bool) -> None:
    if not condition:
        raise AssertionError(f"FAILED: {name}")
    print(f"  ok - {name}")


def fake_request(
    host: str | None = None, headers: dict[str, str] | None = None
) -> StarletteRequest:
    raw_headers = [
        (key.lower().encode(), value.encode()) for key, value in (headers or {}).items()
    ]
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": raw_headers,
        "client": (host, 50000) if host else None,
        "query_string": b"",
    }
    return StarletteRequest(scope)


def call_expecting_http_exception(status_code: int, func) -> HTTPException:
    """Run ``func()`` and return the HTTPException it must raise."""
    try:
        func()
    except HTTPException as error:
        assert error.status_code == status_code, (
            f"expected HTTP {status_code}, got {error.status_code}: {error.detail}"
        )
        return error
    raise AssertionError(f"expected HTTPException {status_code}, none raised")


def test_client_ip_extraction() -> None:
    print("client IP extraction")
    check(
        "X-Forwarded-For uses the leftmost hop",
        get_client_ip(
            fake_request("10.0.0.1", {"X-Forwarded-For": "203.0.113.9, 10.0.0.1"})
        )
        == "203.0.113.9",
    )
    check(
        "X-Real-IP is honoured",
        get_client_ip(fake_request("10.0.0.1", {"X-Real-IP": "198.51.100.7"}))
        == "198.51.100.7",
    )
    check(
        "falls back to the socket address",
        get_client_ip(fake_request("127.0.0.1")) == "127.0.0.1",
    )
    check(
        "returns 'unknown' without a client",
        get_client_ip(fake_request()) == "unknown",
    )


def test_consecutive_failure_lockout() -> None:
    print("consecutive failure lockout")
    limiter = LoginRateLimiter(
        RateLimitConfig(
            max_failed_attempts=3,
            failure_window_seconds=60,
            block_duration_seconds=30,
        )
    )
    key = "1.2.3.4|user@example.com"
    check(
        "first failures do not block",
        all(limiter.record_failure(key) == 0.0 for _ in range(2)),
    )
    check("reaching the max blocks", limiter.record_failure(key) == 30.0)
    check("blocked key reports time left", limiter.remaining_block(key) > 0)
    limiter.record_success(key)
    check("success clears the counter", limiter.remaining_block(key) == 0.0)


def test_failure_window_expiry() -> None:
    print("failure sliding window")
    limiter = LoginRateLimiter(
        RateLimitConfig(
            max_failed_attempts=2,
            failure_window_seconds=0.15,
            block_duration_seconds=5,
        )
    )
    key = "5.6.7.8|slow@example.com"
    check("failure 1 does not block", limiter.record_failure(key) == 0.0)
    time.sleep(0.3)
    check(
        "failures older than the window are forgotten",
        limiter.record_failure(key) == 0.0,
    )
    time.sleep(0.3)
    check(
        "no block without consecutive failures",
        limiter.remaining_block(key) == 0.0,
    )


def test_ip_limit() -> None:
    print("per-IP request cap")
    limiter = IPRateLimiter(
        RateLimitConfig(ip_max_requests=3, ip_window_seconds=0.3)
    )
    check(
        "requests 1-3 allowed",
        all(limiter.hit("9.9.9.9") == 0.0 for _ in range(3)),
    )
    check("request 4 is rejected", limiter.hit("9.9.9.9") > 0)
    check("other IPs are unaffected", limiter.hit("8.8.8.8") == 0.0)
    time.sleep(0.35)
    check("window frees up again", limiter.hit("9.9.9.9") == 0.0)


def test_endpoint_blocked_paths() -> None:
    print("login endpoint HTTP 429 paths")
    # 1) Block triggered by consecutive failed attempts (default config: 5).
    email = "blocked.user@example.com"
    ip = "203.0.113.77"
    key = f"{ip}|{email}"
    for _ in range(5):
        login_attempt_limiter.record_failure(key)
    error = call_expecting_http_exception(
        429,
        lambda: login(
            LoginInput(email=email, password="whatever"),
            fake_request(ip),
            connection=None,
        ),
    )
    check("5 consecutive failures => HTTP 429", error.status_code == 429)
    check("Retry-After header present", "Retry-After" in (error.headers or {}))
    check(
        "message mentions the temporary block",
        "temporarily blocked" in str(error.detail),
    )

    # 2) Per-IP flood protection (default config: 10 requests / 60 s).
    flood_ip = "203.0.113.88"
    for _ in range(10):
        login_ip_limiter.hit(flood_ip)
    error = call_expecting_http_exception(
        429,
        lambda: login(
            LoginInput(email="anyone@example.com", password="whatever"),
            fake_request(flood_ip),
            connection=None,
        ),
    )
    check("11th request from one IP => HTTP 429", error.status_code == 429)


def main() -> None:
    try:
        test_client_ip_extraction()
        test_consecutive_failure_lockout()
        test_failure_window_expiry()
        test_ip_limit()
        test_endpoint_blocked_paths()
    finally:
        # Leave the shared singletons clean for the running application.
        login_attempt_limiter._entries.clear()
        login_ip_limiter._entries.clear()
    print("\nAll rate limiter checks passed.")


if __name__ == "__main__":
    main()

