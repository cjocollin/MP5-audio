import { useId, useRef, useState } from "react";
import {
  FORMAT_COMPARISON_TABLE,
  rowsForCompareView,
  type FormatComparisonRow,
  type Mp5CompareView,
} from "../lib/formatComparison";
import { usePlayerStore } from "../store/playerStore";

/** Public About columns — focused subset of the shared table payload. */
const ABOUT_COMPARE_COLUMNS = [
  { key: "format", label: "Format" },
  { key: "type", label: "Type" },
  { key: "bitExact", label: "Fidelity" },
  { key: "ratioVsWav", label: "Size vs WAV/PCM" },
  { key: "use", label: "Typical use" },
] as const;

const COMPARE_VIEWS: Mp5CompareView[] = ["peers", "modes", "legacy"];

function sizeVsWavDisplay(row: FormatComparisonRow): {
  text: string;
  pending: boolean;
} {
  const { measured } = row;
  if (measured.status === "pending" || measured.ratioVsWavLabel.includes("{{")) {
    return { text: "Pending measurement", pending: true };
  }
  return { text: measured.ratioVsWavLabel, pending: false };
}

type ModeId = "l" | "c2" | "c6" | "h" | "c" | "pcm";

const SPECTRUM_MODES: { id: ModeId; label: string; short: string }[] = [
  { id: "l", label: "MP5-L v4 (default)", short: "L" },
  { id: "c2", label: "MP5-C2", short: "C2" },
  { id: "c6", label: "MP5-C v6", short: "C6" },
  { id: "h", label: "MP5-H", short: "H" },
  { id: "c", label: "MP5-C classic", short: "C" },
  { id: "pcm", label: "PCM", short: "PCM" },
];

const SECONDARY_MODES: {
  id: Exclude<ModeId, "l">;
  name: string;
  tag: string;
  body: string;
}[] = [
  {
    id: "c2",
    name: "MP5-C2",
    tag: "Lossless · bit-exact · lab",
    body: "Bit-exact. Quiet, fragile, and tail passages use MP5-L; loud units take whichever is smaller — a signal-relative base plus lossless CORR, or plain MP5-L. A fresh real-music remeasure put it at 0.77x PCM but about 1.07x MP5-L v4, so it is slightly larger than MP5-L rather than smaller: MP5-L v4 stays the recommended export and C2 sits under the Converter's lab / advanced toggle. Batch export stays MP5-L. Distinct from classic MP5-C. The MDCT loud path is lab measurement only and is never what a CodecId 5 export contains.",
  },
  {
    id: "c6",
    name: "MP5-C v6",
    tag: "Lossy · beta preview · not default",
    body: "The lossy MDCT codec (CodecId 6, encoder rev 4) with four presets — Low, Standard, High, Extreme. On a 48 kHz real-music reference track, High measured in MP3-320 territory at 314 kbps with quiet-passage noise at or below LAME-320's own dips, and Extreme reached 55 dB SNR at 620 kbps. Quiet, fragile, and decaying-tail passages stay bit-exact MP5-L via protect islands; only those islands are sample-exact — the file as a whole is lossy. Available in the Converter as a beta preview: the bitstream is not frozen, files may not decode in future builds, and MP5-L v4 stays the recommended export — not for archival or distribution. See the measured MP3 preset comparison below.",
  },
  {
    id: "h",
    name: "MP5-H",
    tag: "Experimental hybrid",
    body: "MP5-C base layer plus a lossless CORR correction. Clean when CORR is applied, but files are much larger than MP5-L. Not the default.",
  },
  {
    id: "c",
    name: "MP5-C classic (legacy)",
    tag: "Lab-only",
    body: "Lossy research codec (CodecId 1). May add audible hiss on all presets. Not for normal listening or demos unless you are explicitly showing lab limitations.",
  },
  {
    id: "pcm",
    name: "PCM",
    tag: "Reference / debug",
    body: "Uncompressed samples inside the container. Used when WASM codecs are unavailable or for baseline testing. Not the normal export path.",
  },
];

/**
 * MP5-C v6 vs MP3, measured on one 48 kHz stereo real-music reference track
 * (217.5 s) with encoder rev 4 and libmp3lame. "Quiet noise" is the error
 * level in the softest phrase gap (8.0–8.75 s). MP3's three rates run in
 * order with the MP5-C v6 preset of the matching tier beside each — High sits
 * under MP3 320, which it edges on both fidelity and size on this track.
 * Single-track figures, not a general claim.
 */
