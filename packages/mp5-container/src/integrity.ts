import type { Mp5File } from "./types.js";
import { decodeFing, type FingPayload } from "./fing.js";
import { decodeHash, type HashPayload, type ChunkHashEntry } from "./hash.js";

export type IntegrityCheckStatus =
  | "verified"
  | "audio_verified"
  | "mismatch"
  | "missing"
  | "unsupported"
  | "partial"
  | "pending";

export interface IntegrityCheckResult {
  status: IntegrityCheckStatus;
  hasFingerprint: boolean;
  hasHashChunk: boolean;
  /** Whole-file hash mismatch is expected when FING/HASH were embedded after hashing. */
  fileHashInformational?: boolean;
  fileHash?: {
    expected?: string;
    actual?: string;
    ok: boolean | null;
    informational?: boolean;
  };
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

/** True when only whole-file hash fails but audio (and non-HASH chunks) verify. */
export function isInformationalFileHashMismatch(params: {
  fileHashOk: boolean | null;
  pcmHashOk: boolean | null;
  audiHashOk: boolean | null;
  chunkChecks: IntegrityCheckResult["chunkChecks"];
}): boolean {
  if (params.fileHashOk !== false) return false;
  if (params.audiHashOk !== true) return false;
  if (params.pcmHashOk === false) return false;
  const chunkFail = params.chunkChecks.some(
    (c) => c.ok === false && c.fourcc !== "HASH" && c.fourcc !== "FING",
  );
  return !chunkFail;
}

export function resolveIntegrityStatus(params: {
  fileHashOk: boolean | null;
  pcmHashOk: boolean | null;
  audiHashOk: boolean | null;
  metaHashOk: boolean | null;
  chunkChecks: IntegrityCheckResult["chunkChecks"];
  hasAnyExpected: boolean;
}): {
  status: IntegrityCheckStatus;
  message: string;
  fileHashInformational: boolean;
} {
  if (!params.hasAnyExpected) {
    return {
      status: "missing",
      message: "No fingerprint or integrity metadata.",
      fileHashInformational: false,
    };
  }

  const audioMismatch = params.pcmHashOk === false || params.audiHashOk === false;
  const chunkMismatch = params.chunkChecks.some((c) => c.ok === false);
  const fileHashInformational = isInformationalFileHashMismatch(params);

  if (audioMismatch) {
    return {
      status: "mismatch",
      message:
        "Audio payload hash mismatch — decoded PCM or AUDI does not match embedded fingerprint.",
      fileHashInformational: false,
    };
  }

  if (chunkMismatch) {
    return {
      status: "mismatch",
      message: "One or more chunk integrity hashes do not match.",
      fileHashInformational: false,
    };
  }

  const audioVerified =
    params.audiHashOk === true && params.pcmHashOk !== false && !chunkMismatch;

  if (audioVerified && fileHashInformational) {
    return {
      status: "audio_verified",
      message:
        "Audio verified (PCM and AUDI match). Whole-file hash is informational only — it was computed before FING/HASH were embedded, so the final file bytes differ. Not DRM or legal proof.",
      fileHashInformational: true,
    };
  }

  const strictChecks = [
    { ok: params.fileHashOk },
    { ok: params.pcmHashOk },
    { ok: params.audiHashOk },
    { ok: params.metaHashOk },
    ...params.chunkChecks.map((c) => ({ ok: c.ok })),
  ];
  const status = summarizeIntegrity(strictChecks, params.hasAnyExpected);

  if (status === "verified") {
    return {
      status: "verified",
      message: "Integrity checks passed (local technical verification only).",
      fileHashInformational: false,
    };
  }
  if (status === "mismatch") {
    return {
      status: "mismatch",
      message: "One or more integrity hashes do not match.",
      fileHashInformational: false,
    };
  }
  if (status === "unsupported") {
    return {
      status: "unsupported",
      message: "Fingerprint present but could not verify all fields without re-decoding audio.",
      fileHashInformational: false,
    };
  }
  if (audioVerified) {
    return {
      status: "audio_verified",
      message: "Audio verified. Some optional integrity fields were not checked.",
      fileHashInformational: false,
    };
  }
  return {
    status: "partial",
    message: "Some integrity checks passed; others were not verified.",
    fileHashInformational: false,
  };
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
  const hasAnyExpected = !!(
    fing?.fileHash ||
    fing?.pcmHash ||
    fing?.audiHash ||
    fing?.metaHash ||
    hash?.fileSha256 ||
    hash?.chunks?.length
  );
  const resolved = resolveIntegrityStatus({
    fileHashOk: params.fileHashOk,
    pcmHashOk: params.pcmHashOk,
    audiHashOk: params.audiHashOk,
    metaHashOk: params.metaHashOk,
    chunkChecks: params.chunkChecks,
    hasAnyExpected,
  });
  return {
    status: resolved.status,
    hasFingerprint,
    hasHashChunk,
    fileHashInformational: resolved.fileHashInformational,
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
    message: resolved.message,
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
