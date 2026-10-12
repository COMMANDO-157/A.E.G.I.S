import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { realpathSync } from 'node:fs';

// Some Windows sandbox hosts permit file reads but reject native realpath.
// Use Vite's supported path-preservation option only for that exact condition.
// Ordinary permission failures still propagate; no ACL or security setting changes.
let preserveWindowsPaths = false;
if (process.platform === 'win32') {
  const entry = resolve(__dirname, 'src/main.tsx');
  try { realpathSync.native(entry); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    realpathSync(entry); // Must still be accessible through standard resolution.
    preserveWindowsPaths = true;
    console.warn('Native Windows path resolution unavailable; using original file paths.');
  }
}

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
    preserveSymlinks: preserveWindowsPaths,
    dedupe: preserveWindowsPaths ? ['react', 'react-dom', 'react-router', 'react-router-dom'] : [],
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
