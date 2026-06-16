import type { StemAvailabilityStatus } from "@mp5/container";

export interface StemControlStatusInput {
  selected: boolean;
  muted: boolean;
  solo: boolean;
  loaded: boolean;
  active: boolean;
  preparing: boolean;
  pendingAudible?: boolean;
  availability?: StemAvailabilityStatus;
  stemMixActive: boolean;
}

export interface StemControlStatus {
  label: string;
  audible: boolean;
  disabledReason: string | null;
}

export function describeStemControlState(input: StemControlStatusInput): StemControlStatus {
  if (input.availability === "missing_fragments") {
    return {
      label: "Missing fragments",
      audible: false,
      disabledReason: "Stem fragments are missing.",
    };
  }
  if (input.preparing) {
    return {
      label: input.pendingAudible ? "Preparing audible stem" : "Preparing",
      audible: false,
      disabledReason: "Stem is still preparing.",
    };
  }
  if (input.solo) {
    return {
      label: input.active && !input.muted ? "Solo audible" : "Solo ready",
      audible: input.active && !input.muted,
      disabledReason: null,
    };
  }
  if (input.muted) {
    return {
      label: input.loaded ? "Muted" : "Muted, not loaded",
      audible: false,
      disabledReason: null,
    };
  }
  if (input.active) {
    return {
      label: "Audible",
      audible: true,
      disabledReason: null,
    };
  }
  if (input.selected && input.loaded) {
    return {
      label: input.stemMixActive ? "Ready, not audible" : "Ready for mix",
      audible: false,
      disabledReason: null,
    };
  }
  if (input.selected) {
    return {
      label: "Selected",
      audible: false,
      disabledReason: null,
    };
  }
  if (input.loaded) {
    return {
      label: "Loaded",
      audible: false,
      disabledReason: null,
    };
  }
  return {
    label: "Available",
    audible: false,
    disabledReason: null,
  };
}
