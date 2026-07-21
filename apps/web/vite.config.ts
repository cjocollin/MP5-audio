import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { fixturesPlugin } from "./fixturesPlugin";
import { mp5AppVersionPlugin } from "./mp5AppVersionPlugin";

export default defineConfig({
  plugins: [
    mp5AppVersionPlugin(),
    react(),
    fixturesPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "brand/mp5-brand-icon.svg",
        "brand/mp5-brand-logo.svg",
        "icons/mp5-icon.svg",
        "icons/mp5-32.png",
        "icons/mp5-192.png",
        "icons/mp5-512.png",
        "icons/apple-touch-icon.png",
      ],
      workbox: {
        maximumFileSizeToCacheInBytes: 35 * 1024 * 1024,
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2,wasm}"],
      },
      manifest: {
        id: "/",
        name: "MP5 Player",
        short_name: "MP5",
        description:
          "Experimental MP5 audio player and converter (Public Beta). MP5-L v4 recommended; MP5-C/H lab-only.",
        start_url: "/",
        scope: "/",
        theme_color: "#070b12",
        background_color: "#070b12",
        display: "standalone",
        orientation: "any",
        categories: ["music", "utilities"],
        icons: [
          {
            src: "brand/mp5-brand-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icons/mp5-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/mp5-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/mp5-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util", "./src/wasm/pkg/mp5_codec.js"],
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
    host: "127.0.0.1",
  },
  assetsInclude: ["**/*.wasm"],
});
