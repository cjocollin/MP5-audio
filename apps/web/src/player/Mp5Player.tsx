import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { TestTube } from "@phosphor-icons/react/TestTube";
import {
  clockModeForTransport,
  type PlaybackClockDiagnostics,
} from "../lib/playback/activePlaybackClock";
import {
  usePlayerStore,
  selectCanGoNext,
  selectCanGoPrev,
  withoutDefaultDemoTracks,
} from "../store/playerStore";
import { filesToFileList } from "../lib/pickMp5Files";
import {
  decodeMp5ToPcmOffthread,
  getMixDecodeWorkerClient,
  warmMixDecodePipeline,
} from "./mixDecodeWorkerClient";
import { PlaybackController } from "./engine/playbackController";
import type { PlayIntentSource } from "./engine/playbackMachine";
import { getCodec } from "../wasm/codec";
import { decodeCache } from "./decodeCache";
import { FileDropZone } from "./FileDropZone";
import { WaveformView } from "./WaveformView";
import { PlayerControls } from "./PlayerControls";
import { WaveformProgress } from "./SeekTimeline";
import { PlaybackRangeTicker } from "./PlaybackRangeTicker";
import { MetadataDetailsPanel } from "./MetadataDetailsPanel";
import { StemsPanel } from "./StemsPanel";
import { LyricsPanel } from "./LyricsPanel";
import { SongMapPanel } from "./SongMapPanel";
import { parseStructureFromFile } from "../lib/sections/parseSections";
import {
  loopHookRange,
  loopSectionRange,
  playHighlightRange,
  previewHighlightRange,
  type ActivePlaybackRange,
} from "../lib/sections/playbackRange";
import { findFirstSectionByType } from "../lib/sections/sectionPlayback";
import {
  CodecId,
  peekAudiFramePrefix,
  type HighlightMoment,
  type SongSection,
} from "@mp5/container";
import { mp5lBitstreamVersion } from "../lib/codecDisplay";
import { useMp5AudioEngine } from "./useMp5AudioEngine";
import { useStemMixerEngine, type StemPcmTrack } from "./useStemMixerEngine";
import {
  derivePlayState,
  ingestStageToReadiness,
  type PlaybackStateSnapshot,
} from "../lib/playback/playbackState";
import { assessKaraokeAvailability } from "../lib/lyrics/karaokeMode";
import { parseLyrcFromFile } from "../lib/lyrics/parseLyrics";
import { decodeStemManifest } from "@mp5/container";
import {
  resolvePlaybackRequest,
  type PlaybackRequestReason,
} from "../lib/playback/requestPlayback";
import {
  recordLastAlbumAction,
  recordLastPlaybackRequest,
  recordLastStemOperation,
  recordLastWaveformSeek,
  tracePlayback,
} from "../lib/playback/playbackTrace";
import {
  buildPlaybackRegressionSnapshot,
  setLatestPlaybackRegressionSnapshot,
  type PlaybackRegressionSnapshot,
} from "../lib/playback/playbackRegressionSnapshot";
import { APP_VERSION } from "../generated/appVersion";
import { authorityForMode, createTransportSnapshot } from "../lib/playback/playbackTransport";
import type { StemTransportMode } from "../lib/stems/stemMixState";
import type { StemMixSeamlessOp } from "../lib/playback/stemMixOps";
import {
  warnIfPlayheadResetAfterPatch,
} from "../lib/playback/stemMixerAssert";
import { NowPlayingView } from "./NowPlayingView";
import { LibraryPanel } from "./LibraryPanel";
import { PersistentTransport } from "./PersistentTransport";
import { PlayerInspectorOverview } from "./PlayerInspectorOverview";
import { TrackMetadata } from "./TrackMetadata";
import { ingestMp5Files, trackDurationSec, findSimilarTrackIndex, similarTrackAvailable, type IngestResult } from "./playlistUtils";
import { useActivePlaybackClock } from "./useActivePlaybackClock";
import {
  ingestStageLabel,
  indexStageDetail,
  mapIndexProgressToIngestStage,
  mapParseProgressToIngestStage,
  parseStageDetail,
  type IngestLoadStage,
} from "../lib/ingest/ingestStages";
import { updateIngestDiagnostics } from "../lib/ingest/ingestDiagnostics";
import {
  ingestAlbumPackageFiles,
  partitionDroppedFiles,
} from "../lib/album/ingestAlbumPackage";
import {
  enrichResolvedAlbum,
  resolveAlbumTracks,
  resolvedTracksInOrder,
  type ResolvedAlbumPackage,
} from "../lib/album/resolveAlbum";
import { auditAlbmPackageManifest } from "@mp5/container";
import { saveAlbumPackage } from "../lib/localLibrary/albumLibrary";
import { saveEmbeddedAlbumPackage } from "../lib/localLibrary/embeddedAlbumLibrary";
import {
  ensureEmbeddedTracksLoaded,
  loadEmbeddedTrackAsPlaylistTrack,
} from "../lib/album/embeddedAlbumLoader";
import {
  buildEmbeddedPlaylistPlaceholders,
  isEmbeddedPlaceholderTrack,
} from "../lib/album/embeddedAlbumQueue";
import { prefetchEmbeddedPlaylistMetadata } from "../lib/album/embeddedPlaylistMetadata";
import {
  formatExtractFilename,
  formatPackageBytes,
  LIBRARY_STORAGE_NOTE,
} from "../lib/album/albumPackageUi";
import { albumPlaybackContext } from "../lib/album/albumPlaybackContext";
import { downloadBlob } from "../lib/performance/downloadBlob";
import { AlbumPackagePanel } from "../components/AlbumPackagePanel";
import { CreateAlbumPackagePanel } from "../components/CreateAlbumPackagePanel";
import { listLibraryRecords } from "../lib/localLibrary/api";
import { savePlaylistTrackToLibrary } from "../lib/localLibrary/libraryActions";
import { findLibraryDuplicate } from "../lib/fingerprint/duplicates";
import {
  decodeFing,
  fingIdentityKey,
  getFingFromParsed,
  getHashFromParsed,
  type IntegrityCheckResult,
} from "@mp5/container";
import { verifyMp5Integrity } from "../lib/fingerprint/verify";
import { LibraryStorageError } from "../lib/localLibrary/errors";
import { USER_ERRORS } from "../lib/userFacingErrors";
import { DropImportSummary } from "../components/DropImportSummary";
import { CodecModesHelper } from "../components/CodecModesHelper";
import { dismissOnboarding } from "../lib/firstRun";
import {
  clearPlayerSession,
  loadPlayerSession,
  PLAYLIST_PERSISTENCE_NOTE,
  savePlayerSession,
  trackToSummary,
} from "./playerSession";
import type { Mp5File } from "@mp5/container";
import type { PlaylistTrack } from "../store/playerStore";
import { themeRootStyle } from "../lib/visualTheme/applyVisualTheme";
import { resolveThemeForFile } from "../lib/visualTheme/themeApplication";

type InspectorSection = "overview" | "format" | "lyrics" | "stems" | "metadata" | "integrity";

/** First-audible window for L-v4 / PCM progressive load (Day 2). */
const PROGRESSIVE_FIRST_SEC = 8;

const INSPECTOR_TABS: { id: InspectorSection; label: string; target: InspectorSection }[] = [
  { id: "overview", label: "Overview", target: "overview" },
  { id: "format", label: "Format", target: "format" },
  { id: "lyrics", label: "Lyrics", target: "lyrics" },
  { id: "stems", label: "Stems", target: "stems" },
  { id: "metadata", label: "Metadata", target: "metadata" },
  { id: "integrity", label: "Integrity", target: "metadata" },
];

interface Mp5PlayerProps {
  panelVisible?: boolean;
  onRequestPlayer?: () => void;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return !!target.closest("[contenteditable='true']");
}

