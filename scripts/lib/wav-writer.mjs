/**
 * Write 16-bit PCM WAV (no dependencies).
 */
export function writeWavPcm({ samples, sampleRate, channels }) {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  const writeStr = (offset, s) => {
    for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(o, samples[i], true);
    o += 2;
  }
  return out;
}

export function synthTone({ sampleRate, channels, durationSec, freqHz = 440, amplitude = 8000 }) {
  const frames = Math.floor(sampleRate * durationSec);
  const samples = new Int16Array(frames * channels);
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((i * freqHz * 2 * Math.PI) / sampleRate) * amplitude);
    for (let c = 0; c < channels; c++) {
      samples[i * channels + c] = v;
    }
  }
  return samples;
}
