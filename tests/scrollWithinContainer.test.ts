import { describe, expect, it, vi } from "vitest";
import { scrollChildIntoContainer } from "../apps/web/src/lib/ui/scrollWithinContainer";

describe("scrollWithinContainer", () => {
  it("adjusts container scrollTop instead of calling scrollIntoView", () => {
    const container = {
      scrollTop: 0,
      clientHeight: 100,
      scrollTo: vi.fn(),
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 200, height: 100 }),
    } as unknown as HTMLDivElement;

    const child = {
      getBoundingClientRect: () => ({ top: 120, left: 0, width: 200, height: 20 }),
    } as unknown as HTMLElement;

    scrollChildIntoContainer(container, child);
    expect(container.scrollTo).toHaveBeenCalled();
    expect((child as { scrollIntoView?: () => void }).scrollIntoView).toBeUndefined();
  });

  it("no-ops when container or child missing", () => {
    expect(() => scrollChildIntoContainer(null, null)).not.toThrow();
  });
});
