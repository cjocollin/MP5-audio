import { describe, it, expect } from "vitest";
import { sanitizeMetadata, encodeMeta, decodeMeta } from "@mp5/container";

describe("metadata", () => {
  it("strips control characters", () => {
    expect(sanitizeMetadata("a\x00b")).toBe("ab");
  });

  it("roundtrips meta fields", () => {
    const enc = encodeMeta([{ key: "artist", value: "Test Artist" }]);
    const dec = decodeMeta(enc);
    expect(dec[0]?.value).toBe("Test Artist");
  });
});
