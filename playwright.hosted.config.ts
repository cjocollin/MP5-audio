import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.MP5_HOSTED_URL;
if (!baseURL) {
  throw new Error("Set MP5_HOSTED_URL=https://your-deployment.vercel.app");
}

export default defineConfig({
  testDir: "e2e",
  testMatch: "hosted-demo.spec.ts",
  timeout: 120_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
});
