import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'offline.html'],
      manifest: {
        name: 'SIDC Road Intelligence',
        short_name: 'SIDC Road',
        description: 'SIDC Road Defect Intelligence — AI-powered road monitoring',
        theme_color: '#005bb5', // Government Blue
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        share_target: {
          action: '/share-target',
          method: 'GET',
          params: {
            title: 'title',
            text: 'text',
            url: 'url'
          }
        },
        related_applications: [
          {
            platform: 'play',
            url: 'https://play.google.com/store/apps/details?id=com.example.pothole',
            id: 'com.example.pothole'
          },
          {
            platform: 'itunes',
            url: 'https://itunes.apple.com/app/example-pothole/id123456789'
          }
        ],
        shortcuts: [
          {
            name: 'Report Pothole',
            short_name: 'Report',
            description: 'Report a new pothole',
            url: '/report',
            icons: [{ src: '/icons/report.png', sizes: '192x192' }]
          },
          {
            name: 'View Reports',
            short_name: 'Reports',
            description: 'View all reported potholes',
            url: '/reports',
            icons: [{ src: '/icons/reports.png', sizes: '192x192' }]
          }
        ],
        display_override: ['window-controls-overlay', 'standalone'],
        protocol_handlers: [
          {
            protocol: 'web+pothole',
            url: '/report?id=%s'
          }
        ]
      },
      workbox: {
        navigateFallback: 'offline.html',
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
              },
            },
          },
          {
            urlPattern: new RegExp('^https://fonts.googleapis.com/.*', 'i'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: new RegExp('^https://fonts.gstatic.com/.*', 'i'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'script' || request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-resources-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 20 * 24 * 60 * 60 // 20 Days
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  optimizeDeps: {
    // onnxruntime-web ships wasm + workers that Vite's dep pre-bundler mangles;
    // excluding it lets the runtime resolve its own assets from /ort/.
    exclude: ['onnxruntime-web'],
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      // Serve MinIO objects through the dev server so detection images share the
      // app's origin. Needed for phone/ngrok use: the free ngrok plan only gives
      // one public domain, so the object store cannot have a tunnel of its own.
      '/pothole-images': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../dist'
  }
});