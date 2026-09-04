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