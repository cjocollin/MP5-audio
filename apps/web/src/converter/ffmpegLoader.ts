import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import coreJs from "@ffmpeg/core?url";
import coreWasm from "@ffmpeg/core/wasm?url";
import { USER_ERRORS } from "../lib/userFacingErrors";

export type FfmpegLoadState = "idle" | "loading" | "ready" | "failed";

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
let ffmpegState: FfmpegLoadState = "idle";

/** Serializes all FFmpeg VFS/exec usage (singleton is not reentrant). */
let ffmpegLock: Promise<void> = Promise.resolve();
let jobSeq = 0;

export function getFfmpegLoadState(): FfmpegLoadState {
  return ffmpegState;
}

export function isFfmpegReady(): boolean {
  return ffmpegState === "ready" && !!ffmpeg?.loaded;
}

/** Unique basename for this job's VFS files (no path separators). */
export function nextFfmpegJobId(): string {
  jobSeq += 1;
  return `j${jobSeq}_${Date.now().toString(36)}`;
}

/**
 * Run work against the shared FFmpeg instance exclusively.
 * Callers must use unique VFS filenames (see `nextFfmpegJobId`).
 */
export async function withFfmpegLock<T>(fn: (ffmpeg: FFmpeg) => Promise<T>): Promise<T> {
  const prev = ffmpegLock;
  let release!: () => void;
  ffmpegLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    const instance = await getFfmpeg();
    return await fn(instance);
  } finally {
    release();
  }
}

const LOAD_TIMEOUT_MS = 180_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Singleton FFmpeg instance (loads ~31 MB WASM once per page session). */
export async function getFfmpeg(onStatus?: (message: string) => void): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;

  if (!loadPromise) {
    ffmpegState = "loading";
    loadPromise = (async () => {
      onStatus?.("Loading FFmpeg decoder (first time, ~31 MB)…");
      const instance = new FFmpeg();
      instance.on("log", ({ type, message }) => {
        if (type === "fferr" || /error|invalid/i.test(message)) {
          console.warn("[ffmpeg]", message);
        }
      });

      const coreURL = await toBlobURL(coreJs, "text/javascript");
      const wasmURL = await toBlobURL(coreWasm, "application/wasm");

      await withTimeout(
        instance.load({ coreURL, wasmURL }),
        LOAD_TIMEOUT_MS,
        USER_ERRORS.ffmpegTimeout,
      );

      ffmpeg = instance;
      ffmpegState = "ready";
      return instance;
    })().catch((err) => {
      loadPromise = null;
      ffmpegState = "failed";
      throw err;
    });
  }

  return loadPromise;
}
