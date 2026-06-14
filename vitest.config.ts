import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@mp5/container": path.resolve(__dirname, "packages/mp5-container/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "packages/**/src/**/*.test.ts"],
    // compatibilityPass.test.ts requires generated fixtures — run via pnpm compatibility:check
    environment: "node",
    // Vitest 3 default 5s is too tight for large STDF/stem encode tests under CI load.
    testTimeout: 20_000,
  },
});
