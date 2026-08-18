import {
  CodecId,
  loadAudiFrames,
  loadCorrFrames,
  parseMp5,
  type Mp5File,
} from "@mp5/container";
import { getCodec, Mp5lStreamDecoder } from "../wasm/codec";
import { mp5lBitstreamVersion, mp5lVersionLabel } from "../lib/codecDisplay";
import { updateIngestDiagnostics } from "../lib/ingest/ingestDiagnostics";
import { alignedInt16 } from "../lib/pcm/alignedInt16";

function decodeWasm(
  fn: () => Int16Array,
  codecName: string,
): Int16Array {
  try {
    return fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("RuntimeError") || msg.includes("unreachable")) {
      throw new Error(
        `${codecName} decode failed. This file may use an unsupported bitstream version — re-export as MP5-L v4 with the current converter.`,
      );
    }
    throw new Error(`${codecName} decode failed: ${msg}`);
  }
}

export type DecodePath =
  | "PCM (container passthrough)"
  | "MP5-L WASM v3 decode (lossless)"
  | "MP5-L WASM v4 decode (lossless)"
  | "MP5-L WASM v4 windowed stream decode"
  | "MP5-L WASM v4 progressive first-window decode"
  | "MP5-L WASM v2 decode (legacy raw blocks)"
  | "MP5-L WASM decode"
  | "MP5-C WASM v5.1 decode (experimental)"
  | "MP5-C WASM v5 decode (legacy)"
  | "MP5-C WASM v4 decode (legacy)"
  | "MP5-C WASM v3 decode (legacy)"
  | "MP5-C WASM v2 decode (legacy)"
  | "MP5-C2 WASM decode (lossless · bit-exact)"
  | "MP5-C v6 WASM decode (lossy · experimental · protect islands bit-exact)"
  | "MP5-H WASM enhanced decode (CORR applied)"
  | "MP5-H WASM base-only decode (CORR missing)";

export type Mp5hDecodeInfo = {
  hasCorr: boolean;
  enhancedActive: boolean;
};

export type Mp5lDecodeInfo = {
  bitstreamVersion: number | null;
};

export type DecodeResult = {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  parsed: Mp5File;
  decodePath: DecodePath;
  mp5h?: Mp5hDecodeInfo;
  mp5l?: Mp5lDecodeInfo;
  /** Planar float PCM when built off-thread (skips main-thread Int16 loops). */
  floatChannels?: Float32Array[];
};

export type DecodeMp5Options = {
  /**
   * Sample index to seek to before decode (Mp5lStreamDecoder.seek_frame).
   * Prefer omit for full-file production decode (codec.decode_mp5l).
   */
  windowStartSample?: number;
  /** @deprecated Use windowStartSample — historically misnamed as frame index. */
  windowStartFrame?: number;
  /** Exclusive end sample (channel-frames). With start=0, yields first N samples. */
  windowEndSample?: number;
  /**
   * Build planar Float32 channels in the worker (default true). Set false when
   * the caller only needs `samples` — e.g. the neighbor prefetch, which caches
   * Int16 and never uploads an AudioBuffer. Floats are 2x the size of `samples`,
   * so skipping them avoids allocating + transferring them for nothing.
   */
  wantFloats?: boolean;
};

function mp5cDecodePath(frameData: Uint8Array): DecodePath {
  if (frameData.length >= 2 && frameData[0] === 0x43) {
    const ver = frameData[1];
    if (ver === 2) return "MP5-C WASM v2 decode (legacy)";
    if (ver === 3) return "MP5-C WASM v3 decode (legacy)";
    if (ver === 4) return "MP5-C WASM v4 decode (legacy)";
    if (ver === 5) return "MP5-C WASM v5 decode (legacy)";
    if (ver === 6) return "MP5-C WASM v5.1 decode (experimental)";
  }
  return "MP5-C WASM v5.1 decode (experimental)";
}

