import type { AlbmPackageManifest } from "@mp5/container";

export function albumCoverDataUrlFromManifest(manifest: AlbmPackageManifest): string | undefined {
  const cover = manifest.album.cover;
  if (!cover || cover.type !== "embedded" || !cover.dataBase64) return undefined;
  const mime = cover.mime || "image/jpeg";
  return `data:${mime};base64,${cover.dataBase64}`;
}

/** Approximate stored manifest size in bytes (UTF-8), not UTF-16 code-unit count. */
export function manifestJsonByteSize(manifest: AlbmPackageManifest): number {
  return new TextEncoder().encode(JSON.stringify(manifest)).length;
}

export function albumDurationMsFromManifest(manifest: AlbmPackageManifest): number | null {
  let total = 0;
  let any = false;
  for (const t of manifest.tracks) {
    if (typeof t.durationMs === "number" && t.durationMs > 0) {
      total += t.durationMs;
      any = true;
    }
  }
  return any ? total : null;
}
