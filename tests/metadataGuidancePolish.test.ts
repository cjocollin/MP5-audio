import { describe, it, expect } from "vitest";
import { decodeExpl, encodeExpl, parseOptionalMetadata } from "@mp5/container";
import { buildExportMetadataBundle } from "../apps/web/src/converter/buildExportBundles";
import {
  buildOverridesFromEdits,
  manualEditsFromSource,
} from "../apps/web/src/converter/manualMetadata";
import { formatWarningSourceLabel } from "../apps/web/src/lib/metadataLabels";

const extractedBase = {
  meta: { title: "T", artist: "A" },
};

describe("metadata guidance polish", () => {
  it("roundtrips clean version available in EXPL", () => {
    const edits = manualEditsFromSource(extractedBase);
    edits.expl.cleanVersionAvailable = true;
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits));
    expect(bundle.optional.has("EXPL")).toBe(true);
    const expl = decodeExpl(bundle.optional.get("EXPL"));
    expect(expl?.cleanVersionAvailable).toBe(true);
    expect(expl?.warningSource).toBe("user");
  });

  it("formats manual content guidance source as user-provided", () => {
    expect(formatWarningSourceLabel("user")).toBe("user-provided");
  });

  it("does not write RECV when specialized profile is None", () => {
    const edits = manualEditsFromSource(extractedBase);
    edits.specializedProfile = "none";
    edits.havenProfile.groundingFriendly = true;
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits));
    expect(bundle.optional.has("RECV")).toBe(false);
  });

  it("writes RECV only when Haven profile is selected and fields are set", () => {
    const edits = manualEditsFromSource(extractedBase);
    edits.specializedProfile = "haven";
    edits.havenProfile.groundingFriendly = true;
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits));
    expect(bundle.optional.has("RECV")).toBe(true);
    const chunks = parseOptionalMetadata(bundle.optional);
    expect(chunks.recv?.groundingFriendly).toBe(true);
  });

  it("does not write RECV for Haven profile with no flags set", () => {
    const edits = manualEditsFromSource(extractedBase);
    edits.specializedProfile = "haven";
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits));
    expect(bundle.optional.has("RECV")).toBe(false);
  });

  it("does not write custom app tags chunk when Custom profile is selected (postponed)", () => {
    const edits = manualEditsFromSource(extractedBase);
    edits.specializedProfile = "custom";
    const bundle = buildExportMetadataBundle(extractedBase, buildOverridesFromEdits(edits));
    expect(bundle.optional.has("RECV")).toBe(false);
    expect(bundle.optional.has("APPT")).toBe(false);
    expect([...bundle.optional.keys()].some((k) => k === "NOTE")).toBe(false);
  });

  it("EXPL encode/decode preserves cleanVersionAvailable", () => {
    const data = encodeExpl({
      cleanVersionAvailable: true,
      warningSource: "user",
    });
    const expl = decodeExpl(data);
    expect(expl?.cleanVersionAvailable).toBe(true);
    expect(expl?.warningSource).toBe("user");
  });
});
