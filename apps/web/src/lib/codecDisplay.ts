import { CodecId, type HeadPayload, type Mp5File } from "@mp5/container";

const PRESET_NAMES = ["Low", "Standard", "High", "Extreme"] as const;

/** Detect MP5-L bitstream version from frame payload (`0x4c` magic). */
export function mp5lBitstreamVersion(frameData: Uint8Array): number | null {
  if (frameData.length < 2 || frameData[0] !== 0x4c) return null;
  return frameData[1];
}

export function mp5lVersionLabel(version: number | null): string {
  if (version === 2) return "v2 (legacy raw PCM blocks)";
  if (version === 3) return "v3 (LPC + delta + varint)";
  if (version == null) return "unknown";
  return `v${version}`;
}

export function codecLabel(codecId: number): string {
  switch (codecId) {
    case CodecId.MP5C:
      return "MP5-C (experimental / lab)";
    case CodecId.MP5L:
      return "MP5-L v3 (lossless · default)";
    case CodecId.MP5H:
      return "MP5-H (hybrid · not default)";
    case CodecId.PCM:
      return "PCM (reference / debug)";
    case CodecId.PASSTHROUGH:
      return "Passthrough";
    default:
      return `Unknown codec (${codecId})`;
  }
}

export function codecExportOptionLabel(codec: "mp5l" | "mp5h" | "mp5c" | "pcm"): string {
  switch (codec) {
    case "mp5l":
      return "MP5-L v3 (lossless · default export · bit-exact)";
    case "mp5h":
      return "MP5-H (hybrid: MP5-C base + CORR · large · not default)";
    case "mp5c":
      return "MP5-C (experimental / lab · may hiss · not for listening)";
    case "pcm":
      return "PCM (reference / debug · uncompressed)";
  }
}

export function presetLabel(presetId: number): string {
  const base = PRESET_NAMES[presetId] ?? `Preset ${presetId}`;
  if (presetId === 0) return `${base} (preview only)`;
  if (presetId === 1) return `${base} (smaller — hiss)`;
  if (presetId === 2) return `${base} (still lossy — hiss)`;
  if (presetId === 3) return `${base} (finest MP5-C — still may hiss)`;
  return base;
}

export function presetLabelForCodec(codecId: number, presetId: number): string {
  if (codecId === CodecId.MP5H) {
    const base = PRESET_NAMES[presetId] ?? `Preset ${presetId}`;
    return `${base} (MP5-C base layer)`;
  }
  return presetLabel(presetId);
}

export type Mp5lPlaybackLabels = {
  containerMode: string;
  encoderVersion: string;
  outputQuality: string;
  defaultExport: string;
  bitExact: boolean;
};

export function describeMp5lPlayback(frameData?: Uint8Array): Mp5lPlaybackLabels {
  const ver = frameData ? mp5lBitstreamVersion(frameData) : null;
  return {
    containerMode: "MP5-L v3 (lossless)",
    encoderVersion: mp5lVersionLabel(ver),
    outputQuality: "Bit-exact — decoded PCM matches source samples",
    defaultExport: "Recommended default export for listening",
    bitExact: true,
  };
}

export type Mp5hPlaybackLabels = {
  containerMode: string;
  baseLayer: string;
  correctionLayer: string;
  decodeMode: string;
  outputQuality: string;
  warning?: string;
};

export function describeMp5hPlayback(
  parsed: Mp5File,
  enhancedActive: boolean,
): Mp5hPlaybackLabels {
  const presetId = parsed.head?.presetId ?? 0;
  const baseName = PRESET_NAMES[presetId] ?? `Preset ${presetId}`;
  const hasCorr = (parsed.corr?.length ?? 0) > 0 && (parsed.corr[0]?.data?.length ?? 0) > 0;

  if (!hasCorr) {
    return {
      containerMode: "MP5-H Hybrid",
      baseLayer: `MP5-C ${baseName}`,
      correctionLayer: "CORR missing",
      decodeMode: "Base only (no CORR applied)",
      outputQuality: "Not restored — MP5-C base only (may hiss)",
      warning:
        "MP5-H without CORR: playback uses MP5-C base only and may contain hiss or artifacts.",
    };
  }

  if (enhancedActive) {
    return {
      containerMode: "MP5-H Hybrid",
      baseLayer: `MP5-C ${baseName}`,
      correctionLayer: "CORR present",
      decodeMode: "Enhanced / CORR applied",
      outputQuality: "Lossless restored when CORR decodes cleanly (bit-exact vs source)",
    };
  }

  return {
    containerMode: "MP5-H Hybrid",
    baseLayer: `MP5-C ${baseName}`,
    correctionLayer: "CORR present (not applied)",
    decodeMode: "Base only",
    outputQuality: "Not restored",
    warning: "CORR chunk present but enhanced decode was not used.",
  };
}

export type Mp5cPlaybackLabels = {
  containerMode: string;
  bitstreamVersion: string;
  outputQuality: string;
  warning: string;
};

export function describeMp5cPlayback(frameData?: Uint8Array): Mp5cPlaybackLabels {
  let ver = "unknown";
  if (frameData && frameData.length >= 2 && frameData[0] === 0x43) {
    ver = `v${frameData[1]}`;
  }
  return {
    containerMode: "MP5-C (experimental)",
    bitstreamVersion: ver,
    outputQuality: "Lossy — not bit-exact",
    warning:
      "Lab/research codec. May add audible hiss on all presets. Not recommended for normal listening.",
  };
}

export function formatCodecSummary(head: HeadPayload): string {
  const parts = [codecLabel(head.codecId)];
  if (head.codecId !== CodecId.MP5L && head.codecId !== CodecId.PCM) {
    parts.push(presetLabelForCodec(head.codecId, head.presetId));
  }
  parts.push(`${head.sampleRate} Hz`, `${head.channels} ch`, `${head.bitsPerSample}-bit`);
  return parts.join(" · ");
}
