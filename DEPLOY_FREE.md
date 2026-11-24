# Free-tier deployment

Vercel (frontend) + Render (API) + TiDB Cloud (MySQL) + Cloudinary (uploads)
+ optional Brevo (email over HTTPS).

## 1. Database (TiDB Cloud)
Create a Serverless cluster, then "Connect" > general > note host, port (4000),
user and password. From your computer:

    cd backend
    MYSQL_HOST=... MYSQL_PORT=4000 MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_SSL=true \
      SCHEMA_FILE=scripts/tidb_schema.sql python scripts/initialize_database.py
    MYSQL_DATABASE=barangay_portal ... ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long-password' \
      python scripts/create_admin.py

## 2. API (Render)
New > Blueprint > pick this repo/branch (reads render.yaml). Fill the secrets:
MYSQL_HOST/USER/PASSWORD, CLOUDINARY_URL, FRONTEND_URL and CORS_ORIGINS (the
Vercel URL, no trailing slash). Optional: BREVO_API_KEY + SMTP_FROM_EMAIL.
Free instances sleep after ~15 min idle (first request is slow) and block SMTP.

## 3. Frontend (Vercel)
Import the repo. Set env var VITE_API_BASE_URL to the Render URL
(https://<name>.onrender.com). Deploy.

Pothole AI detection is off online (torch is too large for the free tier);
reports are still saved with detection "not_run".

Performance: create the Render service in the same region as the TiDB cluster
(Singapore for ap-southeast-1). A region cannot be changed afterwards, so it must be
chosen when the service is created. Every request makes several database round trips,
so a far-away region (e.g. Oregon) makes pages slow.
