import type { StemAvailabilityEntry } from "@mp5/container";

export type StemTransportMode = "full_mix" | "stem_mix" | "solo_stem" | "karaoke";

export interface StemRowUiState {
  id: string;
  gain: number;
  muted: boolean;
  solo: boolean;
  /** User wants this stem in a stem mix (checkbox). */
  selected: boolean;
  /** Background decode in progress. */
  preparing: boolean;
  /** Unmuted during stem mix; join when decode finishes. */
  pendingAudible?: boolean;
}

export type StemRowBadge =
  | "available"
  | "selected"
  | "preparing"
  | "pending_audible"
  | "loaded"
  | "active"
  | "muted";

export function stemRowBadges(
  ui: StemRowUiState,
  opts: {
    loaded: boolean;
    active: boolean;
    stemMixActive?: boolean;
    availability?: StemAvailabilityEntry;
  },
): StemRowBadge[] {
  const badges: StemRowBadge[] = [];
  if (opts.availability?.status === "missing_fragments") {
    badges.push("available");
    return badges;
  }
  if (opts.availability?.status === "partial_fragments") {
    badges.push("available");
    return badges;
  }
  if (ui.preparing && !opts.loaded) badges.push("preparing");
  if (
    !ui.muted &&
    !opts.loaded &&
    (ui.pendingAudible || ui.preparing) &&
    opts.stemMixActive
  ) {
    badges.push("pending_audible");
  }
  if (ui.selected) badges.push("selected");
  if (opts.loaded) badges.push("loaded");
  if (opts.active) badges.push("active");
  if (ui.muted && (opts.active || ui.selected)) badges.push("muted");
  if (!badges.length) badges.push("available");
  return badges;
}

export function badgeLabel(b: StemRowBadge): string {
  switch (b) {
    case "available":
      return "Available";
    case "selected":
      return "Selected";
    case "preparing":
      return "Preparing";
    case "pending_audible":
      return "Will join mix";
    case "loaded":
      return "Loaded";
    case "active":
      return "Active";
    case "muted":
      return "Muted";
    default:
      return b;
  }
}

/** Tracks included in the active stem mix graph (loaded + selected, or solo target). */
export function stemsForActiveMix(
  stems: { stemId: string }[],
  uiState: StemRowUiState[],
  cache: { has(id: string): boolean },
  mode: StemTransportMode,
): string[] {
  if (mode === "solo_stem") {
    return uiState.filter((u) => u.solo && cache.has(u.id)).map((u) => u.id);
  }
  return stems
    .filter((s) => {
      const ui = uiState.find((u) => u.id === s.stemId);
      return ui?.selected && cache.has(s.stemId);
    })
    .map((s) => s.stemId);
}
