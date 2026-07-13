import { defineConfig, devices } from "@playwright/test";

// Dedicated e2e port (override with E2E_PORT). Decoupled from the 5173 dev-server
// default so a developer's running `pnpm dev` can't collide with the e2e server
// (the "port 5173 already used" failure). `--strictPort` makes a real collision
// fail loudly instead of silently drifting to another port.
const HOST = "127.0.0.1";
const PORT = Number(process.env.E2E_PORT ?? 5188);
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  testIgnore: "**/hosted-demo.spec.ts",
  // WASM decode + stem workers contend when many browser tabs run in parallel.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
  webServer: {
    command: `pnpm --filter @mp5/web dev --host ${HOST} --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