function mp5lDecodePath(
  frameData: Uint8Array,
  mode: "full" | "windowed" | "progressive",
): DecodePath {
  const ver = mp5lBitstreamVersion(frameData);
  if (mode === "progressive" && ver === 4) {
    return "MP5-L WASM v4 progressive first-window decode";
  }
  if (mode === "windowed" && ver === 4) return "MP5-L WASM v4 windowed stream decode";
  if (ver === 4) return "MP5-L WASM v4 decode (lossless)";
  if (ver === 3) return "MP5-L WASM v3 decode (lossless)";
  if (ver === 2) return "MP5-L WASM v2 decode (legacy raw blocks)";
  return `MP5-L WASM decode (${mp5lVersionLabel(ver)})` as DecodePath;
}

/**
 * Stream path for L-v4. Always free() the decoder — full-file decode should use
 * codec.decode_mp5l instead.
 */
function decodeMp5lWindowed(
  frameData: Uint8Array,
  startSample: number,
  endSampleExclusive?: number,
): Int16Array {
  const decoder = new Mp5lStreamDecoder(frameData);
  try {
    if (startSample > 0) {
      decoder.seek_frame(startSample);
    }
    if (endSampleExclusive != null && Number.isFinite(endSampleExclusive)) {
      const maxSamples = Math.max(0, endSampleExclusive - startSample);
      return decoder.push_until(new Uint8Array(0), maxSamples);
    }
    return decoder.push(new Uint8Array(0));
  } finally {
    decoder.free();
  }
}

/** Decode from HEAD + first AUDI frame (and optional CORR). No container parse. */
export type DecodeFrameInput = {
  codecId: number;
  channels: number;
  sampleRate: number;
  frameData: Uint8Array;
  corrData?: Uint8Array;
  windowStartSample?: number;
  windowStartFrame?: number;
  windowEndSample?: number;
};

export type DecodeFrameResult = {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  decodePath: DecodePath;
  mp5h?: Mp5hDecodeInfo;
  mp5l?: Mp5lDecodeInfo;
};

/**
 * WASM decode only — used by the mix worker after main has loaded AUDI frames.
 */
export async function decodeFrameDataToPcm(
  input: DecodeFrameInput,
): Promise<DecodeFrameResult> {
  const { codecId, channels, sampleRate, frameData } = input;
  const codec = await getCodec();
  let samples: Int16Array;
  let decodePath: DecodePath;
  let mp5h: Mp5hDecodeInfo | undefined;
  let mp5l: Mp5lDecodeInfo | undefined;
  const startSample =
    input.windowStartSample ?? input.windowStartFrame ?? undefined;
  const endSample = input.windowEndSample;
  const hasStart = startSample != null && Number.isFinite(startSample);
  const hasEnd = endSample != null && Number.isFinite(endSample);
  const streamMode: "full" | "windowed" | "progressive" = hasEnd
    ? "progressive"
    : hasStart
      ? "windowed"
      : "full";

  switch (codecId) {
    case CodecId.MP5L:
      decodePath = mp5lDecodePath(frameData, streamMode);
      mp5l = { bitstreamVersion: mp5lBitstreamVersion(frameData) };
      samples = decodeWasm(() => {
        if (streamMode !== "full") {
          return decodeMp5lWindowed(
            frameData,
            hasStart ? startSample! : 0,
            hasEnd ? endSample : undefined,
          );
        }
        return codec.decode_mp5l(frameData);
      }, "MP5-L");
      break;
    case CodecId.MP5C:
      decodePath = mp5cDecodePath(frameData);
      samples = decodeWasm(() => codec.decode_mp5c(frameData), "MP5-C");
      break;
    case CodecId.MP5C2:
      decodePath = "MP5-C2 WASM decode (lossless · bit-exact)";
      samples = decodeWasm(() => codec.decode_mp5c_vnext(frameData), "MP5-C2");
      break;
    case CodecId.MP5C6:
      decodePath = "MP5-C v6 WASM decode (lossy · experimental · protect islands bit-exact)";
      samples = decodeWasm(() => codec.decode_mp5c6(frameData), "MP5-C v6");
      break;
    case CodecId.MP5H: {
      const corr = input.corrData;
      const hasCorr = !!(corr && corr.length > 0);
      const enhancedActive = hasCorr;
      mp5h = { hasCorr, enhancedActive };
      decodePath = enhancedActive
        ? "MP5-H WASM enhanced decode (CORR applied)"
        : "MP5-H WASM base-only decode (CORR missing)";
      const wrapped =
        hasCorr && corr ? wrapMp5h(frameData, corr) : frameData;
      samples = decodeWasm(
        () => codec.decode_mp5h(wrapped, enhancedActive),
        "MP5-H",
      );
      break;
    }
    case CodecId.PCM: {
      decodePath = "PCM (container passthrough)";
      const all = alignedInt16(frameData);
      if (hasEnd || hasStart) {
        const start = (hasStart ? startSample! : 0) * channels;
        const end = hasEnd
          ? Math.min(all.length, endSample! * channels)
          : all.length;
        samples = all.subarray(start, Math.max(start, end));
      } else {
        samples = all;
      }
      break;
    }
    default:
      throw new Error(
        `Unsupported codec id ${codecId}. Re-export with MP5-L v4 (recommended) or PCM.`,
      );
  }

  return {
    samples,
    sampleRate,
    channels,
    decodePath,
    mp5h,
    mp5l,
  };
}

