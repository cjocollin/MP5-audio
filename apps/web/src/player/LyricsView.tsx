interface Props {
  lyrics?: string;
}

export function LyricsView({ lyrics }: Props) {
  if (!lyrics) {
    return (
      <p className="text-gray-500 text-sm italic">No lyrics in file (LYRC chunk)</p>
    );
  }
  return (
    <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">
      {lyrics}
    </pre>
  );
}
