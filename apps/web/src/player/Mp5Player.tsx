import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { NowPlayingView } from "./NowPlayingView";
import { LibraryPanel } from "./LibraryPanel";
import { ingestMp5Files, type IngestResult } from "./playlistUtils";
import { ingestAlbumPackageFiles } from "../lib/album/ingestAlbumPackage";
import {
  enrichResolvedAlbum,
  resolveAlbumTracks,
  resolvedTracksInOrder,
  type ResolvedAlbumPackage,
} from "../lib/album/resolveAlbum";
import { auditAlbmPackageManifest } from "@mp5/container";
import { saveAlbumPackage } from "../lib/localLibrary/albumLibrary";
import { AlbumPackagePanel } from "../components/AlbumPackagePanel";
import { CreateAlbumPackagePanel } from "../components/CreateAlbumPackagePanel";
import { listLibraryRecords } from "../lib/localLibrary/api";
import { savePlaylistTrackToLibrary } from "../lib/localLibrary/libraryActions";
import { findLibraryDuplicate } from "../lib/fingerprint/duplicates";
import { decodeFing, fingIdentityKey } from "@mp5/container";
import { verifyMp5Integrity } from "../lib/fingerprint/verify";
import type { IntegrityCheckResult } from "@mp5/container";
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
import { parseVisuFromFile } from "../lib/visualTheme/parseVisuFromFile";
import { resolvePlayerTheme, themeRootStyle } from "../lib/visualTheme/applyVisualTheme";

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
  const [karaokeMode, setKaraokeMode] = useState(false);
  const [karaokeStemPreset, setKaraokeStemPreset] = useState<Map<
    string,
    { muted: boolean; solo: boolean }
  > | null>(null);
  const [activePlaybackRange, setActivePlaybackRange] =
    useState<ActivePlaybackRange | null>(null);
  const [activeAlbum, setActiveAlbum] = useState<ResolvedAlbumPackage | null>(null);
  const [albumManifestError, setAlbumManifestError] = useState("");
  const [albumSaveBusy, setAlbumSaveBusy] = useState(false);
  const [albumSaveNote, setAlbumSaveNote] = useState("");
  const [integrity, setIntegrity] = useState<IntegrityCheckResult | null>(null);
  useEffect(() => {
    const pending = consumePendingAlbumPackage();
    if (pending) {
      setActiveAlbum(pending);
      setAlbumManifestError("");
    }
  }, [consumePendingAlbumPackage]);

  const playWhenReadyRef = useRef(false);
  const autoAdvanceRef = useRef(false);
  const seekRef = useRef<(t: number) => void>(() => {});

  const useStemPlayback = stemMixActive && (stemTracks?.length ?? 0) > 0;

  const { loadPcm, seek: seekMain } = useMp5AudioEngine({
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

  const { loadTracks, seek: seekStems } = useStemMixerEngine({
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
  });

  useEffect(() => {
    if (useStemPlayback && stemTracks?.length) {
      void loadTracks(stemTracks);
    }
  }, [useStemPlayback, stemTracks, loadTracks]);

  useEffect(() => {
    if (!parsed?.optional.has("STEM")) {
      setStemMixActive(false);
      setStemTracks(null);
    }
  }, [parsed]);

  const seek = useStemPlayback ? seekStems : seekMain;
  seekRef.current = seek;

  const track = tracks[currentIndex];
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
    async (trackId: string, file: File) => {
      setLoadError("");
      setLoading(true);
      if (!autoAdvanceRef.current) {
        setPlaying(false);
      }

      const cached = decodeCache.get(trackId);
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
          try {
            const buf = await file.arrayBuffer();
            setIntegrity(
              await verifyMp5Integrity(cached.parsed, new Uint8Array(buf), {
                pcmSamples: cached.samples,
              }),
            );
          } catch {
            setIntegrity(null);
          }
        } else {
          const buf = await file.arrayBuffer();
          const { samples, sampleRate, channels, parsed: pr, decodePath: path, mp5h } =
            await decodeMp5ToPcm(buf);
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
          try {
            setIntegrity(
              await verifyMp5Integrity(pr, new Uint8Array(buf), { pcmSamples: samples }),
            );
          } catch {
            setIntegrity(null);
          }
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
    setKaraokeStemPreset(null);
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
      setKaraokeStemPreset(null);
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
    }
    if (track.file) void loadFile(track.id, track.file);
  }, [track?.id, track?.file, track?.parseError, loadFile, setCurrentTime, setDuration, setPlaying, handleTrackEnded, setCurrentIndex]);

  const handleFiles = async (files: FileList) => {
    setSessionRestored(false);
    dismissOnboarding();
    setAlbumManifestError("");
    const fileList = Array.from(files);
    const ingest = await ingestAlbumPackageFiles(fileList, tracks);
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
      if (ingest.album) {
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

  const handleSaveAlbumToLibrary = () => {
    if (!activeAlbum) return;
    setAlbumSaveBusy(true);
    setAlbumSaveNote("");
    try {
      const name = activeAlbum.manifestName ?? `${activeAlbum.manifest.album.title}.mp5p`;
      saveAlbumPackage(activeAlbum.manifest, name);
      setAlbumSaveNote("Album manifest saved to this browser (Library → Saved albums).");
    } catch (e) {
      setAlbumSaveNote(e instanceof Error ? e.message : String(e));
    } finally {
      setAlbumSaveBusy(false);
    }
  };

  const handlePlayAlbum = () => {
    if (!activeAlbum) return;
    const ordered = resolvedTracksInOrder(activeAlbum);
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

  const handleAddAlbumToQueue = () => {
    if (!activeAlbum) return;
    const ordered = resolvedTracksInOrder(activeAlbum);
    const newIds = new Set(tracks.map((t) => t.id));
    const toAdd = ordered.filter((t) => !newIds.has(t.id));
    if (toAdd.length) appendTracks(toAdd);
  };

  const handleAlbumTrackSelect = (rowIndex: number) => {
    const row = activeAlbum?.tracks[rowIndex];
    if (!row?.playlistTrack) return;
    const idx = tracks.findIndex((t) => t.id === row.playlistTrack!.id);
    if (idx >= 0) {
      playWhenReadyRef.current = true;
      setCurrentIndex(idx);
      return;
    }
    appendTracks([row.playlistTrack]);
    setCurrentIndex(tracks.length);
    playWhenReadyRef.current = true;
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

  const playerTheme = useMemo(() => {
    if (!useFileThemes || !parsed) return null;
    return resolvePlayerTheme(parseVisuFromFile(parsed));
  }, [useFileThemes, parsed]);

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
          onSelectTrack={handleAlbumTrackSelect}
          onAddSidecarFiles={(f) => void handleAddAlbumSidecars(f)}
          onSaveAlbum={handleSaveAlbumToLibrary}
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
        <div className="space-y-4">
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

        <div
          className="space-y-4 rounded-2xl p-4 -m-4 border border-transparent"
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
          <WaveformView
            peaks={parsed?.waveform ?? []}
            progress={progress}
            durationSec={duration}
            sectionMarkers={waveformSectionMarkers}
            highlightMarkers={waveformHighlightMarkers}
            activeLoopRange={waveformLoopRange}
            onSeek={(r) => seek(r * duration)}
          />
          <PlayerControls
            isPlaying={isPlaying}
            onPlayPause={() => setPlaying(!isPlaying)}
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
        duration={duration}
        isPlaying={isPlaying}
        onSeek={seek}
        karaokeMode={karaokeMode}
        onKaraokeModeChange={setKaraokeMode}
        onKaraokePreset={setKaraokeStemPreset}
      />
      <StemsPanel
        parsed={parsed}
        stemMixActive={stemMixActive}
        onStemMixActiveChange={setStemMixActive}
        onStemTracksReady={setStemTracks}
        isPlaying={isPlaying}
        loading={loading}
        karaokeMode={karaokeMode}
        karaokeStemPreset={karaokeStemPreset}
      />
      <MetadataDetailsPanel parsed={parsed} integrity={integrity} />
    </div>
  );
}
