import { EmptyStateCard } from "./EmptyStateCard";

export function PlayerEmptyState() {
  return (
    <EmptyStateCard title="Build your playlist" testId="player-empty-state">
      <ul className="space-y-2 text-left list-disc list-inside">
        <li>Drop one or more <strong className="text-gray-400 font-normal">.mp5</strong> files</li>
        <li>Tracks append to the queue — use next/previous or tap a row to play</li>
        <li>
          Search by title, artist, album, genre, or mood/vibe tags
        </li>
        <li>
          Scroll to the <strong className="text-gray-400 font-normal">Format</strong> panel below for
          codec, bit-exact, and decode path details
        </li>
      </ul>
    </EmptyStateCard>
  );
}
