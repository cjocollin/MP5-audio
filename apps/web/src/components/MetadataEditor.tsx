import { useRef, useState } from "react";
import { MAX_COVER_SIZE, type CoverArt } from "@mp5/container";
import {
  appendTagInput,
  MOOD_TAG_SUGGESTIONS,
  VIBE_TAG_SUGGESTIONS,
  VISU_INTENSITY_OPTIONS,
  VISU_STYLE_OPTIONS,
  type ManualMetadataEdits,
} from "../converter/manualMetadata";
import { parseSyncedLyricsText } from "../lib/lyrics/lyrcTimestampParser";
import { parseSectionsText, parseHighlightsText } from "../lib/sections/sectionParser";
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
  VISUAL_THEME_HELP,
  CREDITS_HELP,
  RIGHTS_HELP,
  IDENTIFIERS_HELP,
  type SpecializedProfileId,
} from "../lib/metadataLabels";
import type { ManualCrdtEdits, ManualLicnEdits, ManualIdenEdits, TriStateEdit } from "../lib/creditsRights/textFormat";

interface Props {
  edits: ManualMetadataEdits;
  onChange: (edits: ManualMetadataEdits) => void;
  coverError?: string;
  onCoverError: (msg: string) => void;
}

function SectionsParseNote({ text }: { text: string }) {
  const { sections, errors } = parseSectionsText(text);
  if (errors.length) {
    return (
      <p className="text-xs text-amber-200/90" data-testid="sections-parse-error">
        {errors[0]}
        {errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}
      </p>
    );
  }
  return (
    <p className="text-xs text-gray-600" data-testid="sections-parse-ok">
      {sections.length} section{sections.length === 1 ? "" : "s"} ready for export
    </p>
  );
}

function HighlightsParseNote({ text }: { text: string }) {
  const { highlights, errors } = parseHighlightsText(text);
  if (errors.length) {
    return (
      <p className="text-xs text-amber-200/90" data-testid="highlights-parse-error">
        {errors[0]}
      </p>
    );
  }
  return (
    <p className="text-xs text-gray-600" data-testid="highlights-parse-ok">
      {highlights.length} highlight{highlights.length === 1 ? "" : "s"} ready for export
    </p>
  );
}

