import { CodecId, loadAudiFrames, parseMp5, type Mp5File } from "@mp5/container";
import { getCodec } from "../wasm/codec";
import { mp5lBitstreamVersion, mp5lVersionLabel } from "../lib/codecDisplay";
import { updateIngestDiagnostics } from "../lib/ingest/ingestDiagnostics";

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
        `${codecName} decode failed. This file may use an unsupported bitstream version — re-export as MP5-L v3 with the current converter.`,
      );
    }
    throw new Error(`${codecName} decode failed: ${msg}`);
  }
}

export type DecodePath =
  | "PCM (container passthrough)"
  | "MP5-L WASM v3 decode (lossless)"
  | "MP5-L WASM v2 decode (legacy raw blocks)"
  | "MP5-L WASM decode"
  | "MP5-C WASM v5.1 decode (experimental)"
  | "MP5-C WASM v5 decode (legacy)"
  | "MP5-C WASM v4 decode (legacy)"
  | "MP5-C WASM v3 decode (legacy)"
  | "MP5-C WASM v2 decode (legacy)"
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

function mp5lDecodePath(frameData: Uint8Array): DecodePath {
  const ver = mp5lBitstreamVersion(frameData);
  if (ver === 3) return "MP5-L WASM v3 decode (lossless)";
  if (ver === 2) return "MP5-L WASM v2 decode (legacy raw blocks)";
  return `MP5-L WASM decode (${mp5lVersionLabel(ver)})` as DecodePath;
}

/**
 * Decode full mix to PCM. Uses pre-parsed file; lazy-indexed files load AUDI on demand.
 */
export async function decodeMp5ToPcm(
  buffer: ArrayBuffer | undefined,
  preParsed?: Mp5File,
): Promise<DecodeResult> {
  const parsed = preParsed ?? (buffer ? parseMp5(buffer) : undefined);
  if (!parsed) throw new Error("Missing MP5 file data");
  if (!parsed.head) throw new Error("Missing HEAD chunk");

  const audioFrames = await loadAudiFrames(parsed);
  const frameData = audioFrames[0]?.data;
  if (!frameData) throw new Error("No audio frames");

  if (parsed.lazy) {
    updateIngestDiagnostics({
      audiLoaded: true,
      loadedBinaryMb:
        parsed.lazy.loadedPayloadBytes / (1024 * 1024) +
        frameData.byteLength / (1024 * 1024),
    });
  }

  const codec = await getCodec();
  const ch = parsed.head.channels;
  let samples: Int16Array;
  let decodePath: DecodePath;
  let mp5h: Mp5hDecodeInfo | undefined;
  let mp5l: Mp5lDecodeInfo | undefined;

  switch (parsed.head.codecId) {
    case CodecId.MP5L:
      decodePath = mp5lDecodePath(frameData);
      mp5l = { bitstreamVersion: mp5lBitstreamVersion(frameData) };
      samples = decodeWasm(() => codec.decode_mp5l(frameData), "MP5-L");
      break;
    case CodecId.MP5C:
      decodePath = mp5cDecodePath(frameData);
      samples = decodeWasm(() => codec.decode_mp5c(frameData), "MP5-C");
      break;
    case CodecId.MP5H: {
      const corr = parsed.corr[0]?.data;
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
    case CodecId.PCM:
      decodePath = "PCM (container passthrough)";
      samples = new Int16Array(
        frameData.buffer,
        frameData.byteOffset,
        frameData.byteLength / 2,
      );
      break;
    default:
      throw new Error(
        `Unsupported codec id ${parsed.head.codecId}. Re-export with MP5-L v3 (recommended) or PCM.`,
      );
  }

  return {
    samples,
    sampleRate: parsed.head.sampleRate,
    channels: ch,
    parsed,
    decodePath,
    mp5h,
    mp5l,
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
