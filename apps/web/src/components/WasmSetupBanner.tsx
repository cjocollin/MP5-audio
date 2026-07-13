import { useEffect, useState } from "react";
import { getCodec, getCodecLoadState, type CodecLoadState } from "../wasm/codec";

const LOADING_STEPS = [
  "Fetching MP5 codec WASM…",
  "Initializing encoders (MP5-L / MP5-C / MP5-H / vNext)…",
  "Ready for .mp5 playback and export",
] as const;

export function WasmSetupBanner() {
  const [state, setState] = useState<CodecLoadState>(getCodecLoadState());
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    void getCodec().then(() => setState(getCodecLoadState()));
  }, []);

  useEffect(() => {
    if (state !== "loading") return;
    setStepIndex(0);
    const t1 = window.setTimeout(() => setStepIndex(1), 400);
    const t2 = window.setTimeout(() => setStepIndex(2), 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [state]);

  if (state === "loading") {
    const progressPct = Math.min(95, 20 + stepIndex * 35);
    return (
      <div
        className="rounded-xl border border-white/10 bg-surface-elevated px-4 py-3 text-sm text-gray-400 space-y-2"
        data-testid="wasm-setup-banner"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="font-medium text-gray-300">Loading MP5 codecs…</p>
        <div
          className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden"
          data-testid="wasm-load-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
        >
          <div
            className="h-full bg-accent/80 transition-[width] duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500" data-testid="wasm-load-step">
          {LOADING_STEPS[stepIndex] ?? LOADING_STEPS[0]}
        </p>
        <p className="text-xs text-gray-600">
          First non-WAV conversion also downloads FFmpeg (~31 MB, once per session). Existing .mp5
          playback starts as soon as codecs finish loading.
        </p>
      </div>
    );
  }

  if (state !== "unavailable") {
    return null;
  }

  return (
    <div
      className="rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-sm space-y-2"
      data-testid="wasm-setup-banner"
      role="alert"
    >
      <p className="font-semibold text-amber-100">MP5 codecs require WASM</p>
      <p className="text-amber-200/90 text-xs leading-relaxed">
        MP5-L, MP5-C, MP5-C vNext, and MP5-H are not loaded. The app can only use{" "}
        <strong>PCM reference / debug</strong> mode until you build the WASM package.
      </p>
      <ol className="text-xs text-amber-100/90 list-decimal list-inside space-y-1 font-mono">
        <li>
          Run: <code className="text-accent">pnpm wasm:build</code>
        </li>
        <li>Refresh this page</li>
      </ol>
      <p className="text-xs text-gray-500">
        See <code className="text-accent">docs/WASM_SETUP.md</code> · Or run{" "}
        <code className="text-accent">pnpm demo</code> from the repo root.
      </p>
    </div>
  );
}
