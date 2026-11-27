# Barangay Lagab Document Portal

A web portal for Barangay Lagab. Residents request documents and report
potholes; barangay staff and administrators review and manage them.

* **Frontend:** React, TypeScript and Vite
* **Backend:** FastAPI (Python) with a MySQL database
* **Pothole detection:** a YOLO model that counts potholes in uploaded photos

## Folder structure

```
src/                  Frontend
  Pages/              One folder per screen (Admin, Resident, sign-in pages)
  components/         Parts used to build the screens
  Styles/             CSS, arranged like Pages and components
  Types/              TypeScript types
  Utils/              Page logic and shared helpers
    Shared/api/       Calls to the backend, one file per feature
  Routes/             Which URL shows which page

backend/
  app/                The API
    main.py           Creates the app and registers the routers
    routers/          API routes, one file per feature
    potholes/         Pothole reports: routes, detection and location checks
    ml/               Pothole detector and model weights
    schemas.py        Request and response shapes
  db/                 Database schema
  scripts/            Setup tools and database migrations
  tests/              Test scripts
  ml_training/        Model training and evaluation

certs/                Local HTTPS certificate (created on each computer)
scripts/              Frontend tools (certificate generator)
```

## Setup

1. **Database and backend:** follow [backend/README.md](backend/README.md).
2. **HTTPS certificate:** follow [HTTPS_SETUP.md](HTTPS_SETUP.md).
3. **Frontend packages:** run `npm install` in this folder.

## Run

Use two terminals.

Backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python run_https.py
```

Frontend:

```powershell
npm run dev
```

Then open <https://localhost:5173>.

## Check your changes

```powershell
npm run build
npm run lint
```

Backend tests are in `backend/tests/`. Run them from the `backend` folder, for
example:

```powershell
.\.venv\Scripts\python.exe tests\test_rate_limit.py
```

Many of them use the database in `backend/.env` and some send email, so read the
notes at the top of a test before running it.
