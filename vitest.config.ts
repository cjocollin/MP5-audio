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
    environment: "node",
  },
});
