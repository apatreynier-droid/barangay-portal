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
- `GET /api/document-types`
- `GET`, `POST /api/requests`
- `GET /api/dashboard-summary`
- `GET /api/notifications`
- `PATCH /api/notifications/{notification_id}/read`
- `POST /api/notifications/read-all`