/**
 * Decode full mix to PCM. Uses pre-parsed file; lazy-indexed files load AUDI on demand.
 * Production path uses codec.decode_mp5l for MP5-L (including v4). Pass
 * windowStartSample / windowEndSample for progressive first-audible windows.
 */
export async function decodeMp5ToPcm(
  buffer: ArrayBuffer | undefined,
  preParsed?: Mp5File,
  opts?: DecodeMp5Options,
): Promise<DecodeResult> {
  const parsed = preParsed ?? (buffer ? parseMp5(buffer) : undefined);
  if (!parsed) throw new Error("Missing MP5 file data");
  if (!parsed.head) throw new Error("Missing HEAD chunk");

  const audioFrames = await loadAudiFrames(parsed);
  const frameData = audioFrames[0]?.data;
  if (!frameData) throw new Error("No audio frames");

  // MP5-H enhancement (CORR) is skipped by the lazy index when it exceeds the
  // eager cap; load it before decode so >2MB files aren't silently base-only.
  if (parsed.head.codecId === CodecId.MP5H && parsed.lazy && !parsed.corr.length) {
    await loadCorrFrames(parsed);
  }

  if (parsed.lazy) {
    updateIngestDiagnostics({
      audiLoaded: true,
      loadedBinaryMb:
        parsed.lazy.loadedPayloadBytes / (1024 * 1024) +
        frameData.byteLength / (1024 * 1024),
    });
  }

  const decoded = await decodeFrameDataToPcm({
    codecId: parsed.head.codecId,
    channels: parsed.head.channels,
    sampleRate: parsed.head.sampleRate,
    frameData,
    corrData: parsed.corr[0]?.data,
    windowStartSample: opts?.windowStartSample ?? opts?.windowStartFrame,
    windowEndSample: opts?.windowEndSample,
  });

  return {
    ...decoded,
    parsed,
  };
}

function wrapMp5h(base: Uint8Array, corr: Uint8Array): Uint8Array {
  const out = new Uint8Array(6 + base.length + 4 + corr.length);
  out[0] = 0x48;
  out[1] = 0x01;
  new DataView(out.buffer).setUint32(2, base.length, true);
  out.set(base, 6);
  const o = 6 + base.length;
  new DataView(out.buffer).setUint32(o, corr.length, true);
  out.set(corr, o + 4);
  return out;
}
