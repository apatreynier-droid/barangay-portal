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
    # -- Password reset (token + email, see app/email_service.py) ----------
    # Public base URL of the React app; used to build links inside emails.
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip(
        "/"
    )
    # How long a password-reset link stays valid.
    password_reset_token_expiration_minutes: int = int(
        os.getenv("PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES", "15")
    )
    # Abuse protection for the forgot-password endpoint: reset emails
    # allowed per client IP within a sliding window.
    password_reset_ip_max_requests: int = int(
        os.getenv("PASSWORD_RESET_IP_MAX_REQUESTS", "5")
    )
    password_reset_ip_window_seconds: int = int(
        os.getenv("PASSWORD_RESET_IP_WINDOW_SECONDS", "900")
    )
    # Abuse protection per target email address (never spam one inbox).
    password_reset_email_max_requests: int = int(
        os.getenv("PASSWORD_RESET_EMAIL_MAX_REQUESTS", "3")
    )
    password_reset_email_window_seconds: int = int(
        os.getenv("PASSWORD_RESET_EMAIL_WINDOW_SECONDS", "900")
    )
    # Abuse protection for the reset-password (token) endpoint.
    password_reset_submit_max_requests: int = int(
        os.getenv("PASSWORD_RESET_SUBMIT_MAX_REQUESTS", "20")
    )
    password_reset_submit_window_seconds: int = int(
        os.getenv("PASSWORD_RESET_SUBMIT_WINDOW_SECONDS", "900")
    )
    # -- SMTP email delivery ------------------------------------------------
    # Credentials live in backend/.env only; never hardcode them here.
    smtp_host: str = os.getenv("SMTP_HOST", "").strip()
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str = os.getenv("SMTP_USERNAME", "").strip()
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from: str = os.getenv("SMTP_FROM", "").strip()
    # STARTTLS on submission ports (587/25). Port 465 always uses implicit SSL.
    smtp_use_tls: bool = os.getenv("SMTP_USE_TLS", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    # Display name shown in the "From" header of outgoing mail.
    smtp_from_name: str = os.getenv(
        "SMTP_FROM_NAME", "Barangay Lagab Document Portal"
    )
    # Keep SMTP calls short so requests cannot hang on a dead server.
    smtp_timeout_seconds: int = int(os.getenv("SMTP_TIMEOUT_SECONDS", "15"))
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    )

    @property
    def smtp_from_address(self) -> str:
        """Envelope/From address (``SMTP_FROM``, falling back to the username)."""
        return self.smtp_from or self.smtp_username

    @property
    def smtp_configured(self) -> bool:
        """True when every value needed to send mail is present."""
        return bool(
            self.smtp_host
            and self.smtp_username
            and self.smtp_password
            and self.smtp_from_address
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