import { useEffect, useRef, useState } from "react";

import { decodeSourceToPcm } from "../converter/decodeSourceToPcm";
import type { OutputCodec } from "../converter/convertToMp5";
import { getCodec, getCodecLoadState } from "../wasm/codec";
import { codecExportOptionLabel } from "../lib/codecDisplay";
import { MetadataEditor } from "../components/MetadataEditor";
import { MetadataReviewPanel } from "../components/MetadataReviewPanel";
import { ConverterFlowSteps } from "../components/ConverterFlowSteps";
import { ExportSummaryPanel } from "../components/ExportSummaryPanel";
import { extractSourceMetadata, type SourceMetadata } from "../converter/extractSourceMetadata";
import {
  buildOverridesFromEdits,
  manualEditsFromSource,
  type ManualMetadataEdits,
} from "../converter/manualMetadata";
import { buildExportFilename } from "../converter/exportFilename";
import { buildExportSummary, type ExportSummary } from "../converter/exportSummary";
import { LOAD_PHASE_LABELS, runExportPipeline } from "../converter/exportPipeline";
import { importMp5ToPlayer } from "./playerImport";
import { saveMp5ToLibrary } from "../lib/localLibrary/api";
import { LibraryStorageError } from "../lib/localLibrary/errors";
import {
  USER_ERRORS,
  formatConverterDecodeError,
} from "../lib/userFacingErrors";
import { SupportedSourcesNote } from "../components/SupportedSourcesNote";
import { ConverterEmptyState } from "../components/ConverterEmptyState";
import { CodecModesHelper } from "../components/CodecModesHelper";
import { DemoFixtureActions } from "../components/DemoFixtureActions";
import { dismissOnboarding } from "../lib/firstRun";
import { FileDropZone } from "./FileDropZone";
import { BatchConverterPanel } from "../components/BatchConverterPanel";
import { StemImportSection } from "../components/StemImportSection";
import {
  validateStemsForExport,
  type PendingStemPcm,
} from "../converter/stemValidation";
import {
  analyzeStemAlignment,
  ensureStemSourceSnapshot,
  normalizeStemsToMixSequentially,
  padMixToDuration,
  pcmDurationSec,
  type StemAlignmentStrategy,
} from "../converter/stemNormalize";
import {
  assessBatchStemImport,
  buildBatchStemImportSummary,
  createPendingStemFromPcm,
  estimatePendingStemDecodedBytes,
  partitionStemFiles,
  type BatchStemImportSummary,
} from "../converter/batchStemImport";
import { downloadBlob } from "../lib/performance/downloadBlob";
import { assessSourceFile, type GuardrailMessage } from "../lib/performance/guardrails";
import { GuardrailNotice } from "../components/GuardrailNotice";
import { useConversionStore } from "../store/conversionStore";
import { recordUserFacingError } from "../lib/sessionDiagnostics";

type PendingPcm = {
  samples: Int16Array;
  sampleRate: number;
  channels: number;
  metadata: { title?: string };
};

type PendingSource = {
  file: File;
  pcm: PendingPcm;
  extracted: SourceMetadata;
};

function triggerDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function metaFromEdits(edits: ManualMetadataEdits) {
  return {
    title: edits.meta.title,
    artist: edits.meta.artist,
  };
}

type ConverterMode = "single" | "batch";

