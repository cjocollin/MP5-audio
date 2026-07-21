import { describe, expect, it } from "vitest";
import { CodecId } from "@mp5/container";
import {
  codecExportOptionLabel,
  codecLabel,
  describeMp5cPlayback,
  describeMp5lPlayback,
  mp5lBitstreamVersion,
} from "../apps/web/src/lib/codecDisplay";

describe("Public Beta codec labels", () => {
  it("labels MP5-L as default lossless export", () => {
    expect(codecLabel(CodecId.MP5L)).toMatch(/lossless/i);
    expect(codecLabel(CodecId.MP5L)).toMatch(/default/i);
    expect(codecExportOptionLabel("mp5l_v4")).toMatch(/v4/i);
    expect(codecExportOptionLabel("mp5l_v4")).toMatch(/default/i);
    expect(codecExportOptionLabel("mp5l_v4")).toMatch(/bit-exact/i);
    expect(codecExportOptionLabel("mp5l")).toMatch(/v3/i);
    expect(codecExportOptionLabel("mp5l")).toMatch(/lab|legacy/i);
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

  it("labels MP5-C2 as hybrid not default", () => {
    expect(codecLabel(CodecId.MP5C2)).toMatch(/MP5-C2/i);
    expect(codecLabel(CodecId.MP5C2)).toMatch(/not default/i);
    expect(codecExportOptionLabel("mp5c2")).toMatch(/MP5-C2/i);
    expect(codecExportOptionLabel("mp5c2")).toMatch(/not default/i);
  });

  it("detects MP5-L v3 bitstream as lab/legacy", () => {
    const frame = new Uint8Array([0x4c, 3, 2, 0, 0, 0, 0]);
    expect(mp5lBitstreamVersion(frame)).toBe(3);
    expect(codecLabel(CodecId.MP5L, frame)).toMatch(/v3/i);
    const labels = describeMp5lPlayback(frame);
    expect(labels.encoderVersion).toContain("v3");
    expect(labels.containerMode).toMatch(/v3/i);
    expect(labels.bitExact).toBe(true);
    expect(labels.defaultExport).toMatch(/lab|legacy|not the recommended/i);
  });

  it("labels MP5-L v4 bitstream as default", () => {
    const frame = new Uint8Array([0x4c, 4, 2, 0, 0, 0, 0]);
    expect(mp5lBitstreamVersion(frame)).toBe(4);
    expect(codecLabel(CodecId.MP5L, frame)).toMatch(/v4/i);
    expect(codecLabel(CodecId.MP5L, frame)).toMatch(/default/i);
    expect(codecLabel(CodecId.MP5L, frame)).not.toMatch(/v3/i);
    const labels = describeMp5lPlayback(frame);
    expect(labels.containerMode).toMatch(/v4/i);
    expect(labels.defaultExport).toMatch(/recommended default/i);
  });
});
