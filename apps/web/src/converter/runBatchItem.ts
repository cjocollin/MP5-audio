import { decodeSourceToPcm } from "./decodeSourceToPcm";
import { extractSourceMetadata } from "./extractSourceMetadata";
import { manualEditsFromSource } from "./manualMetadata";
import { runExportPipeline } from "./exportPipeline";
import { decodeFailureHint } from "./supportedSources";
import {
  batchOutputFilename,
  mapExportPhaseToBatchStatus,
} from "./batchQueue";
import { BATCH_CODEC, type BatchItemStatus, type BatchQueueItem } from "./batchTypes";

export interface BatchItemProgress {
  status: BatchItemStatus;
  detectedTitle?: string;
  detectedArtist?: string;
  outputFilename?: string;
}

export interface BatchItemResult {
  status: "complete" | "failed" | "cancelled";
  detectedTitle?: string;
  detectedArtist?: string;
  outputFilename?: string;
  outputBytes?: number;
  mp5?: Uint8Array;
  errorMessage?: string;
}

export async function runBatchItemConversion(
  item: BatchQueueItem,
  opts: {
    signal: AbortSignal;
    onProgress: (patch: BatchItemProgress) => void;
  },
): Promise<BatchItemResult> {
  const { file } = item;
  const report = (patch: BatchItemProgress) => opts.onProgress(patch);

  const checkAborted = () => {
    if (opts.signal.aborted) {
      throw new DOMException("Batch cancelled", "AbortError");
    }
  };

  try {
    checkAborted();
    report({ status: "decoding" });
    const pcm = await decodeSourceToPcm(
      file,
      () => {
        checkAborted();
      },
      opts.signal,
    );

    checkAborted();
    report({ status: "metadata" });
    const extracted = await extractSourceMetadata(file).catch(() => ({
      meta: { title: file.name.replace(/\.[^.]+$/, "") },
    }));
    const edits = manualEditsFromSource(extracted);
    const detectedTitle = edits.meta.title;
    const detectedArtist = edits.meta.artist;
    const outputFilename = batchOutputFilename(edits, file.name);

    report({
      status: "encoding",
      detectedTitle,
      detectedArtist,
      outputFilename,
    });

    const { mp5 } = await runExportPipeline(
      {
        pcm,
        extracted,
        edits,
        codec: BATCH_CODEC,
        preset: 2,
        sourceBytes: file.size,
      },
      (phase) => {
        checkAborted();
        report({
          status: mapExportPhaseToBatchStatus(phase),
          detectedTitle,
          detectedArtist,
          outputFilename,
        });
      },
    );

    checkAborted();
    return {
      status: "complete",
      detectedTitle,
      detectedArtist,
      outputFilename,
      outputBytes: mp5.byteLength,
      mp5,
    };
  } catch (e) {
    if (opts.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
      return { status: "cancelled", errorMessage: "Batch cancelled." };
    }
    const message =
      e instanceof Error ? e.message : String(e);
    const hint = decodeFailureHint(file.name);
    return {
      status: "failed",
      errorMessage: message.includes("decode") || message.includes("FFmpeg")
        ? `${message} ${hint}`
        : message,
    };
  }
}
