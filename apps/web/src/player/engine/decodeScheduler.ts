/**
 * Preemptive single-flight scheduler for the mix-decode worker.
 *
 * The worker is single-threaded, so only one decode should be doing WASM work at
 * a time. This scheduler enforces that plus the priority contract that Phase 1
 * established (and closes a gap in the original `backgroundChain`, which only
 * serialized background decodes against *each other*, not against an in-flight
 * interactive one):
 *
 *  - `interactive` (a user-driven track load) SUPERSEDES all older/queued work
 *    by bumping the epoch and runs immediately. Superseded jobs observe
 *    `isCurrent() === false` and must bail; the caller also terminates the
 *    worker so the killed decode's memory is actually released.
 *  - `background` (progressive upgrade, neighbor prefetch) NEVER cancels another
 *    decode: it waits for whatever is running/queued to settle, then runs — but
 *    only if it wasn't superseded by an interactive decode while it waited.
 *
 * Pure and worker-agnostic so the concurrency contract is unit-testable without
 * a Worker or WASM: callers inject the `run` that does the actual decode.
 */

export type DecodePriority = "interactive" | "background";

export interface DecodeRunContext {
  /** Epoch assigned to this job; compare against the live epoch via isCurrent. */
  epoch: number;
  /** False once a newer interactive decode has superseded this job. */
  isCurrent: () => boolean;
}

const noop = () => {};

export class DecodeScheduler {
  private epoch = 0;
  private running = 0;
  private queued = 0;
  /** Settles when the current/last job finishes; background jobs await it. */
  private tail: Promise<void> = Promise.resolve();

  /** True while any decode is running or waiting its turn. */
  isBusy(): boolean {
    return this.running > 0 || this.queued > 0;
  }

  /** Current epoch — a job is "current" while this equals its assigned epoch. */
  currentEpoch(): number {
    return this.epoch;
  }

  /** Supersede all in-flight/queued work without scheduling anything new. */
  supersede(): void {
    this.epoch += 1;
  }

  schedule<T>(
    priority: DecodePriority,
    run: (ctx: DecodeRunContext) => Promise<T>,
  ): Promise<T> {
    if (priority === "interactive") {
      const epoch = (this.epoch += 1); // supersede everything older/queued
      const p = this.execute(epoch, run);
      this.tail = p.then(noop, noop);
      return p;
    }

    // Background: wait for the current tail (interactive or background), then run
    // only if an interactive decode hasn't superseded us in the meantime.
    const epochAtQueue = this.epoch;
    const gate = this.tail;
    this.queued += 1;
    const p = (async () => {
      await gate.then(noop, noop);
      this.queued -= 1;
      if (this.epoch !== epochAtQueue) {
        throw new DOMException("Decode superseded before start", "AbortError");
      }
      return this.execute(this.epoch, run);
    })();
    this.tail = p.then(noop, noop);
    return p;
  }

  private execute<T>(
    epoch: number,
    run: (ctx: DecodeRunContext) => Promise<T>,
  ): Promise<T> {
    this.running += 1;
    const ctx: DecodeRunContext = { epoch, isCurrent: () => epoch === this.epoch };
    // Start run() synchronously (up to its first await) so `isCurrent` is live
    // immediately for a caller that preempts in the same tick.
    return (async () => {
      try {
        return await run(ctx);
      } finally {
        this.running -= 1;
      }
    })();
  }
}
