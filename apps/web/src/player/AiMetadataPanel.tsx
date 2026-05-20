interface Props {
  optional: Map<string, Uint8Array>;
}

function readText(data?: Uint8Array): string | null {
  if (!data?.length) return null;
  try {
    return new TextDecoder().decode(data);
  } catch {
    return null;
  }
}

export function AiMetadataPanel({ optional }: Props) {
  const mood = readText(optional.get("MOOD"));
  const vibe = readText(optional.get("VIBE"));
  const summ = readText(optional.get("SUMM"));
  const beat = readText(optional.get("BEAT"));

  if (!mood && !vibe && !summ && !beat) return null;

  return (
    <div className="rounded-xl bg-surface-elevated p-3 text-sm space-y-1">
      <p className="font-semibold text-accent">AI metadata <span className="text-xs text-gray-500">(display only)</span></p>
      {mood && <p className="text-gray-400">Mood: {mood.slice(0, 120)}</p>}
      {vibe && <p className="text-gray-400">Vibe: {vibe.slice(0, 120)}</p>}
      {summ && <p className="text-gray-400">{summ.slice(0, 200)}</p>}
      {beat && <p className="text-gray-400">Beat: {beat.slice(0, 80)}</p>}
    </div>
  );
}

