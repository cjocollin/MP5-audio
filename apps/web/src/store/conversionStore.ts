import { create } from "zustand";

export type SingleConversionPhase = "idle" | "decoding" | "extracting" | "exporting";

interface ConversionState {
  singlePhase: SingleConversionPhase;
  singleFileName: string | null;
  batchRunning: boolean;
  batchCurrentName: string | null;
  batchPendingCount: number;
  /** Incremented on user cancel — export handlers ignore stale completions. */
  cancelGeneration: number;
  setSinglePhase: (phase: SingleConversionPhase, fileName?: string | null) => void;
  setBatchActivity: (opts: {
    running: boolean;
    currentName?: string | null;
    pendingCount?: number;
  }) => void;
  bumpCancelGeneration: () => number;
  resetSingle: () => void;
}

export const useConversionStore = create<ConversionState>((set, get) => ({
  singlePhase: "idle",
  singleFileName: null,
  batchRunning: false,
  batchCurrentName: null,
  batchPendingCount: 0,
  cancelGeneration: 0,
  setSinglePhase: (singlePhase, fileName = null) =>
    set({ singlePhase, singleFileName: fileName ?? get().singleFileName }),
  setBatchActivity: ({ running, currentName, pendingCount }) =>
    set((s) => ({
      batchRunning: running,
      batchCurrentName: currentName !== undefined ? currentName : s.batchCurrentName,
      batchPendingCount: pendingCount !== undefined ? pendingCount : s.batchPendingCount,
    })),
  bumpCancelGeneration: () => {
    const next = get().cancelGeneration + 1;
    set({ cancelGeneration: next });
    return next;
  },
  resetSingle: () => set({ singlePhase: "idle", singleFileName: null }),
}));

export function activeConversionLabel(state: ConversionState): string {
  if (state.batchRunning) {
    const cur = state.batchCurrentName ? ` · ${state.batchCurrentName}` : "";
    return `Batch (${state.batchPendingCount} pending)${cur}`;
  }
  switch (state.singlePhase) {
    case "decoding":
      return `Decoding${state.singleFileName ? ` · ${state.singleFileName}` : ""}`;
    case "extracting":
      return `Metadata${state.singleFileName ? ` · ${state.singleFileName}` : ""}`;
    case "exporting":
      return `Exporting${state.singleFileName ? ` · ${state.singleFileName}` : ""}`;
    default:
      return "Idle";
  }
}
