import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";
import pkg from "./package.json";

export default defineConfig({
  // App version for the X-App-Version header (proxy version gate)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // The plugin's injected registerSW.js registers the worker unconditionally,
      // which breaks APK updates: the WebView keeps serving the old precached
      // bundle. Registration is done manually in main.tsx instead, where it can
      // be skipped on native platforms.
      injectRegister: null,
      includeAssets: [
        "favicon.ico",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "Lex — Translator and Vocabulary Trainer",
        short_name: "Lex",
        description: "Translate words from 90+ languages, save them to your dictionary, and memorize them with spaced repetition.",
        theme_color: "#1095c1",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff2}"],
        // Runtime cache for translate proxy: NetworkFirst with offline fallback
        runtimeCaching: [
          {
            urlPattern: /\/translate$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "lex-translate-api",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 86400,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/languages$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "lex-languages-api",
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 604800,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/tts$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "lex-tts-api",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 86400,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/translate": "http://localhost:8004",
      "/languages": "http://localhost:8004",
      "/tts": "http://localhost:8004",
      "/quota": "http://localhost:8004",
      "/dictionary": {
        target: "http://localhost:8004",
        bypass: (req) => {
          // GET /dictionary is an SPA route, not a proxy endpoint
          if (req.method !== "POST") return req.url;
        },
      },
      "/feedback": "http://localhost:8004",
    },
  },
});