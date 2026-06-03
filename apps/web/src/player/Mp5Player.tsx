import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clockModeForTransport,
  type PlaybackClockDiagnostics,
} from "../lib/playback/activePlaybackClock";
import { usePlayerStore, selectCanGoNext, selectCanGoPrev } from "../store/playerStore";
import { decodeMp5ToPcm } from "./decodeMp5";
import { decodeCache } from "./decodeCache";
import { FileDropZone } from "./FileDropZone";
import { WaveformView } from "./WaveformView";
import { PlayerControls } from "./PlayerControls";
import { MetadataDetailsPanel } from "./MetadataDetailsPanel";
import { StemsPanel } from "./StemsPanel";
import { LyricsPanel } from "./LyricsPanel";
import { SongMapPanel } from "./SongMapPanel";
import { parseStructureFromFile } from "../lib/sections/parseSections";
import {
  applyPlaybackRangeTick,
  loopHookRange,
  loopSectionRange,
  playHighlightRange,
  previewHighlightRange,
  type ActivePlaybackRange,
} from "../lib/sections/playbackRange";
import { findFirstSectionByType } from "../lib/sections/sectionPlayback";
import type { HighlightMoment, SongSection } from "@mp5/container";
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
import { ingestMp5Files, trackDurationSec, type IngestResult } from "./playlistUtils";
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
import { ingestAlbumPackageFiles } from "../lib/album/ingestAlbumPackage";
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
import { PlayerEmptyState } from "../components/PlayerEmptyState";
import { DemoFixtureActions } from "../components/DemoFixtureActions";
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

