import { useState } from "react";
import {
  fetchDemoMp5lFixture,
  fetchDemoStemsFixture,
  DEMO_MP5L_FIXTURE_NAME,
  DEMO_STEMS_FIXTURE_NAME,
} from "../lib/demoFixture";
import { dismissOnboarding } from "../lib/firstRun";

interface Props {
  onLoaded: (file: File, playFirst: boolean) => void | Promise<void>;
  compact?: boolean;
  testIdPrefix?: string;
}

export function DemoFixtureActions({ onLoaded, compact, testIdPrefix = "demo" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLoad(playAfter = false, stems = false) {
    setLoading(true);
    setError("");
    try {
      const file = stems ? await fetchDemoStemsFixture() : await fetchDemoMp5lFixture();
      if (!file) {
        setError(
          stems
            ? "Karaoke demo not available on this server. Run pnpm fixtures:generate, or add your own stems and synced lyrics in the Converter."
            : "Demo file not available on this server. Drop your own .mp5, or convert WAV/FLAC in the Converter.",
        );
        return;
      }
      dismissOnboarding();
      await onLoaded(file, playAfter);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`mp5-card ${compact ? "p-3" : "p-4"} space-y-3`}
      data-testid="demo-fixture-actions"
    >
      <div>
        <p className={`font-medium text-gray-200 ${compact ? "text-sm" : "text-base"}`}>
          Try the demo file
        </p>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Synthetic 440 Hz tone — no copyrighted music in the repo. For real listening tests, convert
          your own <strong className="text-gray-400 font-normal">FLAC or WAV</strong> in the Converter.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleLoad(true)}
          className="mp5-btn-primary text-xs sm:text-sm"
          data-testid={`${testIdPrefix}-load-demo-play`}
        >
          {loading ? "Loading…" : "Load MP5-L demo & play"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleLoad(false)}
          className="mp5-btn-secondary text-xs sm:text-sm"
          data-testid={`${testIdPrefix}-load-demo-add`}
        >
          Add demo to playlist
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleLoad(true, true)}
          className="mp5-btn-secondary text-xs sm:text-sm"
          data-testid={`${testIdPrefix}-load-stems-demo`}
        >
          Load karaoke demo
        </button>
      </div>
      <p className="text-[10px] text-gray-600 font-mono">
        {DEMO_MP5L_FIXTURE_NAME} · {DEMO_STEMS_FIXTURE_NAME}
      </p>
      {error && (
        <p className="text-xs text-amber-200/80" role="status" data-testid="demo-fixture-error">
          {error}
        </p>
      )}
    </div>
  );
}
