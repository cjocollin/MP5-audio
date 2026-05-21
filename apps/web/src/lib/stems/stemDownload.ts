import { CodecId } from "@mp5/container";
import { stemTypeLabel, type StemType } from "@mp5/container";

export function sanitizeStemFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 48);
  return cleaned || "stem";
}

/** Safe download name for embedded stem frame bytes (not a full .mp5 container). */
export function stemFrameDownloadFilename(
  stemName: string,
  stemType: StemType,
  codecId: number,
): string {
  const base = sanitizeStemFilenamePart(stemName);
  const type = stemType === "custom" ? "custom" : stemType;
  const codec =
    codecId === CodecId.MP5L
      ? "mp5l-v3"
      : codecId === CodecId.PCM
        ? "pcm"
        : `codec${codecId}`;
  return `${base}_${type}_${codec}.stem-frame`;
}

export function stemDownloadHelp(codecId: number): string {
  if (codecId === CodecId.MP5L) {
    return "Downloads the embedded MP5-L v3 stem bitstream (single frame), not a full .mp5 file.";
  }
  return "Downloads the embedded PCM stem payload (raw frame bytes).";
}

export function stemTypeLabelShort(type: StemType): string {
  return stemTypeLabel(type);
}
