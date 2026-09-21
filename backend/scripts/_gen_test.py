"""Generate the request status email test file."""

from __future__ import annotations

from pathlib import Path

TEST_FILE = Path(__file__).resolve().parents[1] / "scripts" / "test_request_status_email.py"

HEADER = '''"""End-to-end checks for the automatic document-request status email feature.

What this verifies
-----------------
* Each status-change email is sent to the registered address of the resident
  who owns *that specific request* - never to a hardcoded address and never to
  every resident.
* The approved / processing / ready-for-pickup / completed / rejected paths each
  produce the expected delivery outcome.
* A duplicate status update does not send a second email.
* A failed send leaves the request status committed and records the failure in
  request_status_emails.

How to run
----------
From the repository root:

    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python scripts\\test_request_status_email.py

SMTP is expected to be configured in backend/.env. The test still passes
when SMTP is misconfigured - it then asserts that the failure was logged
correctly instead of checking that an inbox received a message.
"""

from __future__ import annotations

import logging
import os
import sys
import uuid
from typing import Any

import mysql.connector

from app.database import create_connection
from app.request_notifications import (
    DELIVERY_FAILED,
    DELIVERY_SENT,
    DELIVERY_SKIPPED,
    DELIVERY_DUPLICATE,
    NOTIFIABLE_STATUSES,
    load_request_owner,
    send_request_status_email,
)
from app.security import hash_password

logger = logging.getLogger(__name__)

TEST_EMAIL_DOMAIN = "test-" + uuid.uuid4().hex[:8] + ".example"


'''

TEST_FILE.write_text(HEADER, encoding="utf-8")
print(f"Wrote header: {len(HEADER)} chars")