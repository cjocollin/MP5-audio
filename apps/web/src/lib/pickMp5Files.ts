/**
 * Named MP5 file picker via showOpenFilePicker (Chrome / Edge).
 * Must be called directly from a user gesture — do not wrap in setTimeout.
 */

export const MP5_FILE_ACCEPT = ".mp5,.mp5p,audio/mp5";
export const MP5_AND_AUDIO_ACCEPT =
  ".mp5,.mp5p,audio/mp5,audio/*,.wav,.flac,.mp3,.m4a,.aac,.ogg,.opus";

type OpenFilePickerOptions = {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

type FileSystemFileHandleLike = {
  getFile: () => Promise<File>;
};

function supportsOpenFilePicker(): boolean {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
}

export function filesToFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  for (const file of files) dt.items.add(file);
  return dt.files;
}

function pickerTypesForAccept(accept: string): NonNullable<OpenFilePickerOptions["types"]> {
  const wantsAudio =
    accept.includes("audio/*") ||
    /\.(wav|flac|mp3|m4a|aac|ogg|opus)\b/i.test(accept);

  // Use application/octet-stream — Chromium accepts custom extensions this way
  // and shows `description` in the type dropdown (unlike legacy <input accept>).
  const types: NonNullable<OpenFilePickerOptions["types"]> = [
    {
      description: "MP5 / MP5P files",
      accept: {
        "application/octet-stream": [".mp5", ".mp5p"],
      },
    },
  ];

  if (wantsAudio) {
    types.push({
      description: "Audio files",
      accept: {
        "audio/wav": [".wav"],
        "audio/x-wav": [".wav"],
        "audio/flac": [".flac"],
        "audio/x-flac": [".flac"],
        "audio/mpeg": [".mp3"],
        "audio/mp4": [".m4a"],
        "audio/aac": [".aac", ".m4a"],
        "audio/ogg": [".ogg", ".opus"],
        "audio/opus": [".opus"],
      },
    });
  }

  return types;
}

/**
 * @returns File[] when the modern picker ran (empty if cancelled),
 *          null when the caller should fall back to input.click().
 */
export async function pickMp5Files(options?: {
  multiple?: boolean;
  accept?: string;
}): Promise<File[] | null> {
  const multiple = options?.multiple ?? true;
  const accept = options?.accept ?? MP5_FILE_ACCEPT;

  if (!supportsOpenFilePicker()) return null;

  const attempts: OpenFilePickerOptions[] = [
    {
      multiple,
      excludeAcceptAllOption: false,
      types: pickerTypesForAccept(accept),
    },
    // Minimal retry if the browser rejects multi-type / MIME maps.
    {
      multiple,
      excludeAcceptAllOption: false,
      types: [
        {
          description: "MP5 / MP5P files",
          accept: { "application/octet-stream": [".mp5", ".mp5p"] },
        },
      ],
    },
  ];

  let lastErr: unknown;
  for (const opts of attempts) {
    try {
      const handles = (await window.showOpenFilePicker!(opts)) as FileSystemFileHandleLike[];
      return await Promise.all(handles.map((h) => h.getFile()));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return [];
      }
      // NotAllowedError = lost user gesture / permission — don't retry other types.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        return null;
      }
      lastErr = err;
    }
  }

  console.warn("[mp5] showOpenFilePicker failed; falling back to <input type=file>", lastErr);
  return null;
}

/**
 * Open picker from a click handler and deliver files via onFiles.
 * Prefer this over openMp5FileInput when you have an onFiles callback
 * (avoids programmatic input.files assignment).
 */
export async function pickMp5FilesForHandler(
  onFiles: (files: FileList) => void,
  options?: { multiple?: boolean; accept?: string; fallbackInput?: HTMLInputElement | null },
): Promise<void> {
  const picked = await pickMp5Files(options);
  if (picked === null) {
    options?.fallbackInput?.click();
    return;
  }
  if (picked.length === 0) return;
  onFiles(filesToFileList(picked));
}

declare global {
  interface Window {
    showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandleLike[]>;
  }
}
