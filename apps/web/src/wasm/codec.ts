import wasmUrl from "./pkg/mp5_codec_bg.wasm?url";
import init, {
  Mp5lStreamDecoder,
  decode_mp5c,
  decode_mp5c_vnext,
  decode_mp5c3,
  decode_mp5h,
  decode_mp5l,
  encode_mp5c,
  encode_mp5c_vnext,
  encode_mp5c_vnext_at,
  encode_mp5c_vnext_protect,
  encode_mp5c_vnext_mdct,
  encode_mp5c3,
  encode_mp5h,
  encode_mp5h_min,
  encode_mp5l,
  encode_mp5l_v4,
  snr_db_wasm,
} from "./pkg/mp5_codec.js";
import * as wasmPkg from "./pkg/mp5_codec.js";

export { Mp5lStreamDecoder };

export type CodecModule = {
  encode_mp5l: typeof encode_mp5l;
  encode_mp5l_v4: typeof encode_mp5l_v4;
  decode_mp5l: typeof decode_mp5l;
  encode_mp5c: typeof encode_mp5c;
  decode_mp5c: typeof decode_mp5c;
  encode_mp5c_vnext: typeof encode_mp5c_vnext;
  encode_mp5c_vnext_at: typeof encode_mp5c_vnext_at;
  encode_mp5c_vnext_protect: typeof encode_mp5c_vnext_protect;
  encode_mp5c_vnext_mdct: typeof encode_mp5c_vnext_mdct;
  decode_mp5c_vnext: typeof decode_mp5c_vnext;
  encode_mp5c3: typeof encode_mp5c3;
  decode_mp5c3: typeof decode_mp5c3;
  encode_mp5h: typeof encode_mp5h;
  encode_mp5h_min: typeof encode_mp5h_min;
  decode_mp5h: typeof decode_mp5h;
  snr_db_wasm: typeof snr_db_wasm;
  /** Present after `pnpm wasm:build` with progressive/frame APIs. */
  Mp5lV4StreamEncoder?: new (
    samples: Int16Array,
    channels: number,
  ) => {
    free(): void;
    frameCount(): number;
    framesDone(): number;
    encodeNextFrame(): boolean;
    finish(): Uint8Array;
  };
  plan_mp5l_v4_boundaries?: (samples: Int16Array, channels: number) => Uint32Array;
  encode_mp5l_v4_frame?: (
    samples: Int16Array,
    channels: number,
    start: number,
    end: number,
  ) => Uint8Array;
  assemble_mp5l_v4?: (
    channels: number,
    sampleOffsets: Uint32Array,
    framesConcat: Uint8Array,
    frameLengths: Uint32Array,
  ) => Uint8Array;
};

export type CodecLoadState = "idle" | "loading" | "ready" | "unavailable";

let mod: CodecModule | null = null;
let initPromise: Promise<CodecModule> | null = null;
let loadState: CodecLoadState = "idle";

/** True when using PCM passthrough fallback (run `pnpm wasm:build` for real codecs) */
export let usingWasmFallback = false;

export function getCodecLoadState(): CodecLoadState {
  return loadState;
}

/** MP5-C/L/H encoding is unavailable (WASM not loaded). */
export function isCodecUnavailable(): boolean {
  return loadState === "unavailable";
}

export function isWasmCodecReady(): boolean {
  return loadState === "ready";
}

async function tryLoadWasmModule(): Promise<CodecModule | null> {
  const inWindow = typeof window !== "undefined";
  const inWorker =
    typeof self !== "undefined" &&
    typeof (self as { importScripts?: unknown }).importScripts !== "undefined";
  if (!inWindow && !inWorker) return null;
  try {
    await init({ module_or_path: wasmUrl });
    const pkg = wasmPkg as CodecModule & typeof wasmPkg;
    return {
      encode_mp5l,
      encode_mp5l_v4,
      decode_mp5l,
      encode_mp5c,
      decode_mp5c,
      encode_mp5c_vnext,
      encode_mp5c_vnext_at,
      encode_mp5c_vnext_protect,
      encode_mp5c_vnext_mdct,
      decode_mp5c_vnext,
      encode_mp5c3,
      decode_mp5c3,
      encode_mp5h,
      encode_mp5h_min,
      decode_mp5h,
      snr_db_wasm,
      Mp5lV4StreamEncoder: pkg.Mp5lV4StreamEncoder,
      plan_mp5l_v4_boundaries: pkg.plan_mp5l_v4_boundaries,
      encode_mp5l_v4_frame: pkg.encode_mp5l_v4_frame,
      assemble_mp5l_v4: pkg.assemble_mp5l_v4,
    };
  } catch (err) {
    console.warn("MP5 WASM codec failed to load:", err);
    return null;
  }
}

export async function getCodec(): Promise<CodecModule> {
  if (mod) return mod;
  if (!initPromise) {
    loadState = "loading";
    initPromise = (async () => {
      try {
        const wasm = await tryLoadWasmModule();
        if (wasm) {
          mod = wasm;
          usingWasmFallback = false;
          loadState = "ready";
          return wasm;
        }
      } catch {
        /* fall through to PCM fallback */
      }
      usingWasmFallback = true;
      loadState = "unavailable";
      mod = createJsFallback();
      return mod;
    })();
  }
  return initPromise;
}

function createJsFallback(): CodecModule {
  const passthrough = (samples: Int16Array) =>
    new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);

  // NEVER reinterpret a compressed bitstream as raw PCM — that plays full-scale
  // noise (a hearing hazard). Without WASM, compressed codecs cannot be decoded;
  // throw a clear error so the UI surfaces "decode failed" instead of noise.
  const decodeUnavailable = (): never => {
    throw new Error(
      "MP5 codec (WASM) unavailable — cannot decode compressed audio in this browser/session. Reload the page, or use a PCM file.",
    );
  };

  return {
    encode_mp5l: passthrough,
    encode_mp5l_v4: passthrough,
    decode_mp5l: decodeUnavailable,
    encode_mp5c: passthrough,
    decode_mp5c: decodeUnavailable,
    encode_mp5c_vnext: passthrough,
    encode_mp5c_vnext_at: (s) => passthrough(s),
    encode_mp5c_vnext_protect: (s) => passthrough(s),
    encode_mp5c_vnext_mdct: passthrough,
    decode_mp5c_vnext: decodeUnavailable,
    encode_mp5c3: passthrough,
    decode_mp5c3: decodeUnavailable,
    encode_mp5h: passthrough,
    encode_mp5h_min: passthrough,
    decode_mp5h: decodeUnavailable,
    snr_db_wasm: () => 0,
  };
}

export const CodecPreset = { Low: 0, Standard: 1, High: 2, Extreme: 3 } as const;
