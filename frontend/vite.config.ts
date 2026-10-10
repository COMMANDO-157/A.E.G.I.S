import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * A.E.G.I.S 4.0 — Vite Configuration
 *
 * Development: Vite serves the React app on localhost:5173.
 * All /api requests are proxied to the existing Node backend on 127.0.0.1:5501.
 *
 * IMPORTANT — CSRF/Origin requirement:
 * The existing backend enforces: req.headers.origin === process.env.APP_ORIGIN
 * During local Vite development, APP_ORIGIN must be set to http://127.0.0.1:5173
 * in the root .env file before state-changing API calls (/api/auth/*, POST/PATCH)
 * will succeed. GET-only endpoints (e.g. /api/config, /api/health) are unaffected.
 * This is a KNOWN BLOCKER documented for WP-4.2 — do not weaken CSRF checks.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5501',
        changeOrigin: false, // Preserve Origin — do not override CSRF header
        secure: false,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/react-router') || id.includes('node_modules/react-router-dom/')) {
            return 'router-vendor';
          }
        },
      },
    },
  },

  css: {
    devSourcemap: true,
  },
});
