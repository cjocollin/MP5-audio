import { useMemo, useState, useCallback } from "react";
import { STEM_TYPE_OPTIONS, stemTypeLabel, type StemType } from "../converter/stemTypes";
import type { PendingStemPcm } from "../converter/stemValidation";
import type { StemValidationIssue } from "../converter/stemValidation";
import {
  analyzeStemAlignment,
  formatStemNormalizeSummary,
  pcmDurationSec,
  type StemAlignmentStrategy,
} from "../converter/stemNormalize";
import type { BatchStemImportSummary } from "../converter/batchStemImport";
import { alignmentStatusLines } from "../converter/batchStemImport";
import type { GuardrailMessage } from "../lib/performance/guardrails";
import { GuardrailNotice } from "./GuardrailNotice";

interface MixInfo {
  sampleRate: number;
  channels: number;
  durationSec: number;
}

interface Props {
  stems: PendingStemPcm[];
  issues: StemValidationIssue[];
  mix: MixInfo | null;
  busy: boolean;
  batchSummary: BatchStemImportSummary | null;
  importGuardrails: GuardrailMessage[];
  onAddStems: (files: File[]) => void;
  onUpdateStem: (id: string, patch: Partial<PendingStemPcm>) => void;
  onRemoveStem: (id: string) => void;
  onRemoveAllStems: () => void;
  onSetAllVolumesFull: () => void;
  onNormalizeStems: (strategy: StemAlignmentStrategy, allowLargeTrim: boolean) => void;
  onPadMixToStems: (targetDurationSec: number) => void;
}

