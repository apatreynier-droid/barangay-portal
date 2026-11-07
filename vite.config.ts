import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on every network interface so phones on the same network can
    // open the portal (e.g. http://100.100.109.59:5173), not only localhost.
    host: true,
    port: 5173,
    // Fail instead of silently moving to 5174: the backend's CORS_ORIGINS
    // list (backend/.env) allows the :5173 origins only.
    strictPort: true,
  },
})