const C6_VS_MP3_ROWS: {
  format: string;
  type: string;
  fidelity: string;
  sizeVsWav: string;
  quietNoise: string;
  /** This row wins the metric column within its MP3-vs-C6 tier pairing. */
  betterFidelity?: boolean;
  betterSize?: boolean;
  betterQuiet?: boolean;
}[] = [
  { format: "MP3 128 kbps", type: "Lossy", fidelity: "20.4 dB SNR", sizeVsWav: "0.08x", quietNoise: "−46.9 dB", betterSize: true },
  { format: "MP5-C v6 Low", type: "Lossy · beta", fidelity: "25.6 dB SNR", sizeVsWav: "0.11x", quietNoise: "−52.3 dB", betterFidelity: true, betterQuiet: true },
  { format: "MP3 192 kbps", type: "Lossy", fidelity: "25.7 dB SNR", sizeVsWav: "0.13x", quietNoise: "−52.4 dB", betterSize: true },
  { format: "MP5-C v6 Standard", type: "Lossy · beta", fidelity: "31.9 dB SNR", sizeVsWav: "0.15x", quietNoise: "−58.3 dB", betterFidelity: true, betterQuiet: true },
  { format: "MP3 320 kbps", type: "Lossy", fidelity: "35.7 dB SNR", sizeVsWav: "0.21x", quietNoise: "−72.2 dB" },
  { format: "MP5-C v6 High", type: "Lossy · beta", fidelity: "38.1 dB SNR", sizeVsWav: "0.20x", quietNoise: "−72.5 dB", betterFidelity: true, betterSize: true, betterQuiet: true },
  { format: "MP5-C v6 Extreme", type: "Lossy · beta", fidelity: "55.0 dB SNR", sizeVsWav: "0.40x", quietNoise: "−75.1 dB" },
];

