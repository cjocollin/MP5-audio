import { describe, it, expect, beforeEach } from "vitest";
import {
  CodecId,
  encodeExpl,
  encodeMood,
  encodeVibe,
  metaFieldsFromRecord,
  writeMp5,
} from "@mp5/container";
import {
  formatDuration,
  ingestMp5Files,
  matchesSearch,
  trackDisplayInfo,
} from "../apps/web/src/player/playlistUtils";
import { usePlayerStore } from "../apps/web/src/store/playerStore";

function minimalMp5(extra?: Parameters<typeof writeMp5>[0]) {
  return writeMp5({
    head: {
      codecId: CodecId.PCM,
      channels: 1,
      bitsPerSample: 16,
      presetId: 0,
      sampleRate: 48000,
      totalSamples: 48000n,
      encoderVersion: 1,
    },
    audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(96000) }],
    ...extra,
  });
}

function fileFromBuffer(name: string, buf: Uint8Array): File {
  return new File([buf], name, { type: "application/octet-stream" });
}

describe("player playlist utilities", () => {
  it("ingests multiple valid MP5 files", async () => {
    const a = fileFromBuffer(
      "alpha.mp5",
      minimalMp5({
        meta: metaFieldsFromRecord({ title: "Alpha", artist: "Artist A", album: "Album X" }),
      }),
    );
    const b = fileFromBuffer(
      "beta.mp5",
      minimalMp5({
        meta: metaFieldsFromRecord({ title: "Beta", artist: "Artist B", genre: "Electronic" }),
      }),
    );
    const { tracks, dropErrors } = await ingestMp5Files([a, b]);
    expect(tracks).toHaveLength(2);
    expect(dropErrors).toHaveLength(0);
    expect(trackDisplayInfo(tracks[0]!).title).toBe("Alpha");
    expect(trackDisplayInfo(tracks[1]!).artist).toBe("Artist B");
  });

  it("skips non-mp5 files with calm errors", async () => {
    const bad = new File([new Uint8Array([1, 2, 3])], "notes.txt", { type: "text/plain" });
    const good = fileFromBuffer("ok.mp5", minimalMp5());
    const { tracks, dropErrors } = await ingestMp5Files([bad, good]);
    expect(tracks).toHaveLength(1);
    expect(dropErrors).toHaveLength(1);
    expect(dropErrors[0]?.message).toContain("Not an .mp5");
  });

  it("keeps unreadable mp5 in queue with parse error", async () => {
    const corrupt = new File([new Uint8Array([0, 1, 2])], "bad.mp5", { type: "application/octet-stream" });
    const { tracks, dropErrors } = await ingestMp5Files([corrupt]);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.parseError).toBeTruthy();
    expect(dropErrors[0]?.message).toContain("could not be read as MP5");
    expect(dropErrors[0]?.reason).toBe("unreadable");
  });

  it("shows playlist metadata including content notice and duration", async () => {
    const optional = new Map([
      ["EXPL", encodeExpl({ explicit: true, warningSource: "user" })],
      ["MOOD", encodeMood({ tags: ["calm"], source: "user" })],
      ["VIBE", encodeVibe({ tags: ["focus"], source: "user" })],
    ]);
    const file = fileFromBuffer(
      "tagged.mp5",
      minimalMp5({
        meta: metaFieldsFromRecord({ title: "Tagged", artist: "Meta Artist", album: "Meta Album", genre: "Ambient" }),
        optional,
      }),
    );
    const { tracks } = await ingestMp5Files([file]);
    const info = trackDisplayInfo(tracks[0]!);
    expect(info.hasContentNotice).toBe(true);
    expect(info.moodTags).toContain("calm");
    expect(info.vibeTags).toContain("focus");
    expect(info.durationSec).toBeCloseTo(1, 1);
    expect(formatDuration(info.durationSec)).toBe("0:01");
  });

  it("filters by title artist album genre mood and vibe", async () => {
    const parsed = await ingestMp5Files([
      fileFromBuffer("file.mp5", writeMp5({
        head: {
          codecId: CodecId.PCM,
          channels: 1,
          bitsPerSample: 16,
          presetId: 0,
          sampleRate: 48000,
          totalSamples: 4n,
          encoderVersion: 1,
        },
        meta: metaFieldsFromRecord({
          title: "Sunrise",
          artist: "Dawn",
          album: "Morning",
          genre: "Chill",
        }),
        optional: new Map([
          ["MOOD", encodeMood({ tags: ["hopeful"] })],
          ["VIBE", encodeVibe({ tags: ["study"] })],
        ]),
        audioFrames: [{ frameIndex: 0, blockType: 0, flags: 0, data: new Uint8Array(8) }],
      })),
    ]);
    const t = parsed.tracks[0]!;
    expect(matchesSearch(t, "sunrise")).toBe(true);
    expect(matchesSearch(t, "hopeful")).toBe(true);
    expect(matchesSearch(t, "study")).toBe(true);
    expect(matchesSearch(t, "metal")).toBe(false);
  });

  it("trackDisplayInfo uses embedded album manifest when track file is not loaded", () => {
    const track = {
      id: "t1",
      name: "01-track.mp5",
      embeddedAlbum: {
        trackId: "t1",
        filename: "01-track.mp5",
        display: { title: "GARBAGE", artist: "Melanie Martinez", album: "HADES" },
        packageMeta: {
          albumTitle: "HADES",
          albumArtist: "Melanie Martinez",
          year: "2026",
          genre: "Alternative",
        },
      },
    };
    const info = trackDisplayInfo(track);
    expect(info.title).toBe("GARBAGE");
    expect(info.artist).toBe("Melanie Martinez");
    expect(info.album).toBe("HADES");
    expect(info.genre).toBe("Alternative");
  });
});