export function Mp5Player({
  panelVisible = true,
  onRequestPlayer,
}: Mp5PlayerProps) {
  // Selectors — avoid full-store subscribe so currentTime ticks don't re-render this tree.
  const tracks = usePlayerStore((s) => s.tracks);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  // Reactive so the track-load effect re-runs (and drains this mailbox into the
  // machine) whenever a trigger arms play intent — regardless of whether the
  // mailbox is set before or after the track becomes current.
  const pendingPlayTrackId = usePlayerStore((s) => s.pendingPlayTrackId);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const appendTracks = usePlayerStore((s) => s.appendTracks);
  const setTracks = usePlayerStore((s) => s.setTracks);
  const replacePlaylistTrack = usePlayerStore((s) => s.replacePlaylistTrack);
  const removeTrack = usePlayerStore((s) => s.removeTrack);
  const clearTracks = usePlayerStore((s) => s.clearTracks);
  const setCurrentIndex = usePlayerStore((s) => s.setCurrentIndex);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const handleTrackEnded = usePlayerStore((s) => s.handleTrackEnded);
  const cycleRepeatMode = usePlayerStore((s) => s.cycleRepeatMode);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const setRepeatMode = usePlayerStore((s) => s.setRepeatMode);
  const setShuffleMode = usePlayerStore((s) => s.setShuffle);
  const sessionRestored = usePlayerStore((s) => s.sessionRestored);
  const setSessionRestored = usePlayerStore((s) => s.setSessionRestored);
  const dismissDefaultDemo = usePlayerStore((s) => s.dismissDefaultDemo);
  const useFileThemes = usePlayerStore((s) => s.useFileThemes);
  const pendingAlbumPackage = usePlayerStore((s) => s.pendingAlbumPackage);
  const consumePendingAlbumPackage = usePlayerStore((s) => s.consumePendingAlbumPackage);
  const pendingPlayerFiles = usePlayerStore((s) => s.pendingPlayerFiles);
  const consumePendingPlayerFiles = usePlayerStore((s) => s.consumePendingPlayerFiles);
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);
  const setPendingConverterFiles = usePlayerStore((s) => s.setPendingConverterFiles);
  const canPrev = usePlayerStore(selectCanGoPrev);
  const canNext = usePlayerStore(selectCanGoNext);

  const [parsed, setParsed] = useState<Mp5File | undefined>();
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  /**
   * Bumped when the decode worker frees up (background upgrade settled), to
   * re-run the neighbour prefetch effect. Without it the effect's deps
   * (loading/currentIndex/tracks) can never change again after a progressive
   * load — `loading` goes false at the 8s window while the full decode still
   * holds the worker busy — so the prefetch bailed once and never retried.
   */
  const [decodeIdleTick, setDecodeIdleTick] = useState(0);
  const [decodePath, setDecodePath] = useState("");
  const [mp5hInfo, setMp5hInfo] = useState<import("./decodeMp5").Mp5hDecodeInfo | undefined>();
  const [dropErrors, setDropErrors] = useState<{ name: string; message: string }[]>([]);
  const [lastDropSummary, setLastDropSummary] = useState<IngestResult | null>(null);
  const [lastSkippedConvertibleFiles, setLastSkippedConvertibleFiles] = useState<File[]>([]);
  const [librarySaveBusy, setLibrarySaveBusy] = useState(false);
  const [librarySaveNote, setLibrarySaveNote] = useState("");
  const [stemMixActive, setStemMixActive] = useState(false);
  const [stemTracks, setStemTracks] = useState<StemPcmTrack[] | null>(null);
  const [transportMode, setTransportMode] = useState<StemTransportMode>("full_mix");
  const [transportDiagLine, setTransportDiagLine] = useState("");
  const [clockDiagLine, setClockDiagLine] = useState("");
  const [stemInsertDeferredId, setStemInsertDeferredId] = useState<string | null>(null);
  const [activeStemSourceIds, setActiveStemSourceIds] = useState<string[]>([]);
  const stemLoadOffsetRef = useRef(0);
  const stemGraphGenRef = useRef(0);
  const transportIdRef = useRef(0);
  const [karaokeMode, setKaraokeMode] = useState(false);
  const [karaokePrepareRequest, setKaraokePrepareRequest] = useState<{
    stemIds: string[];
    preset: Map<string, { muted: boolean; solo: boolean }>;
  } | null>(null);
  const [activePlaybackRange, setActivePlaybackRange] =
    useState<ActivePlaybackRange | null>(null);
  const [activeAlbum, setActiveAlbum] = useState<ResolvedAlbumPackage | null>(null);
  const [albumManifestError, setAlbumManifestError] = useState("");
  const [albumSaveBusy, setAlbumSaveBusy] = useState(false);
  const [albumSaveNote, setAlbumSaveNote] = useState("");
  const [embeddedLoading, setEmbeddedLoading] = useState(false);
  const [integrity, setIntegrity] = useState<IntegrityCheckResult | null>(null);
  const [ingestStage, setIngestStage] = useState<IngestLoadStage>("idle");
  const [ingestStageDetail, setIngestStageDetail] = useState("");
  const [inspectorSection, setInspectorSection] = useState<InspectorSection>("overview");
  useEffect(() => {
    if (!pendingAlbumPackage) return;
    const pending = consumePendingAlbumPackage();
    if (pending) {
      setActiveAlbum(pending);
      setAlbumManifestError("");
    }
  }, [consumePendingAlbumPackage, pendingAlbumPackage]);

  useEffect(() => {
    if (
      !lastDropSummary ||
      lastDropSummary.skippedCount > 0 ||
      lastDropSummary.unreadableCount > 0 ||
      lastDropSummary.dropErrors.length > 0
    ) {
      return;
    }
    const timer = window.setTimeout(() => setLastDropSummary(null), 1800);
    return () => window.clearTimeout(timer);
  }, [lastDropSummary]);

  // Transport-layer "resume once prepared" flag. NOT load-deferred play intent
  // (the playback machine owns that now, keyed by trackId): this covers the
  // narrower case where the track's PCM is already ready but the STEM MIX / karaoke
  // graph is still being prepared, so audio must start when preparation finishes.
  const resumeStemsWhenPreparedRef = useRef(false);
  /** Volume before M-key mute so unmute restores the prior level. */
  const preMuteVolumeRef = useRef(0.8);
  const embeddedHydrateGenRef = useRef(0);
  const playlistPrefetchGenRef = useRef(0);
  const ingestProgressFlushRef = useRef(0);

  // Day-1 load: warm main WASM + mix worker before the first song open.
  useEffect(() => {
    void getCodec();
    warmMixDecodePipeline();
  }, []);
  const embeddedHydratingTrackIdRef = useRef<string | null>(null);
  const seekRef = useRef<(t: number) => void>(() => {});
  const [karaokeStemPrepFailed, setKaraokeStemPrepFailed] = useState(false);

  // Track ended (or a load failed mid-auto-advance): apply the queue's advance
  // policy. `repeat_one` restarts in place; `goto` arms play intent for the next
  // track in the shared mailbox (source "autoAdvance" so a next-track load that
  // itself fails keeps chaining past it) and moves the index — the track-load
  // effect drains that mailbox into the playback machine.
  const advanceAfterEnd = useCallback(() => {
    const result = handleTrackEnded();
    if (result.type === "repeat_one") {
      seekRef.current(0);
      setPlaying(true);
    } else if (result.type === "goto") {
      const nextId = usePlayerStore.getState().tracks[result.index]?.id ?? null;
      if (nextId) usePlayerStore.getState().setPendingPlayTrackId(nextId, "autoAdvance");
      setCurrentIndex(result.index);
    }
    return result;
  }, [handleTrackEnded, setCurrentIndex, setPlaying]);

  const useStemPlayback = stemMixActive && (stemTracks?.length ?? 0) > 0;

  const {
    loadPcm,
    upgradePcm,
    seek: seekMain,
    stopSource: stopMainSource,
    getPlaybackTime: getMainPlaybackTime,
    isSourceActive: isMainSourceActive,
    hasPcm: hasMainPcm,
  } = useMp5AudioEngine({
    volume,
    isPlaying: isPlaying && !useStemPlayback,
    duration,
    setCurrentTime,
    setPlaying,
    onTrackEnded: () => {
      advanceAfterEnd();
    },
  });

  const {
    loadInitialTracksForMix,
    insertStemAtCurrentOffset,
    removeStemOnly,
    patchStemAudible,
    seekStemMix,
    stopStemMix,
    setGraphGeneration,
    getPlaybackTime: getStemPlaybackTime,
    getDiagnostics: getStemDiagnostics,
    hasActiveSources: hasStemActiveSources,
    isGraphBusy: isStemGraphBusy,
  } = useStemMixerEngine({
    volume,
    isPlaying: isPlaying && useStemPlayback,
    duration,
    setCurrentTime,
    setPlaying,
    onTrackEnded: () => {
      advanceAfterEnd();
    },
    onOverlapDetected: (detail) => {
      tracePlayback("transport", "overlap detected", { detail });
      console.error("[MP5 transport overlap]", detail);
      stopMainSource();
      stopStemMix();
    },
    onStemMixNaturalEnd: () => {
      tracePlayback("stem_mix", "natural end — stop UI");
      setPlaying(false);
      advanceAfterEnd();
    },
  });

  const invalidateStemGraph = useCallback(() => {
    stemGraphGenRef.current += 1;
    setGraphGeneration(stemGraphGenRef.current);
    return stemGraphGenRef.current;
  }, [setGraphGeneration]);

  const refreshTransportDiagnostics = useCallback(() => {
    const stemDiag = getStemDiagnostics();
    const snap = createTransportSnapshot({
      mode: transportMode,
      authority: authorityForMode(transportMode),
      transportId: transportIdRef.current,
      stemGraphGeneration: stemDiag.stemGraphGeneration,
      stemSourceCount: stemDiag.activeSourceCount,
      activeStemIds: stemDiag.activeStemIds,
      fullMixSourceActive: isMainSourceActive(),
      stemMixSourcesActive: stemDiag.stemMixSourcesActive,
    });
    setActiveStemSourceIds(stemDiag.activeStemIds);
    setTransportDiagLine(
      `Transport ${snap.mode} · id ${snap.transportId} · graph gen ${snap.stemGraphGeneration} · sources ${snap.stemSourceCount}${snap.activeStemIds.length ? ` [${snap.activeStemIds.join(", ")}]` : ""} · full ${snap.fullMixSourceActive ? "on" : "off"} · stem ${snap.stemMixSourcesActive ? "on" : "off"}${snap.overlapDetected ? " · OVERLAP" : ""}`,
    );
    if (snap.overlapDetected) {
      console.error("[MP5 transport] full_mix and stem_mix both active — stopping both");
      stopMainSource();
      stopStemMix();
      invalidateStemGraph();
    }
  }, [
    getStemDiagnostics,
    invalidateStemGraph,
    isMainSourceActive,
    stopMainSource,
    stopStemMix,
    transportMode,
  ]);

  useEffect(() => {
    if (useStemPlayback) {
      stopMainSource();
    } else {
      stopStemMix();
      invalidateStemGraph();
    }
    refreshTransportDiagnostics();
  }, [
    useStemPlayback,
    stopMainSource,
    stopStemMix,
    invalidateStemGraph,
    refreshTransportDiagnostics,
  ]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(refreshTransportDiagnostics, 500);
    return () => window.clearInterval(id);
  }, [isPlaying, refreshTransportDiagnostics]);

  const handleStemMixEnable = useCallback(
    (tracks: StemPcmTrack[], mode: import("./StemsPanel").StemMixMode, offsetSec: number) => {
      stopMainSource();
      transportIdRef.current += 1;
      const gen = invalidateStemGraph();
      stemLoadOffsetRef.current = offsetSec;
      setTransportMode(mode);
      setStemTracks(tracks);
      setStemMixActive(true);
      const resume = isPlaying || resumeStemsWhenPreparedRef.current;
      resumeStemsWhenPreparedRef.current = false;
      void loadInitialTracksForMix(tracks, {
        offset: offsetSec,
        resume,
        generation: gen,
      }).then(() => refreshTransportDiagnostics());
    },
    [
      invalidateStemGraph,
      isPlaying,
      loadInitialTracksForMix,
      refreshTransportDiagnostics,
      stopMainSource,
    ],
  );

  const handleReturnToFullMix = useCallback(
    (offsetSec: number) => {
      stopStemMix();
      invalidateStemGraph();
      transportIdRef.current += 1;
      setTransportMode("full_mix");
      setStemTracks(null);
      setStemMixActive(false);
      if (isPlaying) void seekMain(offsetSec);
      refreshTransportDiagnostics();
    },
    [invalidateStemGraph, isPlaying, refreshTransportDiagnostics, seekMain, stopStemMix],
  );

  const handleRestartStemMix = useCallback(() => {
    if (!stemTracks?.length || !stemMixActive) return;
    const gen = invalidateStemGraph();
    const offset = getStemPlaybackTime();
    void loadInitialTracksForMix(stemTracks, {
      offset,
      resume: isPlaying,
      generation: gen,
    }).then(() => refreshTransportDiagnostics());
  }, [
    stemMixActive,
    stemTracks,
    invalidateStemGraph,
    getStemPlaybackTime,
    isPlaying,
    loadInitialTracksForMix,
    refreshTransportDiagnostics,
  ]);

  const handleStemMixSeamlessOp = useCallback(
    (op: StemMixSeamlessOp) => {
      if (!stemMixActive) return;
      recordLastStemOperation(
        op.type === "insert"
          ? `insert:${op.track.id}`
          : op.type === "remove"
            ? `remove:${op.stemId}`
            : `audible:${op.track.id}:${op.track.muted ? "mute" : "unmute"}`,
      );
      const gen = stemGraphGenRef.current;
      const before = getStemPlaybackTime();
      const run = async () => {
        switch (op.type) {
          case "insert": {
            const ok = await insertStemAtCurrentOffset(op.track, gen);
            if (!ok) setStemInsertDeferredId(op.track.id);
            setStemTracks((prev) => {
              if (!prev) return [op.track];
              if (prev.some((t) => t.id === op.track.id)) {
                return prev.map((t) => (t.id === op.track.id ? op.track : t));
              }
              return [...prev, op.track];
            });
            break;
          }
          case "remove":
            await removeStemOnly(op.stemId, gen);
            setStemTracks((prev) => prev?.filter((t) => t.id !== op.stemId) ?? null);
            break;
          case "audible":
            await patchStemAudible(op.track, gen);
            setStemTracks((prev) => {
              if (!prev) return [op.track];
              if (prev.some((t) => t.id === op.track.id)) {
                return prev.map((t) => (t.id === op.track.id ? op.track : t));
              }
              return [...prev, op.track];
            });
            break;
        }
        const after = getStemPlaybackTime();
        const caller =
          op.type === "insert"
            ? "checkbox"
            : op.type === "remove"
              ? "checkbox"
              : op.track.muted
                ? "mute"
                : "unmute";
        warnIfPlayheadResetAfterPatch(caller, before, after);
        refreshTransportDiagnostics();
      };
      void run();
    },
    [
      stemMixActive,
      getStemPlaybackTime,
      insertStemAtCurrentOffset,
      removeStemOnly,
      patchStemAudible,
      refreshTransportDiagnostics,
    ],
  );

  useEffect(() => {
    if (!parsed?.optional.has("STEM")) {
      setStemMixActive(false);
      setStemTracks(null);
    }
  }, [parsed]);

  const karaokeAvailability = useMemo(() => {
    const lyrc = parseLyrcFromFile(parsed);
    const stems = decodeStemManifest(parsed?.optional.get("STEM"))?.stems;
    return assessKaraokeAvailability(lyrc?.synced, stems);
  }, [parsed]);

  const karaokePreparing = karaokePrepareRequest !== null;
  const karaokeReady = karaokeMode && useStemPlayback;
  const karaokeFallback =
    karaokeMode &&
    !karaokePreparing &&
    !useStemPlayback &&
    (karaokeStemPrepFailed || !karaokeAvailability.audioAvailable);

  const requestPlayback = useCallback(
    (opts: {
      reason: PlaybackRequestReason;
      offsetSec?: number;
      autoPlay?: boolean;
    }) => {
      const offsetSec = opts.offsetSec ?? usePlayerStore.getState().currentTime;
      const autoPlay =
        opts.autoPlay ??
        (opts.reason === "play_button" || opts.reason === "resume_after_prepare");

      const ctx = {
        reason: opts.reason,
        offsetSec,
        autoPlay,
        karaokeMode,
        karaokePreparing,
        karaokeAudioUnavailable: !karaokeAvailability.audioAvailable,
        useStemPlayback,
        hasMainPcm: hasMainPcm(),
        stemTracksReady: (stemTracks?.length ?? 0) > 0,
        hasActiveStemSources: hasStemActiveSources(),
        isPlaying,
      };
      const action = resolvePlaybackRequest(ctx);
      tracePlayback("request_playback", opts.reason, {
        action: action.action,
        transportMode,
        karaokeMode,
        karaokePreparing,
        karaokeReady,
        karaokeFallback,
        useStemPlayback,
        offsetSec,
        autoPlay,
        isPlaying,
        pcmDecoded: hasMainPcm(),
      });

      switch (action.action) {
        case "noop":
          return;
        case "set_playing_preparing_karaoke":
          // PCM is ready but the stem/karaoke graph is still preparing; mark the
          // transport-resume so the resume-after-prepare effect starts audio when
          // the graph is ready. (Load-deferred intent is the machine's job; this
          // is the narrower transport-prep case it does not model.)
          resumeStemsWhenPreparedRef.current = true;
          setPlaying(true);
          tracePlayback("karaoke", "preparing — play deferred");
          return;
        case "set_playing_preparing_full_mix":
          // Full-mix requested before PCM is ready. The machine's armed intent
          // already drives startAudio on LOAD_READY; just reflect desired-playing.
          setPlaying(true);
          return;
        case "start_stem_mix":
          setPlaying(true);
          if (stemTracks?.length && !isStemGraphBusy()) {
            void loadInitialTracksForMix(stemTracks, {
              offset: action.offsetSec,
              resume: true,
              generation: stemGraphGenRef.current,
            }).then(() => refreshTransportDiagnostics());
          }
          return;
        case "seek_stem_mix":
          if (action.start) setPlaying(true);
          seekStemMix(action.offsetSec, stemGraphGenRef.current, { start: action.start });
          return;
        case "karaoke_fallback_full_mix":
          tracePlayback("karaoke", "fallback full mix + synced lyrics");
          stopStemMix();
          setPlaying(true);
          seekMain(action.offsetSec, { start: true });
          return;
        case "start_full_mix":
          setPlaying(true);
          seekMain(action.offsetSec, { start: true });
          return;
        case "seek_full_mix":
          if (action.start) setPlaying(true);
          seekMain(action.offsetSec, { start: action.start });
          return;
      }
    },
    [
      karaokeMode,
      karaokePreparing,
      karaokeReady,
      karaokeFallback,
      karaokeAvailability.audioAvailable,
      useStemPlayback,
      hasMainPcm,
      stemTracks,
      hasStemActiveSources,
      isPlaying,
      transportMode,
      setPlaying,
      loadInitialTracksForMix,
      seekStemMix,
      seekMain,
      stopStemMix,
      isStemGraphBusy,
      refreshTransportDiagnostics,
    ],
  );

  const seek = useCallback(
    (seconds: number) => {
      requestPlayback({
        reason: "seek_slider",
        offsetSec: seconds,
        autoPlay: isPlaying,
      });
    },
    [requestPlayback, isPlaying],
  );
  seekRef.current = seek;

  const track = tracks[currentIndex];

  const getPlaybackTime = useCallback(() => {
    if (useStemPlayback) {
      return hasStemActiveSources() || isPlaying
        ? getStemPlaybackTime()
        : usePlayerStore.getState().currentTime;
    }
    return isMainSourceActive() || isPlaying
      ? getMainPlaybackTime()
      : usePlayerStore.getState().currentTime;
  }, [
    useStemPlayback,
    getStemPlaybackTime,
    getMainPlaybackTime,
    hasStemActiveSources,
    isMainSourceActive,
    isPlaying,
  ]);

  const hasActivePlaybackSource = useCallback(() => {
    if (useStemPlayback) return hasStemActiveSources();
    return isMainSourceActive();
  }, [useStemPlayback, hasStemActiveSources, isMainSourceActive]);

  const playbackSnapshot = useMemo((): PlaybackStateSnapshot => {
    const pcmDecoded = hasMainPcm();
    const readiness = ingestStageToReadiness(ingestStage, pcmDecoded, !!loadError);
    return {
      transportMode: useStemPlayback ? transportMode : stemMixActive ? "full_mix" : "idle",
      readiness,
      playState: derivePlayState(isPlaying, readiness, loading),
      activeClockSource: useStemPlayback
        ? hasStemActiveSources()
          ? "stem_mix"
          : "none"
        : isMainSourceActive()
          ? "full_mix"
          : "none",
      activeTrackId: track?.id ?? null,
      currentTimeSec: usePlayerStore.getState().currentTime,
      durationSec: duration,
      activeSourceCount: useStemPlayback
        ? getStemDiagnostics().activeSourceCount
        : isMainSourceActive()
          ? 1
          : 0,
      activeStemIds: getStemDiagnostics().activeStemIds,
      pcmDecoded,
      isPlaying,
      karaokeMode,
      karaokePreparing,
      karaokeReady,
      karaokeFallback,
    };
  }, [
    hasMainPcm,
    ingestStage,
    loadError,
    useStemPlayback,
    transportMode,
    stemMixActive,
    isPlaying,
    loading,
    hasStemActiveSources,
    isMainSourceActive,
    track?.id,
    duration,
    getStemDiagnostics,
    karaokeMode,
    karaokePreparing,
    karaokeReady,
    karaokeFallback,
  ]);

  useEffect(() => {
    const stemDiag = getStemDiagnostics();
    const transportSnap = createTransportSnapshot({
      mode: transportMode,
      authority: authorityForMode(transportMode),
      transportId: transportIdRef.current,
      stemGraphGeneration: stemDiag.stemGraphGeneration,
      stemSourceCount: stemDiag.activeSourceCount,
      activeStemIds: stemDiag.activeStemIds,
      fullMixSourceActive: isMainSourceActive(),
      stemMixSourcesActive: stemDiag.stemMixSourcesActive,
    });
    const reg = buildPlaybackRegressionSnapshot(playbackSnapshot, {
      appVersion: APP_VERSION,
      fullMixSourceActive: transportSnap.fullMixSourceActive,
      stemMixSourcesActive: transportSnap.stemMixSourcesActive,
      overlapDetected: transportSnap.overlapDetected,
      transportDiagnosticsLine: transportDiagLine,
    });
    setLatestPlaybackRegressionSnapshot(reg);
    const w = window as Window & {
      __mp5PlaybackRegression?: () => PlaybackRegressionSnapshot | null;
    };
    w.__mp5PlaybackRegression = () => reg;
  }, [
    playbackSnapshot,
    transportMode,
    transportDiagLine,
    getStemDiagnostics,
    isMainSourceActive,
  ]);

  useEffect(() => {
    if (!useStemPlayback || !stemTracks?.length || !isPlaying) return;
    if (hasStemActiveSources() || isStemGraphBusy()) return;
    if (!resumeStemsWhenPreparedRef.current) return;
    resumeStemsWhenPreparedRef.current = false;
    tracePlayback("request_playback", "resume_after_prepare", {
      stemTracks: stemTracks.length,
    });
    void loadInitialTracksForMix(stemTracks, {
      offset: usePlayerStore.getState().currentTime,
      resume: true,
      generation: stemGraphGenRef.current,
    }).then(() => refreshTransportDiagnostics());
  }, [
    useStemPlayback,
    stemTracks,
    isPlaying,
    hasStemActiveSources,
    loadInitialTracksForMix,
    refreshTransportDiagnostics,
  ]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      tracePlayback("play_click", "pause");
      // pauseClick drops any pending play intent in the machine (so a pause while
      // a track is still loading won't auto-start at ready); setPlaying(false) is
      // the universal transport stop for both the main and stem engines.
      controllerRef.current?.pauseClick();
      setPlaying(false);
      return;
    }
    tracePlayback("play_click", "play", {
      trackId: track?.id,
      karaokeMode,
      useStemPlayback,
      transportMode,
    });
    if (!track?.file && !track?.parsed && !track?.embeddedAlbum) return;
    if (!track?.file && track?.embeddedAlbum) {
      // Embedded placeholder not hydrated yet: arm play in the mailbox so the
      // track-load effect starts it once the real file loads.
      if (track?.id) usePlayerStore.getState().setPendingPlayTrackId(track.id, "user");
      recordLastPlaybackRequest("play_button");
      return;
    }
    // Machine-owned play. If this track's load previously FAILED (machine phase
    // "error"), PLAY_CLICK is inert, so re-arm the mailbox to make the track-load
    // effect re-select and RETRY the load. Otherwise PLAY_CLICK starts audio if
    // the track is ready, or defers until its in-flight load completes.
    if (controllerRef.current?.getState().phase === "error" && track?.id) {
      usePlayerStore.getState().setPendingPlayTrackId(track.id, "user");
    } else {
      controllerRef.current?.playClick();
    }
  }, [
    isPlaying,
    track?.file,
    track?.parsed,
    track?.embeddedAlbum,
    track?.id,
    karaokeMode,
    useStemPlayback,
    transportMode,
    setPlaying,
  ]);

  const handleWaveformSeek = useCallback(
    (ratio: number) => {
      recordLastWaveformSeek(`ratio=${ratio.toFixed(3)}`);
      tracePlayback("waveform_click", "seek", { ratio, duration });
      requestPlayback({
        reason: "waveform_seek",
        offsetSec: ratio * duration,
        autoPlay: isPlaying,
      });
    },
    [duration, requestPlayback, isPlaying],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        handlePlayPause();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const t = usePlayerStore.getState().currentTime;
        seek(Math.max(0, t - 5));
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        const t = usePlayerStore.getState().currentTime;
        seek(Math.min(duration || t + 5, t + 5));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setVolume(Math.min(1, volume + 0.05));
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setVolume(Math.max(0, volume - 0.05));
        return;
      }
      if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        if (volume > 0) {
          preMuteVolumeRef.current = volume;
          setVolume(0);
        } else {
          setVolume(preMuteVolumeRef.current > 0 ? preMuteVolumeRef.current : 0.8);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlePlayPause, seek, duration, volume, setVolume]);

  const activeClockMode = clockModeForTransport(
    transportMode,
    !!activePlaybackRange && activePlaybackRange.mode === "preview",
  );

  useActivePlaybackClock(
    isPlaying,
    duration,
    getPlaybackTime,
    setCurrentTime,
    activeClockMode,
    hasActivePlaybackSource,
  );

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      const raw = getPlaybackTime();
      const displayed = usePlayerStore.getState().currentTime;
      const diag: PlaybackClockDiagnostics = {
        activeClockMode,
        rawClockTime: raw,
        displayedCurrentTime: displayed,
        duration,
        activeTransportMode: transportMode,
      };
      setClockDiagLine(
        `Clock ${diag.activeClockMode} · raw ${diag.rawClockTime.toFixed(2)}s · UI ${diag.displayedCurrentTime.toFixed(2)}s · dur ${diag.duration.toFixed(2)}s · transport ${diag.activeTransportMode}`,
      );
    }, 500);
    return () => window.clearInterval(id);
  }, [
    isPlaying,
    getPlaybackTime,
    activeClockMode,
    duration,
    transportMode,
    karaokeReady,
    karaokePreparing,
    karaokeFallback,
  ]);

  useEffect(() => {
    const headDur = trackDurationSec(parsed);
    if (headDur != null && headDur > 0) {
      setDuration(duration > 0 ? Math.max(duration, headDur) : headDur);
    }
  }, [parsed, duration, setDuration]);

  const songStructure = useMemo(() => parseStructureFromFile(parsed), [parsed]);

  useEffect(() => {
    const session = loadPlayerSession();
    if (!session) return;
    setRepeatMode(session.repeatMode);
    setShuffleMode(session.shuffle);
    setVolume(session.volume);
    if (session.tracks.length > 0) {
      setSessionRestored(true);
    }
  }, [setRepeatMode, setShuffleMode, setVolume, setSessionRestored]);

  useEffect(() => {
    savePlayerSession({
      version: 1,
      repeatMode,
      shuffle,
      volume,
      currentIndex,
      tracks: tracks.map(trackToSummary),
    });
  }, [tracks, currentIndex, repeatMode, shuffle, volume]);

  const loadFile = useCallback(
    async (playlistTrack: PlaylistTrack, loadGen: number, signal: AbortSignal) => {
      const { id: trackId, file, rawBuffer, parsed: ingestParsed } = playlistTrack;
      if (!file) return;
      // The playback controller owns the load lifecycle: it aborts a prior load
      // before starting this one and provides `signal` (aborts on supersede /
      // clear). Report readiness/failure back by `loadGen` so the machine tracks
      // phase and never reloads an already-ready track.
      getMixDecodeWorkerClient().cancelActive();
      // Play intent now lives in the playback machine (armed by the track-load
      // effect's select({play}) and consumed on AUDIO_STARTED). loadFile just
      // decodes and reports loadReady/loadFailed by `loadGen`; the machine's
      // startAudio effect (via requestPlayback) is what actually starts audio.
      stopMainSource();
      setLoadError("");
      setLoading(true);
      // Clear stale duration so Play stays disabled until this track is ready.
      setDuration(0);
      setCurrentTime(0);
      setIngestStage("decoding_audio");
      setIngestStageDetail("Preparing decode…");
      // A new load means nothing is playing until this track reaches ready and
      // the machine starts it. (A partial→full upgrade of an already-playing
      // track is not a new load and never reaches here.)
      setPlaying(false);

      const cached = decodeCache.get(trackId);
      // Guard so loadReady is dispatched EXACTLY once per load: the progressive
      // branch reports it early (at the 8s window) and the shared tail must not
      // report it again in the same synchronous tick (a second LOAD_READY would
      // re-emit startAudio before the isPlaying->machine bridge has consumed the
      // intent).
      let readyReported = false;
      const scheduleIntegrity = (pr: Mp5File, samples: Int16Array) => {
        const run = async () => {
          // This runs on an idle callback, long after loadFile returned, so it
          // must re-check the load's abort signal. Without this a superseded
          // track's verify still ran (hashing tens of MB for a track the user
          // already left) and then wrote a stale "Bit-exact" onto the new track.
          if (!stillCurrent()) return;
          setIngestStage("checking_integrity");
          setIngestStageDetail(ingestStageLabel("checking_integrity"));
          try {
            const result = await verifyMp5Integrity(pr, undefined, {
              pcmSamples: samples,
            });
            if (!stillCurrent()) return;
            setIntegrity(result);
            updateIngestDiagnostics({ integrityStatus: result.status });
          } catch {
            if (!stillCurrent()) return;
            setIntegrity(null);
          }
          setIngestStage("ready");
          setIngestStageDetail("");
        };
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(() => void run());
        } else {
          setTimeout(() => void run(), 0);
        }
      };

      const stillCurrent = () => !signal.aborted;

      try {
        if (cached) {
          if (!stillCurrent()) return;
          setDecodePath(cached.decodePath);
          setMp5hInfo(cached.mp5h);
          await loadPcm({
            samples: cached.samples,
            rate: cached.sampleRate,
            ch: cached.channels,
          });
          if (!stillCurrent()) return;
          setParsed(cached.parsed);
          setDuration(cached.duration);
          setCurrentTime(0);
          setIngestStage("ready");
          setIngestStageDetail("");
          scheduleIntegrity(cached.parsed, cached.samples);
        } else {
          const mixStart = performance.now();
          // Prefer ingestParsed → load AUDI + worker frames decode (lazy + eager).
          // Full-file arrayBuffer only when we lack a parsed HEAD.
          const buf = ingestParsed?.head
            ? undefined
            : rawBuffer ?? (await file.arrayBuffer());
          if (!stillCurrent()) return;

          // Day 2: L-v4 / PCM — decode first seconds, play, finish in background.
          let useProgressive = false;
          let progressiveEndSample = 0;
          let progressiveTrackDur = 0;
          if (ingestParsed?.head) {
            const head = ingestParsed.head;
            const total = Number(head.totalSamples);
            const rate = head.sampleRate;
            if (Number.isFinite(total) && total > 0 && rate > 0) {
              progressiveTrackDur = total / rate;
              progressiveEndSample = Math.min(
                total,
                Math.ceil(PROGRESSIVE_FIRST_SEC * rate),
              );
              const longEnough = progressiveEndSample < total - rate * 0.25;
              if (longEnough && head.codecId === CodecId.PCM) {
                useProgressive = true;
              } else if (longEnough && head.codecId === CodecId.MP5L) {
                // Peek only — do not CRC/load full AUDI just to read the version byte.
                const prefix = await peekAudiFramePrefix(ingestParsed, 8);
                useProgressive = !!prefix && mp5lBitstreamVersion(prefix) === 4;
              }
            }
          }
          if (!stillCurrent()) return;

          if (useProgressive && ingestParsed) {
            setDuration(progressiveTrackDur);
            setIngestStageDetail("Loading audio stream…");
            // Yield so "Loading…" can paint before AUDI CRC / worker transfer.
            await new Promise<void>((r) => setTimeout(r, 0));
            if (!stillCurrent()) return;
            setIngestStageDetail("Decoding first seconds…");
            const partial = await decodeMp5ToPcmOffthread(undefined, ingestParsed, {
              windowStartSample: 0,
              windowEndSample: progressiveEndSample,
            });
            if (!stillCurrent()) return;
            updateIngestDiagnostics({
              readyMixMs: Math.round(performance.now() - mixStart),
            });
            setDecodePath(partial.decodePath);
            setMp5hInfo(partial.mp5h);
            setParsed(partial.parsed);
            setCurrentTime(0);
            setIngestStageDetail("Preparing playback…");
            await loadPcm(
              {
                samples: partial.samples,
                rate: partial.sampleRate,
                ch: partial.channels,
                floatChannels: partial.floatChannels,
              },
              { partial: true },
            );
            if (!stillCurrent()) return;
            setIngestStage("ready");
            setIngestStageDetail("Finishing full decode…");
            // PARTIAL ready: the 8s window is playable, but the full decode is
            // still in flight. Reporting the real `loadReady` here would have
            // claimed the load was finished — leaving phase "readyPartial"
            // unreachable and hiding the still-running background work from
            // CLEAR/REMOVE. If play intent is armed, LOAD_PARTIAL_READY already
            // emits startAudio, so playback still begins at the window.
            controllerRef.current?.loadPartialReady(trackId, loadGen);
            // The shared tail must not report ready either: it runs immediately
            // (the upgrade below is fire-and-forget), long before the full
            // decode lands. The upgrade reports loadReady/loadFailed itself.
            readyReported = true;
            // Unlock Play immediately; full decode continues off-thread.
            setLoading(false);

            void (async () => {
              try {
                // Background priority: a neighbor prefetch must never cancel this
                // upgrade (that left the track a permanent 8s partial). Only a
                // real track switch (interactive) supersedes it.
                const full = await decodeMp5ToPcmOffthread(
                  undefined,
                  ingestParsed,
                  undefined,
                  "background",
                );
                if (!stillCurrent()) return;
                const dur =
                  full.samples.length / full.channels / full.sampleRate;
                decodeCache.set(trackId, {
                  samples: full.samples,
                  sampleRate: full.sampleRate,
                  channels: full.channels,
                  parsed: full.parsed,
                  decodePath: full.decodePath,
                  mp5h: full.mp5h,
                  duration: dur,
                });
                setDecodePath(full.decodePath);
                setMp5hInfo(full.mp5h);
                setDuration(dur);
                await upgradePcm({
                  samples: full.samples,
                  rate: full.sampleRate,
                  ch: full.channels,
                  floatChannels: full.floatChannels,
                });
                if (!stillCurrent()) return;
                setIngestStageDetail("");
                // NOW the load is genuinely complete — advance the machine from
                // readyPartial to ready.
                controllerRef.current?.loadReady(trackId, loadGen);
                scheduleIntegrity(full.parsed, full.samples);
              } catch (err) {
                if (!stillCurrent()) return;
                if (err instanceof DOMException && err.name === "AbortError") {
                  return;
                }
                setIngestStageDetail("");
                const message =
                  err instanceof Error
                    ? err.message
                    : "Background full decode failed";
                // Tell the machine too: without this it stayed in readyPartial
                // (previously "ready") while the UI showed an error, so its phase
                // disagreed with what the user saw and auto-advance-on-error
                // never ran for a failed upgrade.
                controllerRef.current?.loadFailed(trackId, loadGen, message);
                setLoadError(message);
              } finally {
                // The worker is free now — let the neighbour prefetch retry.
                if (stillCurrent()) setDecodeIdleTick((n) => n + 1);
              }
            })();
          } else {
            setIngestStageDetail("Loading audio stream…");
            await new Promise<void>((r) => setTimeout(r, 0));
            if (!stillCurrent()) return;
            setIngestStageDetail(ingestStageLabel("decoding_audio"));
            const {
              samples,
              sampleRate,
              channels,
              parsed: pr,
              decodePath: path,
              mp5h,
              floatChannels,
            } = await decodeMp5ToPcmOffthread(buf, ingestParsed);
            if (!stillCurrent()) return;
            updateIngestDiagnostics({
              readyMixMs: Math.round(performance.now() - mixStart),
            });
            const dur = samples.length / channels / sampleRate;
            decodeCache.set(trackId, {
              samples,
              sampleRate,
              channels,
              parsed: pr,
              decodePath: path,
              mp5h,
              duration: dur,
            });
            setDecodePath(path);
            setMp5hInfo(mp5h);
            setIngestStageDetail("Preparing playback…");
            await loadPcm({
              samples,
              rate: sampleRate,
              ch: channels,
              floatChannels,
            });
            if (!stillCurrent()) return;
            setParsed(pr);
            setDuration(dur);
            setCurrentTime(0);
            setIngestStage("ready");
            setIngestStageDetail("");
            scheduleIntegrity(pr, samples);
          }
        }

        if (!stillCurrent()) return;

        const neighborIds = [
          tracks[currentIndex - 1]?.id,
          trackId,
          tracks[currentIndex + 1]?.id,
        ].filter((id): id is string => !!id);
        decodeCache.retain(neighborIds);

        // Full decode ready (cached / non-progressive paths). The machine starts
        // audio iff play intent is armed for this track. Skipped when the
        // progressive branch already reported ready at its 8s window, so
        // loadReady fires exactly once per load.
        if (!readyReported) controllerRef.current?.loadReady(trackId, loadGen);
      } catch (e) {
        if (!stillCurrent()) return;
        // Track switch / StrictMode cancel — clear busy UI so we never stick on
        // "Preparing decode…" after an AbortError.
        if (e instanceof DOMException && e.name === "AbortError") {
          setIngestStage("ready");
          setIngestStageDetail("");
          return;
        }
        const message = e instanceof Error ? e.message : String(e);
        // A genuine failure: the machine clears intent + surfaces the error, and
        // (via the onLoadFailed handle) auto-advances past the track if the load
        // was an auto-advance continuation. A superseding abort returns above, so
        // it never reaches here and the reload keeps its intent.
        controllerRef.current?.loadFailed(trackId, loadGen, message);
        setDecodePath("");
        setMp5hInfo(undefined);
        setParsed(undefined);
        setIntegrity(null);
        setIngestStage("ready");
        setIngestStageDetail("");
      } finally {
        if (stillCurrent()) setLoading(false);
      }
    },
    [
      loadPcm,
      upgradePcm,
      stopMainSource,
      setCurrentTime,
      setDuration,
      setPlaying,
      tracks,
      currentIndex,
      handleTrackEnded,
      setCurrentIndex,
    ],
  );

  // Latest-callback refs for the track-load effect. loadFile/requestPlayback
  // change identity whenever load state flips; depending on them from that
  // effect created a feedback loop that aborted every in-flight decode
  // (endless "Preparing decode…"). The effect must re-run on track changes
  // only, so it calls the latest callbacks through these refs instead.
  const loadFileRef = useRef(loadFile);
  loadFileRef.current = loadFile;
  const requestPlaybackRef = useRef(requestPlayback);
  requestPlaybackRef.current = requestPlayback;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const stopMainSourceRef = useRef(stopMainSource);
  stopMainSourceRef.current = stopMainSource;

  // The playback controller owns the load lifecycle (state machine + one
  // AbortController per load). The React layer provides the side-effect handles;
  // the track-load effect + play triggers drive it. Instantiated once.
  const controllerRef = useRef<PlaybackController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new PlaybackController({
      startLoad: (trackId, gen, sig) => {
        const t = tracksRef.current.find((track) => track.id === trackId);
        if (t) void loadFileRef.current(t, gen, sig);
      },
      startAudio: () => {
        // Transport (full-mix vs stems vs karaoke) is resolved at start time by
        // requestPlayback → resolvePlaybackRequest from live engine state.
        requestPlaybackRef.current({ reason: "play_button", autoPlay: true });
      },
      stopAudio: () => {
        // setPlaying(false) is the universal stop (drives both engines); also
        // release the main source promptly.
        stopMainSourceRef.current();
        setPlaying(false);
      },
      surfaceError: (msg) => setLoadError(msg),
      onLoadFailed: (trackId, source) => {
        // Only an auto-advance continuation skips past a failed track; a failed
        // user/album pick just surfaces the error and stays put. repeat_one is
        // intentionally NOT replayed on failure (that would loop on the bad track).
        if (source !== "autoAdvance") return;
        const result = handleTrackEnded();
        if (result.type === "goto") {
          const nextId =
            usePlayerStore.getState().tracks[result.index]?.id ?? null;
          if (nextId)
            usePlayerStore.getState().setPendingPlayTrackId(nextId, "autoAdvance");
          setCurrentIndex(result.index);
        }
      },
      onStateChange: () => {},
    });
  }

  // Bridge desired-playing (store.isPlaying — what the engines follow) into the
  // machine's CONFIRMED-playing signal. The machine consumes armed intent and
  // flips `playing` only on AUDIO_STARTED, so without this the machine's intent
  // would never be consumed and its play/pause gating would be inert. One-way
  // only (machine.playing never writes back to isPlaying) so there is no loop.
  const currentTrackIdRef = useRef<string | null>(null);
  currentTrackIdRef.current = track?.id ?? null;
  useEffect(() => {
    if (isPlaying) {
      const id = currentTrackIdRef.current;
      if (id) controllerRef.current?.audioStarted(id);
    } else {
      controllerRef.current?.audioStopped();
    }
  }, [isPlaying]);

  // Prefetch next track into decodeCache when the active load is idle.
  useEffect(() => {
    if (loading) return;
    const next = tracks[currentIndex + 1];
    if (!next?.id || !next.parsed?.head || !next.file) return;
    if (decodeCache.get(next.id)) return;
    // Exact pre-decode admission test: HEAD already tells us the decoded size,
    // so an over-budget neighbour is never decoded at all (rather than decoded,
    // admitted, then immediately evicted — which would re-decode it forever).
    // Charge the compressed AUDI too: prefetching forces loadAudiFrames on the
    // neighbour, and those bytes stay pinned on its playlist track afterwards,
    // so a PCM-only estimate understates what the prefetch actually costs.
    const nextHead = next.parsed.head;
    const projectedPcmBytes =
      Number(nextHead.totalSamples) * nextHead.channels * 2;
    const projectedAudiBytes = next.file.size;
    const projectedBytes = projectedPcmBytes + projectedAudiBytes;
    if (!projectedPcmBytes || !decodeCache.canAdmit(projectedBytes)) return;
    const client = getMixDecodeWorkerClient();
    if (client.isBusy()) return;

    const genAtSchedule = controllerRef.current?.getState().loadGen;
    const loadUnchanged = () =>
      controllerRef.current?.getState().loadGen === genAtSchedule;
    const nextId = next.id;
    const nextParsed = next.parsed;
    const timer = window.setTimeout(() => {
      if (!loadUnchanged()) return;
      if (client.isBusy()) return;
      // Background priority: serializes behind (never cancels) the current
      // track's decode/upgrade; a track switch supersedes it in the scheduler.
      // wantFloats:false — the prefetch only caches Int16 `samples` (CachedDecode
      // has no float field); building + transferring planar floats here allocated
      // 2x `samples` per prefetch purely to be garbage-collected on return. The
      // cache-hit path converts to float on demand.
      void decodeMp5ToPcmOffthread(
        undefined,
        nextParsed,
        { wantFloats: false },
        "background",
      )
        .then((result) => {
          if (!loadUnchanged()) return;
          const dur =
            result.samples.length / result.channels / result.sampleRate;
          decodeCache.set(nextId, {
            samples: result.samples,
            sampleRate: result.sampleRate,
            channels: result.channels,
            parsed: result.parsed,
            decodePath: result.decodePath,
            mp5h: result.mp5h,
            duration: dur,
          });
          decodeCache.retain(
            [
              tracks[currentIndex - 1]?.id,
              tracks[currentIndex]?.id,
              nextId,
            ].filter((id): id is string => !!id),
          );
        })
        .catch(() => {
          /* prefetch is best-effort */
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [loading, currentIndex, tracks, decodeIdleTick]);

  useEffect(() => {
    setKaraokeMode(false);
    setKaraokePrepareRequest(null);
    setKaraokeStemPrepFailed(false);
    setActivePlaybackRange(null);
  }, [track?.id]);

  // Pin the current track in the decode cache: it is never evicted (the engine
  // holds the same samples anyway, so it costs no extra RAM) and never counts
  // against the budget for evictable neighbours.
  useEffect(() => {
    decodeCache.setProtected(track?.id ?? null);
  }, [track?.id]);

  const startPlaybackRange = useCallback(
    (range: ActivePlaybackRange | null, autoPlay = true) => {
      if (!range) return;
      setActivePlaybackRange(range);
      seek(range.startSec);
      if (autoPlay) setPlaying(true);
    },
    [seek, setPlaying],
  );

  const handlePlayHighlight = useCallback(
    (h: HighlightMoment, index: number) => {
      const { range, seekOnly } = playHighlightRange(h, index);
      seek(h.startMs / 1000);
      if (seekOnly) {
        setActivePlaybackRange(null);
        setPlaying(true);
        return;
      }
      if (range) startPlaybackRange(range);
      else setPlaying(true);
    },
    [seek, setPlaying, startPlaybackRange],
  );

  const handlePreviewHighlight = useCallback(
    (h: HighlightMoment, index: number) => {
      const range = previewHighlightRange(h, index);
      if (range) startPlaybackRange(range);
    },
    [startPlaybackRange],
  );

  const handleLoopSection = useCallback(
    (section: SongSection) => {
      const id = `sect-${section.sectionId}`;
      if (activePlaybackRange?.id === id) {
        setActivePlaybackRange(null);
        return;
      }
      const range = loopSectionRange(section);
      if (range) startPlaybackRange(range);
    },
    [activePlaybackRange?.id, startPlaybackRange],
  );

  const handleLoopHook = useCallback(() => {
    if (activePlaybackRange?.id === "hook") {
      setActivePlaybackRange(null);
      return;
    }
    const sections = songStructure.sect?.sections ?? [];
    const hookSection = findFirstSectionByType(sections, "hook");
    const range = loopHookRange(songStructure.hook ?? undefined, hookSection);
    if (range) startPlaybackRange(range);
  }, [activePlaybackRange?.id, songStructure, startPlaybackRange]);

  useEffect(() => {
    if (!track) {
      // Queue emptied (Clear / removed last track): the controller aborts any
      // in-flight load so it cannot complete into an empty queue — the "ghost
      // load" that resurrected metadata and could auto-play a gone track.
      controllerRef.current?.clear();
      getMixDecodeWorkerClient().cancelActive();
      stopMainSource();
      setParsed(undefined);
      setLoadError("");
      setDecodePath("");
      setMp5hInfo(undefined);
      setKaraokeMode(false);
      setKaraokePrepareRequest(null);
      setKaraokeStemPrepFailed(false);
      setActivePlaybackRange(null);
      setDuration(0);
      setCurrentTime(0);
      return;
    }
    if (track.parseError) {
      setLoadError(track.parseError);
      setParsed(undefined);
      setDecodePath("");
      setMp5hInfo(undefined);
      setDuration(0);
      setCurrentTime(0);
      setLoading(false);
      // An unparseable track never enters the load lifecycle (no select below),
      // so the machine can't model this skip. Drain the mailbox: if the track was
      // reached via auto-advance, skip past it; otherwise stop.
      const store = usePlayerStore.getState();
      const wasAutoAdvance =
        store.pendingPlayTrackId === track.id &&
        store.pendingPlaySource === "autoAdvance";
      store.consumePendingPlayTrackId(track.id);
      if (wasAutoAdvance) {
        const result = handleTrackEnded();
        if (result.type === "goto") {
          const nextId = store.tracks[result.index]?.id ?? null;
          if (nextId) store.setPendingPlayTrackId(nextId, "autoAdvance");
          setCurrentIndex(result.index);
          return;
        }
      }
      setPlaying(false);
      return;
    }
    if (track.parsed) {
      setParsed(track.parsed);
      const hasFp =
        !!getFingFromParsed(track.parsed) || !!getHashFromParsed(track.parsed);
      if (hasFp) {
        setIntegrity({
          status: "pending",
          hasFingerprint: true,
          hasHashChunk: !!getHashFromParsed(track.parsed),
          message: "Integrity check pending — will verify after audio decode.",
          chunkChecks: [],
        });
      } else {
        setIntegrity(null);
      }
    }
    if (isEmbeddedPlaceholderTrack(track) && activeAlbum?.packageKind === "embedded" && activeAlbum.embeddedSource) {
      if (embeddedHydratingTrackIdRef.current === track.id) {
        return;
      }
      stopMainSource();
      // Keep audio stopped while hydrating unless play is already armed for this
      // track (peek — the intent must survive until the real file loads below).
      if (usePlayerStore.getState().pendingPlayTrackId !== track.id) {
        setPlaying(false);
      }
      embeddedHydratingTrackIdRef.current = track.id;
      const gen = ++embeddedHydrateGenRef.current;
      setEmbeddedLoading(true);
      void (async () => {
        try {
          const ref = track.embeddedAlbum!;
          const loaded = await loadEmbeddedTrackAsPlaylistTrack(
            activeAlbum.embeddedSource!.file,
            activeAlbum.embeddedSource!.index,
            ref.trackId,
            ref.filename,
          );
          if (gen !== embeddedHydrateGenRef.current) return;
          if (!loaded) {
            setLoadError("Could not load embedded track from album package.");
            setPlaying(false);
            // Track can't load — drop its armed play intent so it can't leak.
            usePlayerStore.getState().consumePendingPlayTrackId(track.id);
            return;
          }
          replacePlaylistTrack(track.id, {
            ...loaded,
            id: track.id,
            embeddedAlbum: ref,
            durationSec: loaded.durationSec ?? track.durationSec,
          });
          const hydrated = await ensureEmbeddedTracksLoaded(activeAlbum, [ref.trackId]);
          setActiveAlbum(hydrated);
        } finally {
          if (gen === embeddedHydrateGenRef.current) {
            if (embeddedHydratingTrackIdRef.current === track.id) {
              embeddedHydratingTrackIdRef.current = null;
            }
            setEmbeddedLoading(false);
          }
        }
      })();
      return;
    }
    if (track.file) {
      // Drain the play-intent mailbox for this track (import/library/converter/
      // demo/auto-advance/next-prev/album all deposit here, keyed by track id).
      const store = usePlayerStore.getState();
      const wantPlay = store.pendingPlayTrackId === track.id;
      const source: PlayIntentSource = wantPlay
        ? (store.pendingPlaySource ?? "external")
        : "user";
      if (wantPlay) store.consumePendingPlayTrackId(track.id);

      // The machine is the single owner of load-play intent, and this is its sole
      // select() caller, so exactly one load runs per track change and a stray
      // effect re-run can never restart or wipe an in-flight load.
      const machineState = controllerRef.current?.getState();
      const machineHasTrack = machineState?.trackId === track.id;
      const machineErrored = machineHasTrack && machineState?.phase === "error";

      // Machine already owns this track LIVE (loading or ready): a play request is
      // PLAY_CLICK (start if ready, defer if loading); a plain re-fire is a no-op.
      if (machineHasTrack && !machineErrored) {
        if (wantPlay) controllerRef.current?.playClick();
        if (track.parsed) setParsed(track.parsed);
        return;
      }
      // A previously-FAILED current track (phase "error") is only re-loaded when
      // the user actually asked to play it (wantPlay). An incidental re-fire with
      // no armed intent (e.g. an activeAlbum change) must NOT spuriously re-decode.
      if (machineErrored && !wantPlay) {
        if (track.parsed) setParsed(track.parsed);
        return;
      }
      // A genuinely new current track, or a failed track the user asked to retry:
      // begin its load carrying any play intent.
      controllerRef.current?.select(track.id, { play: wantPlay, source });
    }
  }, [
    track?.id,
    track?.file,
    track?.parseError,
    track?.rawBuffer,
    track?.embeddedAlbum?.trackId,
    activeAlbum,
    pendingPlayTrackId,
    replacePlaylistTrack,
    stopMainSource,
    setCurrentTime,
    setDuration,
    setPlaying,
    handleTrackEnded,
    setCurrentIndex,
    hasMainPcm,
  ]);

  const handleFiles = async (files: FileList) => {
    setSessionRestored(false);
    dismissOnboarding();
    setAlbumManifestError("");
    const fileList = Array.from(files);
    const { mp5, manifests, other } = partitionDroppedFiles(fileList);

    // Pure source-audio Open/drop → Converter handoff (Player stays for .mp5 / .mp5p).
    if (other.length > 0 && mp5.length === 0 && manifests.length === 0) {
      setPendingConverterFiles(other);
      setActiveTab("converter");
      setLastDropSummary(null);
      setLastSkippedConvertibleFiles([]);
      return;
    }

    setIngestStage("loading_mp5");
    setIngestStageDetail(ingestStageLabel("loading_mp5"));
    ingestProgressFlushRef.current = 0;
    let pendingIngestStage: IngestLoadStage = "loading_mp5";
    let pendingIngestDetail = ingestStageLabel("loading_mp5");
    const flushIngestProgress = (force = false) => {
      const now = performance.now();
      if (!force && now - ingestProgressFlushRef.current < 100) return;
      ingestProgressFlushRef.current = now;
      setIngestStage(pendingIngestStage);
      setIngestStageDetail(pendingIngestDetail);
    };
    const ingest = await ingestAlbumPackageFiles(
      [...mp5, ...manifests],
      withoutDefaultDemoTracks(tracks),
      (name, progress) => {
        const isIndex = "chunksScanned" in progress;
        const stage = isIndex
          ? mapIndexProgressToIngestStage(progress)
          : mapParseProgressToIngestStage(progress);
        const detail = isIndex
          ? indexStageDetail(progress)
          : parseStageDetail(progress);
        pendingIngestStage = stage;
        pendingIngestDetail = ingestStageLabel(stage, detail ?? `Loading ${name}…`);
        // Throttle: stem files emit dozens of STDF progress events; full-tree
        // re-renders on each one freeze the tab on the last painted label (often WAVE).
        flushIngestProgress(stage === "ready" || stage === "indexing_stems");
      },
    );
    flushIngestProgress(true);
    setIngestStage("ready");
    setIngestStageDetail("");

    const otherErrors = other.map((file) => ({
      name: file.name,
      message: "Not an .mp5 / .mp5p file — use Converter for source audio.",
      reason: "not-mp5" as const,
    }));
    const summary: IngestResult = {
      ...ingest.mp5,
      skippedCount: ingest.mp5.skippedCount + other.length,
      dropErrors: [...ingest.mp5.dropErrors, ...otherErrors],
    };
    setLastDropSummary(summary);
    setLastSkippedConvertibleFiles(other);

    if (ingest.manifestError) {
      setAlbumManifestError(ingest.manifestError);
      setActiveAlbum(null);
    } else if (ingest.album) {
      dismissDefaultDemo();
      setActiveAlbum(ingest.album);
    }
    if (summary.dropErrors.length) {
      setDropErrors((prev) => [...prev, ...summary.dropErrors].slice(-8));
    }
    if (ingest.mp5.tracks.length) {
      const prevTracks = withoutDefaultDemoTracks(tracks);
      appendTracks(ingest.mp5.tracks);
      if (ingest.album && ingest.album.packageKind === "manifest") {
        const combined = [...prevTracks, ...ingest.mp5.tracks];
        const resolved = resolveAlbumTracks(ingest.album.manifest, combined);
        setActiveAlbum(
          enrichResolvedAlbum(resolved, {
            manifestName: ingest.manifestName,
            warnings: auditAlbmPackageManifest(ingest.album.manifest),
          }),
        );
      }
    }
  };

  useEffect(() => {
    if (!pendingPlayerFiles?.length) return;
    const files = consumePendingPlayerFiles();
    if (files?.length) void handleFiles(filesToFileList(files));
    // handleFiles is stable enough for one-shot handoff from shell/empty Open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consume once per pendingPlayerFiles
  }, [pendingPlayerFiles, consumePendingPlayerFiles]);

  const handleAddAlbumSidecars = async (files: FileList) => {
    if (!activeAlbum) return;
    dismissDefaultDemo();
    const mp5Result = await ingestMp5Files(Array.from(files));
    if (mp5Result.tracks.length) {
      appendTracks(mp5Result.tracks);
      const combined = [...withoutDefaultDemoTracks(tracks), ...mp5Result.tracks];
      setActiveAlbum(
        enrichResolvedAlbum(
          resolveAlbumTracks(activeAlbum.manifest, combined),
          {
            manifestName: activeAlbum.manifestName,
            warnings: activeAlbum.warnings,
          },
        ),
      );
    }
  };

  const handleSaveAlbumToLibrary = async () => {
    if (!activeAlbum) return;
    setAlbumSaveBusy(true);
    setAlbumSaveNote("");
    try {
      const name = activeAlbum.manifestName ?? `${activeAlbum.manifest.album.title}.mp5p`;
      if (activeAlbum.packageKind === "embedded" && activeAlbum.embeddedSource?.file) {
        const sizeBytes = activeAlbum.packageFileSize ?? activeAlbum.embeddedSource.file.size;
        const sizeLabel = formatPackageBytes(sizeBytes);
        const sizeMb = sizeBytes / (1024 * 1024);
        const confirmMsg =
          sizeMb > 16
            ? `Save the full embedded album package (${sizeLabel}) to browser storage?\n\n${LIBRARY_STORAGE_NOTE}\n\nLarge packages may take a moment. Continue?`
            : `Save this embedded album package (${sizeLabel}) to browser storage?\n\n${LIBRARY_STORAGE_NOTE}`;
        if (sizeMb > 16 && !window.confirm(confirmMsg)) {
          setAlbumSaveNote("Save cancelled.");
          return;
        }
        if (sizeMb <= 16 && !window.confirm(confirmMsg)) {
          setAlbumSaveNote("Save cancelled.");
          return;
        }
        await saveEmbeddedAlbumPackage(activeAlbum.embeddedSource.file, activeAlbum.manifest);
        setAlbumSaveNote(
          `Embedded album saved (${sizeLabel}). Library → Saved albums. ${LIBRARY_STORAGE_NOTE}`,
        );
      } else {
        if (
          !window.confirm(
            `Save manifest album to browser storage?\n\nSidecar .mp5 files must stay available on this device. ${LIBRARY_STORAGE_NOTE}`,
          )
        ) {
          setAlbumSaveNote("Save cancelled.");
          return;
        }
        saveAlbumPackage(activeAlbum.manifest, name);
        setAlbumSaveNote(
          `Manifest album saved. Keep sidecar .mp5 files available. ${LIBRARY_STORAGE_NOTE}`,
        );
      }
    } catch (e) {
      setAlbumSaveNote(
        e instanceof LibraryStorageError && e.code === "quota"
          ? USER_ERRORS.libraryQuota
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setAlbumSaveBusy(false);
    }
  };

  const loadEmbeddedAlbumForPlayback = async (
    trackIds?: string[],
  ): Promise<ResolvedAlbumPackage | null> => {
    if (!activeAlbum || activeAlbum.packageKind !== "embedded") return activeAlbum;
    const loaded = await ensureEmbeddedTracksLoaded(activeAlbum, trackIds);
    setActiveAlbum(loaded);
    return loaded;
  };

  const startEmbeddedPlaylistMetadataPrefetch = (album: ResolvedAlbumPackage) => {
    if (album.packageKind !== "embedded") return;
    const gen = ++playlistPrefetchGenRef.current;
    void prefetchEmbeddedPlaylistMetadata(
      album,
      (trackId, patch) => {
        if (gen !== playlistPrefetchGenRef.current) return;
        const current = usePlayerStore.getState().tracks.find((t) => t.id === trackId);
        if (!current) return;
        if (current.file) {
          replacePlaylistTrack(trackId, {
            ...current,
            durationSec: patch.durationSec ?? current.durationSec,
            embeddedAlbum: patch.embeddedAlbum
              ? { ...current.embeddedAlbum!, ...patch.embeddedAlbum }
              : current.embeddedAlbum,
          });
          return;
        }
        replacePlaylistTrack(trackId, { ...current, ...patch });
      },
      { isCancelled: () => gen !== playlistPrefetchGenRef.current },
    );
  };

  const queueEmbeddedAlbumTracksInBackground = () => {
    if (!activeAlbum || activeAlbum.packageKind !== "embedded") return;
    const albumSnapshot = activeAlbum;
    void (async () => {
      for (let i = 0; i < albumSnapshot.tracks.length; i++) {
        const row = albumSnapshot.tracks[i]!;
        if (row.playlistTrack || row.missing) continue;
        const loaded = await ensureEmbeddedTracksLoaded(albumSnapshot, [row.ref.trackId]);
        setActiveAlbum(loaded);
        const playlistTrack = loaded.tracks[i]?.playlistTrack;
        if (!playlistTrack) continue;
        const existing = withoutDefaultDemoTracks(usePlayerStore.getState().tracks);
        if (!existing.some((t) => t.id === playlistTrack.id)) {
          appendTracks([playlistTrack]);
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    })();
  };

  const handlePlayAlbum = async () => {
    if (!activeAlbum) return;
    dismissDefaultDemo();
    recordLastAlbumAction("play_album");
    recordLastPlaybackRequest("play_album");
    stopMainSource();
    setPlaying(false);
    if (activeAlbum.packageKind === "embedded") {
      const placeholders = buildEmbeddedPlaylistPlaceholders(activeAlbum);
      if (!placeholders.length) return;
      setTracks(placeholders);
      startEmbeddedPlaylistMetadataPrefetch(activeAlbum);
      const firstId = placeholders[0]?.id;
      if (firstId) usePlayerStore.getState().setPendingPlayTrackId(firstId, "album");
      setCurrentIndex(0);
      recordLastAlbumAction("play_album", placeholders[0]?.id ?? null);
      tracePlayback("request_playback", "play_album", {
        trackCount: placeholders.length,
        firstTrackId: placeholders[0]?.id,
        packageKind: "embedded",
      });
      return;
    }
    let album = activeAlbum;
    album = (await loadEmbeddedAlbumForPlayback()) ?? album;
    const ordered = resolvedTracksInOrder(album);
    if (!ordered.length) return;
    const first = ordered[0]!;
    const currentTracks = withoutDefaultDemoTracks(usePlayerStore.getState().tracks);
    const toAdd = ordered.filter((t) => !currentTracks.some((x) => x.id === t.id));
    if (toAdd.length) appendTracks(toAdd);
    const idx = usePlayerStore.getState().tracks.findIndex((t) => t.id === first.id);
    if (idx < 0) return;
    usePlayerStore.getState().setPendingPlayTrackId(first.id, "album");
    setCurrentIndex(idx);
    recordLastAlbumAction("play_album", first.id);
  };

  const handleAddAlbumToQueue = async () => {
    if (!activeAlbum) return;
    dismissDefaultDemo();
    recordLastAlbumAction("add_album_to_queue");
    if (activeAlbum.packageKind === "embedded") {
      const placeholders = buildEmbeddedPlaylistPlaceholders(activeAlbum);
      const existingIds = new Set(
        withoutDefaultDemoTracks(usePlayerStore.getState().tracks).map((t) => t.id),
      );
      const toAdd = placeholders.filter((t) => !existingIds.has(t.id));
      if (toAdd.length) appendTracks(toAdd);
      startEmbeddedPlaylistMetadataPrefetch(activeAlbum);
      return;
    }
    let album = activeAlbum;
    album = (await loadEmbeddedAlbumForPlayback()) ?? album;
    const ordered = resolvedTracksInOrder(album);
    const newIds = new Set(
      withoutDefaultDemoTracks(usePlayerStore.getState().tracks).map((t) => t.id),
    );
    const toAdd = ordered.filter((t) => !newIds.has(t.id));
    if (toAdd.length) appendTracks(toAdd);
  };

  const handleAlbumTrackSelect = async (rowIndex: number) => {
    const row = activeAlbum?.tracks[rowIndex];
    if (!row) return;
    dismissDefaultDemo();
    const trackId = row.ref.trackId;
    const queued = withoutDefaultDemoTracks(usePlayerStore.getState().tracks).find(
      (t) => t.id === trackId || t.embeddedAlbum?.trackId === trackId,
    );
    if (queued) {
      const idx = usePlayerStore.getState().tracks.findIndex((t) => t.id === queued.id);
      usePlayerStore.getState().setPendingPlayTrackId(queued.id, "album");
      setCurrentIndex(idx);
      recordLastAlbumAction("select_track", trackId);
      return;
    }
    let playlistTrack = row.playlistTrack;
    if (!playlistTrack && activeAlbum?.packageKind === "embedded" && activeAlbum.embeddedSource) {
      setEmbeddedLoading(true);
      try {
        const dir = activeAlbum.embeddedSource.index.tracks.find((t) => t.trackId === row.ref.trackId);
        playlistTrack = await loadEmbeddedTrackAsPlaylistTrack(
          activeAlbum.embeddedSource.file,
          activeAlbum.embeddedSource.index,
          row.ref.trackId,
          dir?.logicalFile ?? row.ref.file,
        );
        if (playlistTrack) {
          const loaded = await ensureEmbeddedTracksLoaded(activeAlbum, [row.ref.trackId]);
          setActiveAlbum(loaded);
        }
      } finally {
        setEmbeddedLoading(false);
      }
    }
    if (!playlistTrack) return;
    const idx = withoutDefaultDemoTracks(usePlayerStore.getState().tracks).findIndex(
      (t) => t.id === playlistTrack!.id,
    );
    if (idx >= 0) {
      usePlayerStore.getState().setPendingPlayTrackId(playlistTrack.id, "album");
      setCurrentIndex(idx);
      recordLastAlbumAction("play_track", playlistTrack.id);
      return;
    }
    appendTracks([playlistTrack]);
    const nextIdx = usePlayerStore.getState().tracks.findIndex((t) => t.id === playlistTrack!.id);
    usePlayerStore.getState().setPendingPlayTrackId(playlistTrack.id, "album");
    setCurrentIndex(nextIdx >= 0 ? nextIdx : usePlayerStore.getState().tracks.length - 1);
    recordLastAlbumAction("play_track", playlistTrack.id);
  };

  const handleAddAlbumTrackToQueue = async (rowIndex: number) => {
    const row = activeAlbum?.tracks[rowIndex];
    if (!row) return;
    dismissDefaultDemo();
    if (activeAlbum?.packageKind === "embedded") {
      const placeholders = buildEmbeddedPlaylistPlaceholders(activeAlbum);
      const placeholder = placeholders[rowIndex];
      if (
        !placeholder ||
        withoutDefaultDemoTracks(usePlayerStore.getState().tracks).some(
          (t) => t.id === placeholder.id,
        )
      ) {
        return;
      }
      appendTracks([placeholder]);
      recordLastAlbumAction("add_track_to_queue", placeholder.id);
      return;
    }
    let playlistTrack = row.playlistTrack;
    if (!playlistTrack && activeAlbum?.embeddedSource) {
      setEmbeddedLoading(true);
      try {
        const dir = activeAlbum.embeddedSource.index.tracks.find((t) => t.trackId === row.ref.trackId);
        playlistTrack = await loadEmbeddedTrackAsPlaylistTrack(
          activeAlbum.embeddedSource.file,
          activeAlbum.embeddedSource.index,
          row.ref.trackId,
          dir?.logicalFile ?? row.ref.file,
        );
        if (playlistTrack) {
          const loaded = await ensureEmbeddedTracksLoaded(activeAlbum, [row.ref.trackId]);
          setActiveAlbum(loaded);
        }
      } finally {
        setEmbeddedLoading(false);
      }
    }
    if (
      !playlistTrack ||
      withoutDefaultDemoTracks(usePlayerStore.getState().tracks).some(
        (t) => t.id === playlistTrack!.id,
      )
    ) return;
    appendTracks([playlistTrack]);
  };

  const handleExtractEmbeddedTrack = async (rowIndex: number) => {
    const row = activeAlbum?.tracks[rowIndex];
    if (!activeAlbum?.embeddedSource || !row) return;
    setEmbeddedLoading(true);
    try {
      const dir = activeAlbum.embeddedSource.index.tracks.find((t) => t.trackId === row.ref.trackId);
      const title = row.ref.title ?? row.playlistTrack?.name ?? "Track";
      const filename = formatExtractFilename(row.trackNumber, title);
      const fileTrack = await loadEmbeddedTrackAsPlaylistTrack(
        activeAlbum.embeddedSource.file,
        activeAlbum.embeddedSource.index,
        row.ref.trackId,
        dir?.logicalFile ?? row.ref.file,
      );
      if (!fileTrack?.file) return;
      downloadBlob(fileTrack.file, filename);
    } finally {
      setEmbeddedLoading(false);
    }
  };

  const handleExtractAllEmbedded = async () => {
    if (!activeAlbum?.embeddedSource || activeAlbum.packageKind !== "embedded") return;
    const extractable = activeAlbum.tracks.filter((t) => !t.missing);
    if (!extractable.length) return;
    if (
      extractable.length > 1 &&
      !window.confirm(
        `Extract ${extractable.length} tracks? Browsers may block or delay multiple downloads.`,
      )
    ) {
      return;
    }
    for (let i = 0; i < extractable.length; i++) {
      await handleExtractEmbeddedTrack(activeAlbum.tracks.indexOf(extractable[i]!));
      if (i < extractable.length - 1) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  };

  const handlePlayIndex = useCallback(
    (index: number) => {
      const target = tracks[index];
      if (!target || target.parseError) return;
      recordLastPlaybackRequest("play_button");

      if (index === currentIndex) {
        // Play the current track. PLAY_CLICK starts it if ready / defers if
        // loading; but if its load FAILED (phase "error") re-arm the mailbox to
        // retry, and if it is an un-hydrated embedded placeholder (no file yet)
        // arm play so it starts once hydrated — matching handlePlayPause.
        if (target.file) {
          if (controllerRef.current?.getState().phase === "error") {
            usePlayerStore.getState().setPendingPlayTrackId(target.id, "user");
          } else {
            controllerRef.current?.playClick();
          }
        } else if (isEmbeddedPlaceholderTrack(target)) {
          usePlayerStore.getState().setPendingPlayTrackId(target.id, "user");
        }
        return;
      }
      // Switch to and play a different queue entry.
      usePlayerStore.getState().setPendingPlayTrackId(target.id, "user");
      setCurrentIndex(index);
    },
    [tracks, currentIndex, setCurrentIndex],
  );

  const handleSaveToLibrary = async (t: (typeof tracks)[0]) => {
    if (!t?.file) return;
    setLibrarySaveBusy(true);
    setLibrarySaveNote("");
    try {
      const records = await listLibraryRecords();
      let identityKey: string | undefined;
      if (t.parsed) {
        try {
          identityKey = fingIdentityKey(decodeFing(t.parsed.optional.get("FING"))) ?? undefined;
        } catch {
          /* optional */
        }
      }
      const dup = findLibraryDuplicate(records, {
        filename: t.name,
        fileSize: t.file.size,
        identityKey,
      });
      if (dup) {
        const msg =
          dup.reason === "fingerprint"
            ? "This track appears to already be in your library (matching fingerprint)."
            : "This track appears to already be in your library (same filename and size).";
        if (!window.confirm(`${msg}\n\nSave anyway?`)) {
          setLibrarySaveNote("Save skipped — duplicate not added.");
          return;
        }
      }
      const result = await savePlaylistTrackToLibrary(t);
      if (result.status === "failed") {
        setLibrarySaveNote(
          result.errorCode === "quota" ? USER_ERRORS.libraryQuota : result.message,
        );
        return;
      }
      setLibrarySaveNote(
        result.status === "duplicate"
          ? "Already in your local library."
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
    } finally {
      setLibrarySaveBusy(false);
    }
  };

  const handleClear = () => {
    setDropErrors([]);
    setLastDropSummary(null);
    setActiveAlbum(null);
    setAlbumManifestError("");
    clearTracks();
    decodeCache.clear();
    clearPlayerSession();
    setParsed(undefined);
    setIntegrity(null);
    setLoadError("");
    setSessionRestored(false);
  };

  const waveformSectionMarkers = useMemo(
    () =>
      songStructure.sect?.sections.map((s) => ({
        startMs: s.startMs,
        endMs: s.endMs,
        label: s.title,
      })) ?? [],
    [songStructure.sect],
  );
  const waveformHighlightMarkers = useMemo(
    () =>
      songStructure.hilt?.highlights.map((h) => ({
        startMs: h.startMs,
        endMs: h.endMs,
      })) ?? [],
    [songStructure.hilt],
  );
  const waveformLoopRange = useMemo(() => {
    if (!activePlaybackRange?.endSec) return null;
    return {
      startSec: activePlaybackRange.startSec,
      endSec: activePlaybackRange.endSec,
    };
  }, [activePlaybackRange]);
  const { theme: playerTheme, status: themeStatus } = useMemo(
    () => resolveThemeForFile(parsed, useFileThemes),
    [useFileThemes, parsed],
  );

  const albumCtx = useMemo(
    () => albumPlaybackContext(activeAlbum, track),
    [activeAlbum, track],
  );

  const currentAlbumTrackId = useMemo(() => {
    if (!activeAlbum || !track) return null;
    const row = activeAlbum.tracks.find(
      (t) => t.playlistTrack?.id === track.id || t.ref.trackId === track.id,
    );
    return row?.ref.trackId ?? null;
  }, [activeAlbum, track]);

  // "Should playback continue across this skip?" Reads the machine's LIVE state
  // (already playing OR a play-intent pending for an in-flight load) rather than
  // the store's isPlaying, which goes transiently false during every load — so
  // rapid Next/Prev (pressed faster than tracks load) keeps playing instead of
  // silently stopping.
  const playbackContinues = () => {
    const s = controllerRef.current?.getState();
    return isPlaying || !!s?.playing || s?.intent != null;
  };

  const handlePlayerNext = () => {
    if (activeAlbum && track) {
      const rowIndex = activeAlbum.tracks.findIndex(
        (t) => t.playlistTrack?.id === track.id || t.ref.trackId === track.id,
      );
      if (rowIndex >= 0 && rowIndex < activeAlbum.tracks.length - 1) {
        void handleAlbumTrackSelect(rowIndex + 1);
        return;
      }
    }
    const wasPlaying = playbackContinues();
    const prevId = track?.id;
    playNext();
    if (wasPlaying) {
      const s = usePlayerStore.getState();
      const nextId = s.tracks[s.currentIndex]?.id;
      if (nextId && nextId !== prevId) s.setPendingPlayTrackId(nextId, "user");
    }
  };

  const handlePlayerPrev = () => {
    if (activeAlbum && track) {
      const rowIndex = activeAlbum.tracks.findIndex(
        (t) => t.playlistTrack?.id === track.id || t.ref.trackId === track.id,
      );
      if (rowIndex > 0) {
        void handleAlbumTrackSelect(rowIndex - 1);
        return;
      }
    }
    const wasPlaying = playbackContinues();
    const prevId = track?.id;
    playPrevious();
    if (wasPlaying) {
      const s = usePlayerStore.getState();
      const nextId = s.tracks[s.currentIndex]?.id;
      if (nextId && nextId !== prevId) s.setPendingPlayTrackId(nextId, "user");
    }
  };

  const canPlaySimilar = useMemo(
    () => similarTrackAvailable(tracks, currentIndex),
    [tracks, currentIndex],
  );

  const handlePlaySimilar = () => {
    const nextIndex = findSimilarTrackIndex(tracks, currentIndex);
    if (nextIndex == null) return;
    const similarId = tracks[nextIndex]?.id;
    if (similarId) usePlayerStore.getState().setPendingPlayTrackId(similarId, "user");
    setCurrentIndex(nextIndex);
  };

  const embeddedHydratingTrackId = embeddedLoading ? embeddedHydratingTrackIdRef.current : null;

  const jumpToInspector = (section: InspectorSection, target: InspectorSection = section) => {
    setInspectorSection(section);
    document.getElementById(`mp5-inspector-${target}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <>
      {panelVisible && (
        <div className="space-y-6" data-testid="mp5-player">
      {ingestStage !== "idle" && ingestStage !== "ready" && (
        <p
          className="text-xs text-accent/90 bg-accent/5 rounded-lg px-3 py-2"
          data-testid="player-ingest-status"
        >
          {ingestStageDetail || ingestStageLabel(ingestStage)}
        </p>
      )}

      {albumManifestError && (
        <p className="text-xs text-amber-200/80 bg-amber-950/20 rounded-lg px-3 py-2" data-testid="album-manifest-error">
          Album manifest: {albumManifestError}
        </p>
      )}

      {activeAlbum && (
        <AlbumPackagePanel
          album={activeAlbum}
          onPlayAlbum={() => void handlePlayAlbum()}
          onAddToQueue={() => void handleAddAlbumToQueue()}
          onDismiss={() => {
            setActiveAlbum(null);
            setAlbumSaveNote("");
          }}
          onSelectTrack={(i) => void handleAlbumTrackSelect(i)}
          onPlayTrack={(i) => void handleAlbumTrackSelect(i)}
          onAddTrackToQueue={(i) => void handleAddAlbumTrackToQueue(i)}
          onAddSidecarFiles={(f) => void handleAddAlbumSidecars(f)}
          onSaveAlbum={() => void handleSaveAlbumToLibrary()}
          onExtractTrack={(i) => void handleExtractEmbeddedTrack(i)}
          onExtractAll={() => void handleExtractAllEmbedded()}
          saveBusy={albumSaveBusy}
          embeddedLoading={embeddedLoading}
          currentTrackId={currentAlbumTrackId}
        />
      )}

      {albumSaveNote && (
        <p className="text-xs text-gray-400 bg-surface-elevated rounded-lg px-3 py-2" data-testid="album-save-note">
          {albumSaveNote}
        </p>
      )}

      {lastDropSummary && (
        <DropImportSummary summary={lastDropSummary} skippedFiles={lastSkippedConvertibleFiles} />
      )}

      {librarySaveNote && (
        <p className="text-xs text-gray-400 bg-surface-elevated rounded-lg px-3 py-2" data-testid="library-save-note">
          {librarySaveNote}
        </p>
      )}

      {sessionRestored && tracks.length === 0 && (
        <p className="text-xs text-gray-500 bg-surface-elevated rounded-lg px-3 py-2" data-testid="session-restore-note">
          {PLAYLIST_PERSISTENCE_NOTE}
        </p>
      )}

      <div className="mp5-player-layout">
        <div className="mp5-player-workspace">
          <section className="mp5-player-primary" aria-label="Player">
            <div
              className={playerTheme ? "mp5-player-themed" : undefined}
              style={themeRootStyle(playerTheme)}
              data-testid="player-theme-root"
              data-theme-active={playerTheme ? "true" : "false"}
            >
              <NowPlayingView
                track={track}
                parsed={parsed}
                loading={loading}
                loadError={loadError}
                playerTheme={playerTheme}
                albumContext={albumCtx}
                duration={duration}
                embeddedHydrating={embeddedHydratingTrackId === track?.id}
                integrity={integrity}
                canPlaySimilar={canPlaySimilar}
                onPlaySimilar={handlePlaySimilar}
              />
            </div>

            <div className="mp5-player-waveform">
              <WaveformProgress duration={duration}>
                {(progress) => (
                  <WaveformView
                    peaks={parsed?.waveform ?? []}
                    progress={progress}
                    durationSec={duration}
                    sectionMarkers={waveformSectionMarkers}
                    highlightMarkers={waveformHighlightMarkers}
                    activeLoopRange={waveformLoopRange}
                    playedFill={playerTheme?.waveformPlayedFill}
                    unplayedFill={playerTheme?.waveformUnplayedFill}
                    visualProfile={track?.origin === "default-demo" ? "default-demo" : undefined}
                    onSeek={handleWaveformSeek}
                    disabled={loading || duration <= 0}
                  />
                )}
              </WaveformProgress>
            </div>

            <div className="mp5-player-controls-wrap">
              <PlayerControls
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                playbackStatus={playbackSnapshot.playState}
                playbackReadiness={playbackSnapshot.readiness}
                hasTrack={!!track}
                loading={loading}
                playbackStatusDetail={
                  playbackSnapshot.playState === "preparing"
                    ? karaokePreparing
                      ? "Preparing karaoke…"
                      : ingestStageDetail || "Preparing audio…"
                    : karaokeFallback
                      ? "Karaoke audio unavailable — playing full mix with synced lyrics"
                      : loadError || undefined
                }
                onPrev={handlePlayerPrev}
                onNext={handlePlayerNext}
                canPrev={canPrev}
                canNext={canNext}
                repeatMode={repeatMode}
                shuffle={shuffle}
                onToggleShuffle={toggleShuffle}
                onCycleRepeat={cycleRepeatMode}
                duration={duration}
                onSeek={seek}
                volume={volume}
                onVolume={setVolume}
              />
            </div>
          </section>

          <section className="mp5-player-inspector" aria-label="Track inspector">
            <nav className="mp5-inspector-tabs" aria-label="Track details">
              {INSPECTOR_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="mp5-inspector-tab"
                  aria-current={inspectorSection === item.id ? "true" : undefined}
                  data-inspector-id={item.id}
                  onClick={() => jumpToInspector(item.id, item.target)}
                >
                  {item.id === "metadata" ? (
                    <>
                      <span className="hidden sm:inline">{item.label}</span>
                      <span className="inline-flex items-center gap-1 sm:hidden">
                        More <CaretDown size={12} />
                      </span>
                    </>
                  ) : (
                    item.label
                  )}
                </button>
              ))}
            </nav>

            <div
              className="mp5-inspector-section"
              id="mp5-inspector-overview"
              data-inspector-section="overview"
              data-active={inspectorSection === "overview" ? "true" : "false"}
            >
              <PlayerInspectorOverview
                track={track}
                parsed={parsed}
                duration={duration}
                integrity={integrity}
              />
            </div>

            <div
              className="mp5-inspector-section space-y-4"
              id="mp5-inspector-format"
              data-inspector-section="format"
              data-active={inspectorSection === "format" ? "true" : "false"}
            >
              <TrackMetadata
                parsed={parsed}
                title={track?.name}
                decodePath={decodePath}
                mp5h={mp5hInfo}
                fileBytes={track?.file?.size}
                hideTrackTitles
              />
              <CodecModesHelper />
              <SongMapPanel
                parsed={parsed}
                duration={duration}
                activeRange={activePlaybackRange}
                onSeek={seek}
                onPlay={() => setPlaying(true)}
                onPlayHighlight={handlePlayHighlight}
                onPreviewHighlight={handlePreviewHighlight}
                onLoopSection={handleLoopSection}
                onLoopHook={handleLoopHook}
                onStopLoop={() => setActivePlaybackRange(null)}
              />
            </div>

            <div
              className="mp5-inspector-section"
              id="mp5-inspector-lyrics"
              data-inspector-section="lyrics"
              data-active={inspectorSection === "lyrics" ? "true" : "false"}
            >
              <LyricsPanel
                parsed={parsed}
                getPlaybackTime={getPlaybackTime}
                duration={duration}
                isPlaying={isPlaying}
                onSeek={seek}
                karaokeMode={karaokeMode}
                onKaraokeModeChange={(on) => {
                  tracePlayback("karaoke", on ? "mode on" : "mode off");
                  if (!on) setKaraokeStemPrepFailed(false);
                  setKaraokeMode(on);
                }}
                onKaraokePrepare={(req) => {
                  setKaraokeStemPrepFailed(false);
                  setKaraokePrepareRequest(req);
                }}
              />
            </div>

            <div
              className="mp5-inspector-section"
              id="mp5-inspector-stems"
              data-inspector-section="stems"
              data-active={inspectorSection === "stems" ? "true" : "false"}
            >
              <StemsPanel
                parsed={parsed}
                fullMixPcm={(() => {
                  const cached = track?.id ? decodeCache.get(track.id) : undefined;
                  return cached
                    ? {
                        samples: cached.samples,
                        sampleRate: cached.sampleRate,
                        channels: cached.channels,
                      }
                    : null;
                })()}
                stemMixActive={stemMixActive}
                onStemMixActiveChange={setStemMixActive}
                onStemMixEnable={handleStemMixEnable}
                onStemMixSeamlessOp={handleStemMixSeamlessOp}
                onRestartStemMix={handleRestartStemMix}
                onReturnToFullMix={handleReturnToFullMix}
                getPlaybackTime={getPlaybackTime}
                getStemGraphGeneration={() => stemGraphGenRef.current}
                activeStemSourceIds={activeStemSourceIds}
                transportDiagnostics={transportDiagLine}
                clockDiagnostics={clockDiagLine}
                stemInsertDeferredId={stemInsertDeferredId}
                onClearStemInsertDeferred={() => setStemInsertDeferredId(null)}
                onMixModeChange={setTransportMode}
                isPlaying={isPlaying}
                loading={loading}
                karaokePrepareRequest={karaokePrepareRequest}
                onKaraokePrepareDone={() => setKaraokePrepareRequest(null)}
                onKaraokePrepareFailed={() => {
                  setKaraokeStemPrepFailed(true);
                  // Prepare failed off the handleStemMixEnable happy path, so clear
                  // the transport-resume flag here or it leaks true and spuriously
                  // auto-starts the next stem/karaoke enable.
                  resumeStemsWhenPreparedRef.current = false;
                }}
              />
            </div>

            <div
              className="mp5-inspector-section"
              id="mp5-inspector-metadata"
              data-inspector-section="metadata"
              data-active={inspectorSection === "metadata" || inspectorSection === "integrity" ? "true" : "false"}
            >
              <MetadataDetailsPanel
                parsed={parsed}
                integrity={integrity}
                useFileThemes={useFileThemes}
                themeStatus={themeStatus}
                playerTheme={playerTheme}
              />
            </div>
          </section>
        </div>

        <aside className="mp5-player-sidebar" id="mp5-player-queue" tabIndex={-1}>
          <LibraryPanel
            compact
            tracks={tracks}
            currentIndex={currentIndex}
            isPlaying={isPlaying}
            dropErrors={dropErrors}
            repeatMode={repeatMode}
            shuffle={shuffle}
            onSelect={(index) => {
              // Plain selection (no play): the track-load effect will select it
              // into the machine without play intent (mailbox is empty).
              setCurrentIndex(index);
            }}
            onPlay={handlePlayIndex}
            onRemove={removeTrack}
            onClear={handleClear}
            onToggleShuffle={toggleShuffle}
            onCycleRepeat={cycleRepeatMode}
            onSaveToLibrary={(item) => void handleSaveToLibrary(item)}
            librarySaveBusy={librarySaveBusy}
            album={activeAlbum}
            hydratingTrackId={embeddedHydratingTrackId}
          />
          <div className="mp5-sidebar-drop-slot">
            <FileDropZone
              testId="player-file-input"
              label="Drag .mp5 / .mp5p here — or source audio to convert"
              onFiles={(files) => void handleFiles(files)}
            />
          </div>
          <div className="mp5-experimental-card">
            <TestTube size={22} aria-hidden />
            <div>
              <p className="font-medium text-gray-200">MP5 is experimental</p>
              <p>Verify important playback. Use at your own risk.</p>
              <button type="button" onClick={() => setActiveTab("about")}>
                Learn more
              </button>
            </div>
          </div>
          <div className="mp5-sidebar-album-creator">
            <CreateAlbumPackagePanel tracks={tracks} />
          </div>
        </aside>
          </div>

        </div>
      )}

      <PlaybackRangeTicker
        activeRange={activePlaybackRange}
        isPlaying={isPlaying}
        onSeek={seek}
        onStop={() => {
          setPlaying(false);
          setActivePlaybackRange(null);
        }}
      />

      <PersistentTransport
        track={track}
        parsed={parsed}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onPrevious={handlePlayerPrev}
        onNext={handlePlayerNext}
        onShuffle={toggleShuffle}
        onRepeat={cycleRepeatMode}
        canPrevious={canPrev}
        canNext={canNext}
        duration={duration}
        volume={volume}
        loading={loading}
        onSeek={seek}
        onVolume={setVolume}
        onQueue={() => {
          const revealQueue = () => {
            const queue = document.getElementById("mp5-player-queue");
            queue?.scrollIntoView({ behavior: "smooth" });
            queue?.focus({ preventScroll: true });
          };
          if (!panelVisible) {
            onRequestPlayer?.();
            window.setTimeout(revealQueue, 0);
            return;
          }
          revealQueue();
        }}
      />
    </>
  );
}
