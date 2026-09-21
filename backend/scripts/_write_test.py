from pathlib import Path

p = Path("scripts/test_request_status_email.py")

header = (
    '"""End-to-end checks for the automatic document-request status email feature.\n'
    '\n'
    'What this verifies\n'
    '-----------------\n'
    '* Each status-change email is sent to the registered address of the resident\n'
    '  who owns *that specific request* - never to a hardcoded address and never to\n'
    '  every resident.\n'
    '* The approved / processing / ready-for-pickup / completed / rejected paths each\n'
    '  produce the expected delivery outcome.\n'
    '* A duplicate status update does not send a second email.\n'
    '* A failed send leaves the request status committed and records the failure in\n'
    '  request_status_emails.\n'
    '\n'
    'How to run\n'
    '----------\n'
    'From the repository root:\n'
    '\n'
    '    cd backend\n'
    '    .\\.venv\\Scripts\\Activate.ps1\n'
    '    python scripts\\test_request_status_email.py\n'
    '\n'
    'SMTP is expected to be configured in backend/.env. The test still passes\n'
    'when SMTP is misconfigured - it then asserts that the failure was logged\n'
    'correctly instead of checking that an inbox received a message.\n'
    '"""'
)

p.write_text(header, encoding="utf-8")
print("wrote header", p.stat().st_size)
