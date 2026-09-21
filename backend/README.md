# Barangay Portal API

This FastAPI service connects the portal to MySQL using the existing schema at
`../react-app/src/db/barangay_portal.sql`. The schema contains no sample data.

## 1. Configure MySQL

Use a MySQL administrator account to import the schema. This creates the
`barangay_portal` database and all tables:

```powershell
mysql -u root -p < ..\react-app\src\db\barangay_portal.sql
```

Then create an application user with a strong password and grant it access:

```sql
CREATE USER 'barangay_app'@'localhost' IDENTIFIED BY 'replace-with-a-strong-password';
GRANT ALL PRIVILEGES ON barangay_portal.* TO 'barangay_app'@'localhost';
FLUSH PRIVILEGES;
```

Copy `.env.example` to `.env` and set the matching MySQL credentials.

## 2. Create the virtual environment and install packages

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## 3. Apply schema migrations

If you created the database from an older version of
`react-app/src/db/barangay_portal.sql`, apply the registration-fields migration
(idempotent — safe to run more than once):

```powershell
mysql -u root -p < scripts\migrations\001_add_registration_profile_fields.sql
```

Fresh installs that import the full schema (step 1 or 4) already include these
columns and do not need the migration.

The Forgot Password feature needs the reset-token table from migration
`004`. Apply it once (idempotent - safe to run more than once):

```powershell
mysql -u root -p < scripts\migrations\004_add_password_reset_tokens.sql
.\\.venv\Scripts\python.exe scripts\apply_password_reset_migration.py
```

The automatic request-status email notifications need the delivery-log table
from migration `005`. Apply it once (idempotent - safe to run more than once):

```powershell
\\.venv\Scripts\python.exe scripts\apply_request_status_email_migration.py
```


## 4. Optional: initialize the database through Python

Run this only when the configured MySQL user has permission to create databases
and tables. Otherwise, use the administrator import command in step 1.

```powershell
$env:PYTHONPATH = "."
python scripts\initialize_database.py
```

## 5. Run the API

```powershell
uvicorn app.main:app --reload --port 8000
```

Open `http://127.0.0.1:8000/docs` for the generated API documentation.

## API routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password` (emails a single-use reset link)
- `POST /api/auth/reset-password` (sets a new password from the reset token)
- `GET /api/document-types`
- `GET`, `POST /api/requests`
- `GET /api/dashboard-summary`
- `GET /api/notifications`
- `PATCH /api/notifications/{notification_id}/read`
- `POST /api/notifications/read-all`

## Login rate limiting

Login protection is implemented in-memory in `app/rate_limit.py` (no Redis or
external service needed) and wired into the `POST /api/auth/login` endpoint in
`app/main.py`. Two limiters are active:

1. **Consecutive failed attempts** (`LoginRateLimiter`, keyed by client IP +
   account email)
   - More than **5 failed attempts within 5 minutes** blocks login for that
     client/account for **15 minutes** (HTTP 429 with a `Retry-After` header).
   - Failures older than 5 minutes stop counting; a **successful login resets
     the counter** immediately.
2. **Per-IP request cap** (`IPRateLimiter`)
   - Maximum **10 login requests per IP per 60-second sliding window**;
     further requests get HTTP 429 until the window frees up.

### Changing the limits

All values live in one place: the `Settings` dataclass in `app/config.py`,
and each can be overridden with an environment variable in `backend/.env`
(see `.env.example`) — no code changes required:

| Setting                        | Env variable                    | Default |
| ------------------------------ | ------------------------------- | ------- |
| Max consecutive failed attempts| `LOGIN_MAX_FAILED_ATTEMPTS`     | 5       |
| Failure sliding window         | `LOGIN_FAILURE_WINDOW_SECONDS`  | 300 (5 min) |
| Temporary block duration       | `LOGIN_BLOCK_DURATION_SECONDS`  | 900 (15 min) |
| Max login requests per IP      | `LOGIN_IP_MAX_REQUESTS`         | 10      |
| IP window                      | `LOGIN_IP_WINDOW_SECONDS`       | 60      |

The tracked counters live in the backend process memory, so restarting the
server (e.g. after a deploy) clears all blocks and counters.

Password reset reuses the same limiter classes with separate budgets, so it
can neither bypass nor consume the login limits (see below).

## SMTP email delivery (Forgot Password)

All outgoing mail goes through one reusable service, `app/email_service.py`
(standard library `smtplib` - no extra dependency):

- `send_email(...)` - connect, STARTTLS/implicit TLS, authenticate, send a
  plain-text and/or HTML message.
- `send_password_reset_email(...)` - the Forgot Password message, rendered by
  `app/email_templates.py`.
- `verify_connection()` - connect + authenticate only (used by the test script).

### Where the credentials live

Only in `backend/.env`, which Git ignores (`backend/.gitignore`). Nothing is
hardcoded in Python/TypeScript, the password is never logged, and no SMTP
credential is ever sent to the frontend.

