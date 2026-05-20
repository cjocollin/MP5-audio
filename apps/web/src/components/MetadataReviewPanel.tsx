import {
  buildExportMetadataBundle,
  type ExportMetadataBundle,
} from "../converter/buildExportBundles";
import {
  buildOverridesFromEdits,
  detectedMetaRows,
  parseTagInput,
  type ManualMetadataEdits,
} from "../converter/manualMetadata";
import type { SourceMetadata } from "../converter/extractSourceMetadata";
import {
  CHUNK_DISPLAY_NAME,
  formatWarningSourceLabel,
  METADATA_GUIDANCE_INTRO,
  SECTION,
  specializedProfileLabel,
} from "../lib/metadataLabels";

interface Props {
  extracted: SourceMetadata;
  edits: ManualMetadataEdits;
}

const META_LABELS: Record<string, string> = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  albumartist: "Album artist",
  genre: "Genre",
  year: "Year",
  date: "Date",
  tracknumber: "Track",
  discnumber: "Disc",
  composer: "Composer",
  comment: "Comment",
};

function embeddedMetaRows(bundle: ExportMetadataBundle) {
  return bundle.metaFields
    .filter((f) => !f.key.startsWith("waveform_") && f.key !== "cover_mime" && f.key !== "cover_size")
    .map((f) => ({ label: META_LABELS[f.key] ?? f.key, value: f.value }));
}

function changedKeys(extracted: SourceMetadata, edits: ManualMetadataEdits): string[] {
  const detected = detectedMetaRows(extracted);
  const changed: string[] = [];
  for (const { key, value } of detected) {
    const edited = edits.meta[key as keyof typeof edits.meta] ?? "";
    if (edited !== value) changed.push(key);
  }
  for (const key of Object.keys(edits.meta) as (keyof ManualMetadataEdits["meta"])[]) {
    const edited = edits.meta[key].trim();
    const was = extracted.meta[key] ?? "";
    if (edited && edited !== was) changed.push(key);
    if (!was && edited) changed.push(key);
  }
  return [...new Set(changed)];
}

