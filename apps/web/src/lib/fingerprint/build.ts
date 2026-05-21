import {
  encodeAudiPayload,
  encodeCover,
  encodeFing,
  encodeHash,
  encodeMeta,
  type ChunkHashEntry,
  type FingPayload,
  type HashPayload,
  type Mp5File,
} from "@mp5/container";
import { sha256Hex } from "./sha256";

export interface FingerprintBuildInput {
  parsed: Mp5File;
  fileBytes: Uint8Array;
  pcmSamples?: Int16Array;
  pcmChannels?: number;
  generatedBy?: string;
}

export interface FingerprintBuildResult {
  fing: FingPayload;
  hash: HashPayload;
}

export async function buildFingerprintChunks(
  input: FingerprintBuildInput,
): Promise<FingerprintBuildResult> {
  const { parsed, fileBytes, pcmSamples, pcmChannels } = input;
  const head = parsed.head!;
  const ch = pcmChannels ?? head.channels;

  const audiPayload = encodeAudiPayload(parsed.audioFrames);
  const audiHash = await sha256Hex(audiPayload);

  let pcmHash: string | undefined;
  if (pcmSamples?.length) {
    const pcmBytes = new Uint8Array(pcmSamples.buffer, pcmSamples.byteOffset, pcmSamples.byteLength);
    pcmHash = await sha256Hex(pcmBytes);
  }

  let metaHash: string | undefined;
  if (parsed.meta.length) {
    metaHash = await sha256Hex(encodeMeta(parsed.meta));
  }

  const fileHash = await sha256Hex(fileBytes);

  const durationMs =
    head.totalSamples > 0n
      ? Math.round(Number(head.totalSamples) / (head.sampleRate * head.channels) * 1000)
      : undefined;

  const fing: FingPayload = {
    version: 1,
    audioFingerprintType: pcmHash ? "sha256-pcm" : "sha256-audi",
    audioFingerprint: pcmHash ?? audiHash,
    pcmHash,
    audiHash,
    metaHash,
    fileHash,
    fileSize: fileBytes.length,
    durationMs,
    sampleRate: head.sampleRate,
    channels: ch,
    generatedBy: input.generatedBy ?? "MP5 Web Converter",
    generatedAt: new Date().toISOString(),
    source: "encoder",
  };

  const chunks: ChunkHashEntry[] = [];
  const push = async (fourcc: string, payload: Uint8Array | undefined) => {
    if (!payload?.length) return;
    chunks.push({ fourcc, sha256: await sha256Hex(payload), size: payload.length });
  };

  const headPayload = new Uint8Array(20);
  const hv = new DataView(headPayload.buffer);
  hv.setUint8(0, head.codecId);
  hv.setUint8(1, head.channels);
  hv.setUint8(2, head.bitsPerSample);
  hv.setUint8(3, head.presetId);
  hv.setUint32(4, head.sampleRate, true);
  hv.setBigUint64(8, head.totalSamples, true);
  hv.setUint16(16, head.encoderVersion, true);
  await push("HEAD", headPayload);
  if (parsed.meta.length) await push("META", encodeMeta(parsed.meta));
  await push("AUDI", audiPayload);
  if (parsed.coverArt) {
    await push("COVR", encodeCover(parsed.coverArt));
  } else if (parsed.cover?.length) {
    await push("COVR", parsed.cover);
  }
  if (parsed.waveform.length) {
    const waveBuf = new Uint8Array(4 + parsed.waveform.length * 4);
    const wv = new DataView(waveBuf.buffer);
    wv.setUint32(0, parsed.waveform.length, true);
    parsed.waveform.forEach((p, i) => wv.setFloat32(4 + i * 4, p, true));
    await push("WAVE", waveBuf);
  }
  for (const [fourcc, payload] of parsed.optional) {
    if (fourcc === "FING" || fourcc === "HASH") continue;
    await push(fourcc, payload);
  }

  const hash: HashPayload = {
    version: 1,
    algorithm: "sha256",
    fileSha256: fileHash,
    chunks: chunks.length ? chunks : undefined,
  };

  return { fing, hash };
}

export async function attachFingerprintOptional(
  optional: Map<string, Uint8Array>,
  input: FingerprintBuildInput,
): Promise<{ warning?: string }> {
  try {
    const { fing, hash } = await buildFingerprintChunks(input);
    optional.set("FING", encodeFing(fing));
    optional.set("HASH", encodeHash(hash));
    return {};
  } catch (e) {
    return {
      warning:
        e instanceof Error
          ? `Fingerprint metadata was not embedded: ${e.message}`
          : "Fingerprint metadata was not embedded.",
    };
  }
}
