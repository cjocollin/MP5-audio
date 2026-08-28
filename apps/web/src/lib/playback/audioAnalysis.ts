export const AUDIO_ANALYSIS_BIN_COUNT = 32;

export function connectPlaybackAnalyser(
  context: AudioContext,
  input: AudioNode,
): AnalyserNode {
  const analyser = context.createAnalyser();
  analyser.fftSize = AUDIO_ANALYSIS_BIN_COUNT * 2;
  analyser.smoothingTimeConstant = 0.78;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -12;
  input.connect(analyser);
  analyser.connect(context.destination);
  return analyser;
}

export function readPlaybackAnalysis(
  analyser: AnalyserNode | null,
  target: Uint8Array,
  active: boolean,
): boolean {
  if (!analyser || !active) {
    target.fill(0);
    return false;
  }
  analyser.getByteFrequencyData(target as Uint8Array<ArrayBuffer>);
  return true;
}
