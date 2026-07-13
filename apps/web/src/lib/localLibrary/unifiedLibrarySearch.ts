import type { UnifiedLibraryFilters, UnifiedLibraryItem } from "./unifiedLibraryTypes";

const LARGE_PACKAGE_BYTES = 50 * 1024 * 1024;

function haystack(item: UnifiedLibraryItem): string {
  return [
    item.title,
    item.artist,
    item.album,
    item.filename,
    item.genre ?? "",
    item.year ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesUnifiedLibraryQuery(item: UnifiedLibraryItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack(item).includes(q);
}

export function matchesUnifiedLibraryKind(item: UnifiedLibraryItem, kind: UnifiedLibraryFilters["kind"]): boolean {
  switch (kind) {
    case "all":
      return true;
    case "tracks":
      return item.type === "track" && item.source === "saved";
    case "albums":
      return item.type === "album" && item.source === "saved";
    case "embedded":
      return item.packageType === "embedded";
    case "manifest":
      return item.packageType === "manifest";
    case "recent":
      return item.source === "recent";
    default:
      return true;
  }
}

function sortKey(item: UnifiedLibraryItem, sort: UnifiedLibraryFilters["sort"]): string | number {
  switch (sort) {
    case "title-asc":
      return item.title.toLowerCase();
    case "artist-asc":
      return item.artist.toLowerCase();
    case "opened-desc":
      return item.lastOpenedAt ?? item.addedAt;
    case "size-desc":
      return item.sizeBytes;
    case "duration-desc":
      return item.durationMs ?? -1;
    case "added-desc":
    default:
      return item.addedAt;
  }
}

export function matchesUnifiedLibraryMoodVibe(
  item: UnifiedLibraryItem,
  moodTag: string,
  vibeTag: string,
): boolean {
  if (moodTag && !(item.moodTags ?? []).some((t) => t.toLowerCase() === moodTag.toLowerCase())) {
    return false;
  }
  if (vibeTag && !(item.vibeTags ?? []).some((t) => t.toLowerCase() === vibeTag.toLowerCase())) {
    return false;
  }
  return true;
}

export function filterAndSortUnifiedLibraryItems(
  items: UnifiedLibraryItem[],
  filters: UnifiedLibraryFilters,
): UnifiedLibraryItem[] {
  const filtered = items.filter(
    (item) =>
      matchesUnifiedLibraryQuery(item, filters.query) &&
      matchesUnifiedLibraryKind(item, filters.kind) &&
      matchesUnifiedLibraryMoodVibe(item, filters.moodTag, filters.vibeTag),
  );
  const descSorts = new Set(["added-desc", "opened-desc", "size-desc", "duration-desc"]);
  const desc = descSorts.has(filters.sort);
  return filtered.sort((a, b) => {
    const av = sortKey(a, filters.sort);
    const bv = sortKey(b, filters.sort);
    if (av === bv) return a.title.localeCompare(b.title);
    if (typeof av === "string" && typeof bv === "string") {
      const cmp = av.localeCompare(bv);
      return desc ? -cmp : cmp;
    }
    const na = Number(av);
    const nb = Number(bv);
    return desc ? nb - na : na - nb;
  });
}

export function isLargePackageItem(item: UnifiedLibraryItem): boolean {
  return item.packageType === "embedded" && item.sizeBytes >= LARGE_PACKAGE_BYTES;
}

export function packageBadgeLabel(item: UnifiedLibraryItem): string {
  if (item.type === "track") return ".mp5";
  if (item.packageType === "embedded") return "embedded .mp5p";
  return "manifest .mp5p";
}
