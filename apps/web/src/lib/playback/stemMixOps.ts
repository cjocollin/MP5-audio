import type { StemPcmTrack } from "../../player/useStemMixerEngine";

/** Seamless stem-mix UI operations — never trigger full graph reload. */

export type StemMixSeamlessOp =
  | { type: "insert"; track: StemPcmTrack }
  | { type: "remove"; stemId: string }
  | { type: "audible"; track: StemPcmTrack };
