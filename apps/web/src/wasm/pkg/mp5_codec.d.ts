/* tslint:disable */
/* eslint-disable */

export function decode_mp5c(data: Uint8Array): Int16Array;

export function decode_mp5h(data: Uint8Array, enhanced: boolean): Int16Array;

export function decode_mp5l(data: Uint8Array): Int16Array;

export function encode_mp5c(samples: Int16Array, channels: number, preset: number): Uint8Array;

export function encode_mp5h(samples: Int16Array, channels: number, preset: number): Uint8Array;

export function encode_mp5l(samples: Int16Array, channels: number): Uint8Array;

export function snr_db_wasm(original: Int16Array, decoded: Int16Array): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly decode_mp5c: (a: number, b: number) => [number, number, number, number];
    readonly decode_mp5h: (a: number, b: number, c: number) => [number, number, number, number];
    readonly decode_mp5l: (a: number, b: number) => [number, number, number, number];
    readonly encode_mp5c: (a: number, b: number, c: number, d: number) => [number, number];
    readonly encode_mp5h: (a: number, b: number, c: number, d: number) => [number, number];
    readonly encode_mp5l: (a: number, b: number, c: number) => [number, number];
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
