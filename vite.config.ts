import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = dirname(fileURLToPath(import.meta.url))

/**
 * Local HTTPS for development (see HTTPS_SETUP.md).
 *
 * The certificate is generated per computer by mkcert into ./certs and is
 * git-ignored. The same files are used by the FastAPI backend
 * (backend/run_https.py), so both https://localhost:5173 and
 * https://localhost:8000 are trusted by the browser.
 *
 * Override the paths with DEV_SSL_CERT / DEV_SSL_KEY in .env.local if needed.
 */
const loadHttpsOptions = (env: Record<string, string>) => {
  const certPath = resolve(projectRoot, env.DEV_SSL_CERT || 'certs/localhost.pem')
  const keyPath = resolve(projectRoot, env.DEV_SSL_KEY || 'certs/localhost-key.pem')

  if (!existsSync(certPath) || !existsSync(keyPath)) {
    throw new Error(
      [
        'HTTPS certificate not found.',
        `  expected certificate: ${certPath}`,
        `  expected private key: ${keyPath}`,
        'Generate them with mkcert (run in the barangay_portal_system folder):',
        '  mkcert -install',
        '  mkcert -cert-file certs\\localhost.pem -key-file certs\\localhost-key.pem localhost 127.0.0.1 ::1 <your-Wi-Fi-IP>',
        'See HTTPS_SETUP.md for details.',
      ].join('\n'),
    )
  }

  return { cert: readFileSync(certPath), key: readFileSync(keyPath) }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // '' prefix: also read non-VITE_ variables (they are NOT exposed to the app).
  const env = loadEnv(mode, projectRoot, '')
  // Only the dev/preview servers need the certificate. `npm run build` must
  // keep working on machines without one (e.g. a future production server,
  // where Nginx/Caddy terminates HTTPS instead).
  const https = command === 'serve' ? loadHttpsOptions(env) : undefined

  return {
    plugins: [react()],
    server: {
      https,
      // Listen on every network interface so phones on the same network can
      // open the portal (e.g. https://192.168.1.25:5173), not only localhost.
      host: true,
      port: 5173,
      // Fail instead of silently moving to 5174: the backend's CORS_ORIGINS
      // list (backend/.env) allows the :5173 origins only.
      strictPort: true,
    },
    // `npm run preview` (serves the production build in ./dist) uses HTTPS too.
    preview: {
      https,
      host: true,
      port: 5173,
      strictPort: true,
    },
  }
})
