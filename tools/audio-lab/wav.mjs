// MP5 Audio Quality Lab — minimal WAV I/O (PCM only).
// Used for listening-set export and reading user-local --source files.
// FLAC/MP3/etc. are intentionally unsupported: convert to WAV first so no
// copyrighted source is ever decoded or committed by the lab.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function writeWavPcm16(path, samples, channels, sampleRate) {
  mkdirSync(dirname(path), { recursive: true });
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  writeFileSync(path, buf);
}

/** Read a PCM WAV (16/24/32-bit int or 32-bit float) into interleaved i16. */
export function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Not a WAV file: ${path} (convert FLAC/MP3 to 16-bit WAV first)`);
  }
  let pos = 12;
  let fmt = null;
  let dataOffset = -1, dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      dataOffset = body;
      dataLen = size;
    }
    pos = body + size + (size % 2); // chunks are word-aligned
  }
  if (!fmt || dataOffset < 0) throw new Error(`Malformed WAV: ${path}`);

  const { bitsPerSample, audioFormat, channels, sampleRate } = fmt;
  const end = Math.min(dataOffset + dataLen, buf.length);
  let samples;
  if (audioFormat === 1 && bitsPerSample === 16) {
    const n = (end - dataOffset) >> 1;
    samples = new Int16Array(n);
    for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(dataOffset + i * 2);
  } else if (audioFormat === 1 && bitsPerSample === 24) {
    const n = Math.floor((end - dataOffset) / 3);
    samples = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const o = dataOffset + i * 3;
      let v = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
      if (v & 0x800000) v |= ~0xffffff; // sign-extend
      samples[i] = Math.max(-32768, Math.min(32767, v >> 8));
    }
  } else if (audioFormat === 3 && bitsPerSample === 32) {
    const n = (end - dataOffset) >> 2;
    samples = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const f = buf.readFloatLE(dataOffset + i * 4);
      samples[i] = Math.max(-32768, Math.min(32767, Math.round(f * 32767)));
    }
  } else {
    throw new Error(`Unsupported WAV format (fmt=${audioFormat}, ${bitsPerSample}-bit) in ${path}`);
  }
  return { samples, channels, sampleRate };
}
