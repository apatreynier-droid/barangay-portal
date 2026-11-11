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
    mysql_password: str = os.getenv("MYSQL_PASSWORD", "***REMOVED***")
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
    frontend_url: str = os.getenv("FRONTEND_URL", "https://localhost:5173").rstrip(
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
    # SMTP_FROM_EMAIL is the preferred name; SMTP_FROM keeps older .env files working.
    smtp_from: str = (
        os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_FROM") or ""
    ).strip()
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
    # -- Resident registration (see app/registration_emails.py) --------------
    # Every registration sends an email, so cap them per client IP.
    registration_ip_max_requests: int = int(
        os.getenv("REGISTRATION_IP_MAX_REQUESTS", "20")
    )
    registration_ip_window_seconds: int = int(
        os.getenv("REGISTRATION_IP_WINDOW_SECONDS", "3600")
    )
    # How often failed registration emails are retried (0 disables the worker).
    registration_email_worker_interval_seconds: int = int(
        os.getenv("REGISTRATION_EMAIL_WORKER_INTERVAL_SECONDS", "60")
    )
    # Automatic attempts per email; an administrator can still retry afterwards.
    registration_email_max_attempts: int = int(
        os.getenv("REGISTRATION_EMAIL_MAX_ATTEMPTS", "6")
    )
    # -- Document request attachments (see app/attachments.py) -------------
    # Persistent folder for uploaded resident images. Never served statically:
    # files are streamed only through the authenticated attachment endpoints.
    upload_dir: Path = Path(
        os.getenv("UPLOAD_DIR", str(Path(__file__).resolve().parents[1] / "uploads"))
    ).resolve()
    # Matches MAX_IMAGE_MB on the Resident "Request a Document" page.
    request_attachment_max_bytes: int = int(
        os.getenv("REQUEST_ATTACHMENT_MAX_BYTES", str(5 * 1024 * 1024))
    )
    # -- Pothole report photos (see app/potholes.py) ------------------------
    # Stored under ``upload_dir / pothole_reports``. Matches MAX_IMAGE_MB on the
    # Resident Pothole Detection page (phone camera photos are often 4-8 MB).
    pothole_photo_max_bytes: int = int(
        os.getenv("POTHOLE_PHOTO_MAX_BYTES", str(10 * 1024 * 1024))
    )
    # -- Pothole detection (see app/ml/detector.py) -------------------------
    # Private weights file; never placed anywhere the frontend can reach.
    pothole_model_path: Path = Path(
        os.getenv(
            "POTHOLE_MODEL_PATH",
            str(Path(__file__).resolve().parent / "ml" / "weights" / "best.pt"),
        )
    ).resolve()
    # Empty: use the threshold tuned for this model (weights/model_info.json).
    pothole_confidence_threshold: float | None = (
        float(os.environ["POTHOLE_CONFIDENCE_THRESHOLD"])
        if os.getenv("POTHOLE_CONFIDENCE_THRESHOLD", "").strip()
        else None
    )
    # CPU threads for one inference, leaving the rest for the API and database.
    pothole_inference_threads: int = int(os.getenv("POTHOLE_INFERENCE_THREADS", "4"))
    # Reports one resident may file per hour (each one runs the model).
    pothole_report_max_per_hour: int = int(os.getenv("POTHOLE_REPORT_MAX_PER_HOUR", "30"))
    # GPS stored inside a photo can be old or from elsewhere, so it is used only
    # when it is this close to the barangay. Live device GPS is not limited.
    # The default center matches LAGAB_CENTER in src/Utils/Shared/mapConfig.ts.
    barangay_center_latitude: float = float(os.getenv("BARANGAY_CENTER_LATITUDE", "7.6691215"))
    barangay_center_longitude: float = float(os.getenv("BARANGAY_CENTER_LONGITUDE", "126.0648858"))
    photo_gps_max_distance_km: float = float(os.getenv("PHOTO_GPS_MAX_DISTANCE_KM", "25"))
    # Reports whose coordinates (device GPS, map pin or photo GPS) are farther
    # than this from the barangay center are flagged "Outside barangay" in the
    # Admin Portal. Only a warning for reviewers; such reports are still saved.
    # OpenStreetMap has no boundary for Lagab, so this is a radius around the
    # center; set it to roughly the distance to the farthest edge of the barangay.
    barangay_radius_km: float = float(os.getenv("BARANGAY_RADIUS_KM", "3"))
    # -- Reverse geocoding (see app/geolocation.py) -------------------------
    # Set REVERSE_GEOCODE_URL to an empty value to turn lookups off.
    reverse_geocode_url: str = os.getenv(
        "REVERSE_GEOCODE_URL", "https://nominatim.openstreetmap.org/reverse"
    ).strip()
    reverse_geocode_user_agent: str = os.getenv(
        "REVERSE_GEOCODE_USER_AGENT", "BarangayLagabPortal/1.0"
    )
    reverse_geocode_timeout_seconds: float = float(
        os.getenv("REVERSE_GEOCODE_TIMEOUT_SECONDS", "4")
    )
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "https://localhost:5173").split(",")
        if origin.strip()
    )
    # Optional regex matched against the whole Origin header, in addition to
    # CORS_ORIGINS. Useful in development so phones keep working when the
    # computer's LAN IP changes (see .env.example). Empty = off.
    cors_origin_regex: str | None = (
        os.getenv("CORS_ORIGIN_REGEX", "").strip() or None
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
        # URL-encode special characters (e.g. '#', '$') in the password.
        encoded_password = quote_plus(self.mysql_password)
        return (
            f"mysql+mysqlconnector://{self.mysql_user}:{encoded_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
        )


settings = Settings()