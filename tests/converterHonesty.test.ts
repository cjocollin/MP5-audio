import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodecId, parseMp5 } from "@mp5/container";

vi.mock("../apps/web/src/wasm/codec", () => ({
  getCodec: vi.fn(async () => ({})),
  isWasmCodecReady: vi.fn(() => false),
  CodecPreset: { Low: 0, Standard: 1, High: 2, Extreme: 3 },
}));

import { convertToMp5 } from "../apps/web/src/converter/convertToMp5";
import { isWasmCodecReady } from "../apps/web/src/wasm/codec";

const samples = new Int16Array([0, 1000, -1000, 500]);

describe("converter honesty", () => {
  beforeEach(() => {
    vi.mocked(isWasmCodecReady).mockReturnValue(false);
  });

  it("exports PCM when WASM unavailable and pcm selected", async () => {
    const buf = await convertToMp5({
      samples,
      sampleRate: 44100,
      channels: 1,
      codec: "pcm",
    });
    const p = parseMp5(buf);
    expect(p.head?.codecId).toBe(CodecId.PCM);
    const info = p.info.find((i) => i.key === "encoder");
    expect(info?.value).toContain("PCM");
  });

  it("rejects MP5-C when WASM unavailable", async () => {
    await expect(
      convertToMp5({
        samples,
        sampleRate: 44100,
        channels: 1,
        codec: "mp5c",
      }),
    ).rejects.toThrow(/WASM/);
  });
});
