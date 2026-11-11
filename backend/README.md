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
The Admin "Activity Logs" page needs the audit table from migration `006`. Apply
it once (idempotent - safe to run more than once):

```powershell
.\.venv\Scripts\python.exe scripts\apply_activity_logs_migration.py
```

Resident registration approval needs migration `010`. Apply it once (idempotent
- safe to run more than once, and existing accounts keep their status):

```powershell
.\.venv\Scripts\python.exe scripts\apply_registration_approval_migration.py
```

Document request image attachments need migration `011` (the
`request_attachments` table) and create the upload folder. Apply it once
(idempotent). Until it is applied, requests keep working without attachments:

```powershell
.\.venv\Scripts\python.exe scripts\apply_request_attachments_migration.py
```

Resident pothole reports (Resident "Pothole Detection" page and Admin
"Pothole Management" page) need migration `012`: the `pothole_reports` and
`pothole_report_updates` tables plus the `uploads/pothole_reports/` photo
folder. Only new tables are created; existing data is not touched. Apply it
once (idempotent), then run the end-to-end check with the backend running:

```powershell
.\.venv\Scripts\python.exe scripts\apply_pothole_reports_migration.py
.\.venv\Scripts\python.exe scripts\test_pothole_reports.py
```

AI pothole detection needs migration `013` (it adds columns and the
`pothole_detections` table; existing reports are kept) and the packages in
`requirements-ml.txt`. Without those packages or the model the API still runs,
and reports are saved with no count (`detection_status` = `not_run`).
How to train, measure, install and replace the model:
[ml_training/README.md](ml_training/README.md).

```powershell
.\.venv\Scripts\python.exe scripts\apply_pothole_detection_migration.py
.\.venv\Scripts\python.exe scripts\test_pothole_detection.py
```

The pickup time on "Ready for Pickup" requests (Admin Document Requests →
Admin Actions → Pickup Schedule) needs migration `014`: one nullable
`requests.pickup_time` column; existing pickup dates are kept. Apply it once
(idempotent), then run the end-to-end check with the backend running:

```powershell
.\.venv\Scripts\python.exe scripts\apply_request_pickup_time_migration.py
.\.venv\Scripts\python.exe scripts\test_pickup_schedule.py
```

AI counts are unverified and per photo. Only an administrator confirms unique
defects (`verified_defect_count`) and marks another photo of the same defect as a
duplicate (`duplicate_of_report_id`), which keeps the two totals separate.

Device GPS only works on a secure page: mobile browsers block the Geolocation
API on plain `http://` addresses (only `localhost` is exempt). Development
already serves both over HTTPS (`../HTTPS_SETUP.md`); keep HTTPS in production;
otherwise residents can still
send reports, pinning the location on the map by hand (stored as a manual pin,
never as GPS).


## 4. Optional: initialize the database through Python

Run this only when the configured MySQL user has permission to create databases
and tables. Otherwise, use the administrator import command in step 1.

```powershell
$env:PYTHONPATH = "."
python scripts\initialize_database.py
```

## 5. Run the API (HTTPS)

The API runs over **HTTPS** with a locally trusted mkcert certificate that it
shares with the Vite dev server. One-time certificate setup:
[`../HTTPS_SETUP.md`](../HTTPS_SETUP.md).

```powershell
python run_https.py
```

That is the same as:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --ssl-certfile ..\certs\localhost.pem --ssl-keyfile ..\certs\localhost-key.pem
```

`--host 0.0.0.0` lets phones and other computers on the same network reach the
API (without it, uvicorn only listens on `127.0.0.1`). Open
`https://localhost:8000/docs` (or `https://<this-computer's-IP>:8000/docs`) for
the generated API documentation. Port `5173` is the React app, so
`:5173/docs` shows the portal, not the API docs. Plain `http://` is not served.