export function MetadataReviewPanel({ extracted, edits }: Props) {
  const overrides = buildOverridesFromEdits(edits);
  const bundle = buildExportMetadataBundle(extracted, overrides);
  const embedded = embeddedMetaRows(bundle);
  const detected = detectedMetaRows(extracted);
  const editedKeys = changedKeys(extracted, edits);

  const coverDetected = extracted.cover;
  const coverEmbedded = bundle.cover;
  const coverRemoved = edits.cover === null;
  const coverReplaced =
    edits.cover != null &&
    coverDetected != null &&
    (edits.cover.data.length !== coverDetected.data.length ||
      edits.cover.mime !== coverDetected.mime);

  const moodEmbedded = parseTagInput(edits.moodTags);
  const vibeEmbedded = parseTagInput(edits.vibeTags);
  const explEmbedded = bundle.optional.has("EXPL");
  const safeEmbedded = bundle.optional.has("SAFE");
  const sensEmbedded = bundle.optional.has("SENS");
  const recvEmbedded = bundle.optional.has("RECV");
  const lyrcEmbedded = bundle.optional.has("LYRC");

  const skippedMeta = Object.entries(META_LABELS)
    .filter(([key]) => !bundle.metaFields.some((f) => f.key === key))
    .map(([, label]) => label);

  return (
    <div
      className="rounded-xl border border-white/10 bg-surface-elevated p-4 space-y-4 text-sm"
      data-testid="metadata-review-panel"
    >
      <p className="font-medium text-white">Export preview</p>
      <p className="text-xs text-gray-500 leading-relaxed">{METADATA_GUIDANCE_INTRO}</p>
      <p className="text-xs text-gray-600">
        Empty fields are skipped. Guidance is never auto-generated.
      </p>

      <section className="space-y-2" data-testid="review-detected">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Detected</p>
        {detected.length > 0 ? (
          <ul className="text-xs text-gray-400 space-y-0.5">
            {detected.map((r) => (
              <li key={r.key}>
                <span className="text-gray-500">{r.label}:</span> {r.value}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-600 italic">No tags from source file</p>
        )}
        {coverDetected && (
          <p className="text-xs text-gray-400">
            Cover: {coverDetected.mime} ({Math.round(coverDetected.data.length / 1024)} KB)
          </p>
        )}
        {extracted.lyrics?.unsynced && (
          <p className="text-xs text-gray-400">Lyrics: detected ({extracted.lyrics.source ?? "embedded"})</p>
        )}
      </section>

      {editedKeys.length > 0 && (
        <section className="space-y-1" data-testid="review-edited">
          <p className="text-[10px] uppercase tracking-wider text-amber-500/80 font-semibold">
            Manually edited
          </p>
          <p className="text-xs text-amber-200/70">{editedKeys.map((k) => META_LABELS[k] ?? k).join(", ")}</p>
        </section>
      )}

      <section className="space-y-2" data-testid="review-embedded">
        <p className="text-[10px] uppercase tracking-wider text-green-500/80 font-semibold">
          Will be embedded
        </p>
        {embedded.length > 0 ? (
          <ul className="text-xs text-gray-200 space-y-0.5">
            {embedded.map((r) => (
              <li key={r.label}>
                <span className="text-gray-500">{r.label}:</span> {r.value}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-600 italic">No META tags (all empty)</p>
        )}
        <p className="text-xs text-gray-300">
          Cover:{" "}
          {coverEmbedded ? (
            <span data-testid="embedded-cover">
              {coverEmbedded.mime} ({Math.round(coverEmbedded.data.length / 1024)} KB)
              {coverReplaced && " · replaced"}
            </span>
          ) : (
            <span className="text-gray-500" data-testid="embedded-cover-none">
              skipped{coverRemoved && coverDetected ? " (removed)" : ""}
            </span>
          )}
        </p>
        <p className="text-xs text-gray-300">
          Lyrics:{" "}
          {lyrcEmbedded ? (
            <span className="text-green-400/90" data-testid="embedded-lyrics">
              yes
            </span>
          ) : (
            <span className="text-gray-500">skipped</span>
          )}
        </p>
        {(explEmbedded || safeEmbedded || sensEmbedded) && (
          <p className="text-xs text-gray-500" data-testid="content-guidance-source">
            {SECTION.contentGuidance} source: {formatWarningSourceLabel("user")}
          </p>
        )}
        <ul className="text-xs text-gray-300 space-y-0.5" data-testid="embedded-guidance-summary">
          <li>
            {CHUNK_DISPLAY_NAME.EXPL}:{" "}
            {explEmbedded ? (
              <span className="text-green-400/90" data-testid="embedded-expl">
                embedded
              </span>
            ) : (
              <span className="text-gray-500">skipped</span>
            )}
          </li>
          <li>
            {CHUNK_DISPLAY_NAME.SAFE}:{" "}
            {safeEmbedded ? (
              <span className="text-green-400/90" data-testid="embedded-safe">
                embedded
              </span>
            ) : (
              <span className="text-gray-500">skipped</span>
            )}
          </li>
          <li>
            {CHUNK_DISPLAY_NAME.SENS}:{" "}
            {sensEmbedded ? (
              <span className="text-green-400/90" data-testid="embedded-sens">
                embedded
              </span>
            ) : (
              <span className="text-gray-500">skipped</span>
            )}
          </li>
          <li>
            {SECTION.specializedAppMetadata}:{" "}
            <span data-testid="embedded-specialized-profile">
              {specializedProfileLabel(edits.specializedProfile)}
            </span>
            {recvEmbedded && (
              <>
                {" "}
                ·{" "}
                <span className="text-green-400/90" data-testid="embedded-recv">
                  {SECTION.havenRecoveryProfile} embedded
                </span>
              </>
            )}
            {edits.specializedProfile === "none" && !recvEmbedded && (
              <span className="text-gray-500"> (none)</span>
            )}
          </li>
        </ul>
        {(moodEmbedded.length > 0 || vibeEmbedded.length > 0) && (
          <p className="text-xs text-gray-300">
            Mood/vibe: {[...moodEmbedded, ...vibeEmbedded].join(", ")}
          </p>
        )}
        <p className="text-xs text-gray-500">+ WAVE preview, SEEK table, INFO encoder string</p>
      </section>

      {skippedMeta.length > 0 && (
        <section data-testid="review-skipped">
          <p className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">
            Skipped (empty)
          </p>
          <p className="text-xs text-gray-600">{skippedMeta.join(", ")}</p>
        </section>
      )}
    </div>
  );
}
