import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Bind explicitly to IPv4 so the URL Vite prints always resolves to this app,
  // even on machines where another local service is listening on ::1.
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8787' } },
})