export function StemImportSection({
  stems,
  issues,
  mix,
  busy,
  batchSummary,
  importGuardrails,
  onAddStems,
  onUpdateStem,
  onRemoveStem,
  onRemoveAllStems,
  onSetAllVolumesFull,
  onNormalizeStems,
  onPadMixToStems,
}: Props) {
  const [showAlignChoice, setShowAlignChoice] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const alignment = useMemo(
    () =>
      batchSummary?.alignment ??
      (mix && stems.length
        ? analyzeStemAlignment(
            { samples: new Int16Array(0), sampleRate: mix.sampleRate, channels: mix.channels },
            stems,
            mix.durationSec,
          )
        : null),
    [batchSummary?.alignment, mix, stems],
  );

  const alignLines = useMemo(
    () => alignmentStatusLines(alignment, mix),
    [alignment, mix],
  );

  const canNormalize = mix && stems.length > 0 && alignment?.needsNormalization;

  const pickFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      onAddStems(Array.from(fileList));
    },
    [onAddStems],
  );

  function handleNormalizeClick() {
    if (!alignment || !mix) return;
    if (alignment.suggestPadMix) {
      setShowAlignChoice(true);
      return;
    }
    if (alignment.anyLargeTrim) {
      const lines = alignment.perStem
        .filter((p) => p.needsLargeTrimConfirm)
        .map(
          (p) =>
            `• ${p.stemName}: ${p.longerBySec.toFixed(1)}s longer than full mix`,
        );
      const ok = window.confirm(
        `Some stems are much longer than the full mix (${mix.durationSec.toFixed(1)}s). Trimming may remove audio.\n\n${lines.join("\n")}\n\nTrim/pad stems to match the full mix?`,
      );
      if (!ok) return;
      onNormalizeStems("trim-pad-stems", true);
      return;
    }
    onNormalizeStems("trim-pad-stems", true);
  }

  return (
    <section
      className="rounded-xl border border-white/10 bg-surface-elevated/60 p-4 space-y-3"
      data-testid="stem-import-section"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!busy) pickFiles(e.dataTransfer.files);
      }}
    >
      <div>
        <p className="text-sm font-medium text-gray-300">Stems (optional)</p>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Import one or many stem files (WAV, FLAC, MP3, M4A, OGG). No AI separation. Stem type is
          guessed from filenames and can be edited. MP5 can resample and align duration when stems
          differ from the full mix.
        </p>
      </div>

      {importGuardrails.length > 0 && (
        <GuardrailNotice messages={importGuardrails} testId="stem-import-guardrails" />
      )}

      <div
        className={`rounded-lg border border-dashed p-3 space-y-2 transition-colors ${
          dragOver ? "border-accent/60 bg-accent/5" : "border-white/10"
        }`}
        data-testid="stem-drop-zone"
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="stem-file-input"
            type="file"
            multiple
            accept="audio/*,.wav,.flac,.mp3,.m4a,.aac,.ogg,.opus"
            className="sr-only"
            disabled={busy}
            data-testid="stem-file-input"
            onChange={(e) => {
              pickFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <label
            htmlFor="stem-file-input"
            className={`px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/10 ${
              busy ? "opacity-40 pointer-events-none" : "cursor-pointer"
            }`}
          >
            Import stems
          </label>
          <span className="text-xs text-gray-500">or drop multiple files here</span>
        </div>
      </div>

      {batchSummary && (
        <div
          className="rounded-lg border border-white/5 bg-surface/40 p-3 space-y-1.5 text-xs"
          data-testid="stem-batch-summary"
        >
          <p className="text-gray-300 font-medium">Batch import summary</p>
          <p data-testid="stem-batch-imported">
            Imported: <span className="font-mono">{batchSummary.imported}</span>
            {batchSummary.skipped > 0 && (
              <>
                {" "}
                · Skipped: <span className="font-mono">{batchSummary.skipped}</span>
              </>
            )}
          </p>
          {batchSummary.unsupported.length > 0 && (
            <p className="text-red-300/90" data-testid="stem-batch-unsupported">
              Unsupported: {batchSummary.unsupported.join(", ")}
            </p>
          )}
          {batchSummary.duplicates.length > 0 && (
            <p className="text-amber-200/80" data-testid="stem-batch-duplicates">
              Duplicate filenames: {batchSummary.duplicates.join(", ")}
            </p>
          )}
          {batchSummary.failed.length > 0 && (
            <p className="text-red-300/90" data-testid="stem-batch-failed">
              Failed to decode: {batchSummary.failed.join(", ")}
            </p>
          )}
          {batchSummary.guessedTypes.length > 0 && (
            <ul className="text-gray-500 space-y-0.5" data-testid="stem-batch-guessed">
              {batchSummary.guessedTypes.map((g) => (
                <li key={g.fileName}>
                  {g.fileName} → {stemTypeLabel(g.stemType)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {alignLines.length > 0 && (
        <ul className="text-xs text-gray-500 space-y-0.5" data-testid="stem-alignment-summary">
          {alignLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      {canNormalize && (
        <div className="space-y-2" data-testid="stem-normalize-panel">
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Stems do not match the full mix sample rate or duration. Normalize to align before export.
          </p>
          <button
            type="button"
            onClick={handleNormalizeClick}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-accent/90 text-black text-xs font-semibold hover:opacity-90 disabled:opacity-40"
            data-testid="stem-normalize-button"
          >
            Normalize stems to match full mix
          </button>
        </div>
      )}

      {showAlignChoice && alignment?.suggestPadMix && mix && (
        <div
          className="rounded-lg border border-violet-500/30 bg-violet-950/30 p-3 space-y-2 text-xs"
          data-testid="stem-alignment-choice"
        >
          <p className="text-violet-100/90 leading-relaxed">
            Stems are consistently longer than the full mix ({mix.durationSec.toFixed(1)}s). You may
            want to pad the full mix to {alignment.suggestedMixDurationSec.toFixed(1)}s instead of
            trimming stems.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="px-2 py-1 rounded bg-accent text-black font-medium"
              data-testid="stem-align-trim-pad"
              onClick={() => {
                setShowAlignChoice(false);
                onNormalizeStems("trim-pad-stems", true);
              }}
            >
              Trim/pad stems to full mix
            </button>
            <button
              type="button"
              disabled={busy}
              className="px-2 py-1 rounded border border-violet-400/40 text-violet-100"
              data-testid="stem-align-pad-mix"
              onClick={() => {
                setShowAlignChoice(false);
                onPadMixToStems(alignment.suggestedMixDurationSec);
              }}
            >
              Pad full mix to {alignment.suggestedMixDurationSec.toFixed(1)}s
            </button>
            <button
              type="button"
              disabled={busy}
              className="px-2 py-1 rounded text-gray-400 hover:text-gray-200"
              data-testid="stem-align-cancel"
              onClick={() => setShowAlignChoice(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {stems.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="stem-bulk-actions">
          <button
            type="button"
            disabled={busy}
            className="px-2 py-1 rounded text-xs border border-white/10 text-gray-400 hover:text-gray-200"
            data-testid="stem-bulk-normalize"
            onClick={handleNormalizeClick}
          >
            Normalize all
          </button>
          <button
            type="button"
            disabled={busy}
            className="px-2 py-1 rounded text-xs border border-white/10 text-gray-400 hover:text-gray-200"
            data-testid="stem-bulk-volume-full"
            onClick={onSetAllVolumesFull}
          >
            All volumes 100%
          </button>
          <button
            type="button"
            disabled={busy}
            className="px-2 py-1 rounded text-xs border border-red-500/20 text-red-300/80 hover:text-red-200"
            data-testid="stem-bulk-remove-all"
            onClick={() => {
              if (
                stems.length === 0 ||
                window.confirm(`Remove all ${stems.length} stems?`)
              ) {
                onRemoveAllStems();
              }
            }}
          >
            Remove all stems
          </button>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="text-xs space-y-1" data-testid="stem-validation-issues">
          {issues.map((issue, i) => (
            <li
              key={i}
              className={issue.level === "error" ? "text-red-300/90" : "text-amber-200/80"}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {stems.length === 0 ? (
        <p className="text-xs text-gray-600 italic" data-testid="stem-import-empty">
          No stems added — export will contain the full mix only.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="stem-import-list">
          {stems.map((stem) => {
            const src = stem.sourceSnapshot;
            const actions = formatStemNormalizeSummary(stem.normalizeMeta);
            const dur = pcmDurationSec(stem.samples, stem.channels, stem.sampleRate);
            return (
              <li
                key={stem.id}
                className="rounded-lg border border-white/5 bg-surface/50 p-3 space-y-2"
                data-testid="stem-import-item"
                data-stem-normalized={stem.normalizeMeta ? "true" : "false"}
              >
                <div className="flex justify-between gap-2">
                  <span className="text-xs text-gray-500 truncate">{stem.fileName}</span>
                  <button
                    type="button"
                    className="text-xs text-gray-500 hover:text-red-300 shrink-0"
                    onClick={() => onRemoveStem(stem.id)}
                    disabled={busy}
                    data-testid="stem-import-remove"
                  >
                    Remove
                  </button>
                </div>
                {(src || stem.normalizeMeta) && (
                  <p
                    className="text-[10px] text-gray-600 font-mono leading-relaxed"
                    data-testid="stem-align-status"
                  >
                    {src && (
                      <>
                        Source: {src.sampleRate} Hz · {src.durationSec.toFixed(1)}s
                        {src.channels !== (mix?.channels ?? stem.channels)
                          ? ` · ${src.channels} ch`
                          : ""}
                        {" → "}
                      </>
                    )}
                    Aligned: {stem.sampleRate} Hz · {dur.toFixed(1)}s
                    {actions.length > 0 ? ` (${actions.join(", ")})` : ""}
                    {stem.normalizeMeta?.largeTrim && (
                      <span className="text-amber-300/90"> · trimming applied</span>
                    )}
                  </p>
                )}
                <label className="block text-xs">
                  <span className="text-gray-500">Stem name</span>
                  <input
                    type="text"
                    value={stem.name}
                    onChange={(e) => onUpdateStem(stem.id, { name: e.target.value })}
                    className="mt-0.5 w-full bg-surface rounded px-2 py-1 text-gray-200 border border-white/5"
                    data-testid="stem-import-name"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-gray-500">Type</span>
                  <select
                    value={stem.stemType}
                    onChange={(e) =>
                      onUpdateStem(stem.id, { stemType: e.target.value as StemType })
                    }
                    className="mt-0.5 w-full bg-surface rounded px-2 py-1 text-gray-200 border border-white/5"
                    data-testid="stem-import-type"
                  >
                    {STEM_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Default volume</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(stem.defaultVolume * 100)}
                    onChange={(e) =>
                      onUpdateStem(stem.id, { defaultVolume: Number(e.target.value) / 100 })
                    }
                    data-testid="stem-import-volume"
                  />
                  <span className="font-mono w-8">{Math.round(stem.defaultVolume * 100)}%</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
