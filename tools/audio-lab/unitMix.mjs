// JS unit-mix tally + mandatory three-figure report (MP5C_NEXT_SPEC §4.4).
//
// TAG_MDCT must be its own category and NEVER folded into "protected".

/** Canonical tag names used in mix reports. */
export const TAG_NAMES = {
  0x4c: "lossless_L", // 'L' broadband-quiet protect
  0x42: "lossless_B", // 'B' band/tail protect
  0x46: "signal_relative_F", // 'F' C2 signal-relative (bit-exact when CORR present)
  0x43: "legacy_lossy_C", // 'C' legacy classic loud
  0x4d: "mdct_M", // 'M' lossy MDCT — own category, not protected
};

export const PROTECT_TAGS = new Set(["lossless_L", "lossless_B"]);
export const LOSSY_TAGS = new Set(["mdct_M", "legacy_lossy_C"]);

/**
 * Detect AUDI header layout.
 * - CodecId 5 (C2): magic 0x43 0x34, 10-byte header
 * - CodecId 6 (C6): magic 0x43 0x36, 28-byte header (spec); pre-freeze lab may still be 10-byte
 * - Standalone mp5c3: magic 0x4d 0x33 ('M','3')
 */
export function detectAudiLayout(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] === 0x43 && bytes[1] === 0x34) {
    return { kind: "c2", magic: "0x43 0x34", headerBytes: 10, codecId: 5 };
  }
  if (bytes[0] === 0x43 && bytes[1] === 0x36) {
    // Prefer 28-byte CodecId 6 header when stream looks long enough and
    // byte 2 is a plausible channel count (1 or 2).
    const ch = bytes[2];
    const headerBytes = bytes.length >= 28 && (ch === 1 || ch === 2) ? 28 : 10;
    return { kind: "c6", magic: "0x43 0x36", headerBytes, codecId: 6 };
  }
  if (bytes[0] === 0x4d && bytes[1] === 0x33) {
    return { kind: "mp5c3", magic: "0x4d 0x33", headerBytes: 10, codecId: null };
  }
  return null;
}

/**
 * Walk AUDI units: [tag u8][nFrames u32le][payloadLen u32le][payload].
 * Returns a UnitMix tally or null if magic unrecognized.
 */
export function walkUnitMixJs(bytes) {
  const layout = detectAudiLayout(bytes);
  if (!layout) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tally = emptyMix();
  tally.layout = layout;
  let pos = layout.headerBytes;
  // CodecId 6 units may append a 4-byte CRC after payload (spec §4.1).
  // Detect: if remaining after classic 9+len still has 4 bytes before next tag
  // or EOF, prefer CRC-aware walk when kind === 'c6' && headerBytes === 28.
  const crcTrail = layout.kind === "c6" && layout.headerBytes === 28;
  while (pos + 9 <= bytes.length) {
    const tagByte = bytes[pos];
    const tag = TAG_NAMES[tagByte] ?? `unknown_0x${tagByte.toString(16)}`;
    const n = view.getUint32(pos + 1, true);
    const len = view.getUint32(pos + 5, true);
    let next = pos + 9 + len;
    if (crcTrail && next + 4 <= bytes.length) {
      // Heuristic: if next byte looks like a known tag OR we are at end-4, consume CRC.
      const after = next + 4;
      const atEnd = after === bytes.length;
      const nextTag = after < bytes.length ? bytes[after] : 0;
      if (atEnd || TAG_NAMES[nextTag] != null || nextTag === 0x4c || nextTag === 0x42 || nextTag === 0x4d) {
        next = after;
      }
    }
    if (next > bytes.length) throw new Error("truncated AUDI unit while tallying");
    tally.units += 1;
    tally.totalFrames += n;
    tally.totalPayloadBytes += len;
    tally.unitsByTag[tag] = (tally.unitsByTag[tag] ?? 0) + 1;
    tally.framesByTag[tag] = (tally.framesByTag[tag] ?? 0) + n;
    tally.payloadBytesByTag[tag] = (tally.payloadBytesByTag[tag] ?? 0) + len;
    pos = next;
  }
  finalizeMix(tally);
  return tally;
}

export function emptyMix() {
  return {
    units: 0,
    totalFrames: 0,
    totalPayloadBytes: 0,
    unitsByTag: {},
    framesByTag: {},
    payloadBytesByTag: {},
  };
}

