import type { HookPayload, SongSection } from "@mp5/container";

export function currentSectionIndex(
  sections: SongSection[],
  currentTimeSec: number,
): number {
  if (!sections.length) return -1;
  const tMs = Math.max(0, currentTimeSec * 1000);
  let idx = -1;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i]!.startMs <= tMs) idx = i;
    else break;
  }
  return idx;
}

export function seekTimeSecForSection(section: SongSection): number {
  return Math.max(0, section.startMs / 1000);
}

export function nextSectionIndex(sections: SongSection[], currentIdx: number): number {
  if (!sections.length || currentIdx < 0) return sections.length ? 0 : -1;
  return Math.min(currentIdx + 1, sections.length - 1);
}

export function prevSectionIndex(sections: SongSection[], currentIdx: number): number {
  if (!sections.length || currentIdx <= 0) return 0;
  return currentIdx - 1;
}

export function findFirstSectionByType(
  sections: SongSection[],
  type: SongSection["type"],
): SongSection | undefined {
  return sections.find((s) => s.type === type);
}

export function skipIntroTarget(sections: SongSection[]): SongSection | undefined {
  const intro = findFirstSectionByType(sections, "intro");
  if (!intro) return undefined;
  const idx = sections.indexOf(intro);
  return sections[idx + 1];
}

export function replayHookTarget(
  hook: HookPayload | undefined,
  sections: SongSection[],
): { startSec: number; endSec?: number } | null {
  if (hook) {
    return {
      startSec: hook.startMs / 1000,
      endSec: hook.endMs !== undefined ? hook.endMs / 1000 : undefined,
    };
  }
  const hookSection = findFirstSectionByType(sections, "hook");
  if (!hookSection) return null;
  return {
    startSec: hookSection.startMs / 1000,
    endSec: hookSection.endMs !== undefined ? hookSection.endMs / 1000 : undefined,
  };
}
