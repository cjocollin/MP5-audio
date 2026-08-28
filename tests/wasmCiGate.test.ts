import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

describe("WASM CI drift gate", () => {
  it("validates the checked package before rebuilding it", () => {
    const validation = workflow.indexOf("- name: Validate checked-in WASM behavior");
    const rebuild = workflow.indexOf("- name: Build WASM codecs");

    expect(validation).toBeGreaterThanOrEqual(0);
    expect(validation).toBeLessThan(rebuild);
    expect(workflow).toContain("tests/mp5c6NativeWasmParity.test.ts");
    expect(workflow).toContain("tests/mp5lWasmRoundtrip.test.ts");
  });

  it("compares portable bindings without byte-comparing cross-host WASM", () => {
    const start = workflow.indexOf("- name: Check WASM pkg is up to date");
    const end = workflow.indexOf("- name: TypeScript lint", start);
    const gate = workflow.slice(start, end);

    expect(gate).toContain("WASM bytes are not cross-host reproducible");
    expect(gate).toContain("apps/web/src/wasm/pkg/mp5_codec.js");
    expect(gate).toContain("apps/web/src/wasm/pkg/mp5_codec_bg.wasm.d.ts");
    expect(gate).not.toMatch(
      /^\s+apps\/web\/src\/wasm\/pkg\/mp5_codec_bg\.wasm\s*\\?\s*$/m,
    );
  });
});
