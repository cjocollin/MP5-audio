import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

const ROOT_PKG = resolve(__dirname, "../../package.json");
const WEB_PKG = resolve(__dirname, "package.json");
const OUT_FILE = resolve(__dirname, "src/generated/appVersion.ts");

export function readRootAppVersion(): string {
  const pkg = JSON.parse(readFileSync(ROOT_PKG, "utf8")) as { version: string };
  return pkg.version;
}

/** Sync version from root package.json into web app sources and @mp5/web package.json. */
export function writeAppVersionModule(version: string): void {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(
    OUT_FILE,
    `/** Auto-generated from root package.json — do not edit */\nexport const APP_VERSION = ${JSON.stringify(version)};\n`,
    "utf8",
  );

  const webPkg = JSON.parse(readFileSync(WEB_PKG, "utf8")) as { version: string };
  if (webPkg.version !== version) {
    webPkg.version = version;
    writeFileSync(WEB_PKG, `${JSON.stringify(webPkg, null, 2)}\n`, "utf8");
  }
}

/** Keeps UI version in sync with root package.json on dev start, build, and version bumps. */
export function mp5AppVersionPlugin(): Plugin {
  return {
    name: "mp5-app-version",
    config() {
      const version = readRootAppVersion();
      writeAppVersionModule(version);
      return {
        define: {
          __MP5_APP_VERSION__: JSON.stringify(version),
          __MP5_BUILD_LABEL__: JSON.stringify("Alpha"),
        },
      };
    },
    configureServer(server) {
      server.watcher.add(ROOT_PKG);
      server.watcher.on("change", (file) => {
        if (file.replace(/\\/g, "/") !== ROOT_PKG.replace(/\\/g, "/")) return;
        const version = readRootAppVersion();
        writeAppVersionModule(version);
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}
