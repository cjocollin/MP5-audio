import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createCoverPreviewUrl,
  replaceCoverPreviewUrl,
  revokeCoverPreviewUrl,
} from "../apps/web/src/lib/coverPreviewUrl";

describe("coverPreviewUrl", () => {
  const revoke = vi.fn();
  const create = vi.fn((blob: Blob) => `blob:mock-${(blob as Blob).type}`);

  beforeEach(() => {
    revoke.mockClear();
    create.mockClear();
    vi.stubGlobal("URL", {
      createObjectURL: create,
      revokeObjectURL: revoke,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates blob URL from cover bytes", () => {
    const url = createCoverPreviewUrl({ mime: "image/png", data: new Uint8Array([1, 2]) });
    expect(url).toBe("blob:mock-image/png");
    expect(create).toHaveBeenCalledOnce();
  });

  it("replaceCoverPreviewUrl revokes previous URL", () => {
    const first = replaceCoverPreviewUrl(undefined, {
      mime: "image/png",
      data: new Uint8Array([1]),
    });
    const second = replaceCoverPreviewUrl(first, {
      mime: "image/jpeg",
      data: new Uint8Array([2]),
    });
    expect(revoke).toHaveBeenCalledWith("blob:mock-image/png");
    expect(second).toBe("blob:mock-image/jpeg");
  });

  it("replaceCoverPreviewUrl clears when cover removed", () => {
    const first = replaceCoverPreviewUrl(undefined, {
      mime: "image/png",
      data: new Uint8Array([1]),
    });
    const cleared = replaceCoverPreviewUrl(first, undefined);
    expect(revoke).toHaveBeenCalledWith("blob:mock-image/png");
    expect(cleared).toBeUndefined();
  });

  it("revokeCoverPreviewUrl is safe on undefined", () => {
    revokeCoverPreviewUrl(undefined);
    expect(revoke).not.toHaveBeenCalled();
  });
});
