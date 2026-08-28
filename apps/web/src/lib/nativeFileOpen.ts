export interface LaunchFileHandleLike {
  getFile: () => Promise<File>;
}

export interface LaunchParamsLike {
  files?: LaunchFileHandleLike[];
}

export interface LaunchQueueLike {
  setConsumer: (consumer: (params: LaunchParamsLike) => void) => void;
}

export function isMp5LaunchFile(file: File): boolean {
  return /\.mp5p?$/i.test(file.name);
}

/** Route installed-PWA file launches through the same player mailbox as Open. */
export function installLaunchFileConsumer(
  queue: LaunchQueueLike | undefined,
  onFiles: (files: File[]) => void,
): boolean {
  if (!queue) return false;
  queue.setConsumer((params) => {
    void Promise.allSettled((params.files ?? []).map((handle) => handle.getFile())).then(
      (results) => {
        const files = results.flatMap((result) =>
          result.status === "fulfilled" && isMp5LaunchFile(result.value) ? [result.value] : [],
        );
        if (files.length) onFiles(files);
      },
    );
  });
  return true;
}

declare global {
  interface Window {
    launchQueue?: LaunchQueueLike;
  }
}
