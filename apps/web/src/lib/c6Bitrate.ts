/**
 * Bitrate readout for MP5 files (pure JS, no WASM).
 *
 * For CodecId 6 the AUDI stream carries everything needed: sample rate, total
 * frames, ABR/CBR target, and the unit table, so coded-path kbps and protect
 * share are computed exactly. For every codec, the headline number is the
 * AUDI stream's bitrate (audio payload only — container/metadata excluded).
 */

export interface StreamBitrateInfo {
  /** AUDI stream bitrate (audio payload only) in kbps, or null if unknown. */
  totalKbps: number | null;
  /** CodecId 6 only: lossy-path kbps (protect islands excluded). */
  codedPathKbps?: number;
  /** CodecId 6 only: protect-island payload share (0-100). */
  protectedBytePct?: number;
  /** CodecId 6 only: ABR/CBR target from the header (0 = unconstrained). */
  targetKbps?: number;
}

const C6_MAGIC0 = 0x43;
const C6_MAGIC1 = 0x36;
const C6_HEADER_LEN = 28;
const UNIT_PREFIX = 9;
const UNIT_CRC = 4;
const TAG_LOSSLESS = 0x4c;
const TAG_BAND = 0x42;
const TAG_MDCT = 0x4d;

function u32le(b: Uint8Array, at: number): number {
  return (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
}

function u16le(b: Uint8Array, at: number): number {
  return b[at]! | (b[at + 1]! << 8);
}

/**
 * AUDI stream bitrate from payload bytes and a duration (seconds).
 * Returns null when the duration is not positive or known.
 */
export function audiKbps(audiBytes: number, durationSec: number | null | undefined): number | null {
  if (!durationSec || !(durationSec > 0) || audiBytes <= 0) return null;
  return (audiBytes * 8) / 1000 / durationSec;
}

/**
 * Parse a CodecId 6 AUDI stream for bitrate readout. Returns null when the
 * frame is not a C6 stream or is structurally truncated.
 */
export function c6BitrateInfo(audi: Uint8Array): StreamBitrateInfo | null {
  if (audi.length < C6_HEADER_LEN || audi[0] !== C6_MAGIC0 || audi[1] !== C6_MAGIC1) return null;
  const sampleRate = u32le(audi, 4);
  const totalFrames = u32le(audi, 8);
  const targetKbps = u16le(audi, 16);
  const durationSec = sampleRate > 0 ? totalFrames / sampleRate : 0;
  const totalKbps = audiKbps(audi.length, durationSec);

  let protectBytes = 0;
  let codedBytes = 0;
  let payloadBytes = 0;
  let pos = C6_HEADER_LEN;
  let ok = true;
  while (pos < audi.length) {
    if (pos + UNIT_PREFIX + UNIT_CRC > audi.length) {
      ok = false;
      break;
    }
    const tag = audi[pos]!;
    const len = u32le(audi, pos + 5);
    const end = pos + UNIT_PREFIX + len + UNIT_CRC;
    if (end > audi.length) {
      ok = false;
      break;
    }
    payloadBytes += len;
    if (tag === TAG_LOSSLESS || tag === TAG_BAND) protectBytes += len;
    else if (tag === TAG_MDCT) codedBytes += len;
    pos = end;
  }
  if (!ok) return { totalKbps, targetKbps };

  const info: StreamBitrateInfo = { totalKbps, targetKbps };
  if (durationSec > 0) {
    info.codedPathKbps = (codedBytes * 8) / 1000 / durationSec;
  }
  if (payloadBytes > 0) {
    info.protectedBytePct = (100 * protectBytes) / payloadBytes;
  }
  return info;
}

/** One-line bitrate label for badges: `332 kbps` or `ABR 320 · 332 kbps`. */
export function bitrateBadgeLabel(info: StreamBitrateInfo | null): string | null {
  if (!info || info.totalKbps == null) return null;
  const kbps = `${Math.round(info.totalKbps)} kbps`;
  if (info.targetKbps && info.targetKbps > 0) {
    return `ABR ${info.targetKbps} · ${kbps}`;
  }
  return kbps;
}

/** Detail line for the overview table (adds coded-path + protect share for C6). */
export function bitrateDetailLabel(info: StreamBitrateInfo | null): string | null {
  const base = bitrateBadgeLabel(info);
  if (!base || !info) return null;
  const parts: string[] = [base];
  if (info.codedPathKbps != null && info.protectedBytePct != null) {
    parts.push(
      `lossy path ${Math.round(info.codedPathKbps)} kbps · protect ${info.protectedBytePct.toFixed(1)}% of payload`,
    );
  }
  return parts.join(" — ");
}
