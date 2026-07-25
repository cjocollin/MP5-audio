export function PlayerEmptyState() {
  return (
    <div className="mp5-player-empty-tip" data-testid="player-empty-state">
      <p className="mp5-player-empty-tip-title">Queue is empty</p>
      <p className="mp5-player-empty-tip-copy">
        Drop <strong>.mp5</strong> / <strong>.mp5p</strong> below, or open files from the header.
        Source audio (FLAC, WAV, MP3…) belongs in Converter.
      </p>
      <details className="mp5-player-empty-tip-more">
        <summary>More tips</summary>
        <ul>
          <li>Tracks append to the queue — next/previous or tap a row to play</li>
          <li>Search by title, artist, album, genre, or mood/vibe tags</li>
          <li>
            Use the <strong>Format</strong> panel for codec, bit-exact, and decode path details
          </li>
        </ul>
      </details>
    </div>
  );
}
