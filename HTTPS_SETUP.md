# Local HTTPS for the Barangay Portal (Windows)

Development runs fully on HTTPS with a **locally trusted** certificate from
[mkcert](https://github.com/FiloSottile/mkcert). There are no browser warnings
to click through, and nothing is exposed to the internet.

| Part              | Address                     | Serves HTTPS with                         |
| ----------------- | --------------------------- | ----------------------------------------- |
| React (Vite)      | `https://localhost:5173`    | `vite.config.ts` → `certs/*.pem`          |
| FastAPI (uvicorn) | `https://localhost:8000`    | `backend/run_https.py` → `certs/*.pem`    |
| MySQL             | `127.0.0.1:3306`            | unchanged; only the backend talks to it   |

```
Browser ──HTTPS──► Vite :5173   (pages, JS)
   │
   └─────HTTPS──► FastAPI :8000 ──► MySQL :3306 (local only)
```

The frontend works out the API address by itself
(`src/Utils/Shared/api.ts`): it uses **the same protocol and host as the page**,
on port 8000. So `https://localhost:5173` calls `https://localhost:8000`, and
`https://192.168.1.25:5173` on a phone calls `https://192.168.1.25:8000`. No API
URLs are hard-coded anywhere, which also rules out mixed-content errors.

---

## 1. One-time setup on this computer

### 1.1 Install mkcert

**WINDOWS POWERSHELL**

```powershell
winget install --id FiloSottile.mkcert -e
```

Close and reopen PowerShell (and VS Code terminals) so `mkcert` is on the PATH,
then check:

```powershell
mkcert -version
```

> Already done on this computer (mkcert v1.4.4).

### 1.2 Trust the local certificate authority (CA)

**WINDOWS POWERSHELL** (normal, not Administrator)

```powershell
mkcert -install
```

Windows shows a **Security Warning: "You are about to install a certificate
from a certification authority (CA) claiming to represent: mkcert ..."**. Click
**Yes**. This adds *your own* private CA to the Windows trust store. Chrome,
Edge and Python on Windows use that store. Recent Firefox versions on Windows
also read it; if Firefox still warns, restart it.

The CA files live in the folder printed by `mkcert -CAROOT`
(`C:\Users\<you>\AppData\Local\mkcert`):

| File              | What it is                         | Share it?                          |
| ----------------- | ---------------------------------- | ---------------------------------- |
| `rootCA.pem`      | public CA certificate              | Only to *your own* test devices    |
| `rootCA-key.pem`  | **CA private key**                 | **NEVER.** Anyone with it can impersonate any website to your devices |

### 1.3 Generate the certificate for the portal

Find this computer's Wi-Fi IPv4 address (needed only for phone access):

**WINDOWS POWERSHELL**

```powershell
Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias Wi-Fi | Select-Object IPAddress
```

Then, in the **`barangay_portal_system`** folder (replace the last value with
your IP, or leave it out if you will not use a phone):

**WINDOWS POWERSHELL**

```powershell
cd C:\Barangay_project\barangay_portal_system
mkdir certs -Force
mkcert -cert-file certs\localhost.pem -key-file certs\localhost-key.pem localhost 127.0.0.1 ::1 100.100.109.84
```

Result:

```
barangay_portal_system\
├── certs\                      ← git-ignored, never committed
│   ├── localhost.pem           ← certificate (shared by Vite + FastAPI)
│   └── localhost-key.pem       ← PRIVATE KEY
├── vite.config.ts
└── backend\
    └── run_https.py
```

> Already done on this computer for `localhost 127.0.0.1 ::1 100.100.109.84`
> (valid until 11 February 2029). Re-run the command whenever your Wi-Fi IP
> changes; see section 6.

---

## 2. Every day: start the system

Use **two** VS Code terminals.

**BACKEND TERMINAL**

```powershell
cd C:\Barangay_project\barangay_portal_system\backend
.\.venv\Scripts\Activate.ps1
python run_https.py
```

Expected: `Uvicorn running on https://0.0.0.0:8000`

**FRONTEND TERMINAL**

```powershell
cd C:\Barangay_project\barangay_portal_system
npm run dev
```

Expected:

```
➜  Local:   https://localhost:5173/
➜  Network: https://100.100.109.84:5173/
```

Open **https://localhost:5173**. The padlock should show "Connection is
secure". The first load after a config change can take ~15 s while Vite
re-optimizes dependencies.

`npm run build` does **not** need the certificate. `npm run preview` (serves
`dist/`) uses HTTPS too.

---

## 3. What was changed

| File | Change |
| ---- | ------ |
| `vite.config.ts` | Loads `certs/localhost.pem` + key for `npm run dev` / `npm run preview`. Stops with a clear message if they are missing. Not used by `npm run build`. |
| `backend/run_https.py` | **New.** Starts uvicorn with `--ssl-certfile/--ssl-keyfile`, `--reload`, host `0.0.0.0`, port `8000`. |
| `backend/.env` | `FRONTEND_URL=https://...`, `CORS_ORIGINS` and `CORS_ORIGIN_REGEX` accept **https** origins only, plus `DEV_SSL_CERTFILE` / `DEV_SSL_KEYFILE`. |
| `backend/.env.example` | Same, as a template. |
| `backend/app/config.py` | Fallback defaults (used only when `.env` lacks a value) are now `https://localhost:5173`. |
| `.env.example` (frontend, **new**) | Documents `VITE_API_BASE_URL` for production. |
| `.gitignore` | Ignores `certs/`, `*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx`. |
| `backend/scripts/test_*.py` | Scripts that call the running server now use `https://localhost:8000` (override with `$env:API_BASE_URL`). Scripts that start their own private server on another port are unchanged. |
| `backend/README.md` | "Run the API" section now uses HTTPS. |

**Not changed:** `src/Utils/Shared/api.ts`, all pages, components and styles,
authentication, tokens, rate limits, database schema, API routes, SMTP, file
uploads and pothole detection.

---

## 4. Verify everything works

On this computer, after `mkcert -install` and with both servers running:

1. Open `https://localhost:5173`: padlock, no warning.
2. Open `https://localhost:8000/docs`: padlock, Swagger UI loads.
   `https://localhost:8000/api/health` returns `{"status":"ok"}` (MySQL reachable).
3. Press **F12 → Console** and keep it open for the next steps. There must be
   **no** "Mixed Content", CORS, or `ERR_CERT_*` errors.
4. Log in as a resident, then as admin/staff. Register a test resident.
5. Submit a document request **with an image**, and open it from the admin side.
6. Resident → Pothole Detection: upload a photo and press "Use my location"
   (the browser asks for location permission).
7. F12 → **Network** tab: every request goes to `https://localhost:8000/...`.

Automated checks (they create test data and remove it afterwards):

**BACKEND TERMINAL** (second terminal; server already running)

```powershell
cd C:\Barangay_project\barangay_portal_system\backend
.\.venv\Scripts\Activate.ps1
python scripts\test_request_attachments.py
python scripts\test_staff_role_access.py
python scripts\test_pothole_reports.py
```

Python on Windows trusts the mkcert CA from the Windows store after
`mkcert -install`. If a script still reports `CERTIFICATE_VERIFY_FAILED`, point
Python at the CA for that terminal only. This keeps verification **on**:

```powershell
$env:SSL_CERT_FILE = "$(mkcert -CAROOT)\rootCA.pem"
```

---

## 5. Security notes

- Certificate verification is never disabled anywhere (no `verify=False`).
- `certs/` and every `*.pem`/`*.key` file are git-ignored. Check before pushing:
  `git status` must not list anything under `certs/`.
- Never copy `rootCA-key.pem` anywhere. Only `rootCA.pem` goes to your phone.
- CORS accepts `https://` origins only. Plain `http://localhost:5173` is refused.
- **MySQL:** this computer's MySQL currently *listens on all network
  interfaces* (port 3306). Windows Firewall blocks it today because there is no
  inbound rule for 3306. **Never add one.** For defence in depth, make MySQL
  listen on this computer only.
  **WINDOWS POWERSHELL (Run as Administrator)**
  ```powershell
  notepad "C:\ProgramData\MySQL\MySQL Server 8.0\my.ini"
  ```
  Under `[mysqld]`, add or change `bind-address=127.0.0.1`, save, then restart
  the service:
  ```powershell
  Restart-Service MySQL80
  ```
  (The service name may differ; check with `Get-Service *mysql*`.) The backend
  already connects via `127.0.0.1`, so nothing else changes.
- Uvicorn listens on `0.0.0.0` (all networks) so phones can connect, but
  Windows Firewall blocks ports 5173/8000 until you add the rule in section 6.
  To keep the API strictly on this computer, set `API_HOST=127.0.0.1` in
  `backend/.env`.

---

## 6. Optional: open the portal on a phone (same Wi-Fi)

Trusting the CA on Windows does **not** make your phone trust it. A phone needs
three things:

### 6.1 The phone must trust your mkcert root CA

Copy **only** `rootCA.pem` to the phone. Find it with:

**WINDOWS POWERSHELL**

```powershell
explorer (mkcert -CAROOT)
```

Copy `rootCA.pem` to the Desktop and rename the copy to `rootCA.crt` (Android
and iOS recognise `.crt` more reliably). Send it by USB cable, or as a Google
Drive / email attachment to yourself.

**Android** (menu names vary by brand):
Settings → Security (& privacy) → More security settings → Encryption &
credentials → **Install a certificate → CA certificate** → "Install anyway" →
pick `rootCA.crt`. Chrome on Android trusts user-installed CAs. In Firefox for
Android, also enable *Settings → About Firefox → tap the logo 5× → Secret
Settings → "Use third party CA certificates"*.

**iPhone / iPad:**
1. Open `rootCA.crt` (AirDrop, Mail or Files) → "Profile Downloaded".
2. Settings → **Profile Downloaded** → Install.
3. Settings → General → About → **Certificate Trust Settings** → switch **on**
   full trust for "mkcert ...". Without this step Safari still warns.

To remove it later: Android → Encryption & credentials → User credentials;
iOS → Settings → General → VPN & Device Management.

### 6.2 The certificate must contain the computer's current IP

The IP you open on the phone must be one of the names in the certificate.
Today that is `100.100.109.84`. When the computer gets a different IP, do the
following. The phone keeps the CA; only the server certificate changes.

1. **WINDOWS POWERSHELL**: regenerate the certificate with the new IP (section 1.3).
2. Add `https://<new-IP>:5173` to `CORS_ORIGINS` in `backend/.env`.
   `CORS_ORIGIN_REGEX` already allows any private IP over https.
3. Restart both servers.

Tip: reserve a fixed IP for this computer in the router's DHCP settings so it
stops changing.

### 6.3 Windows Firewall must allow ports 5173 and 8000

Do this **only on a network you trust** (your home router or your own phone's
hotspot), never on shared/public Wi-Fi. Anyone on the same network could then
reach the portal's login page.

> Your current Wi-Fi ("PISO WIFI HOTSPOT 3") is a shared pay hotspot and is
> marked **Public**. Do not open ports there. Hotspots like this also usually
> block devices from talking to each other. For phone testing, use your phone's
> own hotspot or a home router.

On the trusted network, mark it as Private, then allow the ports **for Private
networks only**:

**WINDOWS POWERSHELL (Run as Administrator)**

```powershell
Set-NetConnectionProfile -InterfaceAlias Wi-Fi -NetworkCategory Private
New-NetFirewallRule -DisplayName "Barangay dev HTTPS (5173, 8000)" -Direction Inbound -Protocol TCP -LocalPort 5173,8000 -Action Allow -Profile Private
```

Remove the rule when you no longer need it:

```powershell
Remove-NetFirewallRule -DisplayName "Barangay dev HTTPS (5173, 8000)"
```

Port 3306 (MySQL) is **never** opened. The phone only talks to 5173 and 8000.

### 6.4 Test on the phone

Open `https://<computer-IP>:5173`. You should see a padlock with no warning. GPS
("Use my location") now works because the page is a secure context.

Password-reset emails link to `FRONTEND_URL` (`https://localhost:5173`), and
that address only works on this computer. To test the reset link on the
phone, temporarily set `FRONTEND_URL=https://<computer-IP>:5173` in
`backend/.env` and restart the backend.

---

## 7. Switching between local HTTPS and future production HTTPS

Every address comes from configuration, so switching never means editing source
code:

| Setting | Local development (now) | Production (later, e.g. Hostinger VPS) |
| ------- | ----------------------- | --------------------------------------- |
| Frontend API address | *empty*: auto `https://<page-host>:8000` | `VITE_API_BASE_URL=https://portal.example.com` in `.env.production` |
| Frontend HTTPS | Vite + mkcert (`certs/`) | Nginx or Caddy with a real Let's Encrypt certificate serving `dist/` |
| Backend start | `python run_https.py` | `uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers` behind the proxy (no certificate in Python) |
| `FRONTEND_URL` | `https://localhost:5173` | `https://portal.example.com` |
| `CORS_ORIGINS` | `https://localhost:5173,...` | `https://portal.example.com` |
| `CORS_ORIGIN_REGEX` | private-IP regex | **remove** |
| Certificates | mkcert, this PC only | Let's Encrypt, renewed automatically by Caddy/certbot |
| MySQL | `127.0.0.1` | `127.0.0.1` on the VPS; port 3306 closed in the VPS firewall |

How each piece picks its values:

- **Frontend:** Vite loads `.env.development` / `.env.local` for `npm run dev`
  and `.env.production` for `npm run build`. Create
  `barangay_portal_system/.env.production` containing only
  `VITE_API_BASE_URL=https://<your-domain>` when you deploy. Leave it unset
  locally. `api.ts` already reads this variable, and nothing else changes.
- **Backend:** everything is in `backend/.env`. Keep one `.env` per machine:
  this PC's file has the local values, and the server gets its own copy with
  the production values. `.env` is git-ignored, so the two never collide.
- **Certificates:** production does not use `certs/`, `run_https.py` or
  mkcert. The reverse proxy owns the real certificate. Don't install the mkcert
  CA on a server or on residents' phones.

When you are ready to deploy, ask for a VPS guide (Nginx/Caddy, Let's Encrypt,
systemd, HSTS). It needs Linux commands, so it is kept out of this Windows
guide.

---

## 8. Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `npm run dev` stops with "HTTPS certificate not found" | Run section 1.3 in the `barangay_portal_system` folder. |
| `python run_https.py` says "HTTPS certificate not found" | Same. Also make sure you are in the `backend` folder with `.venv` active. |
| Browser shows `NET::ERR_CERT_AUTHORITY_INVALID` on this PC | Run `mkcert -install` and restart the browser completely (close every window). |
| `NET::ERR_CERT_COMMON_NAME_INVALID` | The address you typed is not in the certificate (usually a new IP). Regenerate it (section 1.3) and restart both servers. |
| Login says "Failed to fetch" or "network error" | Backend not running, or open `https://localhost:8000/api/health` once to see the real error. On a phone: firewall or certificate (section 6). |
| Console: "blocked by CORS policy" | Add the exact `https://host:5173` origin to `CORS_ORIGINS` and restart the backend. |
| `http://localhost:5173` doesn't load | Expected. Use `https://`. |
| `mkcert` is not recognised | Reopen the terminal after installing (PATH refresh). |
| Phone: "Use my location" unavailable | Page must be opened via `https://` and the certificate trusted (padlock shown). |

### Going back to plain HTTP (emergency only)

Start the backend with `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.
Remove `server.https` / `preview.https` from `vite.config.ts`, and change the
`https://` origins in `backend/.env` back to `http://`. GPS will then stop
working on phones.
