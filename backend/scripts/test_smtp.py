"""Independent SMTP check for the Barangay Portal backend.

Verifies - outside of the web app - that the SMTP settings in
``backend/.env`` can connect, authenticate and deliver a message. The
password is never printed; recipients are masked in the output.

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    # 1) connection + authentication only (sends nothing)
    python scripts\\test_smtp.py --check-only
    # 2) also send a real test email (defaults to SMTP_USERNAME)
    python scripts\\test_smtp.py
    # 3) send it somewhere else
    python scripts\\test_smtp.py --to resident@example.com
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings  # noqa: E402
from app.email_service import (  # noqa: E402
    EmailDeliveryError,
    is_email_configured,
    mask_email,
    send_email,
    verify_connection,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check the portal SMTP settings.")
    parser.add_argument(
        "--to",
        default=settings.smtp_username,
        help="test recipient (defaults to SMTP_USERNAME)",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="only connect and authenticate; do not send an email",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    print("SMTP settings from backend/.env:")
    print(f"  host      : {settings.smtp_host or '(missing)'}")
    print(f"  port      : {settings.smtp_port}")
    print(f"  username  : {'set' if settings.smtp_username else '(missing)'}")
    print(f"  password  : {'set' if settings.smtp_password else '(missing)'}")
    print(f"  from      : {settings.smtp_from_address or '(missing)'}")
    print(f"  use_tls   : {settings.smtp_use_tls}")
    print(f"  timeout   : {settings.smtp_timeout_seconds}s")

    if not is_email_configured():
        print("\nFAILED: SMTP is not fully configured in backend/.env.")
        return 1

    print("\n1) Connecting and authenticating...")
    try:
        verify_connection()
    except EmailDeliveryError as error:
        print(f"   FAILED: {error}")
        return 1
    print("   OK - the SMTP server accepted the connection and login.")

    if args.check_only:
        print("\nCheck-only mode: no email was sent.")
        return 0

    recipient = args.to.strip()
    if not recipient:
        print("\nFAILED: no recipient given (use --to someone@example.com).")
        return 1

    print(f"\n2) Sending a test email to {mask_email(recipient)}...")
    try:
        send_email(
            to_email=recipient,
            subject="Barangay Portal - SMTP test",
            text_body=(
                "This is a test message from the Barangay Portal backend.\n\n"
                "If you can read it, the SMTP settings in backend/.env work "
                "and the Forgot Password emails can be delivered.\n\n"
                "This is an automated message. Please do not reply."
            ),
        )
    except EmailDeliveryError as error:
        print(f"   FAILED: {error}")
        return 1

    print(f"   OK - the mail server accepted the message for {mask_email(recipient)}.")
    print("\nSMTP check finished successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