export function ConverterPanel() {
  const [mode, setMode] = useState<ConverterMode>("single");
  const [codec, setCodec] = useState<OutputCodec>("mp5l");
  const [preset, setPreset] = useState(2);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [loadState, setLoadState] = useState(getCodecLoadState());
  const [pending, setPending] = useState<PendingSource | null>(null);
  const [edits, setEdits] = useState<ManualMetadataEdits | null>(null);
  const [coverError, setCoverError] = useState("");
  const [exportDone, setExportDone] = useState(false);
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);
  const [lastExportFile, setLastExportFile] = useState<File | null>(null);
  const [lastExportBlob, setLastExportBlob] = useState<Blob | null>(null);
  const [librarySaveNote, setLibrarySaveNote] = useState("");
  const [stems, setStems] = useState<PendingStemPcm[]>([]);
  const [stemIssues, setStemIssues] = useState<ReturnType<typeof validateStemsForExport>["issues"]>([]);
  const [stemBatchSummary, setStemBatchSummary] = useState<BatchStemImportSummary | null>(null);
  const [stemImportGuardrails, setStemImportGuardrails] = useState<GuardrailMessage[]>([]);
  const [sourceGuardrails, setSourceGuardrails] = useState<GuardrailMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const { bumpCancelGeneration, setSinglePhase, resetSingle } = useConversionStore();

  const codecUnavailable = loadState === "unavailable";
  const codecReady = loadState === "ready";

  useEffect(() => {
    getCodec()
      .then(() => setLoadState(getCodecLoadState()))
      .catch(() => setLoadState("unavailable"));
  }, []);

  useEffect(() => {
    if (codecUnavailable && codec !== "pcm") {
      setCodec("pcm");
    }
  }, [codecUnavailable, codec]);

  useEffect(() => {
    if (error) recordUserFacingError("converter", error);
  }, [error]);

  function handleCancelConversion() {
    abortRef.current?.abort();
    bumpCancelGeneration();
    resetSingle();
    setBusy(false);
    setStatus("Conversion cancelled.");
    setPending(null);
    setEdits(null);
    setExportDone(false);
    setExportSummary(null);
    setLastExportFile(null);
    setLastExportBlob(null);
  }

  async function handleFiles(files: FileList) {
    const file = files[0];
    if (!file || busy) return;
    const guardrails = assessSourceFile(file);
    setSourceGuardrails(guardrails);
    if (guardrails.some((g) => g.level === "block")) {
      setError(USER_ERRORS.sourceTooLarge);
      return;
    }
    setBusy(true);
    setError("");
    setExportDone(false);
    setExportSummary(null);
    setLastExportFile(null);
    setLastExportBlob(null);
    setStatus(LOAD_PHASE_LABELS.decoding);
    setPending(null);
    setEdits(null);
    setStems([]);
    setStemIssues([]);
    setCoverError("");
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = useConversionStore.getState().cancelGeneration;
    setSinglePhase("decoding", file.name);
    try {
      const pcm = await decodeSourceToPcm(
        file,
        (msg) => setStatus(msg),
        controller.signal,
      );
      if (controller.signal.aborted || useConversionStore.getState().cancelGeneration !== gen) {
        return;
      }
      setStatus(LOAD_PHASE_LABELS.extracting);
      setSinglePhase("extracting", file.name);
      const extracted = await extractSourceMetadata(file, setStatus).catch(() => ({
        meta: { title: file.name.replace(/\.[^.]+$/, "") },
      }));
      if (controller.signal.aborted || useConversionStore.getState().cancelGeneration !== gen) {
        return;
      }
      setPending({ file, pcm, extracted });
      setEdits(manualEditsFromSource(extracted));
      dismissOnboarding();
      resetSingle();
      setStatus("Source loaded — edit metadata, preview tags, then export MP5-L v3.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus("Conversion cancelled.");
        return;
      }
      const msg = formatConverterDecodeError(file.name, e);
      if (msg) setError(msg);
      setStatus("");
      resetSingle();
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const mixDurationSec =
    pending != null
      ? pending.pcm.samples.length / pending.pcm.channels / pending.pcm.sampleRate
      : 0;

  useEffect(() => {
    if (!pending) {
      setStemIssues([]);
      return;
    }
    const { issues } = validateStemsForExport(
      {
        sampleRate: pending.pcm.sampleRate,
        channels: pending.pcm.channels,
        durationSec: mixDurationSec,
      },
      stems,
    );
    setStemIssues(issues);
  }, [pending, stems, mixDurationSec]);

  async function handleAddStems(files: File[]) {
    if (!pending || busy || !files.length) return;

    setStemImportGuardrails([]);
    setError("");

    const partition = partitionStemFiles(
      files,
      stems.map((s) => s.fileName),
    );
    const skipped =
      partition.unsupported.length + partition.duplicates.length;

    if (!partition.toImport.length) {
      setStemBatchSummary(
        buildBatchStemImportSummary({
          imported: 0,
          skipped,
          failed: [],
          partition,
          guessedTypes: [],
          mix: {
            sampleRate: pending.pcm.sampleRate,
            channels: pending.pcm.channels,
            durationSec: mixDurationSec,
          },
          stems,
        }),
      );
      setError(
        partition.unsupported.length
          ? USER_ERRORS.stemUnsupportedBatch
          : "All selected files were duplicates or unsupported.",
      );
      return;
    }

    const guardrails = assessBatchStemImport(
      stems.length,
      partition.toImport,
      estimatePendingStemDecodedBytes(stems),
    );
    setStemImportGuardrails(guardrails);
    const blocked = guardrails.filter((g) => g.level === "block");
    if (blocked.length) {
      setError(blocked.map((g) => g.message).join(" "));
      return;
    }

    setBusy(true);
    setError("");
    const imported: PendingStemPcm[] = [];
    const failed: string[] = [];
    const guessedTypes: { fileName: string; stemType: PendingStemPcm["stemType"] }[] = [];

    try {
      for (let i = 0; i < partition.toImport.length; i++) {
        const file = partition.toImport[i]!;
        setStatus(`Decoding stem ${i + 1}/${partition.toImport.length}: ${file.name}…`);
        try {
          const pcm = await decodeSourceToPcm(file, (msg) =>
            setStatus(`Stem ${i + 1}/${partition.toImport.length}: ${msg}`),
          );
          const stem = createPendingStemFromPcm(file, pcm);
          imported.push(stem);
          guessedTypes.push({ fileName: file.name, stemType: stem.stemType });
        } catch {
          failed.push(file.name);
        }
      }

      const nextStems = [...stems, ...imported];
      setStems(nextStems);
      const summary = buildBatchStemImportSummary({
        imported: imported.length,
        skipped: skipped + failed.length,
        failed,
        partition,
        guessedTypes,
        mix: {
          sampleRate: pending.pcm.sampleRate,
          channels: pending.pcm.channels,
          durationSec: mixDurationSec,
        },
        stems: nextStems,
      });
      setStemBatchSummary(summary);

      if (imported.length) {
        const alignHint = summary.alignment?.needsNormalization
          ? " — use Normalize stems if sample rate or duration differs."
          : "";
        setStatus(
          `Imported ${imported.length} stem${imported.length === 1 ? "" : "s"}${alignHint}`,
        );
      } else {
        setError(USER_ERRORS.stemDecodeFailed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleNormalizeStems(strategy: StemAlignmentStrategy, allowLargeTrim: boolean) {
    if (!pending || strategy !== "trim-pad-stems" || busy) return;
    const mixPcm = pending.pcm;
    setBusy(true);
    setError("");
    try {
      const normalized = await normalizeStemsToMixSequentially(
        mixPcm,
        stems,
        allowLargeTrim,
        ({ index, total, stem, working }) => {
          setStatus(
            `Normalizing stem ${index + 1}/${total}: ${stem.name || stem.fileName}…`,
          );
          setStems([...working]);
        },
      );
      const stillMisaligned = analyzeStemAlignment(mixPcm, normalized, mixDurationSec);
      if (stillMisaligned.needsNormalization) {
        setError(USER_ERRORS.stemAlignBlocked);
        return;
      }
      setStems(normalized);
      setStemBatchSummary((prev) =>
        buildBatchStemImportSummary({
          imported: prev?.imported ?? normalized.length,
          skipped: prev?.skipped ?? 0,
          failed: prev?.failed ?? [],
          partition: {
            toImport: [],
            unsupported: prev?.unsupported ?? [],
            duplicates: prev?.duplicates ?? [],
          },
          guessedTypes: prev?.guessedTypes ?? [],
          mix: {
            sampleRate: pending.pcm.sampleRate,
            channels: pending.pcm.channels,
            durationSec: mixDurationSec,
          },
          stems: normalized,
        }),
      );
      setStatus("Stems normalized to match full mix — review alignment status, then export.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function handlePadMixToStems(targetDurationSec: number) {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      const padded = padMixToDuration(pending.pcm, targetDurationSec);
      setPending({ ...pending, pcm: { ...pending.pcm, ...padded } });
      const normalized = await normalizeStemsToMixSequentially(
        padded,
        stems,
        true,
        ({ index, total, stem, working }) => {
          setStatus(
            `Normalizing stem ${index + 1}/${total}: ${stem.name || stem.fileName}…`,
          );
          setStems([...working]);
        },
      );
      setStems(normalized);
      setStatus(
        `Full mix padded to ${targetDurationSec.toFixed(1)}s and stems aligned — review before export.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    if (!pending || !edits || busy) return;
    const validation = validateStemsForExport(
      {
        sampleRate: pending.pcm.sampleRate,
        channels: pending.pcm.channels,
        durationSec: mixDurationSec,
      },
      stems,
    );
    if (!validation.canExport) {
      setError(USER_ERRORS.stemExportBlocked);
      return;
    }
    const hasWarnings = validation.issues.some((i) => i.level === "warning");
    if (hasWarnings && !window.confirm("Stem alignment warnings — export anyway?")) {
      return;
    }
    setBusy(true);
    setError("");
    setExportDone(false);
    setExportSummary(null);
    const exportGen = useConversionStore.getState().cancelGeneration;
    setSinglePhase("exporting", pending.file.name);
    try {
      const exportCodec = codecUnavailable ? "pcm" : codec;
      const { mp5, bundle, fingerprintWarning } = await runExportPipeline(
        {
          pcm: pending.pcm,
          extracted: pending.extracted,
          edits,
          codec: exportCodec,
          preset,
          sourceBytes: pending.file.size,
          stems: stems.length ? stems : undefined,
        },
        (_phase, label) => setStatus(label),
      );

      const validated = await import("@mp5/container").then((m) => m.parseMp5(mp5));
      const filename = buildExportFilename(metaFromEdits(edits), exportCodec, pending.file.name);
      const summary = buildExportSummary({
        filename,
        exportCodec,
        outputBytes: mp5.byteLength,
        sourceBytes: pending.file.size,
        bundle,
        validated,
      });

      const blob = new Blob([new Uint8Array(mp5)], { type: "audio/mp5" });
      const file = new File([blob], filename, { type: "audio/mp5" });
      if (useConversionStore.getState().cancelGeneration !== exportGen) {
        setStatus("Export cancelled — no download.");
        return;
      }
      setLastExportBlob(blob);
      setLastExportFile(file);
      setExportSummary(summary);
      setExportDone(true);
      if (fingerprintWarning) {
        setStatus((s) => `${s} ${fingerprintWarning}`.trim());
      }
      downloadBlob(blob, filename);
      setStatus("Export complete — ready to download or open in player.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setBusy(false);
      resetSingle();
    }
  }

  function handleDownloadAgain() {
    if (lastExportBlob && exportSummary) {
      downloadBlob(lastExportBlob, exportSummary.filename);
    }
  }

  async function handleOpenInPlayer() {
    if (!lastExportFile) return;
    await importMp5ToPlayer([lastExportFile], { playFirst: true });
  }

  async function handleAddToPlaylist() {
    if (!lastExportFile) return;
    await importMp5ToPlayer([lastExportFile], { playFirst: false });
  }

  async function handleSaveToLibrary() {
    if (!lastExportFile) return;
    setLibrarySaveNote("");
    try {
      const result = await saveMp5ToLibrary(lastExportFile, lastExportFile.name);
      setLibrarySaveNote(
        result.duplicate
          ? result.duplicateReason === "fingerprint"
            ? "Already in library (same fingerprint)."
            : "Already in library (same name and size)."
          : "Saved to local library.",
      );
    } catch (e) {
      setLibrarySaveNote(
        e instanceof LibraryStorageError && e.code === "quota"
          ? USER_ERRORS.libraryQuota
          : e instanceof Error
            ? e.message
            : String(e),
      );
    }
  }

  return (
    <div className="space-y-5" data-testid="converter-panel">
      <div className="flex gap-2" role="tablist" aria-label="Converter mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "single"}
          onClick={() => setMode("single")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            mode === "single"
              ? "bg-accent text-black"
              : "bg-surface-elevated text-gray-400 border border-white/10"
          }`}
          data-testid="converter-mode-single"
        >
          Single file
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "batch"}
          onClick={() => setMode("batch")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            mode === "batch"
              ? "bg-accent text-black"
              : "bg-surface-elevated text-gray-400 border border-white/10"
          }`}
          data-testid="converter-mode-batch"
        >
          Batch
        </button>
      </div>

      {mode === "batch" ? (
        <BatchConverterPanel />
      ) : (
        <>
      <div className="mp5-card p-4 sm:p-5 space-y-3 border-accent/15">
        <h2 className="text-lg font-semibold text-white">Convert to MP5</h2>
        <p className="text-sm text-gray-400 leading-relaxed" data-testid="converter-export-help">
          Drop FLAC, WAV, MP3, M4A, or OGG. Default export is{" "}
          <strong className="text-gray-300">MP5-L v3</strong>. Review metadata, then export and open in
          the player.
        </p>
        <ConverterFlowSteps hasSource={!!pending} exportDone={exportDone} />
      </div>

      {loadState === "loading" && (
        <p className="text-xs text-gray-400 bg-surface-elevated rounded-lg p-2">Loading WASM codecs…</p>
      )}

      {codecUnavailable && (
        <p
          className="text-xs text-amber-200/90 bg-amber-950/40 rounded-lg p-2"
          data-testid="codec-unavailable-banner"
        >
          <strong>MP5 codecs require WASM.</strong> Run <code className="text-accent">pnpm wasm:build</code>{" "}
          and refresh. Until then, only <strong>PCM reference / debug</strong> export is available — not
          MP5-L v3.
        </p>
      )}

      {codecReady && (
        <p className="text-xs text-green-400/90 bg-green-950/30 rounded-lg p-2" data-testid="codec-ready-banner">
          <strong>Default: MP5-L v3</strong> — lossless, bit-exact, modest compression. MP5-H is hybrid
          (large). MP5-C is lab-only and may hiss.
        </p>
      )}

      {!pending && !busy && <ConverterEmptyState />}

      <DemoFixtureActions
        compact
        testIdPrefix="converter"
        onLoaded={async (file, playFirst) => {
          await importMp5ToPlayer([file], { playFirst });
        }}
      />

      <SupportedSourcesNote />

      <GuardrailNotice messages={sourceGuardrails} testId="converter-source-guardrails" />

      <FileDropZone
        accept="audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg,.opus"
        label={busy && !pending ? "Loading source…" : "1. Drop source audio (FLAC / WAV / MP3 / …)"}
        onFiles={handleFiles}
        disabled={busy}
        testId="converter-file-input"
      />

      {busy && (
        <button
          type="button"
          onClick={handleCancelConversion}
          className="text-sm text-red-300/90 hover:underline"
          data-testid="converter-cancel"
        >
          Cancel conversion
        </button>
      )}

      {pending && edits && (
        <>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">2–3. Metadata</p>
          <MetadataEditor
            edits={edits}
            onChange={setEdits}
            coverError={coverError}
            onCoverError={setCoverError}
          />
          <MetadataReviewPanel extracted={pending.extracted} edits={edits} />
          <StemImportSection
            stems={stems}
            issues={stemIssues}
            mix={
              pending
                ? {
                    sampleRate: pending.pcm.sampleRate,
                    channels: pending.pcm.channels,
                    durationSec: mixDurationSec,
                  }
                : null
            }
            busy={busy}
            batchSummary={stemBatchSummary}
            importGuardrails={stemImportGuardrails}
            onAddStems={(files) => void handleAddStems(files)}
            onUpdateStem={(id, patch) =>
              setStems((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
            }
            onRemoveStem={(id) => setStems((prev) => prev.filter((s) => s.id !== id))}
            onRemoveAllStems={() => {
              setStems([]);
              setStemBatchSummary(null);
            }}
            onSetAllVolumesFull={() =>
              setStems((prev) => prev.map((s) => ({ ...s, defaultVolume: 1 })))
            }
            onNormalizeStems={(strategy, allowLargeTrim) => {
              void handleNormalizeStems(strategy, allowLargeTrim);
            }}
            onPadMixToStems={(sec) => {
              void handlePadMixToStems(sec);
            }}
          />
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-accent text-black font-semibold text-sm hover:opacity-90 disabled:opacity-40"
            data-testid="export-mp5-button"
          >
            {busy ? "Exporting…" : "4. Export MP5"}
          </button>
        </>
      )}

      {librarySaveNote && (
        <p className="text-xs text-gray-400" data-testid="converter-library-save-note">
          {librarySaveNote}
        </p>
      )}

      {exportSummary && exportDone && (
        <ExportSummaryPanel
          summary={exportSummary}
          onDownloadAgain={handleDownloadAgain}
          onOpenInPlayer={() => void handleOpenInPlayer()}
          onAddToPlaylist={() => void handleAddToPlaylist()}
          onSaveToLibrary={() => void handleSaveToLibrary()}
        />
      )}

      {codec === "mp5c" && codecReady && (
        <p className="text-xs text-amber-200/90 bg-amber-950/40 rounded-lg p-2" data-testid="mp5c-hiss-warning">
          <strong>MP5-C is experimental / lab-only.</strong> Not for normal listening — audible hiss on all
          presets. Use MP5-L v3 (default) or PCM.
        </p>
      )}

      {codec === "mp5h" && codecReady && (
        <p className="text-xs text-blue-200/90 bg-blue-950/30 rounded-lg p-2" data-testid="mp5h-size-warning">
          <strong>MP5-H is hybrid (not default).</strong> MP5-C base + lossless CORR correction. Larger than
          MP5-L.
        </p>
      )}

      <CodecModesHelper />

      <div className="flex flex-col sm:flex-row flex-wrap gap-4">
        <label className="text-sm text-gray-400 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span>Export format</span>
          <select
            value={codec}
            onChange={(e) => setCodec(e.target.value as OutputCodec)}
            className="bg-surface-elevated rounded-lg px-3 py-1.5 max-w-md border border-white/10 mp5-focus-ring"
            data-testid="codec-select"
            disabled={codecUnavailable || busy}
            aria-label="Export format"
          >
            {codecUnavailable ? (
              <option value="pcm">{codecExportOptionLabel("pcm")} (WASM required for MP5 codecs)</option>
            ) : (
              <>
                <option value="mp5l">{codecExportOptionLabel("mp5l")}</option>
                <option value="mp5h">{codecExportOptionLabel("mp5h")}</option>
                <option value="pcm">{codecExportOptionLabel("pcm")}</option>
                <option value="mp5c">{codecExportOptionLabel("mp5c")}</option>
              </>
            )}
          </select>
        </label>

        <label className="text-sm text-gray-400 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span>Preset (MP5-C / MP5-H)</span>
          <select
            value={preset}
            onChange={(e) => setPreset(Number(e.target.value))}
            className="bg-surface-elevated rounded-lg px-3 py-1.5 border border-white/10 mp5-focus-ring"
            disabled={codec === "mp5l" || codec === "pcm" || busy}
            data-testid="preset-select"
            aria-label="Codec preset"
          >
            <option value={0}>Low</option>
            <option value={1}>Standard (smaller / may hiss)</option>
            <option value={2}>High (balanced)</option>
            <option value={3}>Extreme (finest MP5-C — still may hiss)</option>
          </select>
        </label>
      </div>

      {busy && status && (
        <p className="text-sm text-accent" data-testid="convert-busy">
          {status}
        </p>
      )}
      {!busy && status && (
        <p className="text-sm text-green-400" data-testid="convert-status">
          {status}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-400" data-testid="convert-error">
          {error}
        </p>
      )}
        </>
      )}
    </div>
  );
}