describe("player store queue", () => {
  const mk = (id: string, name: string) => ({
    id,
    name,
    file: new File([], name),
  });

  beforeEach(() => {
    usePlayerStore.setState({
      tracks: [],
      currentIndex: 0,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      repeatMode: "off",
      shuffle: false,
      shuffleOrder: [],
    });
  });

  it("append, next/previous, remove, and clear", () => {
    usePlayerStore.getState().appendTracks([mk("a", "a.mp5"), mk("b", "b.mp5"), mk("c", "c.mp5")]);
    expect(usePlayerStore.getState().tracks).toHaveLength(3);

    usePlayerStore.getState().playNext();
    expect(usePlayerStore.getState().currentIndex).toBe(1);

    usePlayerStore.getState().playPrevious();
    expect(usePlayerStore.getState().currentIndex).toBe(0);

    usePlayerStore.getState().removeTrack("b");
    expect(usePlayerStore.getState().tracks.map((t) => t.id)).toEqual(["a", "c"]);

    usePlayerStore.getState().clearTracks();
    expect(usePlayerStore.getState().tracks).toHaveLength(0);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
    expect(usePlayerStore.getState().duration).toBe(0);
  });

  it("handleTrackEnded advances with repeat all", () => {
    usePlayerStore.getState().appendTracks([mk("a", "a.mp5"), mk("b", "b.mp5")]);
    usePlayerStore.setState({ currentIndex: 1, repeatMode: "all" });
    const result = usePlayerStore.getState().handleTrackEnded();
    expect(result.type).toBe("goto");
    if (result.type === "goto") {
      expect(result.index).toBe(0);
      expect(result.autoPlay).toBe(true);
    }
  });

  it("toggle shuffle builds shuffle order", () => {
    usePlayerStore.getState().appendTracks([mk("a", "a.mp5"), mk("b", "b.mp5"), mk("c", "c.mp5")]);
    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().shuffle).toBe(true);
    expect(usePlayerStore.getState().shuffleOrder.length).toBe(3);
  });
});

