import { useRef, useState } from "react";
import { MAX_COVER_SIZE, type CoverArt } from "@mp5/container";
import {
  appendTagInput,
  MOOD_TAG_SUGGESTIONS,
  VIBE_TAG_SUGGESTIONS,
  type ManualMetadataEdits,
} from "../converter/manualMetadata";
import { useCoverObjectUrl } from "../hooks/useCoverObjectUrl";
import {
  CONTENT_GUIDANCE_HELP,
  CUSTOM_APP_TAGS_POSTPONED,
  METADATA_GUIDANCE_INTRO,
  PROFILE_COMING_SOON,
  SECTION,
  SPECIALIZED_APP_HELP,
  SPECIALIZED_PROFILE_NONE_EMPTY,
  SPECIALIZED_PROFILE_OPTIONS,
  type SpecializedProfileId,
} from "../lib/metadataLabels";

interface Props {
  edits: ManualMetadataEdits;
  onChange: (edits: ManualMetadataEdits) => void;
  coverError?: string;
  onCoverError: (msg: string) => void;
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-300">{title}</p>
      {hint && <p className="text-[10px] text-gray-600 mt-0.5">{hint}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-gray-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full bg-surface rounded px-2 py-1 text-gray-200 text-sm border border-white/5"
        data-testid={testId}
      />
    </label>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      {label}
    </label>
  );
}

