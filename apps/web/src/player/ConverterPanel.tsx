import { useEffect, useState } from "react";

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
import { SupportedSourcesNote } from "../components/SupportedSourcesNote";
import { ConverterEmptyState } from "../components/ConverterEmptyState";
import { CodecModesHelper } from "../components/CodecModesHelper";
import { DemoFixtureActions } from "../components/DemoFixtureActions";
import { dismissOnboarding } from "../lib/firstRun";
import { FileDropZone } from "./FileDropZone";

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

export function ConverterPanel() {
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

  async function handleFiles(files: FileList) {
    const file = files[0];
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setExportDone(false);
    setExportSummary(null);
    setLastExportFile(null);
    setLastExportBlob(null);
    setStatus(LOAD_PHASE_LABELS.decoding);
    setPending(null);
    setEdits(null);
    setCoverError("");
    try {
      const pcm = await decodeSourceToPcm(file, (msg) => setStatus(msg));
      setStatus(LOAD_PHASE_LABELS.extracting);
      const extracted = await extractSourceMetadata(file, setStatus).catch(() => ({
        meta: { title: file.name.replace(/\.[^.]+$/, "") },
      }));
      setPending({ file, pcm, extracted });
      setEdits(manualEditsFromSource(extracted));
      dismissOnboarding();
      setStatus("Source loaded — edit metadata, preview tags, then export MP5-L v3.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    if (!pending || !edits || busy) return;
    setBusy(true);
    setError("");
    setExportDone(false);
    setExportSummary(null);
    try {
      const exportCodec = codecUnavailable ? "pcm" : codec;
      const { mp5, bundle } = await runExportPipeline(
        {
          pcm: pending.pcm,
          extracted: pending.extracted,
          edits,
          codec: exportCodec,
          preset,
          sourceBytes: pending.file.size,
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
      setLastExportBlob(blob);
      setLastExportFile(file);
      setExportSummary(summary);
      setExportDone(true);
      triggerDownload(blob, filename);
      setStatus("Export complete — ready to download or open in player.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadAgain() {
    if (lastExportBlob && exportSummary) {
      triggerDownload(lastExportBlob, exportSummary.filename);
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

  return (
    <div className="space-y-5" data-testid="converter-panel">
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

      <FileDropZone
        accept="audio/*,.mp3,.wav,.flac,.aac,.m4a,.ogg,.opus"
        label={busy && !pending ? "Loading source…" : "1. Drop source audio (FLAC / WAV / MP3 / …)"}
        onFiles={handleFiles}
        disabled={busy}
      />

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

      {exportSummary && exportDone && (
        <ExportSummaryPanel
          summary={exportSummary}
          onDownloadAgain={handleDownloadAgain}
          onOpenInPlayer={() => void handleOpenInPlayer()}
          onAddToPlaylist={() => void handleAddToPlaylist()}
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
    </div>
  );
}
