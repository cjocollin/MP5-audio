import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const DEMO_FIXTURE = "demo_mp5l_v3_tone.mp5";
const fixturesDir = path.resolve(webRoot, "../../test-fixtures");

/** Serve repo test-fixtures at /fixtures for demo MP5 loading in dev and preview. */
function copyDemoFixtureToDist() {
  const src = path.join(fixturesDir, DEMO_FIXTURE);
  const destDir = path.resolve(webRoot, "dist/fixtures");
  if (!fs.existsSync(src)) {
    console.warn(
      `[mp5-fixtures] ${DEMO_FIXTURE} missing — run pnpm fixtures:generate before deploy (demo button will fail gracefully).`,
    );
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, DEMO_FIXTURE));
}

export function fixturesPlugin(): Plugin {
  function serveFixture(
    reqUrl: string | undefined,
    res: import("node:http").ServerResponse,
    next: () => void,
  ) {
    const name = (reqUrl ?? "").replace(/^\//, "").split("?")[0] ?? "";
    if (!name || name.includes("..")) return next();
    const file = path.join(fixturesDir, name);
    if (!file.startsWith(fixturesDir) || !fs.existsSync(file)) return next();
    res.setHeader("Content-Type", "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  }

  return {
    name: "mp5-fixtures",
    configureServer(server) {
      server.middlewares.use("/fixtures", (req, res, next) => {
        serveFixture(req.url, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/fixtures", (req, res, next) => {
        serveFixture(req.url, res, next);
      });
    },
    closeBundle() {
      copyDemoFixtureToDist();
    },
  };
}
