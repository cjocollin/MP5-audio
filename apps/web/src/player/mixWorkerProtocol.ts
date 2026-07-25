/** Worker <-> main thread messages for background full-mix decode. */

import type { Mp5hDecodeInfo, Mp5lDecodeInfo, DecodePath } from "./decodeMp5";
import type { Mp5File } from "@mp5/container";

/** HEAD fields needed for WASM decode (no full container re-parse). */
export type MixWorkerDecodeHead = {
  codecId: number;
  channels: number;
  sampleRate: number;
};

export type MixWorkerDecodeWindow = {
  windowStartSample?: number;
  windowEndSample?: number;
};

/**
 * Build planar float PCM in the worker? Default (undefined) is YES, so old and
 * new peers stay compatible. Pass false for jobs whose result only needs the
 * Int16 samples (e.g. the neighbor prefetch, which stores them in decodeCache
 * and never uploads an AudioBuffer) — the floats are 2x the size of `samples`
 * and were being allocated and transferred only to be garbage-collected.
 */
export type MixWorkerWantFloats = { wantFloats?: boolean };

export type MixWorkerInMessage =
  | { type: "init" }
  | ({ type: "decode"; jobId: string; buffer: ArrayBuffer } & MixWorkerWantFloats)
  | ({
      type: "decode-frames";
      jobId: string;
      head: MixWorkerDecodeHead;
      /** First AUDI frame bitstream (transferable). */
      frameData: ArrayBuffer;
      /** Optional CORR payload for MP5-H (transferable). */
      corrData?: ArrayBuffer;
      window?: MixWorkerDecodeWindow;
    } & MixWorkerWantFloats)
  | { type: "cancel"; jobId: string };

export type MixDecodeJobResult = {
  jobId: string;
  samples: Int16Array;
  /**
   * Planar float PCM built off the UI thread for fast AudioBuffer upload.
   * Transferred alongside samples when present.
   */
  floatChannels?: Float32Array[];
  sampleRate: number;
  channels: number;
  decodePath: DecodePath;
  mp5h?: Mp5hDecodeInfo;
  mp5l?: Mp5lDecodeInfo;
  /**
   * Present only for full-buffer decode (worker re-parse).
   * Frames path omits this — main keeps ingestParsed.
   */
  parsed?: Mp5File;
};

export type MixWorkerOutMessage =
  | { type: "init-done"; ok: boolean; error?: string }
  | { type: "progress"; jobId: string; percent: number }
  | { type: "done"; result: MixDecodeJobResult }
  | { type: "error"; jobId: string; message: string }
  | { type: "cancelled"; jobId: string };