import {
  buildIntegrityResult,
  compareSha256,
  encodeAudiPayload,
  encodeCover,
  encodeMeta,
  getFingFromParsed,
  getHashFromParsed,
  mergeChunkCheck,
  type IntegrityCheckResult,
  type Mp5File,
} from "@mp5/container";
import { sha256Hex } from "./sha256";

export interface VerifyMp5Options {
  /** When provided, PCM hash in FING can be verified. */
  pcmSamples?: Int16Array;
}

export async function verifyMp5Integrity(
  parsed: Mp5File,
  fileBytes: Uint8Array,
  opts?: VerifyMp5Options,
): Promise<IntegrityCheckResult> {
  const fing = getFingFromParsed(parsed);
  const hash = getHashFromParsed(parsed);

  if (!fing && !hash) {
    return buildIntegrityResult({
      fing: null,
      hash: null,
      fileHashOk: null,
      pcmHashOk: null,
      audiHashOk: null,
      metaHashOk: null,
      chunkChecks: [],
    });
  }

  const actualFile = await sha256Hex(fileBytes);
  const fileExpected = fing?.fileHash ?? hash?.fileSha256;
  const fileHashOk = compareSha256(fileExpected, actualFile);

  let pcmHashOk: boolean | null = null;
  if (fing?.pcmHash) {
    if (opts?.pcmSamples?.length) {
      const pcmBytes = new Uint8Array(
        opts.pcmSamples.buffer,
        opts.pcmSamples.byteOffset,
        opts.pcmSamples.byteLength,
      );
      pcmHashOk = compareSha256(fing.pcmHash, await sha256Hex(pcmBytes));
    } else {
      pcmHashOk = null;
    }
  }

  const audiPayload = encodeAudiPayload(parsed.audioFrames);
  const actualAudi = await sha256Hex(audiPayload);
  const audiHashOk = compareSha256(fing?.audiHash, actualAudi);

  let metaHashOk: boolean | null = null;
  if (fing?.metaHash && parsed.meta.length) {
    metaHashOk = compareSha256(fing.metaHash, await sha256Hex(encodeMeta(parsed.meta)));
  }

  const actualByFourcc = new Map<string, string>();
  const head = parsed.head;
  if (head) {
    const headPayload = new Uint8Array(20);
    const hv = new DataView(headPayload.buffer);
    hv.setUint8(0, head.codecId);
    hv.setUint8(1, head.channels);
    hv.setUint8(2, head.bitsPerSample);
    hv.setUint8(3, head.presetId);
    hv.setUint32(4, head.sampleRate, true);
    hv.setBigUint64(8, head.totalSamples, true);
    hv.setUint16(16, head.encoderVersion, true);
    actualByFourcc.set("HEAD", await sha256Hex(headPayload));
  }
  if (parsed.meta.length) {
    actualByFourcc.set("META", await sha256Hex(encodeMeta(parsed.meta)));
  }
  actualByFourcc.set("AUDI", actualAudi);
  if (parsed.coverArt) {
    actualByFourcc.set("COVR", await sha256Hex(encodeCover(parsed.coverArt)));
  } else if (parsed.cover?.length) {
    actualByFourcc.set("COVR", await sha256Hex(parsed.cover));
  }
  for (const [fourcc, payload] of parsed.optional) {
    if (fourcc === "FING" || fourcc === "HASH") continue;
    actualByFourcc.set(fourcc, await sha256Hex(payload));
  }
  const stdfActual: { size: number; sha256: string }[] = [];
  for (const payload of parsed.stdfFragments ?? []) {
    stdfActual.push({ size: payload.length, sha256: await sha256Hex(payload) });
  }

  const chunkChecks = hash?.chunks?.length
    ? hash.chunks.map((e) => {
        if (e.fourcc === "STDF" && stdfActual.length) {
          const match = e.size
            ? stdfActual.find((a) => a.size === e.size)
            : stdfActual[0];
          const actual = match?.sha256;
          return {
            fourcc: e.fourcc,
            expected: e.sha256,
            actual,
            ok: compareSha256(e.sha256, actual),
          };
        }
        const actual = actualByFourcc.get(e.fourcc);
        return {
          fourcc: e.fourcc,
          expected: e.sha256,
          actual,
          ok: compareSha256(e.sha256, actual),
        };
      })
    : [];

  const result = buildIntegrityResult({
    fing,
    hash,
    fileHashOk,
    pcmHashOk,
    audiHashOk,
    metaHashOk,
    chunkChecks,
  });

  result.fileHash = fileExpected
    ? { expected: fileExpected, actual: actualFile, ok: fileHashOk }
    : undefined;
  result.pcmHash = fing?.pcmHash
    ? { expected: fing.pcmHash, actual: undefined, ok: pcmHashOk }
    : undefined;
  result.audiHash = fing?.audiHash
    ? { expected: fing.audiHash, actual: actualAudi, ok: audiHashOk }
    : undefined;
  result.metaHash = fing?.metaHash
    ? { expected: fing.metaHash, actual: undefined, ok: metaHashOk }
    : undefined;

  return result;
}
