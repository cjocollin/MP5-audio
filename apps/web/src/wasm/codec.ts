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

export { Mp5lStreamDecoder };

type CodecModule = {
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

  const decodePassthrough = (data: Uint8Array) =>
    new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

  return {
    encode_mp5l: passthrough,
    encode_mp5l_v4: passthrough,
    decode_mp5l: decodePassthrough,
    encode_mp5c: passthrough,
    decode_mp5c: decodePassthrough,
    encode_mp5c_vnext: passthrough,
    encode_mp5c_vnext_at: (s) => passthrough(s),
    encode_mp5c_vnext_protect: (s) => passthrough(s),
    encode_mp5c_vnext_mdct: passthrough,
    decode_mp5c_vnext: decodePassthrough,
    encode_mp5c3: passthrough,
    decode_mp5c3: decodePassthrough,
    encode_mp5h: passthrough,
    encode_mp5h_min: passthrough,
    decode_mp5h: (d) => decodePassthrough(d),
    snr_db_wasm: () => 0,
  };
}

export const CodecPreset = { Low: 0, Standard: 1, High: 2, Extreme: 3 } as const;
