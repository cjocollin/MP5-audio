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
    body: "The lossy MDCT codec (CodecId 6, encoder rev 7) with four presets — Low, Standard, High, Extreme — plus matched-rate ABR control. On one 48 kHz stereo real-music reference track, the shipping browser/WASM encoder beat the LAME anchors on full-stream SNR at all three matched rates while preserving quieter phrase gaps; see the measured comparison below. Quiet, fragile, and decaying-tail passages stay bit-exact MP5-L via protect islands; only those islands are sample-exact — the file as a whole is lossy. Available in the Converter as a beta preview: the bitstream is not frozen, files may not decode in future builds, and MP5-L v4 stays the recommended export — not for archival or distribution.",
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
 * (217.5 s) with shipping browser/WASM encoder rev 7 and libmp3lame. "Quiet noise" is the
 * error level in the softest phrase gap (8.0–8.75 s). Each MP5-C v6 ABR row
 * sits beside MP3 at the same nominal rate. Single-track figures, not a
 * general claim.
 */
const C6_VS_MP3_ROWS: {
  format: string;
  measuredRate: string;
  fidelity: string;
  sizeVsWav: string;
  quietNoise: string;
  /** This row wins the metric column within its matched-rate pair. */
  betterFidelity?: boolean;
  betterSize?: boolean;
  betterQuiet?: boolean;
}[] = [
  { format: "MP3 128 kbps", measuredRate: "128 kbps", fidelity: "20.4 dB SNR", sizeVsWav: "0.083x", quietNoise: "−46.9 dB" },
  { format: "MP5-C v6 ABR 128", measuredRate: "127.97 kbps", fidelity: "20.6 dB SNR", sizeVsWav: "0.083x", quietNoise: "−50.5 dB", betterFidelity: true, betterQuiet: true },
  { format: "MP3 192 kbps", measuredRate: "192 kbps", fidelity: "25.7 dB SNR", sizeVsWav: "0.125x", quietNoise: "−52.4 dB" },
  { format: "MP5-C v6 ABR 192", measuredRate: "191.95 kbps", fidelity: "26.3 dB SNR", sizeVsWav: "0.125x", quietNoise: "−60.1 dB", betterFidelity: true, betterQuiet: true },
  { format: "MP3 320 kbps", measuredRate: "320 kbps", fidelity: "35.7 dB SNR", sizeVsWav: "0.208x", quietNoise: "−72.2 dB" },
  { format: "MP5-C v6 ABR 320", measuredRate: "318.85 kbps", fidelity: "35.9 dB SNR", sizeVsWav: "0.208x", quietNoise: "−72.8 dB", betterFidelity: true, betterQuiet: true },
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
            MP5-C v6 ABR and MP3 at the same nominal 128/192/320 kbps rates. Measured on one 48 kHz
            stereo real-music reference track (shipping browser/WASM encoder rev 7 vs libmp3lame).
            At 128 kbps, MP5-C v6 reached 20.6 dB SNR versus MP3's 20.4 dB and kept
            the quieter phrase gap.
            Single-track figures, not a general claim — MP5 does not claim to beat MP3 broadly.
          </p>
        </div>
        <div className="mp5-about-compare-scroll">
          <table className="mp5-about-compare-table" data-testid="about-c6-mp3-table">
            <caption className="mp5-about-compare-caption">
              MP3 and MP5-C v6 ABR at matched 128/192/320 kbps targets, measured on the same track
            </caption>
            <thead>
              <tr>
                <th scope="col" className="mp5-about-compare-th">Format</th>
                <th scope="col" className="mp5-about-compare-th">Measured rate</th>
                <th scope="col" className="mp5-about-compare-th">Fidelity</th>
                <th scope="col" className="mp5-about-compare-th">Size vs WAV/PCM</th>
                <th scope="col" className="mp5-about-compare-th">Quiet noise</th>
              </tr>
            </thead>
            <tbody>
              {C6_VS_MP3_ROWS.map((row) => (
                <tr key={row.format}>
                  <th scope="row" className="mp5-about-compare-cell-format">{row.format}</th>
                  <td className="mp5-about-compare-cell-type">{row.measuredRate}</td>
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
          matched-rate pair. MP5-C v6 is a beta-preview codec: the bitstream is not frozen, and only
          its protect islands are sample-exact. Rev 7 figures are shipping browser/WASM lab results;
          the unsealed dev-plus-killer rate/size gates passed at all three targets. Measured with{" "}
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
