import { useEffect, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { FileText } from "@phosphor-icons/react/FileText";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Waveform } from "@phosphor-icons/react/Waveform";

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
  visualThemeEditsFromPayload,
  type ManualMetadataEdits,
} from "../converter/manualMetadata";
import { buildExportFilename, normalizeExportFilename } from "../converter/exportFilename";
import { buildExportSummary, type ExportSummary } from "../converter/exportSummary";
import { LOAD_PHASE_LABELS } from "../converter/exportPipeline";
import { runExportPipelineOffThread } from "../converter/exportPipelineClient";
import { importMp5ToPlayer } from "./playerImport";
import { saveMp5ToLibrary } from "../lib/localLibrary/api";
import { buildSingleExportSummaryText } from "../lib/album/exportReview";
import { recordExportContext } from "../lib/sessionDiagnostics";
import { LibraryStorageError } from "../lib/localLibrary/errors";
import {
  USER_ERRORS,
  formatConverterDecodeError,
} from "../lib/userFacingErrors";
import { SupportedSourcesNote } from "../components/SupportedSourcesNote";
import { CodecModesHelper } from "../components/CodecModesHelper";
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
import { usePlayerStore } from "../store/playerStore";
import { recordUserFacingError } from "../lib/sessionDiagnostics";
import { AiSuggestionsPanel } from "../components/AiSuggestionsPanel";
import {
  enrichWithAi,
  suggestionsToTagString,
  beatBpmLabel,
  type AiAnalysisProgress,
  type AiMetadataSuggestions,
} from "../converter/aiMetadataHooks";
import { cloudAiConfigured, loadAiSettings } from "../lib/ai/aiSettings";
import { formatSectionsText } from "../lib/sections/sectionParser";
import { formatSyncedLyricsText } from "../lib/lyrics/lyrcTimestampParser";
import { sanitizeUnsyncedLyrics } from "../lib/ai/lyricSanitize";
import { ConverterSourceCard } from "../components/ConverterSourceCard";

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
type ConverterStage = "source" | "metadata" | "export";

/**
 * Codecs offered only while the lab / advanced toggle is open.
 * Public converter surface is MP5-L v4 + PCM, plus MP5-C v6 as a clearly
 * labeled beta preview (not default; bitstream not frozen).
 */
const LAB_ONLY_CODECS: ReadonlySet<OutputCodec> = new Set<OutputCodec>([
  "mp5l",
  "mp5c",
  "mp5c2",
  "mp5h",
]);

function stageAfterSourceLoad(): ConverterStage {
  if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches) {
    return "export";
  }
  return "metadata";
}

function codecPresentation(codec: OutputCodec): {
  name: string;
  qualifier: string;
  description: string;
  badges: { label: string; verified?: boolean }[];
} {
  switch (codec) {
    case "mp5l_v4":
      return {
        name: "MP5-L v4",
        qualifier: "Recommended",
        description: "Lossless, bit-exact audio with the current default MP5 encoder.",
        badges: [
          { label: "MP5-L v4" },
          { label: "Lossless", verified: true },
          { label: "Bit-exact", verified: true },
        ],
      };
    case "mp5l":
      return {
        name: "MP5-L v3",
        qualifier: "Lab / legacy",
        description: "Lossless, bit-exact legacy MP5-L encoding.",
        badges: [
          { label: "MP5-L v3" },
          { label: "Lossless", verified: true },
          { label: "Bit-exact", verified: true },
        ],
      };
    case "mp5c2":
      return {
        name: "MP5-C2",
        qualifier: "Lossless · lab · not default",
        description:
          "Bit-exact lossless. Quiet passages use MP5-L; loud units take the smaller of signal-relative + CORR or MP5-L.",
        badges: [
          { label: "MP5-C2" },
          { label: "Lossless", verified: true },
          { label: "Bit-exact", verified: true },
          { label: "Not default" },
        ],
      };
    case "mp5c6":
      return {
        name: "MP5-C v6",
        qualifier: "Lossy · beta preview · not default",
        description:
          "Beta-preview lossy MDCT loud path. Quiet, fragile and decaying-tail passages stay bit-exact MP5-L, but the file as a whole is not bit-exact and the bitstream is not frozen — files may not decode in future builds.",
        badges: [
          { label: "MP5-C v6" },
          { label: "Lossy" },
          { label: "Beta preview" },
          { label: "Protect islands bit-exact", verified: true },
          { label: "Not frozen" },
        ],
      };
    case "mp5h":
      return {
        name: "MP5-H",
        qualifier: "Hybrid · large",
        description: "MP5-C base audio with a lossless correction layer when available.",
        badges: [{ label: "MP5-H" }, { label: "Hybrid" }, { label: "CORR layer" }],
      };
    case "mp5c":
      return {
        name: "MP5-C classic (legacy)",
        qualifier: "Experimental / lab",
        description: "Lossy research codec that may add audible hiss.",
        badges: [{ label: "MP5-C classic" }, { label: "Lossy" }, { label: "Lab" }],
      };
    case "pcm":
      return {
        name: "PCM",
        qualifier: "Reference / debug",
        description: "Uncompressed reference audio for debugging and comparison.",
        badges: [{ label: "PCM" }, { label: "Uncompressed" }, { label: "Bit-exact", verified: true }],
      };
  }
}

