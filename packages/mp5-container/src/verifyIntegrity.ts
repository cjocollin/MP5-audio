import { encodeAudiPayload } from "./containerWriter.js";
import { encodeCover } from "./coverArt.js";
import { encodeMeta } from "./metadata.js";
import type { Mp5File } from "./types.js";
import { getFingFromParsed, getHashFromParsed, buildIntegrityResult, compareSha256 } from "./integrity.js";
import type { IntegrityCheckResult } from "./integrity.js";
import { sha256HexDigest } from "./sha256Digest.js";
import { Mp5ParseError } from "./errors.js";
import { loadAudiFrames } from "./lazyMp5Load.js";

export interface VerifyIntegrityOptions {
  pcmSamples?: Int16Array;
}

/** Verify FING/HASH (full file bytes optional — lazy-indexed files verify AUDI/PCM without whole-file read). */
export async function verifyMp5FileIntegrity(
  parsed: Mp5File,
  fileBytes?: Uint8Array,
  opts?: VerifyIntegrityOptions,
): Promise<IntegrityCheckResult> {
  if (parsed.lazy && (!fileBytes || !fileBytes.length)) {
    return verifyMp5LazyIntegrity(parsed, opts);
  }
  if (!fileBytes?.length) {
    throw new Mp5ParseError("fileBytes required for non-lazy integrity verify");
  }
  return verifyMp5FullIntegrity(parsed, fileBytes, opts);
}

async function verifyMp5LazyIntegrity(
  parsed: Mp5File,
  opts?: VerifyIntegrityOptions,
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

  const fileExpected = fing?.fileHash ?? hash?.fileSha256;
  const fileHashOk = fileExpected ? false : null;

  let pcmHashOk: boolean | null = null;
  if (fing?.pcmHash) {
    if (opts?.pcmSamples?.length) {
      const pcmBytes = new Uint8Array(
        opts.pcmSamples.buffer,
        opts.pcmSamples.byteOffset,
        opts.pcmSamples.byteLength,
      );
      pcmHashOk = compareSha256(fing.pcmHash, await sha256HexDigest(pcmBytes));
    } else {
      pcmHashOk = null;
    }
  }

  const frames = await loadAudiFrames(parsed);
  const audiPayload = encodeAudiPayload(frames);
  const actualAudi = await sha256HexDigest(audiPayload);
  const audiHashOk = compareSha256(fing?.audiHash, actualAudi);

  let metaHashOk: boolean | null = null;
  if (fing?.metaHash && parsed.meta.length) {
    metaHashOk = compareSha256(fing.metaHash, await sha256HexDigest(encodeMeta(parsed.meta)));
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
    actualByFourcc.set("HEAD", await sha256HexDigest(headPayload));
  }
  if (parsed.meta.length) {
    actualByFourcc.set("META", await sha256HexDigest(encodeMeta(parsed.meta)));
  }
  actualByFourcc.set("AUDI", actualAudi);
  if (parsed.coverArt) {
    actualByFourcc.set("COVR", await sha256HexDigest(encodeCover(parsed.coverArt)));
  } else if (parsed.cover?.length) {
    actualByFourcc.set("COVR", await sha256HexDigest(parsed.cover));
  }
  for (const [fourcc, payload] of parsed.optional) {
    if (fourcc === "FING" || fourcc === "HASH") continue;
    actualByFourcc.set(fourcc, await sha256HexDigest(payload));
  }

  const chunkChecks =
    hash?.chunks
      ?.filter((e) => e.fourcc !== "STDF")
      .map((e) => {
        const actual = actualByFourcc.get(e.fourcc);
        return {
          fourcc: e.fourcc,
          expected: e.sha256,
          actual,
          ok: compareSha256(e.sha256, actual),
        };
      }) ?? [];

  const result = buildIntegrityResult({
    fing,
    hash,
    fileHashOk,
    pcmHashOk,
    audiHashOk,
    metaHashOk,
    chunkChecks,
  });

  if (fileExpected) {
    result.fileHash = {
      expected: fileExpected,
      actual: undefined,
      ok: fileHashOk,
      informational: result.fileHashInformational,
    };
  }
  if (fing?.pcmHash) {
    result.pcmHash = { expected: fing.pcmHash, actual: undefined, ok: pcmHashOk };
  }
  if (fing?.audiHash) {
    result.audiHash = { expected: fing.audiHash, actual: actualAudi, ok: audiHashOk };
  }
  if (fing?.metaHash) {
    result.metaHash = { expected: fing.metaHash, actual: undefined, ok: metaHashOk };
  }

  return result;
}

async function verifyMp5FullIntegrity(
  parsed: Mp5File,
  fileBytes: Uint8Array,
  opts?: VerifyIntegrityOptions,
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

  const actualFile = await sha256HexDigest(fileBytes);
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
      pcmHashOk = compareSha256(fing.pcmHash, await sha256HexDigest(pcmBytes));
    } else {
      pcmHashOk = null;
    }
  }

  const frames =
    parsed.audioFrames.length > 0 ? parsed.audioFrames : await loadAudiFrames(parsed);
  const audiPayload = encodeAudiPayload(frames);
  const actualAudi = await sha256HexDigest(audiPayload);
  const audiHashOk = compareSha256(fing?.audiHash, actualAudi);

  let metaHashOk: boolean | null = null;
  if (fing?.metaHash && parsed.meta.length) {
    metaHashOk = compareSha256(fing.metaHash, await sha256HexDigest(encodeMeta(parsed.meta)));
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
    actualByFourcc.set("HEAD", await sha256HexDigest(headPayload));
  }
  if (parsed.meta.length) {
    actualByFourcc.set("META", await sha256HexDigest(encodeMeta(parsed.meta)));
  }
  actualByFourcc.set("AUDI", actualAudi);
  if (parsed.coverArt) {
    actualByFourcc.set("COVR", await sha256HexDigest(encodeCover(parsed.coverArt)));
  } else if (parsed.cover?.length) {
    actualByFourcc.set("COVR", await sha256HexDigest(parsed.cover));
  }
  for (const [fourcc, payload] of parsed.optional) {
    if (fourcc === "FING" || fourcc === "HASH") continue;
    actualByFourcc.set(fourcc, await sha256HexDigest(payload));
  }
  const stdfActual: { size: number; sha256: string }[] = [];
  for (const payload of parsed.stdfFragments ?? []) {
    stdfActual.push({ size: payload.length, sha256: await sha256HexDigest(payload) });
  }

  let stdfEntryIndex = 0;
  const chunkChecks = hash?.chunks?.length
    ? hash.chunks.map((e) => {
        if (e.fourcc === "STDF" && stdfActual.length) {
          const frag = stdfActual[stdfEntryIndex] ?? stdfActual[stdfActual.length - 1];
          stdfEntryIndex += 1;
          const actual = frag?.sha256;
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

  if (fileExpected) {
    result.fileHash = {
      expected: fileExpected,
      actual: actualFile,
      ok: fileHashOk,
      informational: result.fileHashInformational,
    };
  }
  if (fing?.pcmHash) {
    result.pcmHash = { expected: fing.pcmHash, actual: undefined, ok: pcmHashOk };
  }
  if (fing?.audiHash) {
    result.audiHash = { expected: fing.audiHash, actual: actualAudi, ok: audiHashOk };
  }
  if (fing?.metaHash) {
    result.metaHash = { expected: fing.metaHash, actual: undefined, ok: metaHashOk };
  }

  return result;
}
