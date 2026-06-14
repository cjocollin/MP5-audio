import type { UnifiedLibraryItem } from "./unifiedLibraryTypes";
import { packageBadgeLabel } from "./unifiedLibrarySearch";

export function formatLibraryItemSummary(item: UnifiedLibraryItem): string {
  const lines = [
    `Title: ${item.title}`,
    `Artist: ${item.artist}`,
    item.album ? `Album: ${item.album}` : null,
    item.year ? `Year: ${item.year}` : null,
    item.genre ? `Genre: ${item.genre}` : null,
    `Type: ${item.type} (${packageBadgeLabel(item)})`,
    `Filename: ${item.filename}`,
    `Size: ${item.sizeBytes} bytes`,
    item.trackCount ? `Tracks: ${item.trackCount}` : null,
    item.durationMs != null ? `Duration: ${item.durationMs} ms` : null,
    `Source: ${item.source}`,
    `Storage: ${item.storageLocation}`,
    `Integrity: ${item.integrityStatus}`,
  ].filter(Boolean);
  return lines.join("\n");
}