export function AboutMp5Panel() {
  const setActiveTab = usePlayerStore((s) => s.setActiveTab);
  const spectrumLabelId = useId();
  const compareViewId = useId();
  const [selectedMode, setSelectedMode] = useState<ModeId>("l");
  const [compareView, setCompareView] = useState<Mp5CompareView>("peers");
  const modeRefs = useRef<Partial<Record<ModeId, HTMLElement | null>>>({});
  const compareRows = rowsForCompareView(compareView);
  const showModeMethod =
    compareView === "modes" || compareView === "legacy";

  const selectMode = (id: ModeId) => {
    setSelectedMode(id);
    requestAnimationFrame(() => {
      modeRefs.current[id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  return (
    <div className="mp5-about" data-testid="about-mp5-panel">
      <header className="mp5-about-intro">
        <p className="mp5-about-eyebrow">Public Beta</p>
        <h2 className="mp5-about-title">MP5</h2>
        <p className="mp5-about-lede">
          An experimental smart audio container (<code>.mp5</code>) with several codec modes. Research
          prototype — not a finished product codec.
        </p>
        <p className="mp5-about-honesty">
          Does <strong>not</strong> claim to beat MP3, AAC, Opus, or FLAC.
        </p>
        <div className="mp5-about-recommend">
          <div>
            <p className="mp5-about-recommend-label">Recommended</p>
            <p className="mp5-about-recommend-name">MP5-L v4 · lossless</p>
            <p className="mp5-about-recommend-copy">
              Bit-exact export. Decoded PCM matches the source sample-for-sample. Packed Rice +
              multi-mode stereo give modest compression vs raw PCM. Use this for listening, demos, and
              batch export.
            </p>
          </div>
          <button
            type="button"
            className="mp5-about-cta"
            onClick={() => setActiveTab("converter")}
          >
            Open Converter
          </button>
        </div>
      </header>

      <section className="mp5-about-modes" aria-labelledby="mp5-about-modes-heading">
        <div className="mp5-about-modes-head">
          <h3 id="mp5-about-modes-heading">Codec modes</h3>
          <p>One default path. Everything else is optional or lab. Tap a point to inspect a mode.</p>
        </div>

        <div className="mp5-about-spectrum">
          <span className="mp5-about-spectrum-end" id={spectrumLabelId}>
            Default
          </span>
          <div
            className="mp5-about-spectrum-track"
            role="radiogroup"
            aria-labelledby={spectrumLabelId}
          >
            {SPECTRUM_MODES.map((mode) => {
              const selected = selectedMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={mode.label}
                  title={mode.label}
                  className={`mp5-about-spectrum-dot${selected ? " is-active" : ""}`}
                  onClick={() => selectMode(mode.id)}
                >
                  <span className="mp5-about-spectrum-short" aria-hidden="true">
                    {mode.short}
                  </span>
                </button>
              );
            })}
          </div>
          <span className="mp5-about-spectrum-end">Lab / debug</span>
        </div>

        <button
          type="button"
          ref={(el) => {
            modeRefs.current.l = el;
          }}
          className={`mp5-about-mode-featured${selectedMode === "l" ? " is-selected" : ""}`}
          aria-pressed={selectedMode === "l"}
          onClick={() => selectMode("l")}
        >
          <div className="mp5-about-mode-featured-top">
            <span className="mp5-about-mode-featured-name">MP5-L v4</span>
            <span className="mp5-about-pill">Default</span>
          </div>
          <span className="mp5-about-mode-featured-copy">
            Lossless, bit-exact. The only mode this beta recommends for everyday use.
          </span>
        </button>

        <ul className="mp5-about-mode-list">
          {SECONDARY_MODES.map((mode) => {
            const selected = selectedMode === mode.id;
            return (
              <li
                key={mode.id}
                ref={(el) => {
                  modeRefs.current[mode.id] = el;
                }}
              >
                <button
                  type="button"
                  className={`mp5-about-mode-row${selected ? " is-open" : ""}`}
                  aria-expanded={selected}
                  onClick={() => selectMode(selected ? "l" : mode.id)}
                >
                  <span className="mp5-about-mode-name">{mode.name}</span>
                  <span className="mp5-about-mode-tag">{mode.tag}</span>
                  <span className="mp5-about-mode-chevron" aria-hidden="true">
                    {selected ? "−" : "+"}
                  </span>
                </button>
                {selected ? <p className="mp5-about-mode-detail">{mode.body}</p> : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mp5-about-compare" aria-labelledby="mp5-about-c6-heading">
        <div className="mp5-about-compare-head">
          <h3 id="mp5-about-c6-heading">MP5-C v6 vs MP3 — measured</h3>
          <p>
            The four MP5-C v6 presets and MP3's three rates, paired by quality tier — High sits
            under MP3 320, which it edges on both fidelity and size on this track. Measured on one
            48 kHz stereo real-music reference track (encoder rev 4 vs libmp3lame). Single-track
            figures, not a general claim — MP5 does not claim to beat MP3.
          </p>
        </div>
        <div className="mp5-about-compare-scroll">
          <table className="mp5-about-compare-table" data-testid="about-c6-mp3-table">
            <caption className="mp5-about-compare-caption">
              MP3 at 128/192/320 kbps and MP5-C v6's Low/Standard/High/Extreme presets, paired by
              quality tier, measured on the same track
            </caption>
            <thead>
              <tr>
                <th scope="col" className="mp5-about-compare-th">Format</th>
                <th scope="col" className="mp5-about-compare-th">Type</th>
                <th scope="col" className="mp5-about-compare-th">Fidelity</th>
                <th scope="col" className="mp5-about-compare-th">Size vs WAV/PCM</th>
                <th scope="col" className="mp5-about-compare-th">Quiet noise</th>
              </tr>
            </thead>
            <tbody>
              {C6_VS_MP3_ROWS.map((row) => (
                <tr key={row.format}>
                  <th scope="row" className="mp5-about-compare-cell-format">{row.format}</th>
                  <td className="mp5-about-compare-cell-type">{row.type}</td>
                  <td className={`mp5-about-compare-cell-fidelity${row.betterFidelity ? " mp5-about-compare-better" : ""}`}>{row.fidelity}</td>
                  <td className={`mp5-about-compare-cell-size${row.betterSize ? " mp5-about-compare-better" : ""}`}>{row.sizeVsWav}</td>
                  <td className={`mp5-about-compare-cell-use${row.betterQuiet ? " mp5-about-compare-better" : ""}`}>{row.quietNoise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mp5-about-compare-method">
          Fidelity is full-stream SNR against the lossless source; quiet noise is the error level
          in the softest phrase gap (lower is better). Green marks the better figure within each
          tier pairing (Extreme has no MP3 peer). MP5-C v6 is a beta-preview codec: the bitstream
          is not frozen, and only its protect islands are sample-exact. Measured with{" "}
          <code>tools/audio-lab/</code>.
        </p>
      </section>

      <section className="mp5-about-compare" aria-labelledby="mp5-about-compare-heading">
        <div className="mp5-about-compare-head">
          <h3 id="mp5-about-compare-heading">{FORMAT_COMPARISON_TABLE.title}</h3>
          <p>{FORMAT_COMPARISON_TABLE.honestyLead}</p>
        </div>

        <div className="mp5-about-compare-toolbar">
          <label htmlFor={compareViewId} className="mp5-about-compare-label">
            Show
          </label>
          <select
            id={compareViewId}
            className="mp5-about-compare-select"
            value={compareView}
            onChange={(e) => setCompareView(e.target.value as Mp5CompareView)}
          >
            {COMPARE_VIEWS.map((view) => (
              <option key={view} value={view}>
                {FORMAT_COMPARISON_TABLE.viewLabels[view]}
              </option>
            ))}
          </select>
        </div>

        <div className="mp5-about-compare-scroll">
          <table className="mp5-about-compare-table">
            <caption className="mp5-about-compare-caption">
              Format comparison: WAV, FLAC, MP3, MP5-L
              {compareView !== "peers"
                ? ", and selected MP5 modes / legacy variants"
                : ""}{" "}
              versus a WAV/PCM baseline
            </caption>
            <colgroup>
              <col className="mp5-about-compare-col-format" />
              <col className="mp5-about-compare-col-type" />
              <col className="mp5-about-compare-col-fidelity" />
              <col className="mp5-about-compare-col-size" />
              <col className="mp5-about-compare-col-use" />
            </colgroup>
            <thead>
              <tr>
                {ABOUT_COMPARE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`mp5-about-compare-th mp5-about-compare-th-${col.key}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => {
                const size = sizeVsWavDisplay(row);
                const rowClass =
                  row.group === "legacy"
                    ? "mp5-about-compare-legacy"
                    : row.group === "mp5_mode"
                      ? "mp5-about-compare-mode"
                      : undefined;
                return (
                  <tr key={row.id} className={rowClass}>
                    <th scope="row" className="mp5-about-compare-cell-format">
                      {row.format}
                    </th>
                    <td className="mp5-about-compare-cell-type">{row.typeLabel}</td>
                    <td className="mp5-about-compare-cell-fidelity">
                      {row.bitExactLabel}
                    </td>
                    <td
                      className={`mp5-about-compare-cell-size${
                        size.pending ? " mp5-about-compare-pending" : ""
                      }`}
                    >
                      {size.text}
                    </td>
                    <td className="mp5-about-compare-cell-use">{row.typicalUse}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mp5-about-compare-method">{FORMAT_COMPARISON_TABLE.howWeMeasured}</p>
        {showModeMethod ? (
          <p className="mp5-about-compare-method">
            {FORMAT_COMPARISON_TABLE.howWeMeasuredModes}
          </p>
        ) : null}
        <p className="mp5-about-compare-method">{FORMAT_COMPARISON_TABLE.labOnlyNote}</p>
      </section>

      <details className="mp5-about-disclosure">
        <summary>What the player can do</summary>
        <div className="mp5-about-disclosure-body">
          <p>
            Metadata, cover art, lyrics, waveform/seek, VISU themes, and a{" "}
            <strong>local library</strong> stored in this browser only.
          </p>
          <p>
            <strong>Experimental:</strong> user/artist-provided stems, batch stem import, karaoke when
            stems + synced lyrics are present, and manifest/embedded <code>.mp5p</code> album
            packages. There is <strong>no AI stem separation</strong>.
          </p>
        </div>
      </details>

      <details className="mp5-about-disclosure">
        <summary>Install, privacy &amp; docs</summary>
        <div className="mp5-about-disclosure-body">
          <p>
            Primary target is a <strong>web app / PWA</strong> (install from the browser on HTTPS or
            localhost). Desktop (Tauri) and mobile (Capacitor) are packaging scaffolds only — not
            production store apps yet.
          </p>
          <p>
            Audio stays on this device. No telemetry, upload, or cloud sync from the reference app.
            Offline UI/codecs can cache after first load; full offline conversion of all formats is not
            guaranteed.
          </p>
          <p className="mp5-about-docs">
            Docs: <code>docs/MP5_DEMO_GUIDE.md</code>, <code>docs/MP5_BETA_READINESS.md</code>,{" "}
            <code>docs/MP5_CODEC_STATUS.md</code>, <code>docs/MP5_INSTALL_GUIDE.md</code>
            <br />
            Verify: <code>pnpm beta:check</code>
          </p>
        </div>
      </details>
    </div>
  );
}
