import { STEM_TYPES, stemTypeLabel, type StemType } from "@mp5/container";

export { STEM_TYPES, stemTypeLabel, type StemType };

export const STEM_TYPE_OPTIONS: { value: StemType; label: string }[] = STEM_TYPES.map((t) => ({
  value: t,
  label: stemTypeLabel(t),
}));
