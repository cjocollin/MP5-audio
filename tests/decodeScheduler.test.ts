import { describe, it, expect } from "vitest";
import {
  DecodeScheduler,
  type DecodeRunContext,
} from "../apps/web/src/player/engine/decodeScheduler";

/** A run whose completion the test controls, recording start/bail. */
function controllable(label: string, log: string[]) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let ctx: DecodeRunContext | null = null;
  const run = async (c: DecodeRunContext) => {
    ctx = c;
    log.push(`start:${label}`);
    await gate;
    if (!c.isCurrent()) {
      log.push(`bail:${label}`);
      throw new DOMException("superseded", "AbortError");
    }
    log.push(`done:${label}`);
    return label;
  };
  return { run, release: () => release(), ctx: () => ctx };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("DecodeScheduler", () => {
  it("runs two background decodes sequentially, never concurrently", async () => {
    const s = new DecodeScheduler();
    const log: string[] = [];
    const b1 = controllable("b1", log);
    const b2 = controllable("b2", log);

    const p1 = s.schedule("background", b1.run);
    const p2 = s.schedule("background", b2.run);
    await tick();

    // b1 started; b2 must be waiting (not started).
    expect(log).toEqual(["start:b1"]);
    b1.release();
    await Promise.resolve(p1);
    await tick();
    expect(log).toEqual(["start:b1", "done:b1", "start:b2"]);
    b2.release();
    await p2;
    expect(log).toEqual(["start:b1", "done:b1", "start:b2", "done:b2"]);
  });

  it("a background decode waits for an in-flight interactive decode", async () => {
    const s = new DecodeScheduler();
    const log: string[] = [];
    const i1 = controllable("i1", log);
    const b1 = controllable("b1", log);

    const pi = s.schedule("interactive", i1.run);
    const pb = s.schedule("background", b1.run);
    await tick();

    expect(log).toEqual(["start:i1"]); // background is waiting
    i1.release();
    await pi;
    await tick();
    expect(log).toEqual(["start:i1", "done:i1", "start:b1"]);
    b1.release();
    await pb;
  });

  it("an interactive decode supersedes queued backgrounds (they never run)", async () => {
    const s = new DecodeScheduler();
    const log: string[] = [];
    const b1 = controllable("b1", log); // queued, starts after a microtask
    const b2 = controllable("b2", log);
    const i1 = controllable("i1", log);

    const pB1 = s.schedule("background", b1.run);
    const pB2 = s.schedule("background", b2.run);
    const pI = s.schedule("interactive", i1.run); // bumps epoch before b1/b2 start
    await tick();

    // Only the interactive ran; both queued backgrounds were superseded pre-start.
    expect(log).toEqual(["start:i1"]);
    await expect(pB1).rejects.toMatchObject({ name: "AbortError" });
    await expect(pB2).rejects.toMatchObject({ name: "AbortError" });
    expect(log).not.toContain("start:b1");
    expect(log).not.toContain("start:b2");
    i1.release();
    await expect(pI).resolves.toBe("i1");
  });

  it("an interactive decode supersedes a RUNNING background (isCurrent flips)", async () => {
    const s = new DecodeScheduler();
    const log: string[] = [];
    const b1 = controllable("b1", log);
    const i1 = controllable("i1", log);

    const pb = s.schedule("background", b1.run);
    await tick();
    expect(log).toEqual(["start:b1"]);
    expect(b1.ctx()!.isCurrent()).toBe(true);

    const pi = s.schedule("interactive", i1.run); // supersede
    expect(b1.ctx()!.isCurrent()).toBe(false); // running background now stale
    b1.release();
    await expect(pb).rejects.toMatchObject({ name: "AbortError" });
    i1.release();
    await pi;
    expect(log).toContain("bail:b1");
    expect(log).toContain("done:i1");
  });

  it("interactive-after-interactive: the later one supersedes the earlier", async () => {
    const s = new DecodeScheduler();
    const log: string[] = [];
    const i1 = controllable("i1", log);
    const i2 = controllable("i2", log);

    const p1 = s.schedule("interactive", i1.run);
    await tick();
    const p2 = s.schedule("interactive", i2.run);
    expect(i1.ctx()!.isCurrent()).toBe(false);
    expect(i2.ctx()!.isCurrent()).toBe(true);
    i1.release();
    await expect(p1).rejects.toMatchObject({ name: "AbortError" });
    i2.release();
    await expect(p2).resolves.toBe("i2");
  });

  it("isBusy() is true from schedule() through settle, for both priorities", async () => {
    const s = new DecodeScheduler();
    const log: string[] = [];
    expect(s.isBusy()).toBe(false);

    const i1 = controllable("i1", log);
    const pi = s.schedule("interactive", i1.run);
    expect(s.isBusy()).toBe(true); // busy immediately, before any await
    i1.release();
    await pi;
    expect(s.isBusy()).toBe(false);

    const b1 = controllable("b1", log);
    const pb = s.schedule("background", b1.run);
    expect(s.isBusy()).toBe(true); // busy while queued too
    b1.release();
    await pb;
    expect(s.isBusy()).toBe(false);
  });
});