| Variable                  | Purpose                                     | Default |
| ------------------------- | ------------------------------------------- | ------- |
| `SMTP_HOST`               | mail server host                            | (empty = disabled) |
| `SMTP_PORT`               | submission port (587 STARTTLS / 465 SSL)    | 587 |
| `SMTP_USERNAME`           | SMTP account                                | (empty) |
| `SMTP_PASSWORD`           | SMTP password / app password                | (empty) |
| `SMTP_FROM`               | From address (falls back to `SMTP_USERNAME`)| (empty) |
| `SMTP_USE_TLS`            | STARTTLS for ports other than 465           | true |
| `SMTP_FROM_NAME`          | display name on outgoing mail               | Barangay Lagab Document Portal |
| `SMTP_TIMEOUT_SECONDS`    | give up on an unreachable server after N s  | 15 |
| `FRONTEND_URL`            | base URL used to build the reset link       | http://localhost:5173 |
| `PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES` | reset link lifetime          | 15 |

`SMTP_PASSWORD` and `SMTP_USERNAME` are read once by `app/config.py`; nothing
else in the code base needs to know them.

### Testing SMTP on its own

```powershell
cd backend
.\\.venv\\Scripts\\Activate.ps1
# 1) connection + authentication only (sends nothing)
python scripts\\test_smtp.py --check-only
# 2) send a real test message (defaults to SMTP_USERNAME)
python scripts\\test_smtp.py
python scripts\\test_smtp.py --to someone@example.com
```

## Password reset flow and token security

1. `POST /api/auth/forgot-password` with `{ "email": ... }` always answers with
   the same generic message (HTTP 202), whether or not the address exists, so
   the endpoint cannot be used to find out who is registered.
2. When the account exists and is active, the backend creates the token, stores
   **only its SHA-256 hash** plus the expiry in `password_reset_tokens`
   (requesting a new link invalidates older ones) and emails
   `FRONTEND_URL + /reset-password?token=...`.
3. `POST /api/auth/reset-password` with `{ "token": ..., "password": ... }`
   validates the token (unknown, already-used and expired are each rejected with
   a friendly message), saves the new password with the existing scrypt hashing,
   marks the token used, deletes any other outstanding token for that account
   and revokes the account's sessions.
4. The resident signs in again with the new password.

Token rules: generated with `secrets.token_urlsafe(48)`, hashed before storage
(`app/security.py`), single use, rejected once expired, never logged and never
returned by the API. The lifetime comes from
`PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES`.

### Password-reset rate limits

| Limit                            | Env variables                       | Default |
| -------------------------------- | ----------------------------------- | ------- |
| Reset emails per client IP       | `PASSWORD_RESET_IP_MAX_REQUESTS`, `PASSWORD_RESET_IP_WINDOW_SECONDS` | 5 / 900 s |
| Reset emails per address         | `PASSWORD_RESET_EMAIL_MAX_REQUESTS`, `PASSWORD_RESET_EMAIL_WINDOW_SECONDS` | 3 / 900 s |
| Reset submissions per client IP  | `PASSWORD_RESET_SUBMIT_MAX_REQUESTS`, `PASSWORD_RESET_SUBMIT_WINDOW_SECONDS` | 20 / 900 s |

Exceeding a limit answers HTTP 429 with a `Retry-After` header, exactly like the
login limiter.

## Testing the complete Forgot Password flow

1. `python scripts\\test_smtp.py --check-only` - SMTP reachable and login works.
2. Start the API (`uvicorn app.main:app --reload --port 8000`) and the frontend
   (`npm run dev` in `barangay_portal_system`).
3. Open `http://localhost:5173/forgot-password`, submit a registered address and
   confirm the email arrives.
4. Open the reset link - it must land on `/reset-password?token=...`, also when
   nobody is signed in.
5. Choose a new password and sign in with it. Opening the same link again must
   be refused ("already been used").
6. Login protection is unchanged: 5 failed logins within 5 minutes temporarily
   block that client/account for 15 minutes. `python scripts\\test_rate_limit.py`
   checks the limiter itself and the HTTP 429 paths.

## Request status email notifications

When an administrator changes a document request's status, the resident who
owns that request automatically receives an email at their registered address.
No address is hardcoded: the recipient is resolved per request through the
existing `requests.user_id -> users.id` relationship.

* **Statuses that trigger an email:** Approved, Processing, Ready for Pickup
  (subject: *"Your Barangay Document is Ready for Pickup"*), Completed, Rejected.
  `Pending` (the initial status) does not send one.
* **Trigger point:** the backend, inside
  `PATCH /api/admin/document-requests/{id}` (`app/main.py`), *after* the status
  change is committed. An SMTP failure therefore never rolls the status back -
  it is logged server-side and recorded in `request_status_emails`, and the
  resident is never shown SMTP credentials or technical error details.
* **No duplicate emails:** every `(request_id, status)` pair is claimed in
  `request_status_emails` (UNIQUE key) before sending, so a repeated status
  update cannot send a second message.
* **Implementation:** `app/request_notifications.py` (owner lookup, dedup,
  delivery), `app/email_service.py` (`send_document_status_email` on top of the
  existing SMTP service), `app/email_templates.py` (per-status content).
* **Verify with multiple residents:**
  `\\.venv\Scripts\python.exe scripts\test_request_status_email.py`
  creates several residents, moves their requests through every status, and
  asserts each email was routed to that resident's own address only - plus
  duplicate-suppression, failure-logging, and non-notifiable-status checks.
  Test data is cleaned up automatically; real SMTP messages go to the
  `@example.com`-style addresses used by the script.

