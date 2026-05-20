import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerStore, selectCanGoNext, selectCanGoPrev } from "../store/playerStore";
import { decodeMp5ToPcm } from "./decodeMp5";
import { decodeCache } from "./decodeCache";
import { FileDropZone } from "./FileDropZone";
import { WaveformView } from "./WaveformView";
import { PlayerControls } from "./PlayerControls";
import { MetadataDetailsPanel } from "./MetadataDetailsPanel";
import { StemListStub } from "./StemListStub";
import { useMp5AudioEngine } from "./useMp5AudioEngine";
import { NowPlayingView } from "./NowPlayingView";
import { LibraryPanel } from "./LibraryPanel";
import { ingestMp5Files, type IngestResult } from "./playlistUtils";
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
  } = store;

  const [parsed, setParsed] = useState<Mp5File | undefined>();
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [decodePath, setDecodePath] = useState("");
  const [mp5hInfo, setMp5hInfo] = useState<import("./decodeMp5").Mp5hDecodeInfo | undefined>();
  const [dropErrors, setDropErrors] = useState<{ name: string; message: string }[]>([]);
  const [lastDropSummary, setLastDropSummary] = useState<IngestResult | null>(null);
  const playWhenReadyRef = useRef(false);
  const autoAdvanceRef = useRef(false);
  const seekRef = useRef<(t: number) => void>(() => {});

  const { loadPcm, seek } = useMp5AudioEngine({
    volume,
    isPlaying,
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
  seekRef.current = seek;

  const track = tracks[currentIndex];

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
    if (!track) {
      setParsed(undefined);
      setLoadError("");
      setDecodePath("");
      setMp5hInfo(undefined);
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
    const result = await ingestMp5Files(Array.from(files));
    setLastDropSummary(result);
    if (result.dropErrors.length) {
      setDropErrors((prev) => [...prev, ...result.dropErrors].slice(-8));
    }
    if (result.tracks.length) {
      appendTracks(result.tracks);
    }
  };

  const handlePlayIndex = (index: number) => {
    playWhenReadyRef.current = true;
    autoAdvanceRef.current = false;
    setCurrentIndex(index);
  };

  const handleClear = () => {
    setDropErrors([]);
    setLastDropSummary(null);
    clearTracks();
    decodeCache.clear();
    clearPlayerSession();
    setParsed(undefined);
    setLoadError("");
    setSessionRestored(false);
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const canPrev = selectCanGoPrev(store);
  const canNext = selectCanGoNext(store);

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
        label="Drop .mp5 files to build a playlist"
        onFiles={(files) => void handleFiles(files)}
      />

      {lastDropSummary && <DropImportSummary summary={lastDropSummary} />}

      {sessionRestored && tracks.length === 0 && (
        <p className="text-xs text-gray-500 bg-surface-elevated rounded-lg px-3 py-2" data-testid="session-restore-note">
          {PLAYLIST_PERSISTENCE_NOTE}
        </p>
      )}

      <div className="grid lg:grid-cols-[minmax(280px,360px)_1fr] gap-6">
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
        />

        <div className="space-y-4">
          <NowPlayingView
            track={track}
            parsed={parsed}
            loading={loading}
            loadError={loadError}
            decodePath={decodePath}
            mp5h={mp5hInfo}
          />
          <WaveformView
            peaks={parsed?.waveform ?? []}
            progress={progress}
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
      <MetadataDetailsPanel parsed={parsed} />
      <StemListStub
        stems={parsed?.optional.has("STEM") ? ["Stems present — parse in v0.2"] : undefined}
      />
    </div>
  );
}