function SyncedLyricsParseNote({ text }: { text: string }) {
  const { lines, errors } = parseSyncedLyricsText(text);
  if (errors.length) {
    return (
      <p className="text-xs text-amber-200/90" data-testid="lyrics-synced-parse-error">
        {errors[0]}
        {errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}
      </p>
    );
  }
  return (
    <p className="text-xs text-gray-600" data-testid="lyrics-synced-parse-ok">
      {lines.length} synced line{lines.length === 1 ? "" : "s"} ready for export
    </p>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-300">{title}</p>
      {hint && <p className="text-[10px] text-gray-600 mt-0.5">{hint}</p>}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  testId,
  hint,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
  hint?: string;
  rows?: number;
}) {
  return (
    <label className="block text-xs">
      <span className="text-gray-500">{label}</span>
      {hint && <span className="block text-[10px] text-gray-600">{hint}</span>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5 font-mono"
        data-testid={testId}
      />
    </label>
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

const TRI_STATE_OPTIONS: { id: TriStateEdit; label: string }[] = [
  { id: "", label: "(not set)" },
  { id: "true", label: "Yes" },
  { id: "false", label: "No" },
  { id: "unknown", label: "Unknown" },
];

export function MetadataEditor({ edits, onChange, coverError, onCoverError }: Props) {
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [rightsOpen, setRightsOpen] = useState(false);
  const [identifiersOpen, setIdentifiersOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const setCredits = (patch: Partial<ManualCrdtEdits>) => {
    onChange({ ...edits, credits: { ...edits.credits, ...patch } });
  };
  const setRights = (patch: Partial<ManualLicnEdits>) => {
    onChange({ ...edits, rights: { ...edits.rights, ...patch } });
  };
  const setIdentifiers = (patch: Partial<ManualIdenEdits>) => {
    onChange({ ...edits, identifiers: { ...edits.identifiers, ...patch } });
  };

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
        <SectionHeader
          title={SECTION.lyrics}
          hint="Optional — unsynced and/or synced (manual timestamps). No AI lyric generation."
        />
        <label className="block text-xs text-gray-500">Unsynced lyrics</label>
        <textarea
          value={edits.lyricsUnsynced}
          onChange={(e) => onChange({ ...edits, lyricsUnsynced: e.target.value })}
          rows={4}
          placeholder="Plain lyrics text…"
          className="w-full bg-surface rounded px-2 py-1 text-gray-200 text-sm border border-white/5 font-sans"
          data-testid="lyrics-unsynced"
        />
        <label className="block text-xs text-gray-500">Synced lyrics (optional)</label>
        <textarea
          value={edits.lyricsSyncedText}
          onChange={(e) => onChange({ ...edits, lyricsSyncedText: e.target.value })}
          rows={5}
          placeholder={"[00:12.50] First line\n[00:15.20|Chorus] Next line"}
          className="w-full bg-surface rounded px-2 py-1 text-gray-200 text-sm border border-white/5 font-mono text-[11px]"
          data-testid="lyrics-synced-input"
        />
        {edits.lyricsSyncedText.trim() && (
          <SyncedLyricsParseNote text={edits.lyricsSyncedText} />
        )}
        <Field
          label="Source label (optional)"
          value={edits.lyricsSource}
          onChange={(v) => onChange({ ...edits, lyricsSource: v })}
          testId="lyrics-source"
        />
      </section>

      <section className="space-y-2" data-testid="sections-editor">
        <SectionHeader
          title="Song sections"
          hint="Optional manual song map — no AI analysis. Format: [start-end|Type] title"
        />
        <textarea
          value={edits.sectionsText}
          onChange={(e) => onChange({ ...edits, sectionsText: e.target.value })}
          rows={5}
          placeholder={
            "[00:00.00-00:12.00|Intro] Opening\n[00:12.00-00:45.00|Verse] Verse 1\n[00:45.00-01:10.00|Chorus] First chorus"
          }
          className="w-full bg-surface rounded px-2 py-1 text-gray-200 text-sm border border-white/5 font-mono text-[11px]"
          data-testid="sections-input"
        />
        {edits.sectionsText.trim() && <SectionsParseNote text={edits.sectionsText} />}
        <label className="block text-xs text-gray-500">Highlights (optional)</label>
        <textarea
          value={edits.highlightsText}
          onChange={(e) => onChange({ ...edits, highlightsText: e.target.value })}
          rows={3}
          placeholder="[00:45.00-01:10.00|chorus] Share clip"
          className="w-full bg-surface rounded px-2 py-1 text-gray-200 text-sm border border-white/5 font-mono text-[11px]"
          data-testid="highlights-input"
        />
        {edits.highlightsText.trim() && <HighlightsParseNote text={edits.highlightsText} />}
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

      <section className="space-y-3" data-testid="section-visual-theme">
        <SectionHeader title={SECTION.visualTheme} hint={VISUAL_THEME_HELP} />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field
            label="Theme name"
            value={edits.visualTheme.themeName}
            onChange={(v) =>
              onChange({ ...edits, visualTheme: { ...edits.visualTheme, themeName: v } })
            }
            testId="visu-theme-name"
          />
          <Field
            label="Mood label"
            value={edits.visualTheme.moodLabel}
            onChange={(v) =>
              onChange({ ...edits, visualTheme: { ...edits.visualTheme, moodLabel: v } })
            }
            testId="visu-mood-label"
          />
          <Field
            label="Primary color (#rrggbb)"
            value={edits.visualTheme.primaryColor}
            onChange={(v) =>
              onChange({ ...edits, visualTheme: { ...edits.visualTheme, primaryColor: v } })
            }
            testId="visu-primary-color"
          />
          <Field
            label="Accent color (#rrggbb)"
            value={edits.visualTheme.accentColor}
            onChange={(v) =>
              onChange({ ...edits, visualTheme: { ...edits.visualTheme, accentColor: v } })
            }
            testId="visu-accent-color"
          />
          <Field
            label="Background color (#rrggbb)"
            value={edits.visualTheme.backgroundColor}
            onChange={(v) =>
              onChange({ ...edits, visualTheme: { ...edits.visualTheme, backgroundColor: v } })
            }
            testId="visu-background-color"
          />
          <label className="block text-xs">
            <span className="text-gray-500">Visual intensity</span>
            <select
              value={edits.visualTheme.visualIntensity}
              onChange={(e) =>
                onChange({
                  ...edits,
                  visualTheme: {
                    ...edits.visualTheme,
                    visualIntensity: e.target.value as ManualMetadataEdits["visualTheme"]["visualIntensity"],
                  },
                })
              }
              className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
              data-testid="visu-intensity"
            >
              {VISU_INTENSITY_OPTIONS.map((o) => (
                <option key={o.id || "default"} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-gray-500">Player style</span>
            <select
              value={edits.visualTheme.playerStyle}
              onChange={(e) =>
                onChange({
                  ...edits,
                  visualTheme: {
                    ...edits.visualTheme,
                    playerStyle: e.target.value as ManualMetadataEdits["visualTheme"]["playerStyle"],
                  },
                })
              }
              className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
              data-testid="visu-player-style"
            >
              {VISU_STYLE_OPTIONS.map((o) => (
                <option key={o.id || "default"} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[10px] text-gray-600">
          Hex colors only. Invalid values are ignored on export. No AI color extraction in this MVP.
        </p>
      </section>

      <section className="rounded-lg border border-white/5 bg-surface/50" data-testid="section-credits">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium text-gray-400 hover:text-gray-200"
          onClick={() => setCreditsOpen((o) => !o)}
          aria-expanded={creditsOpen}
          data-testid="credits-metadata-toggle"
        >
          <span>{SECTION.credits}</span>
          <span className="text-gray-600">{creditsOpen ? "−" : "+"}</span>
        </button>
        {creditsOpen && (
          <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
            <p className="text-[10px] text-gray-600 leading-relaxed">{CREDITS_HELP}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <TextArea label="Primary artist" hint="One name per line" value={edits.credits.primaryArtist} onChange={(v) => setCredits({ primaryArtist: v })} testId="crdt-primary-artist" />
              <TextArea label="Featured artists" hint="One name per line" value={edits.credits.featuredArtists} onChange={(v) => setCredits({ featuredArtists: v })} testId="crdt-featured-artists" />
              <TextArea label="Producer" hint="One name per line" value={edits.credits.producer} onChange={(v) => setCredits({ producer: v })} testId="crdt-producer" />
              <TextArea label="Songwriter" hint="One name per line" value={edits.credits.songwriter} onChange={(v) => setCredits({ songwriter: v })} testId="crdt-songwriter" />
              <TextArea label="Composer" hint="One name per line" value={edits.credits.composer} onChange={(v) => setCredits({ composer: v })} testId="crdt-composer" />
              <TextArea label="Lyricist" hint="One name per line" value={edits.credits.lyricist} onChange={(v) => setCredits({ lyricist: v })} testId="crdt-lyricist" />
              <TextArea label="Mixing engineer" hint="One name per line" value={edits.credits.mixingEngineer} onChange={(v) => setCredits({ mixingEngineer: v })} testId="crdt-mixing" />
              <TextArea label="Mastering engineer" hint="One name per line" value={edits.credits.masteringEngineer} onChange={(v) => setCredits({ masteringEngineer: v })} testId="crdt-mastering" />
              <TextArea label="Recording engineer" hint="One name per line" value={edits.credits.recordingEngineer} onChange={(v) => setCredits({ recordingEngineer: v })} testId="crdt-recording" />
              <TextArea label="Label" hint="One name per line" value={edits.credits.label} onChange={(v) => setCredits({ label: v })} testId="crdt-label" />
              <TextArea label="Publisher" hint="One name per line" value={edits.credits.publisher} onChange={(v) => setCredits({ publisher: v })} testId="crdt-publisher" />
              <TextArea label="Copyright holder" hint="One name per line" value={edits.credits.copyrightHolder} onChange={(v) => setCredits({ copyrightHolder: v })} testId="crdt-copyright-holder" />
            </div>
            <TextArea label="Performers" hint="Name | instrument per line" value={edits.credits.performers} onChange={(v) => setCredits({ performers: v })} testId="crdt-performers" rows={3} />
            <TextArea label="Instruments" hint="One per line" value={edits.credits.instruments} onChange={(v) => setCredits({ instruments: v })} testId="crdt-instruments" />
            <TextArea label="Additional credits" hint="Role: Name1, Name2 per line" value={edits.credits.additionalCredits} onChange={(v) => setCredits({ additionalCredits: v })} testId="crdt-additional" rows={3} />
            <TextArea label="Notes" value={edits.credits.notes} onChange={(v) => setCredits({ notes: v })} testId="crdt-notes" rows={2} />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-white/5 bg-surface/50" data-testid="section-rights">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium text-gray-400 hover:text-gray-200"
          onClick={() => setRightsOpen((o) => !o)}
          aria-expanded={rightsOpen}
          data-testid="rights-metadata-toggle"
        >
          <span>{SECTION.rightsLicense}</span>
          <span className="text-gray-600">{rightsOpen ? "−" : "+"}</span>
        </button>
        {rightsOpen && (
          <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
            <p className="text-[10px] text-gray-600 leading-relaxed">{RIGHTS_HELP}</p>
            <Field label="Copyright notice" value={edits.rights.copyrightNotice} onChange={(v) => setRights({ copyrightNotice: v })} testId="licn-copyright" />
            <Field label="License type" value={edits.rights.licenseType} onChange={(v) => setRights({ licenseType: v })} testId="licn-license-type" />
            <Field label="License URL (https)" value={edits.rights.licenseUrl} onChange={(v) => setRights({ licenseUrl: v })} testId="licn-license-url" />
            <TextArea label="Usage notes" value={edits.rights.usageNotes} onChange={(v) => setRights({ usageNotes: v })} testId="licn-usage-notes" rows={2} />
            <div className="grid sm:grid-cols-3 gap-2">
              {(["remixAllowed", "commercialUseAllowed", "attributionRequired"] as const).map((key) => (
                <label key={key} className="block text-xs">
                  <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                  <select
                    value={edits.rights[key]}
                    onChange={(e) => setRights({ [key]: e.target.value as TriStateEdit })}
                    className="mt-0.5 w-full bg-surface rounded px-2 py-1.5 text-gray-200 text-sm border border-white/5"
                    data-testid={`licn-${key}`}
                  >
                    {TRI_STATE_OPTIONS.map((o) => (
                      <option key={o.id || "unset"} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-white/5 bg-surface/50" data-testid="section-identifiers">
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium text-gray-400 hover:text-gray-200"
          onClick={() => setIdentifiersOpen((o) => !o)}
          aria-expanded={identifiersOpen}
          data-testid="identifiers-metadata-toggle"
        >
          <span>{SECTION.releaseIdentifiers}</span>
          <span className="text-gray-600">{identifiersOpen ? "−" : "+"}</span>
        </button>
        {identifiersOpen && (
          <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
            <p className="text-[10px] text-gray-600 leading-relaxed">{IDENTIFIERS_HELP}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="ISRC" value={edits.identifiers.isrc} onChange={(v) => setIdentifiers({ isrc: v })} testId="iden-isrc" />
              <Field label="UPC" value={edits.identifiers.upc} onChange={(v) => setIdentifiers({ upc: v })} testId="iden-upc" />
              <Field label="EAN" value={edits.identifiers.ean} onChange={(v) => setIdentifiers({ ean: v })} testId="iden-ean" />
              <Field label="Catalog number" value={edits.identifiers.catalogNumber} onChange={(v) => setIdentifiers({ catalogNumber: v })} testId="iden-catalog" />
              <Field label="Release ID" value={edits.identifiers.releaseId} onChange={(v) => setIdentifiers({ releaseId: v })} testId="iden-release-id" />
              <Field label="Distributor" value={edits.identifiers.distributor} onChange={(v) => setIdentifiers({ distributor: v })} testId="iden-distributor" />
              <Field label="Release date" value={edits.identifiers.releaseDate} onChange={(v) => setIdentifiers({ releaseDate: v })} testId="iden-release-date" />
              <Field label="Original release date" value={edits.identifiers.originalReleaseDate} onChange={(v) => setIdentifiers({ originalReleaseDate: v })} testId="iden-original-release" />
              <Field label="Artist URL" value={edits.identifiers.artistUrl} onChange={(v) => setIdentifiers({ artistUrl: v })} testId="iden-artist-url" />
              <Field label="Album URL" value={edits.identifiers.albumUrl} onChange={(v) => setIdentifiers({ albumUrl: v })} testId="iden-album-url" />
              <Field label="Source URL" value={edits.identifiers.sourceUrl} onChange={(v) => setIdentifiers({ sourceUrl: v })} testId="iden-source-url" />
            </div>
          </div>
        )}
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
