import {
  encodeExpl,
  encodeLyrc,
  encodeSect,
  encodeHook,
  encodeHilt,
  encodeMood,
  encodeRecv,
  encodeSafe,
  encodeSens,
  encodeVibe,
  encodeVisu,
  encodeCrdt,
  encodeLicn,
  encodeIden,
  metaFieldsFromRecord,
  type CoverArt,
  type CrdtPayload,
  type ExplPayload,
  type IdenPayload,
  type LicnPayload,
  type LyrcPayload,
  type SectPayload,
  type HookPayload,
  type HiltPayload,
  type MoodPayload,
  type RecvPayload,
  type SafePayload,
  type SensPayload,
  type VibePayload,
  type VisuPayload,
} from "@mp5/container";
import type { SourceMetadata } from "./extractSourceMetadata";

export interface ExportMetadataBundle {
  metaFields: ReturnType<typeof metaFieldsFromRecord>;
  cover?: CoverArt;
  optional: Map<string, Uint8Array>;
  lyrics?: LyrcPayload;
}

export interface UserMetadataOverrides {
  meta?: Record<string, string>;
  /** `null` = user removed cover; omit to keep detected cover */
  cover?: CoverArt | null;
  lyrics?: LyrcPayload | null;
  sect?: SectPayload | null;
  hook?: HookPayload | null;
  hilt?: HiltPayload | null;
  expl?: ExplPayload;
  safe?: SafePayload;
  recv?: RecvPayload;
  sens?: SensPayload;
  mood?: MoodPayload;
  vibe?: VibePayload;
  visu?: VisuPayload | null;
  crdt?: CrdtPayload | null;
  licn?: LicnPayload | null;
  iden?: IdenPayload | null;
}

/** Build container metadata from extracted source + optional user overrides. */
export function buildExportMetadataBundle(
  extracted: SourceMetadata,
  overrides?: UserMetadataOverrides,
  waveformStats?: { peak: number; rms: number },
): ExportMetadataBundle {
  const merged: Record<string, string> = { ...extracted.meta };
  if (overrides?.meta) {
    for (const [key, value] of Object.entries(overrides.meta)) {
      const v = value.trim();
      if (v) merged[key] = v;
      else delete merged[key];
    }
  }

  let cover: CoverArt | undefined;
  if (overrides && "cover" in overrides) {
    cover = overrides.cover ?? undefined;
  } else {
    cover = extracted.cover;
  }

  delete merged.cover_mime;
  delete merged.cover_size;
  if (cover) {
    merged.cover_mime = cover.mime;
    merged.cover_size = String(cover.data.length);
  }

  if (waveformStats) {
    merged.waveform_peak = waveformStats.peak.toFixed(6);
    merged.waveform_rms = waveformStats.rms.toFixed(6);
  }

  const optional = new Map<string, Uint8Array>();

  let lyrics: LyrcPayload | undefined;
  if (overrides && "lyrics" in overrides) {
    lyrics = overrides.lyrics ?? undefined;
  } else {
    lyrics = extracted.lyrics;
  }
  if (lyrics?.unsynced || lyrics?.synced?.length) {
    optional.set("LYRC", encodeLyrc(lyrics));
  }

  if (overrides && "sect" in overrides) {
    if (overrides.sect?.sections.length) {
      optional.set("SECT", encodeSect(overrides.sect));
    }
  }
  if (overrides && "hook" in overrides && overrides.hook) {
    optional.set("HOOK", encodeHook(overrides.hook));
  }
  if (overrides && "hilt" in overrides && overrides.hilt?.highlights.length) {
    optional.set("HILT", encodeHilt(overrides.hilt));
  }

  if (overrides?.expl && hasExplContent(overrides.expl)) {
    optional.set("EXPL", encodeExpl({ ...overrides.expl, warningSource: overrides.expl.warningSource ?? "user" }));
  }
  if (overrides?.safe && hasSafeContent(overrides.safe)) {
    optional.set("SAFE", encodeSafe({ ...overrides.safe, warningSource: overrides.safe.warningSource ?? "user" }));
  }
  if (overrides?.recv && hasRecvContent(overrides.recv)) {
    optional.set("RECV", encodeRecv({ ...overrides.recv, warningSource: overrides.recv.warningSource ?? "user" }));
  }
  if (overrides?.sens && hasSensContent(overrides.sens)) {
    optional.set("SENS", encodeSens({ ...overrides.sens, warningSource: overrides.sens.warningSource ?? "user" }));
  }
  if (overrides?.mood?.tags?.length) {
    optional.set("MOOD", encodeMood(overrides.mood));
  }
  if (overrides?.vibe?.tags?.length) {
    optional.set("VIBE", encodeVibe(overrides.vibe));
  }
  if (overrides && "visu" in overrides) {
    if (overrides.visu) {
      try {
        optional.set("VISU", encodeVisu(overrides.visu));
      } catch {
        /* invalid theme fields — skip VISU */
      }
    }
  }

  if (overrides && "crdt" in overrides) {
    if (overrides.crdt) {
      try {
        optional.set("CRDT", encodeCrdt(overrides.crdt));
      } catch {
        /* no credit fields */
      }
    }
  }
  if (overrides && "licn" in overrides) {
    if (overrides.licn) {
      try {
        optional.set("LICN", encodeLicn(overrides.licn));
      } catch {
        /* no rights fields */
      }
    }
  }
  if (overrides && "iden" in overrides) {
    if (overrides.iden) {
      try {
        optional.set("IDEN", encodeIden(overrides.iden));
      } catch {
        /* no identifier fields */
      }
    }
  }

  return {
    metaFields: metaFieldsFromRecord(merged),
    cover,
    optional,
    lyrics,
  };
}

function hasExplContent(p: ExplPayload): boolean {
  return !!(
    p.explicit ||
    p.cleanVersionAvailable ||
    p.contentWarnings?.length ||
    p.strongLanguage ||
    p.sexualContent ||
    p.violence ||
    p.drugReferences ||
    p.alcoholReferences ||
    p.selfHarmThemes ||
    p.traumaThemes ||
    p.matureThemes
  );
}

function hasSafeContent(p: SafePayload): boolean {
  return !!(p.tags?.length || p.griefThemes || p.traumaThemes || p.panicHeavy || p.distressingThemes);
}

function hasRecvContent(p: RecvPayload): boolean {
  return !!(
    p.recoverySafe ||
    p.groundingFriendly ||
    p.panicFriendly ||
    p.triggers?.length ||
    p.drugReferences ||
    p.alcoholReferences ||
    p.relapseThemes ||
    p.cravingTriggers
  );
}

function hasSensContent(p: SensPayload): boolean {
  return !!(
    p.warnings?.length ||
    p.suddenLoudSounds ||
    p.intenseBass ||
    p.harshFrequencies ||
    p.sensoryOverloadRisk
  );
}
