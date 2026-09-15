import fs from "node:fs";
import path from "node:path";

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Optional HTTPS so browsers on other devices are allowed to use the camera.
// Set TLS_CERT_DIR to a folder containing dev-key.pem and dev-cert.pem.
const certDir = process.env.TLS_CERT_DIR
const https = certDir
  ? {
      key: fs.readFileSync(path.join(certDir, 'dev-key.pem')),
      cert: fs.readFileSync(path.join(certDir, 'dev-cert.pem')),
    }
  : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { host: true, https },
})
