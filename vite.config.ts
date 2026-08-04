import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// SPA fallback note: this is a single-page app with HTML5 History routing.
// The host must rewrite every unknown path to /index.html.
//   - Netlify: public/_redirects (already configured)
//   - Vercel:  vercel.json (already configured)
//   - Nginx:   `try_files $uri /index.html;`
//   - Apache:  `FallbackResource /index.html`
//   - Cloud Run / static GCS bucket: configure 404 page = /index.html
// Vite's dev server handles this automatically.
export default defineConfig({
  server: {
    // Bind to all network interfaces so the dev server is reachable from other
    // devices on the same LAN (e.g. a phone) via http://<your-PC-IP>:5173.
    host: true,
    port: 5173,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Deploys roll out on their own: a new service worker takes over as soon
      // as it is found and the plugin reloads the page onto the new build. No
      // prompt, no toast, no stale tab left behind.
      registerType: 'autoUpdate',
      injectRegister: null, // registered manually in src/main.tsx so we own *when* updates are checked for (see src/lib/pwa.ts)
      // Keep the service worker OUT of dev. A dev SW regenerates constantly and,
      // paired with our update-on-focus + auto-reload policy, reloads the tab
      // onto a stale cached shell whenever the window regains focus (e.g. after
      // the native file-picker closes) — showing a blank screen with no error.
      devOptions: { enabled: false, suppressWarnings: true },
      manifest: {
        name: 'PBIMS - Hospital Suppliers',
        short_name: 'PBIMS',
        description: 'Pharma billing & inventory management for hospital suppliers.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#fcfcfd',
        theme_color: '#f4515a',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell (built JS/CSS/HTML/fonts) so the app installs
        // and launches offline. API calls are intentionally left uncached
        // below — this is a live billing/inventory system, so a stale cached
        // response (wrong stock, wrong price) is worse than a failed request.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        // Delete precaches from superseded builds. Without this, every deploy
        // leaves its full chunk set behind; the total grows until the browser
        // evicts the whole origin's storage — taking the CURRENT build's chunks
        // with it, which strands the tab on "Failed to fetch dynamically
        // imported module" (see src/lib/chunkRecovery.ts).
        cleanupOutdatedCaches: true,
        // registerType: 'autoUpdate' normally sets these two implicitly, but
        // only when injectRegister is left at its default — we set it to null
        // for manual registration, so pin them here rather than depend on that
        // interaction. Without skipWaiting a new worker sits idle behind the
        // old one and the site never actually updates; without clientsClaim the
        // post-update reload can still be served by the old worker's precached
        // index.html.
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /\/api\/v\d+\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
