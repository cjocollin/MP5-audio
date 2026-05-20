import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

describe("deployment readiness", () => {
  it("has hosted demo validation guide", () => {
    const hosted = readFileSync(join(root, "docs/MP5_HOSTED_DEMO.md"), "utf8");
    expect(hosted).toContain("Hosted demo limitations");
    expect(hosted).toContain("mp5-audio");
    expect(hosted).toContain("mp5-alpha-demo");
  });

  it("has mp5-audio Vercel setup guide", () => {
    const setup = readFileSync(join(root, "docs/MP5_VERCEL_SETUP.md"), "utf8");
    expect(setup).toContain("mp5-audio");
    expect(setup).toContain("apps/web/dist");
    expect(setup).toContain("dist-livid-two-82");
    expect(setup).toContain("mp5-alpha-demo");
  });

  it("has deployment guide with checklist and platform notes", () => {
    const guide = readFileSync(join(root, "docs/MP5_DEPLOYMENT_GUIDE.md"), "utf8");
    expect(guide).toContain("Pre-deploy checklist");
    expect(guide).toContain("Vercel");
    expect(guide).toContain("Netlify");
    expect(guide).toContain("HTTPS");
    expect(guide).toContain("does not claim to beat MP3");
  });

  it("has vercel.json pointing at web dist", () => {
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    expect(vercel.outputDirectory).toBe("apps/web/dist");
    expect(vercel.buildCommand).toMatch(/vercel-build|wasm:build/);
  });

  it("has netlify.toml publish path", () => {
    const netlify = readFileSync(join(root, "netlify.toml"), "utf8");
    expect(netlify).toContain("apps/web/dist");
  });

  it("vite injects version defines", () => {
    const vite = readFileSync(join(root, "apps/web/vite.config.ts"), "utf8");
    expect(vite).toContain("__MP5_APP_VERSION__");
    expect(vite).toContain("__MP5_BUILD_LABEL__");
  });

  it("fixtures plugin copies demo to dist on build", () => {
    const plugin = readFileSync(join(root, "apps/web/fixturesPlugin.ts"), "utf8");
    expect(plugin).toContain("closeBundle");
    expect(plugin).toContain("copyDemoFixtureToDist");
  });

  it("AppVersionBadge component exists", () => {
    expect(existsSync(join(root, "apps/web/src/components/AppVersionBadge.tsx"))).toBe(true);
  });
});
