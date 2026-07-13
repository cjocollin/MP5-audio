import type { AiAnalysisProgress, AiMetadataSuggestions } from "../converter/aiMetadataHooks";

interface Props {
  suggestions: AiMetadataSuggestions;
  busy: boolean;
  progress: AiAnalysisProgress | null;
  error: string;
  onAnalyze: () => void;
  onAcceptBeat: (beat: NonNullable<AiMetadataSuggestions["beat"]>) => void;
  onAcceptStructure: () => void;
  onAcceptLyrics: () => void;
  onAcceptContentWarnings: () => void;
  onAcceptMoodVibe: () => void;
  onAcceptSummary: () => void;
  onDismiss: () => void;
  aiEnabled: boolean;
  cloudConfigured: boolean;
  cloudBeatEnabled: boolean;
  cloudStructureEnabled: boolean;
  cloudLyricsEnabled: boolean;
  cloudContentWarningsEnabled: boolean;
}

function ProvenanceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const label =
    source === "ai-local"
      ? "Local AI"
      : source === "ai-cloud"
        ? "Cloud AI"
        : source?.includes("mp5-") || source?.includes("/")
          ? "Cloud AI"
          : source;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-200">
      {label}
    </span>
  );
}

function explSummary(expl: NonNullable<AiMetadataSuggestions["expl"]>): string {
  const flags: string[] = [];
  if (expl.explicit) flags.push("explicit");
  if (expl.strongLanguage) flags.push("language");
  if (expl.sexualContent) flags.push("sexual");
  if (expl.violence) flags.push("violence");
  if (expl.drugReferences) flags.push("drugs");
  if (expl.alcoholReferences) flags.push("alcohol");
  if (expl.selfHarmThemes) flags.push("self-harm");
  if (expl.traumaThemes) flags.push("trauma");
  if (expl.matureThemes) flags.push("mature");
  if (expl.contentWarnings?.length) flags.push(...expl.contentWarnings.slice(0, 3));
  return flags.join(", ") || "content flags";
}

function safeSummary(safe: NonNullable<AiMetadataSuggestions["safe"]>): string {
  const flags: string[] = [];
  if (safe.griefThemes) flags.push("grief");
  if (safe.traumaThemes) flags.push("trauma");
  if (safe.distressingThemes) flags.push("distressing");
  if (safe.tags?.length) flags.push(...safe.tags.slice(0, 2));
  return flags.join(", ") || "safety flags";
}