export function Mp5Player() {
  const store = usePlayerStore();
  const {
    tracks,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    repeatMode,
    shuffle,
    appendTracks,
    removeTrack,
    clearTracks,
    setCurrentIndex,
    playNext,
    playPrevious,
    handleTrackEnded,
    cycleRepeatMode,
    toggleShuffle,
    setPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    setRepeatMode,
    setShuffle: setShuffleMode,
    sessionRestored,
    setSessionRestored,
    useFileThemes,
    consumePendingAlbumPackage,
  } = store;

  const [parsed, setParsed] = useState<Mp5File | undefined>();
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [decodePath, setDecodePath] = useState("");
  const [mp5hInfo, setMp5hInfo] = useState<import("./decodeMp5").Mp5hDecodeInfo | undefined>();
  const [dropErrors, setDropErrors] = useState<{ name: string; message: string }[]>([]);
  const [lastDropSummary, setLastDropSummary] = useState<IngestResult | null>(null);
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
  const [integrity, setIntegrity] = useState<IntegrityCheckResult | null>(null);
  const [ingestStage, setIngestStage] = useState<IngestLoadStage>("idle");
  const [ingestStageDetail, setIngestStageDetail] = useState("");
  useEffect(() => {
    const pending = consumePendingAlbumPackage();
    if (pending) {
      setActiveAlbum(pending);
      setAlbumManifestError("");
    }
  }, [consumePendingAlbumPackage]);

  const playWhenReadyRef = useRef(false);
  const playWhenReadyKaraokeRef = useRef(false);
  const autoAdvanceRef = useRef(false);
  const seekRef = useRef<(t: number) => void>(() => {});
  const [karaokeStemPrepFailed, setKaraokeStemPrepFailed] = useState(false);

  const useStemPlayback = stemMixActive && (stemTracks?.length ?? 0) > 0;

  const {
    loadPcm,
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
      const result = handleTrackEnded();
      if (result.type === "repeat_one") {
        seekRef.current(0);
        setPlaying(true);
        return;
      }
      if (result.type === "goto") {
        autoAdvanceRef.current = true;
        playWhenReadyRef.current = true;
        setCurrentIndex(result.index);
        return;
      }
      autoAdvanceRef.current = false;
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
      const result = handleTrackEnded();
      if (result.type === "repeat_one") {
        seekRef.current(0);
        setPlaying(true);
        return;
      }
      if (result.type === "goto") {
        autoAdvanceRef.current = true;
        playWhenReadyRef.current = true;
        setCurrentIndex(result.index);
      }
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
      const result = handleTrackEnded();
      if (result.type === "repeat_one") {
        seekRef.current(0);
        setPlaying(true);
      } else if (result.type === "goto") {
        autoAdvanceRef.current = true;
        playWhenReadyRef.current = true;
        setCurrentIndex(result.index);
      }
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
      const resume =
        isPlaying || playWhenReadyKaraokeRef.current || playWhenReadyRef.current;
      playWhenReadyKaraokeRef.current = false;
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
      const offsetSec = opts.offsetSec ?? currentTime;
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
          playWhenReadyKaraokeRef.current = true;
          playWhenReadyRef.current = true;
          setPlaying(true);
          tracePlayback("karaoke", "preparing — play deferred");
          return;
        case "set_playing_preparing_full_mix":
          playWhenReadyRef.current = true;
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
      currentTime,
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
        : currentTime;
    }
    return isMainSourceActive() || isPlaying
      ? getMainPlaybackTime()
      : currentTime;
  }, [
    useStemPlayback,
    getStemPlaybackTime,
    getMainPlaybackTime,
    hasStemActiveSources,
    isMainSourceActive,
    isPlaying,
    currentTime,
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
      currentTimeSec: currentTime,
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
    currentTime,
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
    if (!playWhenReadyKaraokeRef.current && !playWhenReadyRef.current) return;
    playWhenReadyKaraokeRef.current = false;
    tracePlayback("request_playback", "resume_after_prepare", {
      stemTracks: stemTracks.length,
    });
    void loadInitialTracksForMix(stemTracks, {
      offset: currentTime,
      resume: true,
      generation: stemGraphGenRef.current,
    }).then(() => refreshTransportDiagnostics());
  }, [
    useStemPlayback,
    stemTracks,
    isPlaying,
    hasStemActiveSources,
    currentTime,
    loadInitialTracksForMix,
    refreshTransportDiagnostics,
  ]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      tracePlayback("play_click", "pause");
      setPlaying(false);
      return;
    }
    tracePlayback("play_click", "play", {
      trackId: track?.id,
      karaokeMode,
      useStemPlayback,
      transportMode,
    });
    if (!track?.file && !track?.parsed) return;
    requestPlayback({ reason: "play_button", autoPlay: true });
  }, [
    isPlaying,
    track?.file,
    track?.parsed,
    track?.id,
    karaokeMode,
    useStemPlayback,
    transportMode,
    requestPlayback,
    setPlaying,
  ]);

  const handleWaveformSeek = useCallback(
    (ratio: number) => {
      recordLastWaveformSeek(`ratio=${ratio.toFixed(3)}`);
      tracePlayback("waveform_click", "seek", { ratio, duration });
      requestPlayback({
        reason: "waveform_seek",
        offsetSec: ratio * duration,
        autoPlay: true,
      });
    },
    [duration, requestPlayback],
  );

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
      const diag: PlaybackClockDiagnostics = {
        activeClockMode,
        rawClockTime: raw,
        displayedCurrentTime: currentTime,
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
    currentTime,
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
    async (playlistTrack: PlaylistTrack) => {
      const { id: trackId, file, rawBuffer, parsed: ingestParsed } = playlistTrack;
      if (!file) return;
      setLoadError("");
      setLoading(true);
      setIngestStage("decoding_audio");
      setIngestStageDetail(ingestStageLabel("decoding_audio"));
      if (!autoAdvanceRef.current) {
        setPlaying(false);
      }

      const cached = decodeCache.get(trackId);
      const scheduleIntegrity = (pr: Mp5File, samples: Int16Array) => {
        const run = async () => {
          setIngestStage("checking_integrity");
          setIngestStageDetail(ingestStageLabel("checking_integrity"));
          try {
            const result = await verifyMp5Integrity(pr, undefined, {
              pcmSamples: samples,
            });
            setIntegrity(result);
            updateIngestDiagnostics({ integrityStatus: result.status });
          } catch {
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

      try {
        if (cached) {
          setDecodePath(cached.decodePath);
          setMp5hInfo(cached.mp5h);
          await loadPcm({
            samples: cached.samples,
            rate: cached.sampleRate,
            ch: cached.channels,
          });
          setParsed(cached.parsed);
          setDuration(cached.duration);
          setCurrentTime(0);
          setIngestStage("ready");
          setIngestStageDetail("");
          scheduleIntegrity(cached.parsed, cached.samples);
        } else {
          const mixStart = performance.now();
          const buf = playlistTrack.lazyIngest ? undefined : rawBuffer ?? (await file.arrayBuffer());
          const { samples, sampleRate, channels, parsed: pr, decodePath: path, mp5h } =
            await decodeMp5ToPcm(buf, ingestParsed);
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
          await loadPcm({ samples, rate: sampleRate, ch: channels });
          setParsed(pr);
          setDuration(dur);
          setCurrentTime(0);
          setIngestStage("ready");
          setIngestStageDetail("");
          scheduleIntegrity(pr, samples);
        }

        const neighborIds = [
          tracks[currentIndex - 1]?.id,
          trackId,
          tracks[currentIndex + 1]?.id,
        ].filter((id): id is string => !!id);
        decodeCache.retain(neighborIds);

        if (playWhenReadyRef.current || autoAdvanceRef.current) {
          playWhenReadyRef.current = false;
          autoAdvanceRef.current = false;
          setPlaying(true);
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
        setDecodePath("");
        setMp5hInfo(undefined);
        setParsed(undefined);
        setIntegrity(null);
        const wasAutoAdvance = autoAdvanceRef.current;
        playWhenReadyRef.current = false;
        autoAdvanceRef.current = false;
        if (wasAutoAdvance) {
          const result = handleTrackEnded();
          if (result.type === "goto") {
            autoAdvanceRef.current = true;
            playWhenReadyRef.current = true;
            setCurrentIndex(result.index);
          } else {
            setPlaying(false);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [
      loadPcm,
      setCurrentTime,
      setDuration,
      setPlaying,
      tracks,
      currentIndex,
      handleTrackEnded,
      setCurrentIndex,
    ],
  );

  useEffect(() => {
    setKaraokeMode(false);
    setKaraokePrepareRequest(null);
    setKaraokeStemPrepFailed(false);
    setActivePlaybackRange(null);
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

  useEffect(() => {
    if (!isPlaying || !activePlaybackRange) return;
    const tick = applyPlaybackRangeTick(currentTime, activePlaybackRange);
    if (tick.action === "stop") {
      setPlaying(false);
      setActivePlaybackRange(null);
      return;
    }
    if (tick.action === "loop") {
      seek(tick.seekSec);
    }
  }, [currentTime, isPlaying, activePlaybackRange, seek, setPlaying]);

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
      if (autoAdvanceRef.current) {
        const result = handleTrackEnded();
        if (result.type === "goto") {
          playWhenReadyRef.current = true;
          setCurrentIndex(result.index);
        } else {
          autoAdvanceRef.current = false;
          setPlaying(false);
        }
      } else {
        setPlaying(false);
      }
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
    if (track.file) void loadFile(track);
  }, [track?.id, track?.file, track?.parseError, track?.rawBuffer, track?.parsed, loadFile, setCurrentTime, setDuration, setPlaying, handleTrackEnded, setCurrentIndex]);

  const handleFiles = async (files: FileList) => {
    setSessionRestored(false);
    dismissOnboarding();
    setAlbumManifestError("");
    const fileList = Array.from(files);
    setIngestStage("loading_mp5");
    setIngestStageDetail(ingestStageLabel("loading_mp5"));
    const ingest = await ingestAlbumPackageFiles(fileList, tracks, (name, progress) => {
      const isIndex = "chunksScanned" in progress;
      const stage = isIndex
        ? mapIndexProgressToIngestStage(progress)
        : mapParseProgressToIngestStage(progress);
      const detail = isIndex
        ? indexStageDetail(progress)
        : parseStageDetail(progress);
      setIngestStage(stage);
      setIngestStageDetail(
        ingestStageLabel(stage, detail ?? `Loading ${name}…`),
      );
    });
    setIngestStage("ready");
    setIngestStageDetail("");
    setLastDropSummary(ingest.mp5);
    if (ingest.manifestError) {
      setAlbumManifestError(ingest.manifestError);
      setActiveAlbum(null);
    } else if (ingest.album) {
      setActiveAlbum(ingest.album);
    }
    if (ingest.mp5.dropErrors.length) {
      setDropErrors((prev) => [...prev, ...ingest.mp5.dropErrors].slice(-8));
    }
    if (ingest.mp5.tracks.length) {
      const prevTracks = tracks;
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

  const handleAddAlbumSidecars = async (files: FileList) => {
    if (!activeAlbum) return;
    const mp5Result = await ingestMp5Files(Array.from(files));
    if (mp5Result.tracks.length) {
      appendTracks(mp5Result.tracks);
      const combined = [...tracks, ...mp5Result.tracks];
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
        const sizeMb = (activeAlbum.packageFileSize ?? 0) / (1024 * 1024);
        if (sizeMb > 64 && !window.confirm(
          `This embedded album package is about ${sizeMb.toFixed(0)} MiB. Saving will use browser storage. Continue?`,
        )) {
          setAlbumSaveNote("Save cancelled.");
          return;
        }
        await saveEmbeddedAlbumPackage(activeAlbum.embeddedSource.file, activeAlbum.manifest);
        setAlbumSaveNote(
          "Embedded album package saved to this browser (Library → Saved albums). Clearing site data removes it.",
        );
      } else {
        saveAlbumPackage(activeAlbum.manifest, name);
        setAlbumSaveNote("Album manifest saved to this browser (Library → Saved albums).");
      }
    } catch (e) {
      setAlbumSaveNote(e instanceof Error ? e.message : String(e));
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

  const handlePlayAlbum = async () => {
    if (!activeAlbum) return;
    let album = activeAlbum;
    if (album.packageKind === "embedded") {
      album = (await loadEmbeddedAlbumForPlayback()) ?? album;
    }
    const ordered = resolvedTracksInOrder(album);
    if (!ordered.length) return;
    const first = ordered[0]!;
    const toAdd = ordered.filter((t) => !tracks.some((x) => x.id === t.id));
    const startLen = tracks.length;
    if (toAdd.length) appendTracks(toAdd);
    const existingIdx = tracks.findIndex((t) => t.id === first.id);
    const idx = existingIdx >= 0 ? existingIdx : startLen;
    playWhenReadyRef.current = true;
    setCurrentIndex(idx);
  };

  const handleAddAlbumToQueue = async () => {
    if (!activeAlbum) return;
    let album = activeAlbum;
    if (album.packageKind === "embedded") {
      album = (await loadEmbeddedAlbumForPlayback()) ?? album;
    }
    const ordered = resolvedTracksInOrder(album);
    const newIds = new Set(tracks.map((t) => t.id));
    const toAdd = ordered.filter((t) => !newIds.has(t.id));
    if (toAdd.length) appendTracks(toAdd);
  };

  const handleAlbumTrackSelect = async (rowIndex: number) => {
    const row = activeAlbum?.tracks[rowIndex];
    if (!row) return;
    let playlistTrack = row.playlistTrack;
    if (!playlistTrack && activeAlbum?.packageKind === "embedded" && activeAlbum.embeddedSource) {
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
    }
    if (!playlistTrack) return;
    const idx = tracks.findIndex((t) => t.id === playlistTrack!.id);
    if (idx >= 0) {
      playWhenReadyRef.current = true;
      setCurrentIndex(idx);
      return;
    }
    appendTracks([playlistTrack]);
    setCurrentIndex(tracks.length);
    playWhenReadyRef.current = true;
  };

  const handleExtractEmbeddedTrack = async (rowIndex: number) => {
    const row = activeAlbum?.tracks[rowIndex];
    if (!activeAlbum?.embeddedSource || !row) return;
    const dir = activeAlbum.embeddedSource.index.tracks.find((t) => t.trackId === row.ref.trackId);
    const filename = dir?.logicalFile ?? row.ref.file;
    const fileTrack = await loadEmbeddedTrackAsPlaylistTrack(
      activeAlbum.embeddedSource.file,
      activeAlbum.embeddedSource.index,
      row.ref.trackId,
      filename,
    );
    if (!fileTrack?.file) return;
    downloadBlob(fileTrack.file, filename);
  };

  const handlePlayIndex = (index: number) => {
    playWhenReadyRef.current = true;
    autoAdvanceRef.current = false;
    setCurrentIndex(index);
  };

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
      setLibrarySaveNote(
        result.duplicate
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

  const progress = duration > 0 ? currentTime / duration : 0;
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
  const canPrev = selectCanGoPrev(store);
  const canNext = selectCanGoNext(store);

  const { theme: playerTheme, status: themeStatus } = useMemo(
    () => resolveThemeForFile(parsed, useFileThemes),
    [useFileThemes, parsed],
  );

  return (
    <div className="space-y-6" data-testid="mp5-player">
      {tracks.length === 0 && <PlayerEmptyState />}

      <DemoFixtureActions
        testIdPrefix="player"
        onLoaded={async (file, playFirst) => {
          dismissOnboarding();
          const start = tracks.length;
          const result = await ingestMp5Files([file]);
          if (result.tracks.length) appendTracks(result.tracks);
          setLastDropSummary(result);
          if (playFirst && result.addedCount > 0) {
            playWhenReadyRef.current = true;
            setCurrentIndex(start);
          }
        }}
      />

      <FileDropZone
        testId="player-file-input"
        label="Drop .mp5 or .mp5p album manifest files to build a playlist"
        onFiles={(files) => void handleFiles(files)}
      />

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
          onPlayAlbum={handlePlayAlbum}
          onAddToQueue={handleAddAlbumToQueue}
          onDismiss={() => {
            setActiveAlbum(null);
            setAlbumSaveNote("");
          }}
          onSelectTrack={(i) => void handleAlbumTrackSelect(i)}
          onAddSidecarFiles={(f) => void handleAddAlbumSidecars(f)}
          onSaveAlbum={() => void handleSaveAlbumToLibrary()}
          onExtractTrack={(i) => void handleExtractEmbeddedTrack(i)}
          saveBusy={albumSaveBusy}
        />
      )}

      {albumSaveNote && (
        <p className="text-xs text-gray-400 bg-surface-elevated rounded-lg px-3 py-2" data-testid="album-save-note">
          {albumSaveNote}
        </p>
      )}

      {lastDropSummary && <DropImportSummary summary={lastDropSummary} />}

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

      <div className="grid lg:grid-cols-[minmax(280px,360px)_1fr] gap-6">
        <div className="space-y-4 order-2 lg:order-1">
        <LibraryPanel
          tracks={tracks}
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          dropErrors={dropErrors}
          repeatMode={repeatMode}
          shuffle={shuffle}
          onSelect={(index) => {
            autoAdvanceRef.current = false;
            setCurrentIndex(index);
          }}
          onPlay={handlePlayIndex}
          onRemove={removeTrack}
          onClear={handleClear}
          onToggleShuffle={toggleShuffle}
          onCycleRepeat={cycleRepeatMode}
          onSaveToLibrary={(t) => void handleSaveToLibrary(t)}
          librarySaveBusy={librarySaveBusy}
        />
        <CreateAlbumPackagePanel tracks={tracks} />
        </div>

      <div className="space-y-4 order-1 lg:order-2">
        <div
          className={`rounded-2xl p-3 sm:p-4 border overflow-hidden ${
            playerTheme ? "mp5-player-themed" : "border-transparent"
          }`}
          style={themeRootStyle(playerTheme)}
          data-testid="player-theme-root"
          data-theme-active={playerTheme ? "true" : "false"}
        >
          <NowPlayingView
            track={track}
            parsed={parsed}
            loading={loading}
            loadError={loadError}
            decodePath={decodePath}
            mp5h={mp5hInfo}
            playerTheme={playerTheme}
          />
        </div>
        <WaveformView
            peaks={parsed?.waveform ?? []}
            progress={progress}
            durationSec={duration}
            sectionMarkers={waveformSectionMarkers}
            highlightMarkers={waveformHighlightMarkers}
            activeLoopRange={waveformLoopRange}
            playedFill={playerTheme?.waveformPlayedFill}
            unplayedFill={playerTheme?.waveformUnplayedFill}
            onSeek={handleWaveformSeek}
          />
          <PlayerControls
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            playbackStatus={playbackSnapshot.playState}
            playbackStatusDetail={
              playbackSnapshot.playState === "preparing"
                ? karaokePreparing
                  ? "Preparing karaoke…"
                  : ingestStageDetail || "Preparing audio…"
                : karaokeFallback
                  ? "Karaoke audio unavailable — playing full mix with synced lyrics"
                  : loadError || undefined
            }
            onPrev={playPrevious}
            onNext={playNext}
            canPrev={canPrev}
            canNext={canNext}
            repeatMode={repeatMode}
            shuffle={shuffle}
            onToggleShuffle={toggleShuffle}
            onCycleRepeat={cycleRepeatMode}
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
            volume={volume}
            onVolume={setVolume}
          />
        </div>
      </div>

      <CodecModesHelper />
      <SongMapPanel
        parsed={parsed}
        currentTime={currentTime}
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
      <LyricsPanel
        parsed={parsed}
        currentTime={currentTime}
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
      <StemsPanel
        parsed={parsed}
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
        onKaraokePrepareFailed={() => setKaraokeStemPrepFailed(true)}
      />
      <MetadataDetailsPanel
        parsed={parsed}
        integrity={integrity}
        useFileThemes={useFileThemes}
        themeStatus={themeStatus}
        playerTheme={playerTheme}
      />
    </div>
  );
}
