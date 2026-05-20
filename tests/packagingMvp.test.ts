import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const webRoot = join(root, "apps/web");
const iconsDir = join(webRoot, "public/icons");

describe("packaging MVP", () => {
  it("has PWA placeholder icons", () => {
    for (const file of ["mp5-192.png", "mp5-512.png", "mp5-icon.svg"]) {
      expect(existsSync(join(iconsDir, file)), `missing ${file}`).toBe(true);
    }
  });

  it("vite PWA manifest names and theme", () => {
    const vite = readFileSync(join(webRoot, "vite.config.ts"), "utf8");
    expect(vite).toContain('name: "MP5 Player"');
    expect(vite).toContain('short_name: "MP5"');
    expect(vite).toContain('theme_color: "#0a0a0f"');
    expect(vite).toContain("icons/mp5-192.png");
    expect(vite).toContain("icons/mp5-512.png");
  });

  it("install guide documents platform table", () => {
    const guide = readFileSync(join(root, "docs/MP5_INSTALL_GUIDE.md"), "utf8");
    expect(guide).toContain("Platform capability table");
    expect(guide).toContain("Web / PWA");
    expect(guide).toContain("Offline behavior (honest)");
    expect(guide).toContain("does not claim to beat MP3");
  });

  it("tauri scaffold declares mp5 association", () => {
    const conf = JSON.parse(
      readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"),
    );
    const mp5 = conf.bundle?.fileAssociations?.find((a: { ext: string[] }) =>
      a.ext?.includes("mp5"),
    );
    expect(mp5).toBeTruthy();
  });

  it("capacitor config points at web dist", () => {
    const cap = readFileSync(join(root, "capacitor.config.ts"), "utf8");
    expect(cap).toContain('webDir: "apps/web/dist"');
  });
});