export function finalizeMix(tally) {
  const protectFrames =
    (tally.framesByTag.lossless_L ?? 0) + (tally.framesByTag.lossless_B ?? 0);
  const protectBytes =
    (tally.payloadBytesByTag.lossless_L ?? 0) +
    (tally.payloadBytesByTag.lossless_B ?? 0);
  const mdctFrames = tally.framesByTag.mdct_M ?? 0;
  const mdctBytes = tally.payloadBytesByTag.mdct_M ?? 0;
  const legacyLossyFrames = tally.framesByTag.legacy_lossy_C ?? 0;
  const legacyLossyBytes = tally.payloadBytesByTag.legacy_lossy_C ?? 0;
  // Coded-path = lossy units only (MDCT + legacy C). Protect excluded.
  const codedFrames = mdctFrames + legacyLossyFrames;
  const codedBytes = mdctBytes + legacyLossyBytes;

  tally.protectFrames = protectFrames;
  tally.protectBytes = protectBytes;
  tally.mdctFrames = mdctFrames;
  tally.mdctBytes = mdctBytes;
  tally.codedFrames = codedFrames;
  tally.codedBytes = codedBytes;
  tally.protectedSamplePct = tally.totalFrames
    ? (100 * protectFrames) / tally.totalFrames
    : 0;
  tally.protectedBytePct = tally.totalPayloadBytes
    ? (100 * protectBytes) / tally.totalPayloadBytes
    : 0;
  // MDCT is NEVER folded into protected — expose as its own pct for audits.
  tally.mdctSamplePct = tally.totalFrames
    ? (100 * mdctFrames) / tally.totalFrames
    : 0;
  tally.mdctBytePct = tally.totalPayloadBytes
    ? (100 * mdctBytes) / tally.totalPayloadBytes
    : 0;
  return tally;
}

export function mergeMix(total, mix) {
  if (!mix) return total;
  const acc = total ?? emptyMix();
  acc.units += mix.units;
  acc.totalFrames += mix.totalFrames;
  acc.totalPayloadBytes += mix.totalPayloadBytes;
  for (const key of ["unitsByTag", "framesByTag", "payloadBytesByTag"]) {
    for (const [tag, n] of Object.entries(mix[key])) {
      acc[key][tag] = (acc[key][tag] ?? 0) + n;
    }
  }
  return finalizeMix(acc);
}

/**
 * Mandatory three-figure report. A missing figure is a bug.
 *
 * (a) coded-path bitrate — bits in lossy units only / duration
 * (b) protected sample % and protected byte %
 * (c) total size (raw AUDI + optional container)
 */
export function threeFigureReport(mix, durationSec, sizes = {}) {
  if (!mix) {
    return {
      ok: false,
      error: "unit mix unavailable — cannot publish three-figure report",
    };
  }
  const dur = Number(durationSec);
  if (!(dur > 0)) {
    return { ok: false, error: "durationSec must be > 0 for coded-path bitrate" };
  }
  const codedPathBitrateKbps = (mix.codedBytes * 8) / dur / 1000;
  const report = {
    ok: true,
    // (a)
    codedPathBitrateKbps,
    codedPathBytes: mix.codedBytes,
    // (b)
    protectedSamplePct: mix.protectedSamplePct,
    protectedBytePct: mix.protectedBytePct,
    // (c)
    totalAudiBytes: sizes.audiBytes ?? mix.totalPayloadBytes + (mix.layout?.headerBytes ?? 0),
    totalFileBytes: sizes.fileBytes ?? null,
    // Disclosure (not a fourth "gate figure", but required for anti-laundering)
    mdctSamplePct: mix.mdctSamplePct,
    mdctBytePct: mix.mdctBytePct,
    mdctBytes: mix.mdctBytes,
    protectBytes: mix.protectBytes,
    unitMix: {
      units: mix.units,
      totalFrames: mix.totalFrames,
      totalPayloadBytes: mix.totalPayloadBytes,
      unitsByTag: { ...mix.unitsByTag },
      framesByTag: { ...mix.framesByTag },
      payloadBytesByTag: { ...mix.payloadBytesByTag },
    },
  };
  // Enforce contract: all three must be finite numbers (file size may be null if AUDI-only).
  if (
    !Number.isFinite(report.codedPathBitrateKbps) ||
    !Number.isFinite(report.protectedSamplePct) ||
    !Number.isFinite(report.protectedBytePct) ||
    !Number.isFinite(report.totalAudiBytes)
  ) {
    return { ok: false, error: "three-figure report incomplete (non-finite)", report };
  }
  return report;
}

/**
 * Compare two mixes field-by-field (Rust inspect vs JS walk).
 * Returns { equal, diffs }.
 */
export function mixParityDiff(a, b) {
  const diffs = [];
  if (!a || !b) {
    return { equal: false, diffs: ["one side missing"] };
  }
  for (const k of ["units", "totalFrames", "totalPayloadBytes"]) {
    if (a[k] !== b[k]) diffs.push(`${k}: ${a[k]} !== ${b[k]}`);
  }
  const tags = new Set([
    ...Object.keys(a.unitsByTag ?? {}),
    ...Object.keys(b.unitsByTag ?? {}),
    ...Object.keys(a.framesByTag ?? {}),
    ...Object.keys(b.framesByTag ?? {}),
    ...Object.keys(a.payloadBytesByTag ?? {}),
    ...Object.keys(b.payloadBytesByTag ?? {}),
  ]);
  for (const tag of tags) {
    for (const map of ["unitsByTag", "framesByTag", "payloadBytesByTag"]) {
      const av = a[map]?.[tag] ?? 0;
      const bv = b[map]?.[tag] ?? 0;
      if (av !== bv) diffs.push(`${map}.${tag}: ${av} !== ${bv}`);
    }
  }
  return { equal: diffs.length === 0, diffs };
}
