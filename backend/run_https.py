"""Start the FastAPI backend over HTTPS for local development.

Usage (BACKEND TERMINAL, inside the ``backend`` folder with .venv active)::

    python run_https.py

Equivalent to::

    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 ^
        --ssl-certfile ..\\certs\\localhost.pem --ssl-keyfile ..\\certs\\localhost-key.pem

The certificate is created per computer with mkcert (see ../HTTPS_SETUP.md)
and is shared with the Vite dev server, so the browser trusts both
https://localhost:5173 and https://localhost:8000. Settings come from
backend/.env (all optional):

    DEV_SSL_CERTFILE  certificate path   (default ../certs/localhost.pem)
    DEV_SSL_KEYFILE   private key path   (default ../certs/localhost-key.pem)
    API_HOST          interface to bind  (default 0.0.0.0 = this PC + phones on Wi-Fi)
    API_PORT          port               (default 8000)

Production does not use this file: there a reverse proxy (Nginx/Caddy) holds
the real certificate and forwards plain HTTP to uvicorn on 127.0.0.1.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn
from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent

# Read .env without copying it into os.environ: the uvicorn worker (and every
# --reload restart) then loads the current .env itself, so changed database
# credentials take effect on the next reload instead of being frozen here.
ENV = dotenv_values(BACKEND_DIR / ".env")


def _setting(name: str, default: str = "") -> str:
    """Process environment first, then backend/.env, then the default."""
    value = os.environ.get(name)
    if value is None:
        value = ENV.get(name)
    return (value if value is not None else default).strip()


def _path_setting(name: str, default: Path) -> Path:
    value = _setting(name)
    if not value:
        return default
    path = Path(value)
    # Relative paths are relative to the backend folder, like the default.
    return path if path.is_absolute() else (BACKEND_DIR / path).resolve()


def main() -> int:
    certfile = _path_setting("DEV_SSL_CERTFILE", PROJECT_DIR / "certs" / "localhost.pem")
    keyfile = _path_setting("DEV_SSL_KEYFILE", PROJECT_DIR / "certs" / "localhost-key.pem")
    host = _setting("API_HOST", "0.0.0.0") or "0.0.0.0"
    port = int(_setting("API_PORT", "8000") or "8000")

    missing = [str(p) for p in (certfile, keyfile) if not p.is_file()]
    if missing:
        print("HTTPS certificate not found:", *missing, sep="\n  ", file=sys.stderr)
        print(
            "\nGenerate it with mkcert from the barangay_portal_system folder:\n"
            "  mkcert -install\n"
            "  mkcert -cert-file certs\\localhost.pem -key-file certs\\localhost-key.pem "
            "localhost 127.0.0.1 ::1 <your-Wi-Fi-IP>\n"
            "See HTTPS_SETUP.md for details.",
            file=sys.stderr,
        )
        return 1

    print(f"Barangay Portal API: https://localhost:{port}  (docs: https://localhost:{port}/docs)")
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=True,
        # Only watch the application code, not uploads/ or ml_training/.
        reload_dirs=[str(BACKEND_DIR / "app")],
        ssl_certfile=str(certfile),
        ssl_keyfile=str(keyfile),
    )
    return 0


if __name__ == "__main__":
    # uvicorn's reloader imports "app.main" relative to the working directory.
    os.chdir(BACKEND_DIR)
    sys.exit(main())