export function AiSuggestionsPanel({
  suggestions,
  busy,
  progress,
  error,
  onAnalyze,
  onAcceptBeat,
  onAcceptStructure,
  onAcceptLyrics,
  onAcceptContentWarnings,
  onAcceptMoodVibe,
  onAcceptSummary,
  onDismiss,
  aiEnabled,
  cloudConfigured,
  cloudBeatEnabled,
  cloudStructureEnabled,
  cloudLyricsEnabled,
  cloudContentWarningsEnabled,
}: Props) {
  const hasSuggestions = !!(
    suggestions.beat ||
    suggestions.beatCloud ||
    suggestions.sect?.sections.length ||
    suggestions.lyrc?.unsynced ||
    suggestions.lyrc?.synced?.length ||
    suggestions.expl ||
    suggestions.safe ||
    suggestions.mood ||
    suggestions.vibe ||
    suggestions.summ
  );

  return (
    <section
      className="rounded-xl border border-white/10 bg-surface-elevated/80 p-4 space-y-3"
      data-testid="ai-suggestions-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-200">AI metadata suggestions</p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Opt-in only. Review each suggestion before export — nothing is written automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={busy || !aiEnabled}
          className="text-xs px-3 py-1.5 rounded-lg bg-accent/90 text-black font-semibold disabled:opacity-40"
          data-testid="ai-analyze-button"
        >
          {busy ? "Analyzing…" : "Analyze with AI"}
        </button>
      </div>

      {busy && (
        <div
          className="rounded-lg border border-white/10 bg-black/20 px-3 py-3 space-y-2"
          data-testid="ai-analysis-progress"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-gray-200">
              {progress?.label ?? "Starting analysis…"}
            </p>
            {progress ? (
              <span className="text-[10px] text-gray-500 tabular-nums">
                Step {progress.step}/{progress.totalSteps} · {progress.percent}%
              </span>
            ) : null}
          </div>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            {progress?.detail ??
              "Long tracks are scanned in multiple segments. Each step sends a clip or metadata to your AI provider (BYOK)."}
          </p>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${progress?.percent ?? 4}%` }}
              data-testid="ai-analysis-progress-bar"
            />
          </div>
          <p className="text-[10px] text-gray-600">
            API keys stay in this browser. Cloud steps may take 10–30s each on long songs.
          </p>
        </div>
      )}

      {!busy && !aiEnabled && (
        <p className="text-xs text-gray-500" data-testid="ai-disabled-note">
          Enable AI suggestions in Settings to analyze this track.
        </p>
      )}

      {!busy && aiEnabled && !cloudConfigured && (
        <p className="text-xs text-gray-500" data-testid="ai-cloud-key-note">
          Local BPM works without a key. Add an API key in Settings for cloud BPM, structure, lyrics, mood, and more.
        </p>
      )}

      {!busy && aiEnabled && cloudConfigured && !cloudBeatEnabled && (
        <p className="text-xs text-amber-200/80" data-testid="ai-cloud-beat-disabled-note">
          Cloud BPM is off. Enable <strong className="font-medium">Cloud BPM analysis</strong> in Settings for BPM
          (cloud) and musical key.
        </p>
      )}

      {!busy && aiEnabled && cloudConfigured && cloudBeatEnabled && !suggestions.beatCloud?.bpm && suggestions.cloudBeatError && (
        <p className="text-xs text-red-300/90" data-testid="ai-cloud-beat-error">
          Cloud BPM failed: {suggestions.cloudBeatError}
        </p>
      )}

      {!busy &&
        aiEnabled &&
        cloudConfigured &&
        cloudStructureEnabled &&
        !suggestions.sect?.sections.length &&
        suggestions.cloudStructureError && (
          <p className="text-xs text-red-300/90" data-testid="ai-cloud-structure-error">
            Cloud structure failed: {suggestions.cloudStructureError}
          </p>
        )}

      {!busy &&
        aiEnabled &&
        cloudConfigured &&
        cloudLyricsEnabled &&
        !suggestions.lyrc &&
        suggestions.cloudLyricsError && (
          <p className="text-xs text-red-300/90" data-testid="ai-cloud-lyrics-error">
            Cloud lyrics failed: {suggestions.cloudLyricsError}
          </p>
        )}

      {!busy &&
        aiEnabled &&
        cloudConfigured &&
        cloudContentWarningsEnabled &&
        !suggestions.expl &&
        !suggestions.safe &&
        suggestions.cloudContentWarningsError && (
          <p className="text-xs text-red-300/90" data-testid="ai-cloud-warnings-error">
            Cloud content warnings failed: {suggestions.cloudContentWarningsError}
          </p>
        )}

      {error && (
        <p className="text-xs text-red-300/90" data-testid="ai-suggestions-error">
          {error}
        </p>
      )}

      {hasSuggestions && (
        <div className="space-y-3 border-t border-white/5 pt-3">
          {suggestions.beat?.bpm != null && (
            <div className="flex flex-wrap items-center justify-between gap-2" data-testid="ai-suggestion-beat-local">
              <div className="text-xs text-gray-300">
                <span className="text-gray-500">BPM (local):</span> {suggestions.beat.bpm}
                {suggestions.beat.timeSignature ? ` · ${suggestions.beat.timeSignature}` : ""}
                {suggestions.beat.confidence != null ? (
                  <span className="text-gray-600"> · conf {Math.round(suggestions.beat.confidence * 100)}%</span>
                ) : null}
                <span className="ml-2">
                  <ProvenanceBadge source={suggestions.beat.source} />
                </span>
              </div>
              <button
                type="button"
                onClick={() => onAcceptBeat(suggestions.beat!)}
                className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/15"
              >
                Accept local BPM
              </button>
            </div>
          )}

          {(suggestions.beatCloud?.bpm != null || suggestions.beatCloud?.key) && (
            <div className="flex flex-wrap items-center justify-between gap-2" data-testid="ai-suggestion-beat-cloud">
              <div className="text-xs text-gray-300">
                {suggestions.beatCloud.bpm != null ? (
                  <>
                    <span className="text-gray-500">BPM (cloud):</span> {suggestions.beatCloud.bpm}
                    {suggestions.beatCloud.timeSignature ? ` · ${suggestions.beatCloud.timeSignature}` : ""}
                    {suggestions.beatCloud.confidence != null ? (
                      <span className="text-gray-600">
                        {" "}
                        · conf {Math.round(suggestions.beatCloud.confidence * 100)}%
                      </span>
                    ) : null}
                  </>
                ) : null}
                {suggestions.beatCloud.key ? (
                  <>
                    {suggestions.beatCloud.bpm != null ? " · " : null}
                    <span className="text-gray-500">Key:</span> {suggestions.beatCloud.key}
                  </>
                ) : null}
                <span className="ml-2">
                  <ProvenanceBadge source={suggestions.beatCloud.source} />
                </span>
              </div>
              <button
                type="button"
                onClick={() => onAcceptBeat(suggestions.beatCloud!)}
                className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/15"
              >
                Accept cloud tempo/key
              </button>
            </div>
          )}

          {!!suggestions.sect?.sections.length && (
            <div className="space-y-1" data-testid="ai-suggestion-structure">
              <p className="text-xs text-gray-300">
                <span className="text-gray-500">Structure:</span> {suggestions.sect.sections.length} sections (
                {suggestions.sect.sections
                  .slice(0, 4)
                  .map((s) => s.type)
                  .join(" → ")}
                {suggestions.sect.sections.length > 4 ? "…" : ""})
                <span className="ml-2">
                  <ProvenanceBadge source={suggestions.sect.source} />
                </span>
              </p>
              <button
                type="button"
                onClick={onAcceptStructure}
                className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/15"
              >
                Accept structure
              </button>
            </div>
          )}

          {(suggestions.lyrc?.unsynced || suggestions.lyrc?.synced?.length) && (
            <div className="space-y-1" data-testid="ai-suggestion-lyrics">
              <p className="text-xs text-gray-300 line-clamp-3">
                <span className="text-gray-500">Lyrics:</span>{" "}
                {suggestions.lyrc.unsynced?.slice(0, 160) ||
                  suggestions.lyrc.synced?.slice(0, 2).map((l) => l.text).join(" / ")}
                <span className="ml-2">
                  <ProvenanceBadge source={suggestions.lyrc.source} />
                </span>
              </p>
              <p className="text-[10px] text-amber-200/70">
                Audio transcription only — compare against the song before accepting. Wrong on busy mixes is common.
              </p>
              <button
                type="button"
                onClick={onAcceptLyrics}
                className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/15"
              >
                Accept lyrics
              </button>
            </div>
          )}

          {(suggestions.expl || suggestions.safe) && (
            <div className="space-y-1" data-testid="ai-suggestion-content-warnings">
              {suggestions.expl ? (
                <p className="text-xs text-gray-300">
                  <span className="text-gray-500">Content:</span> {explSummary(suggestions.expl)}
                </p>
              ) : null}
              {suggestions.safe ? (
                <p className="text-xs text-gray-300">
                  <span className="text-gray-500">Safety:</span> {safeSummary(suggestions.safe)}
                </p>
              ) : null}
              <button
                type="button"
                onClick={onAcceptContentWarnings}
                className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/15"
              >
                Accept content warnings
              </button>
            </div>
          )}

          {(suggestions.mood?.tags?.length || suggestions.vibe?.tags?.length) && (
            <div className="space-y-1" data-testid="ai-suggestion-mood-vibe">
              {suggestions.mood?.tags?.length ? (
                <p className="text-xs text-gray-300">
                  <span className="text-gray-500">Mood:</span> {suggestions.mood.tags.join(", ")}
                  <span className="ml-2">
                    <ProvenanceBadge source={suggestions.mood.source} />
                  </span>
                </p>
              ) : null}
              {suggestions.vibe?.tags?.length ? (
                <p className="text-xs text-gray-300">
                  <span className="text-gray-500">Vibe:</span> {suggestions.vibe.tags.join(", ")}
                  <span className="ml-2">
                    <ProvenanceBadge source={suggestions.vibe.source} />
                  </span>
                </p>
              ) : null}
              <button
                type="button"
                onClick={onAcceptMoodVibe}
                className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/15"
              >
                Accept mood/vibe
              </button>
            </div>
          )}

          {suggestions.summ?.text && (
            <div className="space-y-1" data-testid="ai-suggestion-summary">
              <p className="text-xs text-gray-300">
                <span className="text-gray-500">Summary:</span> {suggestions.summ.text}
                <span className="ml-2">
                  <ProvenanceBadge source={suggestions.summ.source} />
                </span>
              </p>
              <button
                type="button"
                onClick={onAcceptSummary}
                className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/15"
              >
                Accept summary
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onDismiss}
            className="text-[10px] text-gray-500 hover:text-gray-400"
            data-testid="ai-dismiss-suggestions"
          >
            Dismiss suggestions
          </button>
        </div>
      )}
    </section>
  );
}
