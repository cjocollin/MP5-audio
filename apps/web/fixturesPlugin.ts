import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const DEMO_FIXTURES = ["demo_mp5l_v3_tone.mp5", "demo_mp5l_v3_stems.mp5"] as const;
const fixturesDir = path.resolve(webRoot, "../../test-fixtures");
const screenshotsDir = path.resolve(webRoot, "../../docs/screenshots");
const SCREENSHOT_FILES = ["Player.png", "Metadata.png", "Converter.png"] as const;

/** Serve repo test-fixtures at /fixtures for demo MP5 loading in dev and preview. */
function copyDemoFixtureToDist() {
  const destDir = path.resolve(webRoot, "dist/fixtures");
  fs.mkdirSync(destDir, { recursive: true });
  let copied = 0;
  for (const name of DEMO_FIXTURES) {
    const src = path.join(fixturesDir, name);
    if (!fs.existsSync(src)) {
      console.warn(`[mp5-fixtures] ${name} missing — run pnpm fixtures:generate before deploy.`);
      continue;
    }
    fs.copyFileSync(src, path.join(destDir, name));
    copied++;
  }
  if (copied === 0) {
    console.warn("[mp5-fixtures] No demo fixtures copied — demo buttons will fail gracefully.");
  }
}

function copyScreenshotsToDist() {
  const destDir = path.resolve(webRoot, "dist/screenshots");
  let copied = 0;
  for (const name of SCREENSHOT_FILES) {
    const src = path.join(screenshotsDir, name);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, path.join(destDir, name));
    copied++;
  }
  if (copied === 0) {
    console.warn("[mp5-screenshots] No PNGs in docs/screenshots — landing gallery will be empty.");
  }
}

export function fixturesPlugin(): Plugin {
  function serveFixture(
    reqUrl: string | undefined,
    res: import("node:http").ServerResponse,
    next: () => void,
  ) {
    serveStaticFromDir(reqUrl, fixturesDir, "application/octet-stream", res, next);
  }

  function serveStaticFromDir(
    reqUrl: string | undefined,
    baseDir: string,
    contentType: string,
    res: import("node:http").ServerResponse,
    next: () => void,
  ) {
    const name = (reqUrl ?? "").replace(/^\//, "").split("?")[0] ?? "";
    if (!name || name.includes("..")) return next();
    const file = path.join(baseDir, name);
    if (!file.startsWith(baseDir) || !fs.existsSync(file)) return next();
    res.setHeader("Content-Type", contentType);
    fs.createReadStream(file).pipe(res);
  }

  return {
    name: "mp5-fixtures",
    configureServer(server) {
      server.middlewares.use("/fixtures", (req, res, next) => {
        serveFixture(req.url, res, next);
      });
      server.middlewares.use("/screenshots", (req, res, next) => {
        serveStaticFromDir(req.url, screenshotsDir, "image/png", res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/fixtures", (req, res, next) => {
        serveFixture(req.url, res, next);
      });
      server.middlewares.use("/screenshots", (req, res, next) => {
        serveStaticFromDir(req.url, screenshotsDir, "image/png", res, next);
      });
    },
    closeBundle() {
      copyDemoFixtureToDist();
      copyScreenshotsToDist();
    },
  };
}
