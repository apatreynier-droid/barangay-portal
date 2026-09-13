from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@dataclass(frozen=True)
class Settings:
    mysql_host: str = os.getenv("MYSQL_HOST", "127.0.0.1")
    mysql_port: int = int(os.getenv("MYSQL_PORT", "3306"))
    mysql_user: str = os.getenv("MYSQL_USER", "barangay_app")
    mysql_password: str = os.getenv("MYSQL_PASSWORD", "jh#4Hp$f")
    mysql_database: str = os.getenv("MYSQL_DATABASE", "barangay_portal")
    access_token_days: int = int(os.getenv("ACCESS_TOKEN_DAYS", "7"))
    # -- Login rate limiting (in-memory, see app/rate_limit.py) ------------
    # Max CONSECUTIVE failed login attempts before login is blocked.
    login_max_failed_attempts: int = int(os.getenv("LOGIN_MAX_FAILED_ATTEMPTS", "5"))
    # Failed attempts older than this are forgotten (sliding window).
    login_failure_window_seconds: int = int(
        os.getenv("LOGIN_FAILURE_WINDOW_SECONDS", "300")
    )
    # How long login stays blocked after too many consecutive failures.
    login_block_duration_seconds: int = int(
        os.getenv("LOGIN_BLOCK_DURATION_SECONDS", "900")
    )
    # Per-IP flood protection: max login requests per sliding window.
    login_ip_max_requests: int = int(os.getenv("LOGIN_IP_MAX_REQUESTS", "10"))
    login_ip_window_seconds: int = int(os.getenv("LOGIN_IP_WINDOW_SECONDS", "60"))
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    )

    @property
    def database_url(self) -> str:
        # Safely converts special characters like '#' and '$' into URL-encoded format
        encoded_password = quote_plus(self.mysql_password)
        return (
            f"mysql+mysqlconnector://{self.mysql_user}:{encoded_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
        )


settings = Settings()