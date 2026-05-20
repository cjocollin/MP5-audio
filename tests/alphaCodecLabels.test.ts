import { describe, expect, it } from "vitest";
import { CodecId } from "@mp5/container";
import {
  codecExportOptionLabel,
  codecLabel,
  describeMp5cPlayback,
  describeMp5lPlayback,
  mp5lBitstreamVersion,
} from "../apps/web/src/lib/codecDisplay";

describe("Alpha codec labels", () => {
  it("labels MP5-L as default lossless export", () => {
    expect(codecLabel(CodecId.MP5L)).toMatch(/lossless/i);
    expect(codecLabel(CodecId.MP5L)).toMatch(/default/i);
    expect(codecExportOptionLabel("mp5l")).toMatch(/v3/i);
    expect(codecExportOptionLabel("mp5l")).toMatch(/bit-exact/i);
  });

  it("labels MP5-C as experimental lab", () => {
    expect(codecLabel(CodecId.MP5C)).toMatch(/experimental/i);
    expect(codecExportOptionLabel("mp5c")).toMatch(/hiss/i);
    const labels = describeMp5cPlayback(new Uint8Array([0x43, 6]));
    expect(labels.warning).toMatch(/hiss/i);
  });

  it("labels MP5-H as hybrid not default", () => {
    expect(codecLabel(CodecId.MP5H)).toMatch(/hybrid/i);
    expect(codecExportOptionLabel("mp5h")).toMatch(/not default/i);
  });

  it("labels PCM as reference", () => {
    expect(codecLabel(CodecId.PCM)).toMatch(/reference/i);
    expect(codecExportOptionLabel("pcm")).toMatch(/debug/i);
  });

  it("detects MP5-L v3 bitstream", () => {
    const frame = new Uint8Array([0x4c, 3, 2, 0, 0, 0, 0]);
    expect(mp5lBitstreamVersion(frame)).toBe(3);
    const labels = describeMp5lPlayback(frame);
    expect(labels.encoderVersion).toContain("v3");
    expect(labels.bitExact).toBe(true);
    expect(labels.defaultExport).toMatch(/default/i);
  });
});
