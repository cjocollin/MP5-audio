import type { Mp5File } from "./types.js";
import { decodeFing, type FingPayload } from "./fing.js";
import { decodeHash, type HashPayload, type ChunkHashEntry } from "./hash.js";

export type IntegrityCheckStatus =
  | "verified"
  | "mismatch"
  | "missing"
  | "unsupported"
  | "partial";

export interface IntegrityCheckResult {
  status: IntegrityCheckStatus;
  hasFingerprint: boolean;
  hasHashChunk: boolean;
  fileHash?: { expected?: string; actual?: string; ok: boolean | null };
  pcmHash?: { expected?: string; actual?: string; ok: boolean | null };
  audiHash?: { expected?: string; actual?: string; ok: boolean | null };
  metaHash?: { expected?: string; actual?: string; ok: boolean | null };
  chunkChecks: { fourcc: string; ok: boolean | null; expected?: string; actual?: string }[];
  duplicateIdentityKey?: string;
  message: string;
}

export function getFingFromParsed(parsed: Mp5File): FingPayload | null {
  try {
    return decodeFing(parsed.optional.get("FING"));
  } catch {
    return null;
  }
}

export function getHashFromParsed(parsed: Mp5File): HashPayload | null {
  try {
    return decodeHash(parsed.optional.get("HASH"));
  } catch {
    return null;
  }
}

/** Compare expected SHA-256 hex to actual; null ok = not checked. */
export function compareSha256(
  expected: string | undefined,
  actual: string | undefined,
): boolean | null {
  if (!expected) return null;
  if (!actual) return null;
  return expected.toLowerCase() === actual.toLowerCase();
}

export function summarizeIntegrity(
  checks: { ok: boolean | null }[],
  hasAnyExpected: boolean,
): IntegrityCheckStatus {
  if (!hasAnyExpected) return "missing";
  const evaluated = checks.filter((c) => c.ok !== null);
  if (!evaluated.length) return "unsupported";
  if (evaluated.every((c) => c.ok === true)) return "verified";
  if (evaluated.some((c) => c.ok === false)) return "mismatch";
  return "partial";
}

export function buildIntegrityResult(params: {
  fing: FingPayload | null;
  hash: HashPayload | null;
  fileHashOk: boolean | null;
  pcmHashOk: boolean | null;
  audiHashOk: boolean | null;
  metaHashOk: boolean | null;
  chunkChecks: IntegrityCheckResult["chunkChecks"];
}): IntegrityCheckResult {
  const { fing, hash } = params;
  const hasFingerprint = !!fing;
  const hasHashChunk = !!hash;
  const checks = [
    { ok: params.fileHashOk },
    { ok: params.pcmHashOk },
    { ok: params.audiHashOk },
    { ok: params.metaHashOk },
    ...params.chunkChecks.map((c) => ({ ok: c.ok })),
  ];
  const hasAnyExpected = !!(
    fing?.fileHash ||
    fing?.pcmHash ||
    fing?.audiHash ||
    fing?.metaHash ||
    hash?.fileSha256 ||
    hash?.chunks?.length
  );
  const status = summarizeIntegrity(checks, hasAnyExpected);
  let message = "No fingerprint or integrity metadata.";
  if (status === "verified") {
    message = "Integrity checks passed (local technical verification only).";
  } else if (status === "mismatch") {
    message = "One or more integrity hashes do not match — file may be modified or corrupted.";
  } else if (status === "partial") {
    message = "Some integrity checks passed; others were not verified.";
  } else if (status === "unsupported") {
    message = "Fingerprint present but could not verify all fields without re-decoding audio.";
  }
  return {
    status,
    hasFingerprint,
    hasHashChunk,
    fileHash: fing?.fileHash
      ? {
          expected: fing.fileHash,
          actual: undefined,
          ok: params.fileHashOk,
        }
      : hash?.fileSha256
        ? { expected: hash.fileSha256, actual: undefined, ok: params.fileHashOk }
        : undefined,
    pcmHash: fing?.pcmHash
      ? { expected: fing.pcmHash, actual: undefined, ok: params.pcmHashOk }
      : undefined,
    audiHash: fing?.audiHash
      ? { expected: fing.audiHash, actual: undefined, ok: params.audiHashOk }
      : undefined,
    metaHash: fing?.metaHash
      ? { expected: fing.metaHash, actual: undefined, ok: params.metaHashOk }
      : undefined,
    chunkChecks: params.chunkChecks,
    duplicateIdentityKey: fing ? undefined : undefined,
    message,
  };
}

export function expectedChunkHashes(hash: HashPayload | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of hash?.chunks ?? []) {
    m.set(e.fourcc, e.sha256);
  }
  return m;
}

export function mergeChunkCheck(
  entries: ChunkHashEntry[],
  actualByFourcc: Map<string, string>,
): IntegrityCheckResult["chunkChecks"] {
  return entries.map((e) => {
    const actual = actualByFourcc.get(e.fourcc);
    return {
      fourcc: e.fourcc,
      expected: e.sha256,
      actual,
      ok: compareSha256(e.sha256, actual),
    };
  });
}
