import type { CoverArt } from "@mp5/container";

/** Create a blob URL for cover preview. Caller must revoke the returned URL. */
export function createCoverPreviewUrl(cover: CoverArt): string {
  const bytes = new Uint8Array(cover.data);
  return URL.createObjectURL(new Blob([bytes], { type: cover.mime }));
}

/** Revoke if defined; safe to call with undefined. */
export function revokeCoverPreviewUrl(url: string | undefined): void {
  if (url) URL.revokeObjectURL(url);
}

/** Replace preview URL: revokes previous, returns new or undefined. */
export function replaceCoverPreviewUrl(
  previous: string | undefined,
  cover: CoverArt | undefined,
): string | undefined {
  revokeCoverPreviewUrl(previous);
  if (!cover?.data.length) return undefined;
  return createCoverPreviewUrl(cover);
}