**Using the portal from a phone.** Start the frontend with `npm run dev` (Vite
listens on the network, see `vite.config.ts`) and open
`https://<this-computer's-IP>:5173` on the phone. The phone must trust the
mkcert root CA and the IP must be inside the certificate; see
[`../HTTPS_SETUP.md`](../HTTPS_SETUP.md) section 6. The frontend calls the API on
the same protocol and host at port 8000 automatically
(`src/Utils/Shared/api.ts`; override with `VITE_API_BASE_URL`). Add that origin
to `CORS_ORIGINS` in `backend/.env`, for example:

```
CORS_ORIGINS=https://localhost:5173,https://127.0.0.1:5173,https://192.168.1.25:5173
```

If the computer's IP address changes, update that line (and regenerate the
certificate) and restart the API. `CORS_ORIGIN_REGEX` accepts any
private-network address on port 5173 over `https://` (see `.env.example`).
Leave it unset in production.

If the phone still cannot connect, allow the ports through Windows Firewall on
**Private** networks only (run as Administrator), and only on a Wi-Fi network
you trust:

```powershell
New-NetFirewallRule -DisplayName "Barangay dev HTTPS (5173, 8000)" -Direction Inbound -Protocol TCP -LocalPort 5173,8000 -Action Allow -Profile Private
```

Some public/school Wi-Fi networks block devices from reaching each other; on
those, connect the computer and phone through the phone's hotspot instead.