function metadataFieldCount(edits: ManualMetadataEdits | null): number {
  if (!edits) return 0;
  return Object.values(edits.meta).filter((value) => value.trim().length > 0).length;
}

function toFileList(files: File[]): FileList {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer.files;
}

export function ConverterPanel() {
  const [mode, setMode] = useState<ConverterMode>("single");
  const [stage, setStage] = useState<ConverterStage>("source");
  const [codec, setCodec] = useState<OutputCodec>("mp5l_v4");
  const [preset, setPreset] = useState(2);
  const [labCodecsOpen, setLabCodecsOpen] = useState(false);
  const [formatsOpen, setFormatsOpen] = useState(false);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [exportProgress, setExportProgress] = useState<number | null>(null);
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
  const [customOutputFilename, setCustomOutputFilename] = useState<string | null>(null);
  const [librarySaveNote, setLibrarySaveNote] = useState("");
  const [stems, setStems] = useState<PendingStemPcm[]>([]);
  const [stemIssues, setStemIssues] = useState<ReturnType<typeof validateStemsForExport>["issues"]>([]);
  const [stemBatchSummary, setStemBatchSummary] = useState<BatchStemImportSummary | null>(null);
  const [stemImportGuardrails, setStemImportGuardrails] = useState<GuardrailMessage[]>([]);
  const [sourceGuardrails, setSourceGuardrails] = useState<GuardrailMessage[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AiMetadataSuggestions>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState<AiAnalysisProgress | null>(null);
  const [aiError, setAiError] = useState("");
  const [seedBatchFiles, setSeedBatchFiles] = useState<File[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const formatControlRef = useRef<HTMLDivElement>(null);
  const { bumpCancelGeneration, setSinglePhase, resetSingle } = useConversionStore();
  const pendingConverterFiles = usePlayerStore((s) => s.pendingConverterFiles);
  const consumePendingConverterFiles = usePlayerStore((s) => s.consumePendingConverterFiles);

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
    if (!labCodecsOpen && LAB_ONLY_CODECS.has(codec)) {
      setCodec("mp5l_v4");
    }
  }, [labCodecsOpen, codec]);

  useEffect(() => {
    if (!formatMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!formatControlRef.current?.contains(event.target as Node)) {
        setFormatMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFormatMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [formatMenuOpen]);

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
    setCustomOutputFilename(null);
    setStage("source");
  }

  async function handleFiles(files: FileList) {
    const file = files[0];
    if (!file || busy) return;
    dismissOnboarding();
    const guardrails = assessSourceFile(file);
    setSourceGuardrails(guardrails);
    if (guardrails.some((g) => g.level === "block")) {
      setError(USER_ERRORS.sourceTooLarge);
      return;
    }
    setBusy(true);
    setStage("source");
    setError("");
    setExportDone(false);
    setExportSummary(null);
    setLastExportFile(null);
    setLastExportBlob(null);
    setCustomOutputFilename(null);
    setStatus(LOAD_PHASE_LABELS.decoding);
    setPending(null);
    setEdits(null);
    setStems([]);
    setStemIssues([]);
    setCoverError("");
    setAiSuggestions({});
    setAiError("");
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
      setStage(stageAfterSourceLoad());
      dismissOnboarding();
      resetSingle();
      setStatus("Source loaded — edit metadata, preview tags, then export MP5-L v4.");
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

  // Open→Convert handoff: consume staged source files when Converter mounts/tab focuses.
  useEffect(() => {
    if (!pendingConverterFiles?.length || busy) return;
    const files = consumePendingConverterFiles();
    if (!files?.length) return;
    if (files.length === 1) {
      void handleFiles(toFileList(files));
      return;
    }
    setMode("batch");
    setSeedBatchFiles(files);
    // handleFiles is intentionally omitted — run once per pendingConverterFiles change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingConverterFiles, consumePendingConverterFiles, busy]);

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

  async function handleAnalyzeWithAi() {
    if (!pending || !edits || aiBusy) return;
    const settings = loadAiSettings();
    if (!settings.enabled) {
      setAiError("Enable AI suggestions in Settings first.");
      return;
    }
    setAiBusy(true);
    setAiError("");
    setAiProgress({
      label: "Preparing analysis…",
      detail: "Checking which features are enabled in Settings.",
      step: 0,
      totalSteps: 1,
      percent: 0,
    });
    try {
      const suggestions = await enrichWithAi({
        pcm: pending.pcm.samples,
        sampleRate: pending.pcm.sampleRate,
        channels: pending.pcm.channels,
        cover: edits.cover === null ? undefined : edits.cover ?? pending.extracted.cover,
        context: {
          title: edits.meta.title,
          artist: edits.meta.artist,
          album: edits.meta.album,
          genre: edits.meta.genre,
          comment: edits.meta.comment,
          lyricsText: [edits.lyricsUnsynced, edits.lyricsSyncedText].filter(Boolean).join("\n"),
        },
        onProgress: setAiProgress,
      });
      setAiSuggestions(suggestions);
      const partial =
        suggestions.beat ||
        suggestions.beatCloud ||
        suggestions.sect?.sections.length ||
        suggestions.lyrc?.unsynced ||
        suggestions.lyrc?.synced?.length ||
        suggestions.expl ||
        suggestions.safe ||
        suggestions.mood ||
        suggestions.vibe ||
        suggestions.summ ||
        suggestions.visu;
      const partialErrors = [
        suggestions.cloudBeatError,
        suggestions.cloudStructureError,
        suggestions.cloudLyricsError,
        suggestions.cloudContentWarningsError,
        suggestions.coverPaletteError,
      ].filter(Boolean);
      if (!partial) {
        setAiError(
          partialErrors[0] ??
            "No suggestions returned. Check API key, enable cloud features in Settings, or try different metadata.",
        );
      } else if (partialErrors.length) {
        setAiError(`Partial success: ${partialErrors.join("; ")}`);
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
      setAiProgress(null);
    }
  }

  function acceptBeatSuggestion(beat: NonNullable<AiMetadataSuggestions["beat"]>) {
    if (!edits) return;
    setEdits({
      ...edits,
      beatBpm: beatBpmLabel(beat),
      beatKey: beat.key ?? edits.beatKey,
      beatTimeSignature: beat.timeSignature ?? edits.beatTimeSignature,
      beatSource: beat.source ?? "ai-local",
    });
  }

  function acceptMoodVibeSuggestion() {
    if (!edits) return;
    setEdits({
      ...edits,
      moodTags: aiSuggestions.mood?.tags?.length
        ? suggestionsToTagString(aiSuggestions.mood.tags)
        : edits.moodTags,
      vibeTags: aiSuggestions.vibe?.tags?.length
        ? suggestionsToTagString(aiSuggestions.vibe.tags)
        : edits.vibeTags,
      moodSource: aiSuggestions.mood?.source ?? edits.moodSource,
      vibeSource: aiSuggestions.vibe?.source ?? edits.vibeSource,
    });
  }

  function acceptSummarySuggestion() {
    if (!edits || !aiSuggestions.summ?.text) return;
    setEdits({
      ...edits,
      trackSummary: aiSuggestions.summ.text,
      summSource: aiSuggestions.summ.source ?? "ai-cloud",
    });
  }

  function acceptVisualThemeSuggestion() {
    if (!edits || !aiSuggestions.visu) return;
    setEdits({
      ...edits,
      visualTheme: visualThemeEditsFromPayload(aiSuggestions.visu),
    });
  }

  function acceptStructureSuggestion() {
    if (!edits || !aiSuggestions.sect?.sections.length) return;
    setEdits({
      ...edits,
      sectionsText: formatSectionsText(aiSuggestions.sect.sections),
    });
  }

  function acceptLyricsSuggestion() {
    if (!edits || !aiSuggestions.lyrc) return;
    setEdits({
      ...edits,
      lyricsUnsynced: aiSuggestions.lyrc.unsynced
        ? sanitizeUnsyncedLyrics(aiSuggestions.lyrc.unsynced)
        : edits.lyricsUnsynced,
      lyricsSyncedText: aiSuggestions.lyrc.synced?.length
        ? formatSyncedLyricsText(aiSuggestions.lyrc.synced)
        : edits.lyricsSyncedText,
      lyricsSource: aiSuggestions.lyrc.source ?? "ai-cloud",
    });
  }

  function acceptContentWarningsSuggestion() {
    if (!edits) return;
    const expl = aiSuggestions.expl;
    const safe = aiSuggestions.safe;
    if (!expl && !safe) return;
    setEdits({
      ...edits,
      expl: expl
        ? {
            ...edits.expl,
            explicit: edits.expl.explicit || !!expl.explicit,
            cleanVersionAvailable: edits.expl.cleanVersionAvailable || !!expl.cleanVersionAvailable,
            strongLanguage: edits.expl.strongLanguage || !!expl.strongLanguage,
            sexualContent: edits.expl.sexualContent || !!expl.sexualContent,
            violence: edits.expl.violence || !!expl.violence,
            drugReferences: edits.expl.drugReferences || !!expl.drugReferences,
            alcoholReferences: edits.expl.alcoholReferences || !!expl.alcoholReferences,
            selfHarmThemes: edits.expl.selfHarmThemes || !!expl.selfHarmThemes,
            traumaThemes: edits.expl.traumaThemes || !!expl.traumaThemes,
            matureThemes: edits.expl.matureThemes || !!expl.matureThemes,
          }
        : edits.expl,
      safe: safe
        ? {
            ...edits.safe,
            griefThemes: edits.safe.griefThemes || !!safe.griefThemes,
            traumaThemes: edits.safe.traumaThemes || !!safe.traumaThemes,
            distressingThemes: edits.safe.distressingThemes || !!safe.distressingThemes,
          }
        : edits.safe,
    });
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
    setExportProgress(0);
    const exportGen = useConversionStore.getState().cancelGeneration;
    const controller = new AbortController();
    abortRef.current = controller;
    setSinglePhase("exporting", pending.file.name);
    try {
      const exportCodec = codecUnavailable ? "pcm" : codec;
      const { mp5, bundle, fingerprintWarning } = await runExportPipelineOffThread(
        {
          pcm: pending.pcm,
          extracted: pending.extracted,
          edits,
          codec: exportCodec,
          preset,
          sourceBytes: pending.file.size,
          stems: stems.length ? stems : undefined,
        },
        (_phase, label, percent) => {
          setStatus(label);
          setExportProgress(percent);
        },
        { signal: controller.signal },
      );

      const validated = await import("@mp5/container").then((m) => m.parseMp5(mp5));
      const suggestedFilename = buildExportFilename(
        metaFromEdits(edits),
        exportCodec,
        pending.file.name,
        preset,
      );
      const filename = normalizeExportFilename(
        customOutputFilename ?? suggestedFilename,
        suggestedFilename,
      );
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
      if (customOutputFilename?.trim()) setCustomOutputFilename(filename);
      setExportSummary(summary);
      setExportDone(true);
      recordExportContext({
        exportMode: "single",
        codecPreset: `${exportCodec.toUpperCase()} preset ${preset}`,
        trackCount: 1,
        packageType: "single .mp5",
        warningCount: fingerprintWarning ? 1 : 0,
      });
      if (fingerprintWarning) {
        setStatus((s) => `${s} ${fingerprintWarning}`.trim());
      }
      downloadBlob(blob, filename);
      setStatus("Export complete — ready to download or open in player.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus("Export cancelled — no download.");
      } else {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("");
      }
    } finally {
      abortRef.current = null;
      setExportProgress(null);
      setBusy(false);
      resetSingle();
    }
  }

  function handleDownloadAgain() {
    if (lastExportBlob && exportSummary) {
      downloadBlob(lastExportBlob, exportSummary.filename);
    }
  }

  function handleCopySummary() {
    if (!exportSummary) return;
    const text = buildSingleExportSummaryText({
      filename: exportSummary.filename,
      codecLabel: exportSummary.codecLabel,
      outputBytes: exportSummary.outputBytes,
      sourceBytes: exportSummary.sourceBytes,
      hasMetaTags: exportSummary.hasMetaTags,
      hasCoverArt: exportSummary.hasCoverArt,
      hasLyrics: exportSummary.hasLyrics,
      stemCount: exportSummary.stemCount,
    });
    void navigator.clipboard?.writeText(text).then(
      () => setLibrarySaveNote("Summary copied to clipboard."),
      () => setLibrarySaveNote("Could not copy summary."),
    );
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
      if (result.status === "failed") {
        setLibrarySaveNote(
          result.errorCode === "quota" ? USER_ERRORS.libraryQuota : result.message,
        );
        return;
      }
      setLibrarySaveNote(
        result.status === "duplicate"
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

  const codecView = codecPresentation(codecUnavailable ? "pcm" : codec);
  const suggestedOutputFilename = pending && edits
    ? buildExportFilename(
        metaFromEdits(edits),
        codecUnavailable ? "pcm" : codec,
        pending.file.name,
        preset,
      )
    : "Untitled.mp5";
  const outputFilename = customOutputFilename ?? suggestedOutputFilename;

  function commitOutputFilename() {
    const filename = normalizeExportFilename(outputFilename, suggestedOutputFilename);
    setCustomOutputFilename(customOutputFilename?.trim() ? filename : null);
    if (lastExportBlob) {
      setLastExportFile(new File([lastExportBlob], filename, { type: "audio/mp5" }));
    }
    setExportSummary((summary) => summary ? { ...summary, filename } : summary);
  }

  const effectiveCover = edits?.cover === null
    ? undefined
    : edits?.cover ?? pending?.extracted.cover;
  const fieldCount = metadataFieldCount(edits);
  const hasLyrics = Boolean(edits?.lyricsUnsynced.trim() || edits?.lyricsSyncedText.trim());
  const canExport = Boolean(pending && edits && !busy);

  return (
    <div
      className="mp5-converter-export-desk"
      data-testid="converter-panel"
      data-stage={stage}
      data-mode={mode}
    >
      <header className="mp5-converter-heading">
        <div className="mp5-converter-title">
          <h2>Convert audio</h2>
          <p data-testid="converter-export-help">
            Build a rich, verified MP5 file locally in your browser.
          </p>
        </div>
        <div className="mp5-converter-mode" role="tablist" aria-label="Converter mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "single"}
            onClick={() => setMode("single")}
            data-testid="converter-mode-single"
          >
            Single file
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "batch"}
            onClick={() => setMode("batch")}
            data-testid="converter-mode-batch"
          >
            Batch
          </button>
        </div>
      </header>

      {mode === "batch" ? (
        <section className="mp5-converter-batch" data-testid="converter-batch-workspace">
          <BatchConverterPanel
            seedFiles={seedBatchFiles}
            onSeedConsumed={() => setSeedBatchFiles(null)}
          />
        </section>
      ) : (
        <>
          <ConverterFlowSteps
            hasSource={Boolean(pending)}
            exportDone={exportDone}
            metadataOpen={stage === "metadata"}
          />

          <div className="mp5-converter-workspace" data-testid="converter-workspace">
            <div
              className="mp5-converter-main-column"
              data-testid={!pending && !busy ? "converter-intro-row" : undefined}
            >
              <GuardrailNotice messages={sourceGuardrails} testId="converter-source-guardrails" />

              {!pending ? (
                <section className="mp5-converter-source-empty" data-testid="converter-empty-state">
                  <div>
                    <h3>Source audio</h3>
                    <p>Choose FLAC, WAV, MP3, M4A, OGG, or Opus. Conversion runs locally in your browser.</p>
                  </div>
                  <FileDropZone
                    accept="audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg,.opus"
                    label={busy ? "Loading source…" : "Drop source audio or choose a file"}
                    onFiles={handleFiles}
                    disabled={busy}
                    testId="converter-file-input"
                  />
                  <SupportedSourcesNote />
                </section>
              ) : (
                <>
                  <input
                    ref={sourceInputRef}
                    type="file"
                    className="hidden"
                    accept="audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg,.opus"
                    disabled={busy}
                    data-testid="converter-file-input"
                    onChange={(event) => {
                      if (event.currentTarget.files) void handleFiles(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <ConverterSourceCard
                    file={pending.file}
                    pcm={pending.pcm}
                    cover={effectiveCover}
                    busy={busy}
                    onReplace={() => sourceInputRef.current?.click()}
                    onFiles={(files) => void handleFiles(files)}
                  />
                </>
              )}

              {!pending && busy && status && (
                <div className="mp5-converter-inline-status">
                  <p data-testid="convert-busy">{status}</p>
                  <button type="button" onClick={handleCancelConversion} data-testid="converter-cancel">
                    Cancel
                  </button>
                </div>
              )}
              {!pending && !busy && status && <p className="mp5-converter-success" data-testid="convert-status">{status}</p>}
              {!pending && error && (
                <div className="mp5-converter-error" data-testid="convert-error-block">
                  <p data-testid="convert-error">{error}</p>
                </div>
              )}

              {pending && edits && (
                <section className="mp5-converter-metadata-shell">
                  <div className="mp5-converter-mobile-metadata-summary" data-testid="converter-mobile-metadata-summary">
                    <FileText size={22} aria-hidden />
                    <strong>Metadata</strong>
                    <span>{fieldCount} field{fieldCount === 1 ? "" : "s"} ready</span>
                    <button
                      type="button"
                      onClick={() => setStage("metadata")}
                      data-testid="converter-mobile-edit-metadata"
                    >
                      <PencilSimple size={16} /> Edit
                    </button>
                  </div>

                  <div className="mp5-converter-metadata-workspace">
                    <MetadataEditor
                      edits={edits}
                      onChange={setEdits}
                      coverError={coverError}
                      onCoverError={setCoverError}
                    />

                    <button
                      type="button"
                      className="mp5-converter-metadata-continue"
                      onClick={() => setStage("export")}
                      data-testid="converter-mobile-metadata-done"
                    >
                      Continue to Export
                    </button>

                    <button
                      type="button"
                      className="mp5-converter-disclosure-button mp5-converter-tools-toggle"
                      onClick={() => setAdvancedToolsOpen((open) => !open)}
                      aria-expanded={advancedToolsOpen}
                      data-testid="converter-advanced-tools-toggle"
                    >
                      <span>
                        <strong>Stems &amp; AI tools</strong>
                        <small>Import stems and review optional AI suggestions.</small>
                      </span>
                      <CaretDown className={advancedToolsOpen ? "rotate-180" : undefined} size={18} weight="bold" />
                    </button>

                    {advancedToolsOpen && (
                      <div className="mp5-converter-tools-body">
                        <AiSuggestionsPanel
                          suggestions={aiSuggestions}
                          busy={aiBusy}
                          progress={aiProgress}
                          error={aiError}
                          onAnalyze={() => void handleAnalyzeWithAi()}
                          onAcceptBeat={acceptBeatSuggestion}
                          onAcceptStructure={acceptStructureSuggestion}
                          onAcceptLyrics={acceptLyricsSuggestion}
                          onAcceptContentWarnings={acceptContentWarningsSuggestion}
                          onAcceptMoodVibe={acceptMoodVibeSuggestion}
                          onAcceptSummary={acceptSummarySuggestion}
                          onAcceptVisualTheme={acceptVisualThemeSuggestion}
                          onDismiss={() => setAiSuggestions({})}
                          aiEnabled={loadAiSettings().enabled}
                          cloudConfigured={cloudAiConfigured(loadAiSettings())}
                          cloudBeatEnabled={loadAiSettings().cloudBeat}
                          cloudStructureEnabled={loadAiSettings().cloudStructure}
                          cloudLyricsEnabled={loadAiSettings().cloudLyrics}
                          cloudContentWarningsEnabled={loadAiSettings().cloudContentWarnings}
                        />
                        <StemImportSection
                          stems={stems}
                          issues={stemIssues}
                          mix={{
                            sampleRate: pending.pcm.sampleRate,
                            channels: pending.pcm.channels,
                            durationSec: mixDurationSec,
                          }}
                          busy={busy}
                          batchSummary={stemBatchSummary}
                          importGuardrails={stemImportGuardrails}
                          onAddStems={(files) => void handleAddStems(files)}
                          onUpdateStem={(id, patch) =>
                            setStems((previous) => previous.map((stem) => stem.id === id ? { ...stem, ...patch } : stem))
                          }
                          onRemoveStem={(id) => setStems((previous) => previous.filter((stem) => stem.id !== id))}
                          onRemoveAllStems={() => {
                            setStems([]);
                            setStemBatchSummary(null);
                          }}
                          onSetAllVolumesFull={() =>
                            setStems((previous) => previous.map((stem) => ({ ...stem, defaultVolume: 1 })))
                          }
                          onNormalizeStems={(strategy, allowLargeTrim) => {
                            void handleNormalizeStems(strategy, allowLargeTrim);
                          }}
                          onPadMixToStems={(seconds) => {
                            void handlePadMixToStems(seconds);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </section>
              )}

              {pending && (busy || error || status) && (
                <div className="mp5-converter-mobile-operation-status" aria-live="polite">
                  {busy && status && <p className="mp5-converter-busy" data-testid="convert-busy-mobile">{status}</p>}
                  {error && <p className="mp5-converter-error" data-testid="convert-error-mobile">{error}</p>}
                  {!busy && !error && status && (
                    <p className="mp5-converter-success" data-testid="convert-status-mobile">{status}</p>
                  )}
                  {busy && (
                    <button type="button" className="mp5-converter-cancel" onClick={handleCancelConversion}>
                      Cancel conversion
                    </button>
                  )}
                </div>
              )}
            </div>

            <aside className="mp5-converter-output-rail" data-testid="converter-output-rail">
              <div className="mp5-converter-output-settings">
              <h3>Output</h3>

              <label className="mp5-converter-field">
                <span>Output filename</span>
                <input
                  type="text"
                  value={outputFilename}
                  disabled={!pending || busy}
                  onChange={(event) => setCustomOutputFilename(event.target.value)}
                  onBlur={commitOutputFilename}
                  data-testid="converter-output-filename"
                />
              </label>

              <div className="mp5-converter-field">
                <span id="converter-format-label">Format</span>
                <div
                  ref={formatControlRef}
                  className={`mp5-converter-format-control${formatMenuOpen ? " is-open" : ""}`}
                >
                  <Waveform size={25} weight="duotone" aria-hidden />
                  <span>
                    <strong>{codecView.name}</strong>
                    <small>{codecView.qualifier}</small>
                  </span>
                  <CaretDown
                    size={18}
                    aria-hidden
                    className={formatMenuOpen ? "rotate-180" : undefined}
                  />
                  <button
                    type="button"
                    className="mp5-converter-format-trigger"
                    aria-labelledby="converter-format-label"
                    aria-haspopup="listbox"
                    aria-expanded={formatMenuOpen}
                    aria-controls="converter-format-menu"
                    disabled={codecUnavailable || busy}
                    onClick={() => setFormatMenuOpen((open) => !open)}
                  >
                    <span className="sr-only">Export format</span>
                  </button>
                  {formatMenuOpen && (
                    <div
                      id="converter-format-menu"
                      className="mp5-converter-format-menu"
                      role="listbox"
                      aria-labelledby="converter-format-label"
                    >
                      {codecUnavailable ? (
                        <button
                          type="button"
                          role="option"
                          aria-selected
                          className="is-selected"
                          onClick={() => {
                            setCodec("pcm");
                            setFormatMenuOpen(false);
                          }}
                        >
                          {codecExportOptionLabel("pcm")} (WASM required for MP5 codecs)
                        </button>
                      ) : (
                        <>
                          <p className="mp5-converter-format-menu-group" role="presentation">
                            Recommended
                          </p>
                          <button
                            type="button"
                            role="option"
                            aria-selected={codec === "mp5l_v4"}
                            className={codec === "mp5l_v4" ? "is-selected" : undefined}
                            onClick={() => {
                              setCodec("mp5l_v4");
                              setFormatMenuOpen(false);
                            }}
                          >
                            {codecExportOptionLabel("mp5l_v4")}
                          </button>
                          <p className="mp5-converter-format-menu-group" role="presentation">
                            Beta preview (not default)
                          </p>
                          <button
                            type="button"
                            role="option"
                            aria-selected={codec === "mp5c6"}
                            className={codec === "mp5c6" ? "is-selected" : undefined}
                            onClick={() => {
                              setCodec("mp5c6");
                              setFormatMenuOpen(false);
                            }}
                          >
                            {codecExportOptionLabel("mp5c6")}
                          </button>
                          <p className="mp5-converter-format-menu-group" role="presentation">
                            Debug
                          </p>
                          <button
                            type="button"
                            role="option"
                            aria-selected={codec === "pcm"}
                            className={codec === "pcm" ? "is-selected" : undefined}
                            onClick={() => {
                              setCodec("pcm");
                              setFormatMenuOpen(false);
                            }}
                          >
                            {codecExportOptionLabel("pcm")}
                          </button>
                          {labCodecsOpen && (
                            <>
                              <p className="mp5-converter-format-menu-group" role="presentation">
                                Lab / advanced (not default)
                              </p>
                              {(
                                [
                                  "mp5l",
                                  "mp5c",
                                  "mp5c2",
                                  "mp5h",
                                ] as const
                              ).map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  role="option"
                                  aria-selected={codec === value}
                                  className={codec === value ? "is-selected" : undefined}
                                  onClick={() => {
                                    setCodec(value);
                                    setFormatMenuOpen(false);
                                  }}
                                >
                                  {codecExportOptionLabel(value)}
                                </button>
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {/* Native select kept for e2e / programmatic value checks; UI uses the themed menu above. */}
                  <select
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    value={codecUnavailable ? "pcm" : codec}
                    onChange={(event) => setCodec(event.target.value as OutputCodec)}
                    data-testid="codec-select"
                    disabled={codecUnavailable || busy}
                  >
                    {codecUnavailable ? (
                      <option value="pcm">{codecExportOptionLabel("pcm")} (WASM required for MP5 codecs)</option>
                    ) : (
                      <>
                        <optgroup label="Recommended">
                          <option value="mp5l_v4">{codecExportOptionLabel("mp5l_v4")}</option>
                        </optgroup>
                        <optgroup label="Beta preview (not default)">
                          <option value="mp5c6">{codecExportOptionLabel("mp5c6")}</option>
                        </optgroup>
                        <optgroup label="Debug">
                          <option value="pcm">{codecExportOptionLabel("pcm")}</option>
                        </optgroup>
                        {labCodecsOpen && (
                          <optgroup label="Lab / advanced (not default)">
                            <option value="mp5l">{codecExportOptionLabel("mp5l")}</option>
                            <option value="mp5c">{codecExportOptionLabel("mp5c")}</option>
                            <option value="mp5c2">{codecExportOptionLabel("mp5c2")}</option>
                            <option value="mp5h">{codecExportOptionLabel("mp5h")}</option>
                          </optgroup>
                        )}
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="mp5-converter-codec-badges" aria-label="Selected format qualities">
                {codecView.badges.map((badge) => (
                  <span key={badge.label} className={badge.verified ? "is-verified" : undefined}>
                    {badge.verified && <CheckCircle size={14} weight="bold" aria-hidden />}
                    {badge.label}
                  </span>
                ))}
              </div>
              <p className="mp5-converter-codec-description">{codecView.description}</p>

              {loadState === "loading" && <p className="mp5-converter-codec-state">Loading MP5 codecs…</p>}
              {codecUnavailable && (
                <p className="mp5-converter-warning" data-testid="codec-unavailable-banner">
                  <strong>MP5 codecs require WASM.</strong> PCM reference export is available until the codecs load.
                </p>
              )}
              {codecReady && (
                <p className="sr-only" data-testid="codec-ready-banner">
                  Default MP5-L v4 codec is ready: lossless, bit-exact, with no silent v3 fallback.
                </p>
              )}

              <button
                type="button"
                className="mp5-converter-advanced-formats"
                onClick={() => setFormatsOpen((open) => !open)}
                aria-expanded={formatsOpen}
                data-testid="converter-advanced-formats-toggle"
              >
                Advanced formats <CaretDown className={formatsOpen ? "rotate-180" : undefined} size={18} />
              </button>

              {formatsOpen && (
                <div className="mp5-converter-advanced-formats-body">
                  <button
                    type="button"
                    onClick={() => setLabCodecsOpen((open) => !open)}
                    aria-expanded={labCodecsOpen}
                    data-testid="lab-codecs-toggle"
                    disabled={codecUnavailable || busy}
                  >
                    {labCodecsOpen ? "Hide lab codecs" : "Show lab / advanced codecs"}
                  </button>
                  <label>
                    <span>Preset (MP5-C2 / MP5-H / classic MP5-C)</span>
                    <select
                      value={preset}
                      onChange={(event) => setPreset(Number(event.target.value))}
                      disabled={codec === "mp5l" || codec === "mp5l_v4" || codec === "pcm" || busy}
                      data-testid="preset-select"
                      aria-label="Codec preset"
                    >
                      <option value={0}>Low</option>
                      <option value={1}>Standard</option>
                      <option value={2}>High (preferred MP5-C2 loud path)</option>
                      <option value={3}>Extreme (finest loud path)</option>
                    </select>
                  </label>
                  <CodecModesHelper />
                </div>
              )}

              {codec === "mp5c" && codecReady && (
                <p className="mp5-converter-warning" data-testid="mp5c-hiss-warning">
                  <strong>MP5-C is experimental / lab-only.</strong> Not for normal listening — audible hiss on all
                  presets. Use MP5-L v4 (default) or PCM.
                </p>
              )}
              {codec === "mp5c2" && codecReady && (
                <p className="mp5-converter-info" data-testid="mp5c2-info">
                    <strong>MP5-C2 is bit-exact lossless (lab · not default).</strong> Quiet and fragile passages use
                    MP5-L; loud units take the smaller of signal-relative + lossless CORR or MP5-L. It measures slightly
                    larger than MP5-L v4 (about 1.07x on a real-music corpus), so MP5-L v4 stays the recommended export.
                    Distinct from classic lab MP5-C.
                </p>
              )}
              {codec === "mp5h" && codecReady && (
                <p className="mp5-converter-info" data-testid="mp5h-size-warning">
                  <strong>MP5-H is hybrid (not default).</strong> MP5-C base + lossless CORR correction. Larger than
                  MP5-L.
                </p>
              )}
              {codec === "mp5c6" && codecReady && (
                <p className="mp5-converter-info" data-testid="mp5c6-beta-info">
                  <strong>MP5-C v6 is a beta preview (lossy · not default).</strong> Quiet, fragile and decaying-tail
                  passages stay bit-exact MP5-L via protect islands, but the file as a whole is lossy and the
                  bitstream is not frozen — files may not decode in future builds. MP5-L v4 stays the recommended
                  export.
                </p>
              )}
              </div>

              <section className="mp5-converter-ready" data-testid="converter-ready-summary">
                <h4>{pending ? "Ready to export" : "Add a source to continue"}</h4>
                <dl>
                  <div><dt>Metadata</dt><dd>{pending ? `${fieldCount} fields` : "—"}</dd></div>
                  <div><dt>Artwork</dt><dd>{effectiveCover ? "Included" : "Not added"}</dd></div>
                  <div><dt>Lyrics</dt><dd>{hasLyrics ? "Included" : "Not added"}</dd></div>
                  <div><dt>Stems</dt><dd>{stems.length ? `${stems.length} included` : "None"}</dd></div>
                </dl>
                {pending && edits && (
                  <details className="mp5-converter-review">
                    <summary>Review embedded metadata</summary>
                    <MetadataReviewPanel extracted={pending.extracted} edits={edits} />
                  </details>
                )}
              </section>

              {pending && busy && exportProgress !== null && (
                <div
                  className="mp5-converter-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={exportProgress}
                  aria-label="Export progress"
                  data-testid="export-progress"
                >
                  <span style={{ width: `${Math.max(exportProgress, 3)}%` }} />
                </div>
              )}
              {pending && busy && status && <p className="mp5-converter-busy" data-testid="convert-busy">{status}</p>}
              {pending && !busy && status && <p className="mp5-converter-success" data-testid="convert-status">{status}</p>}
              {pending && error && (
                <div className="mp5-converter-error" data-testid="convert-error-block">
                  <p data-testid="convert-error">{error}</p>
                  {/no v3 fallback|MP5-L v4/i.test(error) && (
                    <button
                      type="button"
                      data-testid="retry-as-mp5l-v3"
                      disabled={busy}
                      onClick={() => {
                        setCodec("mp5l");
                        setLabCodecsOpen(true);
                        setFormatsOpen(true);
                        setError("");
                        setStatus("Switched to MP5-L v3 — click Export MP5 to retry.");
                      }}
                    >
                      Retry as MP5-L v3
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={!canExport}
                className="mp5-converter-export-button"
                data-testid="export-mp5-button"
              >
                {busy ? "Exporting…" : "Export MP5"}
              </button>

              {busy && (
                <button type="button" className="mp5-converter-cancel" onClick={handleCancelConversion} data-testid="converter-cancel">
                  Cancel conversion
                </button>
              )}

              <p className="mp5-converter-local-note">
                <LockKey size={18} aria-hidden /> Conversion runs locally. Optional cloud AI tools may send clips to
                your configured provider.
              </p>

              {librarySaveNote && <p className="mp5-converter-library-note" data-testid="converter-library-save-note">{librarySaveNote}</p>}
              {exportSummary && exportDone && (
                <ExportSummaryPanel
                  summary={exportSummary}
                  onDownloadAgain={handleDownloadAgain}
                  onOpenInPlayer={() => void handleOpenInPlayer()}
                  onAddToPlaylist={() => void handleAddToPlaylist()}
                  onSaveToLibrary={() => void handleSaveToLibrary()}
                  onCopySummary={handleCopySummary}
                />
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
