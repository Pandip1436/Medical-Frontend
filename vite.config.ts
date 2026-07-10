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
      registerType: 'prompt',
      injectRegister: null, // registered manually in src/main.tsx so we can drive the update toast
      devOptions: { enabled: true, suppressWarnings: true },
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