## API routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password` (emails a single-use reset link)
- `POST /api/auth/reset-password` (sets a new password from the reset token)
- `GET /api/document-types`
- `GET`, `POST /api/requests`
- `POST /api/requests/with-attachment` (multipart: request + required image)
- `GET /api/requests/{request_id}/attachment` (the resident's own image only)
- `GET /api/admin/document-requests/{request_id}/attachment` (Staff/administrators)
- `GET /api/dashboard-summary`
- `GET /api/notifications`
- `PATCH /api/notifications/{notification_id}/read`
- `POST /api/notifications/read-all`
- `GET /api/admin/dashboard` (Staff/administrators; analytics below)
- `GET /api/admin/reports?date_from=&date_to=&granularity=` (administrators only)

## Dashboard and Reports analytics (Pandas)

`app/analytics.py` is the analytics service behind `GET /api/admin/dashboard`
and `GET /api/admin/reports`. The route handlers in `app/main.py` only
validate input and call `build_dashboard_analytics()` /
`build_reports_analytics()`. Every figure comes from the live MySQL records
through the request's normal `get_db` connection.

- **SQL** filters by date and does the plain counts (`GROUP BY status`,
  `purok`, …), so only the selected period's rows are loaded.
- **Pandas** does the reshaping: Manila-time bucketing (daily, Monday–Sunday
  weekly, monthly, yearly), filling empty periods and Puroks with 0,
  percentages, previous-period comparison, Purok comparison and
  processing-time statistics (mean/median/90th percentile, per stage from
  `request_status_history`).
- NumPy is installed as a Pandas dependency. It is not used directly.

Reports query parameters (all optional):

| Parameter | Meaning |
|---|---|
| `date_from` | First Philippine calendar day `YYYY-MM-DD`. Omit for all time. |
| `date_to` | Last Philippine calendar day. Defaults to today (Manila). |
| `granularity` | `daily`, `weekly`, `monthly` (default) or `yearly`. |

Invalid dates, `date_from` after `date_to`, or a range with too many periods
for the interval (e.g. more than 400 days at `daily`) return HTTP 422 with an
explanation.

Definitions used by the numbers:

- *Registered residents* = resident accounts that an administrator approved
  (`active` + `inactive`/`suspended`, i.e. *deactivated*). Pending and rejected
  sign-ups are counted separately.
- Report request figures cover the requests **submitted** in the range, with
  their current status. *Completed/rejected in period* and processing times
  cover the requests **completed** (or rejected) in the range, using
  `completed_at` and the status-history timestamps. `last_updated` is never
  treated as an event date.
- Requests per Purok use the requesting resident's Purok. Records without a
  Purok are shown as "Not specified" instead of being dropped.
- Pothole analytics are statistics of submitted reports only; they do not use
  the AI detection counts. *Resolution rate* = resolved ÷ (resolved + unresolved).
  Rejected reports count as neither.

To add a metric, write a function in `app/analytics.py` that takes DataFrames
(or a query helper's result) and returns plain dicts. Add its field to the
response model in `app/schemas.py`, then add a check to
`scripts/test_analytics.py`. That script verifies the analytics against plain
SQL, temporary pothole rows (rolled back) and the role rules. It starts its own
API process on port 8013:

```powershell
python scripts\test_analytics.py
```

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

## Resident registration approval

A new resident is saved as `pending` and gets no session. An administrator
reviews the registration on the Admin Approvals page.

| Stored status | Shown as | Resident Portal access |
|---|---|---|
| `pending` | Pending | No |
| `active` | Active | Yes |
| `rejected` | Rejected | No |
| `inactive`, `suspended` | Deactivated | No |

- `POST /api/auth/register` saves the account and queues the confirmation email.
  A rejected resident can register again with the same email. This reuses the
  account and resident code, replaces the password and profile, and returns it
  to `pending`. The previous decision stays visible to the reviewer until the
  new decision replaces it. Any other existing email answers HTTP 409.
- `POST /api/auth/login` answers HTTP 403 with a status message when the password
  is correct but the account is not active, and creates no session.
- `GET /api/admin/registrations`, `POST .../{id}/approve`, `POST .../{id}/reject`
  (requires `reason`) and `POST .../{id}/email/retry` are limited to the `admin`
  and `super_admin` roles. Staff accounts get HTTP 403.

Each decision and its email are committed together to the `registration_emails`
outbox, then sent. A mail failure never reverses the decision. Failed emails are
retried automatically with increasing delays, and an administrator can retry
one from the Approvals page. Each email can only be delivered once per event.

| Variable | Purpose | Default |
|---|---|---|
| `REGISTRATION_IP_MAX_REQUESTS` | registrations per client IP per window | 20 |
| `REGISTRATION_IP_WINDOW_SECONDS` | length of that window | 3600 |
| `REGISTRATION_EMAIL_WORKER_INTERVAL_SECONDS` | seconds between retry passes, 0 disables | 60 |
| `REGISTRATION_EMAIL_MAX_ATTEMPTS` | automatic attempts per email | 6 |

`scripts/test_registration_approval.py` tests the whole flow against the local
database with a fake SMTP server, so it never sends real mail.

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
| `SMTP_FROM_EMAIL`         | From address (falls back to `SMTP_FROM`, then `SMTP_USERNAME`) | (empty) |
| `SMTP_USE_TLS`            | STARTTLS for ports other than 465           | true |
| `SMTP_FROM_NAME`          | display name on outgoing mail               | Barangay Lagab Document Portal |
| `SMTP_TIMEOUT_SECONDS`    | give up on an unreachable server after N s  | 15 |
| `FRONTEND_URL`            | base URL used to build the reset link       | https://localhost:5173 |
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

### Email design, previews and template tests

All emails (registration received/approved/rejected, document request
received/approved/processing/ready for pickup/completed/rejected, password
reset) share one branded layout in `app/email_templates.py`: navy header with
the Barangay seal, a white content card, color-coded status (green approved/
completed, amber pending/processing, red rejected, blue received/info) and a
Barangay Administration footer. It is built from tables with inline CSS for
Gmail, adapts to phones, and every email has a plain-text part. Dates are shown
in Philippine time (PHT). Residents' names, request IDs, documents, reasons,
pickup dates and event times come from the database.

```powershell
# Render every email with SAMPLE data (nothing is sent) and open the gallery:
python scripts\\preview_emails.py            # -> backend\email_previews\index.html
# Offline checks: content, colors, links, escaping, PHT dates, Gmail-safe HTML:
python scripts\\test_email_templates.py
```

**Lucide icons in emails.** Gmail strips inline `<svg>` and blocks `data:`
images, so Lucide icons (currently used by the "Request Completed" email:
`CircleCheck`, `FileCheck`, `CalendarDays`, `Building2`) are stored as small
PNGs in `app/email_assets/`, drawn from the original Lucide SVGs. They are
attached to the message as inline `cid:` images (`app/email_assets.py`), so they
show in Gmail without loading anything from the internet. Emails without icons
are sent exactly as before. To change or add icons (needs Microsoft Edge):
`python scripts\\generate_email_icons.py`.

The "request received" design exists but is not sent: emails are only
triggered for the statuses in `NOTIFIABLE_STATUSES`
(`app/request_notifications.py`).

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
2. Start the API (`python run_https.py`) and the frontend
   (`npm run dev` in `barangay_portal_system`).
3. Open `https://localhost:5173/forgot-password`, submit a registered address and
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

## Activity logs (admin audit trail)

Every notable action in the portal is written once to the append-only
`activity_logs` table and shown on the Admin **Activity Logs** page
(`/AdminLogs`). Nothing in the application edits or deletes those rows.

* **Recorded actions:** logins, document-request submissions, request approvals
  and rejections, other request status changes, resident information updates,
  and resident account deactivations/reactivations.
* **Fields:** timestamp, action type (`Approve`, `Reject`, `Status`, `Update`,
  `Create`, `Login`), actor name + role, a short action description, the target
  the action applied to (`Request`/`Resident`/`System`), and the client IP.
* **Endpoint:** `GET /api/admin/activity-logs` (administrator only) returns the
  newest entries first and accepts optional `search` and `action_type` filters.
  The page also filters client-side, so typing in the toolbar is instant.
* **Implementation:** `app/activity_logs.py` (`record_activity_log` resolves the
  actor from `user_id` and is deliberately best-effort - a logging failure is
  logged and swallowed so it can never break the action that produced it),
  `app/main.py` (the call sites and the endpoint), `app/schemas.py`
  (`AdminActivityLogResponse`), `src/Pages/AdminLogs/` (page, toolbar, table).
* **Verify:** start the API (`python run_https.py`) and run
  `.\.venv\Scripts\python.exe scripts\test_activity_logs_api.py`. It signs in,
  checks the response shape, ordering, both server-side filters and the 401/403
  paths, then submits and processes a document request to prove every call site
  writes its own entry. Disposable accounts, requests, and the audit rows the
  run created are removed again afterwards.

## Document request attachments

Residents attach one image (JPG, PNG or WebP, up to 5 MB) when they submit a
document request; administrators and Staff see it under **Resident Attachment**
in the request details, can open a larger preview and download the original.

- **Storage:** the file is saved in `backend/uploads/request_attachments/`
  (override with `UPLOAD_DIR`) under a random `<uuid>.<ext>` name. The
  `request_attachments` table (migration `011`) stores the original filename,
  type, size, uploader and upload time, linked to `requests.id` (one image per
  request). Files are kept on disk rather than as MySQL BLOBs so the database
  and its backups stay small. **Back up the `uploads` folder together with the
  database.**
- **Atomic upload:** `POST /api/requests/with-attachment` creates the request
  and stores the image in one transaction; if either fails, nothing is kept.
  Deleting a pending request also deletes its image.
- **Validation:** the type is detected from the file contents (magic bytes),
  never from the filename or the browser's `Content-Type`; size is capped by
  `REQUEST_ATTACHMENT_MAX_BYTES` (default 5 MB). Anything else is rejected with
  HTTP 413/415/422.
- **Access:** the upload folder is never served statically. The admin endpoint
  requires a Staff/administrator session; the resident endpoint only returns the
  signed-in resident's own image (another resident's request answers 404).
  Responses carry `nosniff`, a sandboxing CSP and `Cache-Control: private,
  no-store`.
- **Tests:** with the API running, run
  `.\.venv\Scripts\python.exe scripts\test_request_attachments.py`. It covers
  upload, storage, the database link, admin preview/download, access control,
  requests without images, invalid uploads, persistence in a freshly started
  backend process and deletion, then removes everything it created.
