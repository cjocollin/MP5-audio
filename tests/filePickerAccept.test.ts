import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONVERTER_SOURCE_ACCEPT,
  MP5_AND_AUDIO_ACCEPT,
  MP5_FILE_ACCEPT,
  pickMp5Files,
} from "../apps/web/src/lib/pickMp5Files";

interface CapturedPickerOptions {
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("native file picker filters", () => {
  it("offers source audio only on the converter", async () => {
    let captured: CapturedPickerOptions | undefined;
    vi.stubGlobal("window", {
      showOpenFilePicker: async (options: CapturedPickerOptions) => {
        captured = options;
        return [];
      },
    });

    await pickMp5Files({ accept: CONVERTER_SOURCE_ACCEPT });

    expect(captured?.types?.map((type) => type.description)).toEqual(["Audio files"]);
    expect(JSON.stringify(captured?.types)).not.toContain(".mp5");
  });

  it("keeps the player picker limited to MP5 files", async () => {
    let captured: CapturedPickerOptions | undefined;
    vi.stubGlobal("window", {
      showOpenFilePicker: async (options: CapturedPickerOptions) => {
        captured = options;
        return [];
      },
    });

    await pickMp5Files({ accept: MP5_FILE_ACCEPT });

    expect(captured?.types?.map((type) => type.description)).toEqual(["MP5 / MP5P files"]);
    expect(JSON.stringify(captured?.types)).not.toContain(".wav");
  });

  it("preserves the mixed drop-zone picker when explicitly requested", async () => {
    let captured: CapturedPickerOptions | undefined;
    vi.stubGlobal("window", {
      showOpenFilePicker: async (options: CapturedPickerOptions) => {
        captured = options;
        return [];
      },
    });

    await pickMp5Files({ accept: MP5_AND_AUDIO_ACCEPT });

    expect(captured?.types?.map((type) => type.description)).toEqual([
      "MP5 / MP5P files",
      "Audio files",
    ]);
  });

  it("keeps converter retries audio-only", async () => {
    const attempts: CapturedPickerOptions[] = [];
    vi.stubGlobal("window", {
      showOpenFilePicker: async (options: CapturedPickerOptions) => {
        attempts.push(options);
        if (attempts.length === 1) throw new TypeError("unsupported MIME map");
        return [];
      },
    });

    await pickMp5Files({ accept: CONVERTER_SOURCE_ACCEPT });

    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.types?.[0]?.description).toBe("Audio files");
    expect(JSON.stringify(attempts[1]?.types)).not.toContain(".mp5");
  });
});