function TagField({
  label,
  value,
  onChange,
  suggestions,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: readonly string[];
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <Field label={label} value={value} onChange={onChange} testId={testId} />
      <div className="flex flex-wrap gap-1" data-testid={`${testId}-suggestions`}>
        {suggestions.map((tag) => (
          <button
            key={tag}
            type="button"
            className="px-2 py-0.5 rounded-full text-[10px] bg-gray-800 text-gray-300 border border-gray-700 hover:border-accent/40"
            onClick={() => onChange(appendTagInput(value, tag))}
          >
            + {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length >= 6) {
    const h = String.fromCharCode(...bytes.subarray(0, 6));
    if (h === "GIF87a" || h === "GIF89a") return "image/gif";
  }
  return "image/jpeg";
}

function CoverPreview({ cover }: { cover: CoverArt }) {
  const url = useCoverObjectUrl(cover);
  if (!url) return null;
  return (
    <img
      src={url}
      alt="Cover preview"
      className="w-24 h-24 object-cover rounded-lg border border-white/10"
      data-testid="cover-preview"
    />
  );
}

export function MetadataEditor({ edits, onChange, coverError, onCoverError }: Props) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const setMeta = (key: keyof ManualMetadataEdits["meta"], value: string) => {
    onChange({ ...edits, meta: { ...edits.meta, [key]: value } });
  };

  const setExpl = (key: keyof ManualMetadataEdits["expl"], checked: boolean) => {
    onChange({ ...edits, expl: { ...edits.expl, [key]: checked } });
  };

  const setSafe = (key: keyof ManualMetadataEdits["safe"], checked: boolean) => {
    onChange({ ...edits, safe: { ...edits.safe, [key]: checked } });
  };

  const setSens = (key: keyof ManualMetadataEdits["sens"], checked: boolean) => {
    onChange({ ...edits, sens: { ...edits.sens, [key]: checked } });
  };

  const setHaven = (key: keyof ManualMetadataEdits["havenProfile"], checked: boolean) => {
    onChange({ ...edits, havenProfile: { ...edits.havenProfile, [key]: checked } });
  };

  const setProfile = (profile: SpecializedProfileId) => {
    onChange({
      ...edits,
      specializedProfile: profile,
      havenProfile: profile === "haven" ? edits.havenProfile : { ...edits.havenProfile, recoverySensitive: false, relapseThemes: false, cravingTriggers: false, groundingFriendly: false, panicFriendly: false },
    });
  };

  const effectiveCover: CoverArt | undefined =
    edits.cover === null ? undefined : edits.cover ?? undefined;

  async function handleCoverFile(file: File) {
    onCoverError("");
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length > MAX_COVER_SIZE) {
      onCoverError(`Cover must be under ${Math.round(MAX_COVER_SIZE / 1024 / 1024)} MiB (${buf.length} bytes)`);
      return;
    }
    onChange({
      ...edits,
      cover: { mime: file.type || sniffImageMime(buf), data: buf },
    });
  }

  return (
    <div
      className="rounded-xl border border-accent/15 bg-surface-elevated p-4 space-y-5 text-sm"
      data-testid="metadata-editor"
    >
      <div>
        <p className="font-medium text-white">Edit metadata before export</p>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed" data-testid="metadata-guidance-intro">
          {METADATA_GUIDANCE_INTRO}
        </p>
        <p className="text-xs text-gray-600 mt-2">
          Empty fields are skipped. Guidance tags are manual only — never auto-generated.
        </p>
      </div>

      <section className="space-y-3" data-testid="section-track-info">
        <SectionHeader title={SECTION.trackInfo} />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Title" value={edits.meta.title} onChange={(v) => setMeta("title", v)} testId="meta-title" />
          <Field label="Artist" value={edits.meta.artist} onChange={(v) => setMeta("artist", v)} testId="meta-artist" />
          <Field label="Album" value={edits.meta.album} onChange={(v) => setMeta("album", v)} testId="meta-album" />
          <Field
            label="Album artist"
            value={edits.meta.albumartist}
            onChange={(v) => setMeta("albumartist", v)}
            testId="meta-albumartist"
          />
          <Field label="Genre" value={edits.meta.genre} onChange={(v) => setMeta("genre", v)} testId="meta-genre" />
          <Field label="Year" value={edits.meta.year} onChange={(v) => setMeta("year", v)} testId="meta-year" />
          <Field label="Date" value={edits.meta.date} onChange={(v) => setMeta("date", v)} testId="meta-date" />
          <Field
            label="Track #"
            value={edits.meta.tracknumber}
            onChange={(v) => setMeta("tracknumber", v)}
            testId="meta-track"
          />
          <Field label="Disc #" value={edits.meta.discnumber} onChange={(v) => setMeta("discnumber", v)} testId="meta-disc" />
          <Field
            label="Composer"
            value={edits.meta.composer}
            onChange={(v) => setMeta("composer", v)}
            testId="meta-composer"
          />
          <Field
            label="Comments"
            value={edits.meta.comment}
            onChange={(v) => setMeta("comment", v)}
            testId="meta-comment"
          />
        </div>
      </section>

      <section className="space-y-2" data-testid="cover-editor">
        <SectionHeader title={SECTION.coverArt} />
        {effectiveCover ? (
          <div className="flex flex-wrap items-start gap-3">
            <CoverPreview cover={effectiveCover} />
            <div className="text-xs text-gray-400 space-y-1">
              <p data-testid="cover-mime">{effectiveCover.mime}</p>
              <p data-testid="cover-size">{Math.round(effectiveCover.data.length / 1024)} KB</p>
              <button
                type="button"
                className="text-red-300 hover:text-red-200 underline"
                onClick={() => onChange({ ...edits, cover: null })}
                data-testid="cover-remove"
              >
                Remove cover
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">No cover will be embedded</p>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleCoverFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg bg-surface border border-white/10 text-gray-300 hover:border-accent/40"
          onClick={() => coverInputRef.current?.click()}
          data-testid="cover-replace"
        >
          {effectiveCover ? "Replace image" : "Add cover image"}
        </button>
        {coverError && (
          <p className="text-xs text-red-400" data-testid="cover-error">
            {coverError}
          </p>
        )}
      </section>

      <section className="space-y-2" data-testid="lyrics-editor">
        <SectionHeader title={SECTION.lyrics} hint="Optional — for players and karaoke-style apps." />
        <textarea
          value={edits.lyricsUnsynced}
          onChange={(e) => onChange({ ...edits, lyricsUnsynced: e.target.value })}
          rows={4}
          placeholder="Lyrics text…"
          className="w-full bg-surface rounded px-2 py-1 text-gray-200 text-sm border border-white/5 font-sans"
          data-testid="lyrics-unsynced"
        />
        <Field
          label="Source label (optional)"
          value={edits.lyricsSource}
          onChange={(v) => onChange({ ...edits, lyricsSource: v })}
          testId="lyrics-source"
        />
      </section>

      <section className="space-y-4" data-testid="section-content-guidance">
        <SectionHeader title={SECTION.contentGuidance} hint={CONTENT_GUIDANCE_HELP} />

        <div className="space-y-2 sm:pl-3 sm:border-l border-white/5" data-testid="expl-editor">
        <SectionHeader
          title={SECTION.contentNotices}
          hint="Explicit, mature, and clean-edit labels for music apps and family filters."
        />
        <div className="grid sm:grid-cols-2 gap-2">
          {(
            [
              ["explicit", "Explicit content"],
              ["cleanVersionAvailable", "Clean version"],
              ["strongLanguage", "Strong language"],
              ["sexualContent", "Sexual content"],
              ["violence", "Violence"],
              ["drugReferences", "Drug references"],
              ["alcoholReferences", "Alcohol references"],
              ["matureThemes", "Mature themes"],
            ] as const
          ).map(([key, label]) => (
            <Checkbox
              key={key}
              label={label}
              checked={edits.expl[key]}
              onChange={(c) => setExpl(key, c)}
              testId={`expl-${key}`}
            />
          ))}
        </div>
        </div>

        <div className="space-y-2 sm:pl-3 sm:border-l border-white/5" data-testid="safe-editor">
        <SectionHeader
          title={SECTION.sensitiveThemes}
          hint="Emotional or thematic context — optional for listeners who want more detail."
        />
        <div className="grid sm:grid-cols-2 gap-2">
          <Checkbox label="Grief themes" checked={edits.safe.griefThemes} onChange={(c) => setSafe("griefThemes", c)} testId="safe-griefThemes" />
          <Checkbox label="Trauma themes" checked={edits.safe.traumaThemes} onChange={(c) => setSafe("traumaThemes", c)} testId="safe-traumaThemes" />
          <Checkbox label="Intense emotional content" checked={edits.safe.intenseEmotional} onChange={(c) => setSafe("intenseEmotional", c)} testId="safe-intenseEmotional" />
          <Checkbox label="Distressing themes" checked={edits.safe.distressingThemes} onChange={(c) => setSafe("distressingThemes", c)} testId="safe-distressingThemes" />
        </div>
        </div>

        <div className="space-y-2 sm:pl-3 sm:border-l border-white/5" data-testid="sens-editor">
        <SectionHeader
          title={SECTION.listenerComfort}
          hint="Sensory accessibility — helpful for headphones, loud environments, or sensory-sensitive listeners."
        />
        <div className="grid sm:grid-cols-2 gap-2">
          <Checkbox label="Sudden loud sounds" checked={edits.sens.suddenLoudSounds} onChange={(c) => setSens("suddenLoudSounds", c)} testId="sens-suddenLoudSounds" />
          <Checkbox label="Harsh frequencies" checked={edits.sens.harshFrequencies} onChange={(c) => setSens("harshFrequencies", c)} testId="sens-harshFrequencies" />
          <Checkbox label="Intense bass" checked={edits.sens.intenseBass} onChange={(c) => setSens("intenseBass", c)} testId="sens-intenseBass" />
          <Checkbox label="Sensory overload risk" checked={edits.sens.sensoryOverloadRisk} onChange={(c) => setSens("sensoryOverloadRisk", c)} testId="sens-sensoryOverloadRisk" />
        </div>
        </div>
      </section>

      <section className="space-y-3" data-testid="section-mood-vibe">
        <SectionHeader title={SECTION.moodVibe} hint="Discovery tags for playlists, DJs, educators, and apps." />
        <div className="grid sm:grid-cols-2 gap-3">
          <TagField
            label="Mood (comma-separated)"
            value={edits.moodTags}
            onChange={(v) => onChange({ ...edits, moodTags: v })}
            suggestions={MOOD_TAG_SUGGESTIONS}
            testId="mood-tags"
          />
          <TagField
            label="Vibe / use case (comma-separated)"
            value={edits.vibeTags}
            onChange={(v) => onChange({ ...edits, vibeTags: v })}
            suggestions={VIBE_TAG_SUGGESTIONS}
            testId="vibe-tags"
          />
        </div>
      </section>

      <section
        className="rounded-lg border border-white/5 bg-surface/50"
        data-testid="section-specialized-app-metadata"
      >
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium text-gray-400 hover:text-gray-200"
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedOpen}
          data-testid="specialized-metadata-toggle"
        >
          <span>{SECTION.specializedAppMetadata}</span>
          <span className="text-gray-600">{advancedOpen ? "−" : "+"}</span>
        </button>
        {advancedOpen && (
          <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
            <p className="text-[10px] text-gray-600 leading-relaxed">{SPECIALIZED_APP_HELP}</p>
            <label className="block text-xs">
              <span className="text-gray-500">Specialized profile</span>
              <select
                value={edits.specializedProfile}
                onChange={(e) => setProfile(e.target.value as SpecializedProfileId)}
                className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
                data-testid="specialized-profile-select"
              >
                {SPECIALIZED_PROFILE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            {edits.specializedProfile === "haven" && (
              <div className="space-y-2" data-testid="haven-profile-editor">
                <SectionHeader
                  title={SECTION.havenRecoveryProfile}
                  hint="For Haven and similar recovery-aware apps. Drug and alcohol labels belong under Content notices."
                />
              <div className="grid sm:grid-cols-2 gap-2">
                <Checkbox label="Recovery-sensitive" checked={edits.havenProfile.recoverySensitive} onChange={(c) => setHaven("recoverySensitive", c)} testId="haven-recoverySensitive" />
                <Checkbox label="Relapse themes" checked={edits.havenProfile.relapseThemes} onChange={(c) => setHaven("relapseThemes", c)} testId="haven-relapseThemes" />
                <Checkbox label="Craving triggers" checked={edits.havenProfile.cravingTriggers} onChange={(c) => setHaven("cravingTriggers", c)} testId="haven-cravingTriggers" />
                <Checkbox label="Grounding-friendly" checked={edits.havenProfile.groundingFriendly} onChange={(c) => setHaven("groundingFriendly", c)} testId="haven-groundingFriendly" />
                <Checkbox label="Panic-friendly" checked={edits.havenProfile.panicFriendly} onChange={(c) => setHaven("panicFriendly", c)} testId="haven-panicFriendly" />
              </div>
              </div>
            )}

            {edits.specializedProfile === "none" && (
              <p className="text-xs text-gray-500" data-testid="specialized-profile-none-empty">
                {SPECIALIZED_PROFILE_NONE_EMPTY}
              </p>
            )}

            {edits.specializedProfile === "custom" && (
              <p className="text-xs text-gray-500 italic" data-testid="custom-app-tags-postponed">
                {CUSTOM_APP_TAGS_POSTPONED}
              </p>
            )}

            {edits.specializedProfile !== "none" &&
              edits.specializedProfile !== "haven" &&
              edits.specializedProfile !== "custom" && (
                <p className="text-xs text-gray-500 italic" data-testid="profile-coming-soon">
                  {PROFILE_COMING_SOON}
                </p>
              )}
          </div>
        )}
      </section>
    </div>
  );
}
