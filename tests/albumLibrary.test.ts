import { describe, it, expect, beforeEach, vi } from "vitest";
import { ALBUM_MANIFEST_FORMAT } from "@mp5/container";
import {
  deleteSavedAlbum,
  listSavedAlbums,
  saveAlbumPackage,
} from "../apps/web/src/lib/localLibrary/albumLibrary";

const MANIFEST = {
  format: ALBUM_MANIFEST_FORMAT,
  version: 1,
  album: { title: "Saved LP", artist: "Band" },
  tracks: [{ trackId: "t1", file: "one.mp5", trackNumber: 1 }],
};

const mem = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v);
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
  clear: () => mem.clear(),
});

describe("saved album library (localStorage)", () => {
  beforeEach(() => {
    mem.clear();
  });

  it("saves and lists album packages", () => {
    const entry = saveAlbumPackage(MANIFEST, "Band - Saved LP.mp5p");
    expect(entry.id).toBeTruthy();
    const list = listSavedAlbums();
    expect(list).toHaveLength(1);
    expect(list[0]?.manifest.album.title).toBe("Saved LP");
  });

  it("deletes saved album", () => {
    const entry = saveAlbumPackage(MANIFEST, "test.mp5p");
    deleteSavedAlbum(entry.id);
    expect(listSavedAlbums()).toHaveLength(0);
  });
});
