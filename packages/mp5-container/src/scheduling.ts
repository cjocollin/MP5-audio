/**
 * Yield to the event loop without depending on rendering or timer throttling.
 *
 * requestAnimationFrame never fires in hidden/occluded documents, and
 * setTimeout(0) is clamped (~4ms nested, >=1s in hidden tabs) — both stall or
 * crawl chunked work (CRC, copies, converts) exactly when a track is loading.
 * scheduler.yield / MessageChannel run as ordinary macrotasks regardless of
 * visibility, so chunked work keeps the page responsive AND always completes.
 */

type SchedulerLike = { yield?: () => Promise<void> };

export function yieldToEventLoop(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (typeof scheduler?.yield === "function") {
    return scheduler.yield();
  }
  if (typeof MessageChannel === "function") {
    return new Promise<void>((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => {
        port1.close();
        port2.close();
        resolve();
      };
      port2.postMessage(null);
    });
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
