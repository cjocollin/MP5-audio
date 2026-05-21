/** Parse mm:ss.xx or mm:ss.xxx to milliseconds. */
export function timecodeToMs(
  minutes: number,
  seconds: number,
  frac: string,
): number {
  let fracMs = 0;
  if (frac.length === 2) fracMs = Number(frac) * 10;
  else if (frac.length === 3) fracMs = Number(frac);
  else if (frac.length === 1) fracMs = Number(frac) * 100;
  return (minutes * 60 + seconds) * 1000 + fracMs;
}

export function formatTimecodeMs(ms: number): string {
  const totalSec = ms / 1000;
  const mm = Math.floor(totalSec / 60);
  const ss = Math.floor(totalSec % 60);
  const cs = Math.round((ms % 1000) / 10);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
