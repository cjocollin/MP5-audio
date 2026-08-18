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

  it("labels MP5-C as classic legacy experimental lab", () => {
    expect(codecLabel(CodecId.MP5C)).toMatch(/experimental/i);
    expect(codecLabel(CodecId.MP5C)).toMatch(/classic/i);
    expect(codecLabel(CodecId.MP5C)).toMatch(/legacy/i);
    expect(codecExportOptionLabel("mp5c")).toMatch(/hiss/i);
    expect(codecExportOptionLabel("mp5c")).toMatch(/classic/i);
    const labels = describeMp5cPlayback(new Uint8Array([0x43, 6]));
    expect(labels.warning).toMatch(/hiss/i);
    expect(labels.containerMode).toMatch(/classic/i);
  });

  it("labels MP5-H as hybrid not default", () => {
    expect(codecLabel(CodecId.MP5H)).toMatch(/hybrid/i);
    expect(codecExportOptionLabel("mp5h")).toMatch(/not default/i);
  });

  it("labels PCM as reference", () => {
    expect(codecLabel(CodecId.PCM)).toMatch(/reference/i);
    expect(codecExportOptionLabel("pcm")).toMatch(/debug/i);
  });

  // The shipping CodecId 5 encoder (rust/mp5-codec/src/mp5c2.rs) emits only bit-exact
  // units: MP5-L for quiet/fragile/tail and min(SR+CORR, MP5-L) for loud. TAG_LOSSY is
  // decode-only legacy. Labels must never call it lossy or hybrid.
  it("labels MP5-C2 as bit-exact lossless lab, never lossy or hybrid", () => {
    for (const text of [
      codecLabel(CodecId.MP5C2),
      codecExportOptionLabel("mp5c2"),
    ]) {
      expect(text).toMatch(/MP5-C2/i);
      expect(text).toMatch(/lossless/i);
      expect(text).toMatch(/bit-exact/i);
      expect(text).toMatch(/not default/i);
      expect(text).not.toMatch(/hybrid/i);
      expect(text).not.toMatch(/lossy/i);
    }
  });

  it("labels CodecId 6 as MP5-C v6, distinct from classic MP5-C and MP5-C2", () => {
    expect(codecLabel(CodecId.MP5C6)).toMatch(/MP5-C v6/);
    expect(codecLabel(CodecId.MP5C6)).toMatch(/lossy/i);
    expect(codecExportOptionLabel("mp5c6")).toMatch(/MP5-C v6/);
    // The C-family names must be mutually distinguishable in the lab menu.
    expect(codecLabel(CodecId.MP5C6)).not.toMatch(/classic/i);
    expect(codecLabel(CodecId.MP5C)).not.toMatch(/MP5-C v6/);
    expect(codecLabel(CodecId.MP5C2)).not.toMatch(/MP5-C v6/);
    expect(codecExportOptionLabel("mp5c")).not.toMatch(/MP5-C v6/);
    expect(codecExportOptionLabel("mp5c2")).not.toMatch(/MP5-C v6/);
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
