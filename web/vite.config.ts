import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Charge .env à la racine du monorepo (aligné avec l’API)
  envDir: '..',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'YTMusic',
        short_name: 'YTMusic',
        description: 'YouTube Music — web, mobile & desktop — sans pubs',
        theme_color: '#030303',
        background_color: '#030303',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/stream/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-stream',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200, 206] },
            },
          },
          {
            // Recherche / suggestions : jamais de cache SW (sinon vieux Keny après une nouvelle query)
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/search') ||
              url.pathname.startsWith('/api/search/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/') &&
              !url.pathname.startsWith('/api/stream/') &&
              !url.pathname.startsWith('/api/search'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  // Évite les 504 "Outdated Optimize Dep" après ajout de paquets
  optimizeDeps: {
    include: [
      '@simplewebauthn/browser',
      'qrcode.react',
      'react',
      'react-dom',
      'react-router-dom',
      'zustand',
      'lucide-react',
      'idb',
    ],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[vite-proxy /api]', err.message);
            if (res && 'writeHead' in res && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error: 'Bad Gateway — API indisponible sur :8787',
                  hint: 'Lance make ensure-api ou make up-full',
                }),
              );
            }
          });
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
        changeOrigin: true,
        timeout: 0,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[vite-proxy /ws]', err.message);
          });
        },
      },
    },
  },
})
