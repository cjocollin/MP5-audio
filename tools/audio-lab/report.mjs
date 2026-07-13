// MP5 Audio Quality Lab — report writers (JSON + CSV + Markdown).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function fmt(v, digits = 3) {
  if (v === null || v === undefined) return "—";
  if (v === "inf" || v === Infinity) return "bit-exact";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    return v.toFixed(digits);
  }
  return String(v);
}

function snr(v) {
  if (v === null || v === undefined) return "—";
  if (v === "inf") return "∞ (bit-exact)";
  return typeof v === "number" ? v.toFixed(1) : String(v);
}

const CSV_COLUMNS = [
  "fixture", "category", "mode", "bytes", "ratioVsPcm", "encodeMs", "decodeMs",
  "bitExact", "fullSnrDb", "quietWindowSnrDb", "worst1sSnrDb", "rmsError", "peakError",
  "noiseFloorDbfs", "clippingCount", "stereoCorrError", "hfErrorRms",
  "silenceResidualPeak", "silenceResidualRms", "durationMatch",
];

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function writeCsv(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      CSV_COLUMNS.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return "";
        if (v === "inf") return "inf";
        return typeof v === "number" ? v : String(v).replace(/,/g, ";");
      }).join(","),
    );
  }
  writeFileSync(path, lines.join("\n") + "\n");
}

export function writeMarkdown(path, { title, generatedAt, rows, notes }) {
  mkdirSync(dirname(path), { recursive: true });
  let md = `# ${title}\n\n`;
  md += `_Generated ${generatedAt} by \`tools/audio-lab\`. Synthetic fixtures only — no copyrighted audio._\n\n`;
  md += "> **Reading these numbers honestly:** full-song SNR alone is misleading — a loud signal hides quiet-passage noise. ";
  md += "Judge MP5-C/MP5-H by **quiet-window SNR**, **silence residual**, and **worst-1s SNR**, not full-song SNR.\n\n";

  // group rows by fixture
  const byFixture = new Map();
  for (const r of rows) {
    if (!byFixture.has(r.fixture)) byFixture.set(r.fixture, []);
    byFixture.get(r.fixture).push(r);
  }

  md += "## Per-fixture results\n\n";
  for (const [fixture, frows] of byFixture) {
    md += `### ${fixture} (${frows[0].category})\n\n`;
    md += "| Mode | Bytes | ×PCM | enc ms | dec ms | Bit-exact | Full SNR | Quiet SNR | Worst-1s | Silence pk | Clip |\n";
    md += "|------|------:|-----:|-------:|-------:|:---------:|---------:|----------:|---------:|-----------:|-----:|\n";
    for (const r of frows) {
      md += `| ${r.mode} | ${r.bytes} | ${fmt(r.ratioVsPcm, 3)} | ${fmt(r.encodeMs, 1)} | ${fmt(r.decodeMs, 1)} | `;
      md += `${r.bitExact ? "✅" : "—"} | ${snr(r.fullSnrDb)} | ${snr(r.quietWindowSnrDb)} | ${snr(r.worst1sSnrDb)} | `;
      md += `${r.silenceResidualPeak === null || r.silenceResidualPeak === undefined ? "—" : r.silenceResidualPeak} | ${r.clippingCount} |\n`;
    }
    md += "\n";
  }

  if (notes && notes.length) {
    md += "## Notes\n\n";
    for (const n of notes) md += `- ${n}\n`;
    md += "\n";
  }
  md += "---\n*MP5 Audio Quality Lab — quality before compression.*\n";
  writeFileSync(path, md);
}

/** Aggregate quality-report: per-mode summary + honest verdicts. */
export function writeQualityReport(path, { generatedAt, rows }) {
  mkdirSync(dirname(path), { recursive: true });
  const modes = [...new Set(rows.map((r) => r.mode))];

  let md = "# MP5 Codec Quality Report\n\n";
  md += `_Generated ${generatedAt}. Synthetic fixtures only. No telemetry, no copyrighted audio._\n\n`;
  md += "## Per-mode aggregate\n\n";
  md += "Bit-exact = identical samples **and** identical length. Content-exact = every overlapping sample matches ";
  md += "(raw stream may be frame-padded; the container trims to `totalSamples`, so frame padding is not playback drift).\n\n";
  md += "| Mode | Avg ×PCM | Bit-exact | Content-exact | Min quiet-window SNR | Max silence residual (pk) | Clipping |\n";
  md += "|------|---------:|:---------:|:-------------:|---------------------:|--------------------------:|:--------:|\n";

  for (const mode of modes) {
    const allRows = rows.filter((r) => r.mode === mode);
    const ratios = allRows.map((r) => r.ratioVsPcm).filter((v) => typeof v === "number");
    const avgRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
    const bitExactCount = allRows.filter((r) => r.bitExact).length;
    const contentExactCount = allRows.filter((r) => r.contentBitExact).length;
    const quietSnrs = allRows.map((r) => r.quietWindowSnrDb).filter((v) => typeof v === "number");
    const minQuiet = quietSnrs.length ? Math.min(...quietSnrs) : null;
    const silenceResiduals = allRows.map((r) => r.silenceResidualPeak).filter((v) => typeof v === "number");
    const maxSilence = silenceResiduals.length ? Math.max(...silenceResiduals) : null;
    const anyClip = allRows.some((r) => r.clippingCount > 0);
    md += `| ${mode} | ${avgRatio === null ? "—" : avgRatio.toFixed(3)} | ${bitExactCount}/${allRows.length} | ${contentExactCount}/${allRows.length} | `;
    md += `${minQuiet === null ? "—" : minQuiet.toFixed(1)} | ${maxSilence === null ? "—" : maxSilence} | `;
    md += `${anyClip ? "⚠️ yes" : "no"} |\n`;
  }

  md += "\n## Honest verdicts\n\n";
  md += verdicts(rows);
  md += "\n---\n*MP5 Audio Quality Lab. MP5-L stays the recommended default. ";
  md += "No claim is made that MP5 beats MP3, AAC, Opus, FLAC or WAV.*\n";
  writeFileSync(path, md);
}

function verdicts(rows) {
  let out = "";
  const lMp5l = rows.filter((r) => r.mode.includes("MP5-L"));
  const lAllExact = lMp5l.every((r) => r.bitExact);
  out += `- **MP5-L:** ${lAllExact ? "bit-exact (samples + length) on every fixture ✅ — remains the recommended default." : "⚠️ NOT bit-exact on some fixtures — investigate before release."}\n`;

  const c2 = rows.filter((r) => r.mode.includes("vNext"));
  if (c2.length) {
    const c2Silence = c2.map((r) => r.silenceResidualPeak).filter((v) => typeof v === "number");
    const maxSil = c2Silence.length ? Math.max(...c2Silence) : 0;
    out += `- **MP5-C vNext (prototype):** silence/quiet blocks fall back to lossless → silence residual peak ≤ ${maxSil}; quiet-window SNR much better than current MP5-C on reverb tails. Lab-only, default OFF, never written to .mp5.\n`;
  }
  out += "- **MP5-C (current):** lossy on every fixture — remains lab-only/experimental. Full-song SNR (26–45 dB) hides quiet-passage hiss; reverb-tail quiet-window SNR drops to ~2–6 dB. Judge by quiet-window + worst-1s SNR.\n";
  out += "- **MP5-H:** content-exact only with the CORR layer applied (raw stream frame-padded; container trims). Larger than MP5-L (often >1× PCM). Not default.\n";
  return out;
}
