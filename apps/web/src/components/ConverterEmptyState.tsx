import { EmptyStateCard } from "./EmptyStateCard";

export function ConverterEmptyState() {
  return (
    <EmptyStateCard title="Convert audio to MP5" testId="converter-empty-state">
      <ul className="space-y-2 text-left list-disc list-inside">
        <li>
          Drop <strong className="text-gray-400 font-normal">FLAC, WAV, MP3, M4A, or OGG</strong>{" "}
          files here
        </li>
        <li>
          Default export is <strong className="text-gray-400 font-normal">MP5-L v3</strong> (lossless,
          recommended)
        </li>
        <li>Review and edit metadata before export</li>
        <li>After export, open directly in the Player or download the .mp5</li>
      </ul>
    </EmptyStateCard>
  );
}
