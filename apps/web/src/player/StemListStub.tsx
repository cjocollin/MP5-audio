interface Props {
  stems?: string[];
}

/** v0.2: full stem mixer; MVP shows list only */
export function StemListStub({ stems }: Props) {
  if (!stems?.length) return null;
  return (
    <div className="rounded-xl bg-surface-elevated p-3 text-sm">
      <p className="font-semibold text-gray-300 mb-2">Stems <span className="text-xs text-amber-400/90">(stub)</span></p>
      <ul className="text-gray-500 space-y-1">
        {stems.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="text-xs text-gray-600 mt-2">Mixer / karaoke modes — Phase 11</p>
    </div>
  );
}
