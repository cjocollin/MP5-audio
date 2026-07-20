/* tslint:disable */
/* eslint-disable */

export class Mp5lStreamDecoder {
    free(): void;
    [Symbol.dispose](): void;
    constructor(data_prefix: Uint8Array);
    push(data: Uint8Array): Int16Array;
    seek_frame(sample_index: number): void;
}

export function decode_mp5c(data: Uint8Array): Int16Array;

export function decode_mp5c3(data: Uint8Array): Int16Array;

export function decode_mp5c_vnext(data: Uint8Array): Int16Array;

export function decode_mp5h(data: Uint8Array, enhanced: boolean): Int16Array;

export function decode_mp5l(data: Uint8Array): Int16Array;

export function encode_mp5c(samples: Int16Array, channels: number, preset: number): Uint8Array;

/**
 * MP5-C3 MDCT lab spike (experimental). Distinct magic 0x4D 0x33. Not a public
 * stream and not written into normal `.mp5` exports — audio quality lab only.
 */
export function encode_mp5c3(samples: Int16Array, channels: number, preset: number): Uint8Array;

/**
 * MP5-C2 / vNext encode (protect 1.5, signal-relative loud path). Assumes 44.1 kHz.
 * Prefer [`encode_mp5c_vnext_at`] when sample rate is known.
 */
export function encode_mp5c_vnext(samples: Int16Array, channels: number, preset: number): Uint8Array;

/**
 * MP5-C2 encode with explicit sample rate (Hz) for HF / protect timing.
 */
export function encode_mp5c_vnext_at(samples: Int16Array, channels: number, preset: number, sample_rate: number): Uint8Array;

/**
 * Lab/test: force legacy TAG_LOSSY loud path (classic MP5-C) for metric A/B.
 */
export function encode_mp5c_vnext_legacy_loud(samples: Int16Array, channels: number, preset: number): Uint8Array;

/**
 * MP5-C2 with MDCT loud path (lab-only). Quiet/fragile/tail stay MP5-L.
 */
export function encode_mp5c_vnext_mdct(samples: Int16Array, channels: number, preset: number): Uint8Array;

/**
 * Lab: encode vNext with widened quiet/tail protection (`protect_scale` ≥ 1.0).
 */
export function encode_mp5c_vnext_protect(samples: Int16Array, channels: number, preset: number, protect_scale: number): Uint8Array;

/**
 * Lab: same as protect encode but with sample rate.
 */
export function encode_mp5c_vnext_protect_at(samples: Int16Array, channels: number, preset: number, protect_scale: number, sample_rate: number): Uint8Array;

export function encode_mp5h(samples: Int16Array, channels: number, preset: number): Uint8Array;

/**
 * Encode MP5-H trying presets ≥ `min_preset`; keep smallest bit-exact base+CORR.
 */
export function encode_mp5h_min(samples: Int16Array, channels: number, min_preset: number): Uint8Array;

export function encode_mp5l(samples: Int16Array, channels: number): Uint8Array;

/**
 * Experimental MP5-L v4 framing with seek table, stored QLP, and width-safe stereo.
 */
export function encode_mp5l_v4(samples: Int16Array, channels: number): Uint8Array;

export function snr_db_wasm(original: Int16Array, decoded: Int16Array): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_mp5lstreamdecoder_free: (a: number, b: number) => void;
    readonly decode_mp5c: (a: number, b: number) => [number, number, number, number];
    readonly decode_mp5c3: (a: number, b: number) => [number, number, number, number];
    readonly decode_mp5c_vnext: (a: number, b: number) => [number, number, number, number];
    readonly decode_mp5h: (a: number, b: number, c: number) => [number, number, number, number];
    readonly decode_mp5l: (a: number, b: number) => [number, number, number, number];
    readonly encode_mp5c: (a: number, b: number, c: number, d: number) => [number, number];
    readonly encode_mp5c3: (a: number, b: number, c: number, d: number) => [number, number];
    readonly encode_mp5c_vnext: (a: number, b: number, c: number, d: number) => [number, number];
    readonly encode_mp5c_vnext_at: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly encode_mp5c_vnext_legacy_loud: (a: number, b: number, c: number, d: number) => [number, number];
    readonly encode_mp5c_vnext_mdct: (a: number, b: number, c: number, d: number) => [number, number];
    readonly encode_mp5c_vnext_protect: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly encode_mp5c_vnext_protect_at: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly encode_mp5h: (a: number, b: number, c: number, d: number) => [number, number];
    readonly encode_mp5h_min: (a: number, b: number, c: number, d: number) => [number, number];
    readonly encode_mp5l: (a: number, b: number, c: number) => [number, number];
    readonly encode_mp5l_v4: (a: number, b: number, c: number) => [number, number];
    readonly mp5lstreamdecoder_new: (a: number, b: number) => [number, number, number];
    readonly mp5lstreamdecoder_push: (a: number, b: number, c: number) => [number, number, number, number];
    readonly mp5lstreamdecoder_seek_frame: (a: number, b: number) => [number, number];
    readonly snr_db_wasm: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
