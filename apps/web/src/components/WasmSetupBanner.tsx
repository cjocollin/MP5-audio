import { useEffect, useState } from "react";
import { getCodec, getCodecLoadState, type CodecLoadState } from "../wasm/codec";

export function WasmSetupBanner() {
  const [state, setState] = useState<CodecLoadState>(getCodecLoadState());

  useEffect(() => {
    void getCodec().then(() => setState(getCodecLoadState()));
  }, []);

  if (state === "loading") {
    return (
      <div
        className="rounded-xl border border-white/10 bg-surface-elevated px-4 py-3 text-sm text-gray-400"
        data-testid="wasm-setup-banner"
      >
        Loading MP5 WASM codecs…
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
        MP5-L, MP5-C, and MP5-H are not loaded. The app can only use{" "}
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
