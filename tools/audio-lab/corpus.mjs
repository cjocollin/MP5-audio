#!/usr/bin/env node
// Corpus registration, verify, and held-out seal for MP5 real-music benches.
//
//   node tools/audio-lab/corpus.mjs verify
//   node tools/audio-lab/corpus.mjs status
//   node tools/audio-lab/corpus.mjs register   # rebuild hashes from on-disk files
//
// Held-out material is unusable by tuning commands unless --allow-held-out is
// passed with --held-out-reason <text>. The flag is recorded in every artifact.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { probeAudio } from "./pcm.mjs";
import { REPO_ROOT } from "./wasm.mjs";

const CORPUS_DIR = join(REPO_ROOT, "benchmarks", "real-music", "corpus");
const MANIFEST_PATH = join(CORPUS_DIR, "corpus-manifest.json");
const TARGET_DEV = 30;
const TARGET_HELD_OUT = 20;

export { CORPUS_DIR, MANIFEST_PATH, TARGET_DEV, TARGET_HELD_OUT };

function normRel(p) {
  return String(p).replace(/\\/g, "/");
}

export function loadManifest(path = MANIFEST_PATH) {
  if (!existsSync(path)) {
    throw new Error(
      `corpus manifest missing: ${path}\nRun: node tools/audio-lab/corpus.mjs register`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function corpusAbsolutePath(track, corpusDir = CORPUS_DIR) {
  return join(corpusDir, ...normRel(track.relativePath).split("/"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walkAudioFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkAudioFiles(p, acc);
    else if (/\.(flac|wav)$/i.test(name)) acc.push(p);
  }
  return acc;
}

function roleForRelative(rel) {
  const n = normRel(rel);
  if (n.startsWith("held-out/") || n.startsWith("speech-held-out/")) {
    return "held-out";
  }
  return "dev";
}

function tagsForRelative(rel) {
  const n = normRel(rel).toLowerCase();
  const tags = [];
  if (
    n.startsWith("speech-held-out/") ||
    n.includes("hades_ch") ||
    n.includes("hades_full")
  ) {
    tags.push("speech");
  }
  if (n.includes("kpop")) tags.push("k-pop");
  if (n.includes("edm") || n.includes("illenium")) tags.push("edm");
  if (n.includes("hiphop") || n.includes("nicki")) tags.push("hip-hop");
  if (n.includes("britney")) tags.push("pop");
  if (n.includes("bellion") || n.includes("altpop") || n.includes("origami")) {
    tags.push("alt-pop");
  }
  if (n.includes("hades") && !n.startsWith("speech-held-out/")) {
    tags.push("alt-indie");
  }
  if (n.includes("seg_") || n === "origami_full.flac") {
    tags.push("tuning-master");
  }
  if (n.includes("sparse") || n.includes("quiet")) tags.push("sparse-quiet");
  if (tags.length === 0) tags.push("unclassified");
  return [...new Set(tags)];
}

function stableId(rel) {
  return normRel(rel)
    .replace(/\.(flac|wav)$/i, "")
    .replace(/[^a-zA-Z0-9_/.-]+/g, "_");
}

/** Rebuild machine-readable manifest from files currently on disk. */
export function registerCorpus({ corpusDir = CORPUS_DIR, outPath = MANIFEST_PATH } = {}) {
  const files = walkAudioFiles(corpusDir);
  const tracks = [];
  for (const abs of files) {
    const rel = normRel(relative(corpusDir, abs));
    const meta = probeAudio(abs);
    const role = roleForRelative(rel);
    tracks.push({
      id: stableId(rel),
      role,
      relativePath: rel,
      sha256: sha256File(abs),
      sampleRate: meta.sampleRate,
      bitDepth: meta.bitDepth,
      channels: meta.channels,
      durationSec: Math.round(meta.durationSec * 1000) / 1000,
      tags: tagsForRelative(rel),
      bytes: statSync(abs).size,
    });
  }
  tracks.sort((a, b) => a.id.localeCompare(b.id));
  const nDev = tracks.filter((t) => t.role === "dev").length;
  const nHeld = tracks.filter((t) => t.role === "held-out").length;
  const manifest = {
    manifestId: "mp5-real-music-corpus-v1",
    version: 1,
    createdAt: new Date().toISOString().slice(0, 10),
    targets: { dev: TARGET_DEV, heldOut: TARGET_HELD_OUT },
    counts: { dev: nDev, heldOut: nHeld, total: tracks.length },
    shortfall: {
      dev: Math.max(0, TARGET_DEV - nDev),
      heldOut: Math.max(0, TARGET_HELD_OUT - nHeld),
      note:
        "Do not fabricate entries. Gap is visible until more legal local tracks are registered.",
    },
    policy: {
      heldOutSealed: true,
      heldOutRequiresFlag: "--allow-held-out",
      neverUseHeldOutForTuning: true,
    },
    tracks,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  // Keep a human pointer in CORPUS_MANIFEST.md (benchmarks/, not docs/).
  writeCorpusMarkdown(manifest, join(corpusDir, "CORPUS_MANIFEST.md"));
  // Refresh HELD_OUT_HASHES.txt from held-out role only (music + speech).
  const hashLines = tracks
    .filter((t) => t.role === "held-out")
    .map((t) => `${t.sha256}  ${t.relativePath}`);
  writeFileSync(
    join(corpusDir, "HELD_OUT_HASHES.txt"),
    `# UTF-8 hash freeze — generated by tools/audio-lab/corpus.mjs register\n${hashLines.join("\n")}\n`,
    "utf8",
  );
  return manifest;
}

function writeCorpusMarkdown(manifest, path) {
  const md = `# MP5 real-music corpus freeze

Machine-readable source of truth: [\`corpus-manifest.json\`](./corpus-manifest.json)
(\`manifestId\`: \`${manifest.manifestId}\`).

## Targets vs registered

| Role | Target | Registered | Shortfall |
|------|-------:|-----------:|----------:|
| dev | ${manifest.targets.dev} | ${manifest.counts.dev} | ${manifest.shortfall.dev} |
| held-out | ${manifest.targets.heldOut} | ${manifest.counts.heldOut} | ${manifest.shortfall.heldOut} |

## Policy

- **Held-out is sealed.** Tuning commands must not consume \`role: held-out\` tracks
  unless \`--allow-held-out\` is passed with an explicit \`--held-out-reason\`.
- Verify on disk: \`node tools/audio-lab/corpus.mjs verify\`
- Rebuild hashes after adding local files: \`node tools/audio-lab/corpus.mjs register\`
- Audio files remain git-ignored; only the manifest + hash list are committed.

## Layout

| Role | Path |
|------|------|
| **dev** | corpus root (\`origami_*.flac\`), \`tuning/\` |
| **held-out** | \`held-out/\`, \`speech-held-out/\` |
`;
  writeFileSync(path, md, "utf8");
}

/**
 * Check on-disk files against the manifest.
 * @returns {{ ok: boolean, missing: string[], changed: string[], extra: string[], summary: object }}
 */
export function verifyCorpus({ corpusDir = CORPUS_DIR, manifestPath = MANIFEST_PATH } = {}) {
  const manifest = loadManifest(manifestPath);
  const missing = [];
  const changed = [];
  const okTracks = [];
  const expected = new Set();

  for (const t of manifest.tracks) {
    const abs = corpusAbsolutePath(t, corpusDir);
    expected.add(normRel(t.relativePath));
    if (!existsSync(abs)) {
      missing.push(t.relativePath);
      continue;
    }
    const hash = sha256File(abs);
    if (hash !== t.sha256) {
      changed.push({ id: t.id, relativePath: t.relativePath, expected: t.sha256, actual: hash });
    } else {
      okTracks.push(t.id);
    }
  }

  const onDisk = walkAudioFiles(corpusDir).map((p) =>
    normRel(relative(corpusDir, p)),
  );
  const extra = onDisk.filter((r) => !expected.has(r));

  const ok = missing.length === 0 && changed.length === 0;
  return {
    ok,
    manifestId: manifest.manifestId,
    counts: manifest.counts,
    shortfall: manifest.shortfall,
    verified: okTracks.length,
    missing,
    changed,
    extra,
    summary: {
      ok,
      verified: okTracks.length,
      missing: missing.length,
      changed: changed.length,
      extra: extra.length,
      shortfallDev: manifest.shortfall.dev,
      shortfallHeldOut: manifest.shortfall.heldOut,
    },
  };
}

/**
 * Held-out seal. Throws unless allowHeldOut + reason provided.
 * Returns a seal record to embed in artifacts.
 */
export function assertCorpusAccess(tracks, opts = {}) {
  const held = tracks.filter((t) => t.role === "held-out" || t.heldOut === true);
  if (held.length === 0) {
    return {
      heldOutUsed: false,
      allowHeldOut: false,
      reason: null,
      heldOutIds: [],
    };
  }
  if (!opts.allowHeldOut) {
    throw new Error(
      `Held-out corpus is sealed (${held.length} track(s): ${held
        .map((t) => t.id)
        .slice(0, 5)
        .join(", ")}${held.length > 5 ? "…" : ""}). ` +
        `Pass --allow-held-out --held-out-reason "<why>" for RC evaluation only. ` +
        `Never use held-out for psychoacoustic tuning.`,
    );
  }
  const reason = String(opts.heldOutReason ?? "").trim();
  if (!reason) {
    throw new Error(
      "--allow-held-out requires --held-out-reason <non-empty text> (recorded in the artifact).",
    );
  }
  console.error(
    `WARNING: consuming held-out corpus (${held.length} track(s)). Reason: ${reason}`,
  );
  return {
    heldOutUsed: true,
    allowHeldOut: true,
    reason,
    heldOutIds: held.map((t) => t.id),
  };
}

/** Resolve track ids / roles into absolute paths with seal enforcement. */
export function resolveTracks(selector = {}, opts = {}) {
  const manifest = opts.manifest ?? loadManifest();
  let tracks = [...manifest.tracks];
  if (selector.role === "dev") tracks = tracks.filter((t) => t.role === "dev");
  else if (selector.role === "held-out") {
    tracks = tracks.filter((t) => t.role === "held-out");
  }
  if (selector.ids?.length) {
    const want = new Set(selector.ids);
    tracks = tracks.filter((t) => want.has(t.id));
  }
  if (selector.tags?.length) {
    tracks = tracks.filter((t) =>
      selector.tags.some((tag) => (t.tags ?? []).includes(tag)),
    );
  }
  const seal = assertCorpusAccess(tracks, opts);
  const resolved = tracks
    .map((t) => ({
      ...t,
      absolutePath: corpusAbsolutePath(t, opts.corpusDir ?? CORPUS_DIR),
    }))
    .filter((t) => existsSync(t.absolutePath));
  return { manifest, tracks: resolved, seal };
}

function parseArgs(argv) {
  const out = {
    _: [],
    allowHeldOut: false,
    heldOutReason: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--allow-held-out") out.allowHeldOut = true;
    else if (a === "--held-out-reason") out.heldOutReason = argv[++i];
    else out._.push(a);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] ?? "status";
  if (cmd === "register") {
    const m = registerCorpus();
    console.log(
      JSON.stringify(
        {
          manifestId: m.manifestId,
          counts: m.counts,
          shortfall: m.shortfall,
          path: MANIFEST_PATH,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (cmd === "verify") {
    const r = verifyCorpus();
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exit(1);
    if (r.extra.length) {
      console.error(
        `Note: ${r.extra.length} on-disk file(s) not in manifest (run register to add).`,
      );
    }
    return;
  }
  if (cmd === "status") {
    const m = loadManifest();
    console.log(
      JSON.stringify(
        {
          manifestId: m.manifestId,
          counts: m.counts,
          shortfall: m.shortfall,
          targets: m.targets,
          policy: m.policy,
        },
        null,
        2,
      ),
    );
    return;
  }
  // Self-check: resolving held-out without flag must throw.
  if (cmd === "guard-selftest") {
    const m = loadManifest();
    const held = m.tracks.filter((t) => t.role === "held-out").slice(0, 1);
    let blocked = false;
    try {
      assertCorpusAccess(held, { allowHeldOut: false });
    } catch {
      blocked = true;
    }
    if (!blocked) {
      console.error("GUARD FAILED: held-out was allowed without flag");
      process.exit(1);
    }
    const seal = assertCorpusAccess(held, {
      allowHeldOut: true,
      heldOutReason: "guard-selftest",
    });
    console.log(JSON.stringify({ blockedWithoutFlag: true, seal }, null, 2));
    return;
  }
  console.error(`Unknown corpus command: ${cmd}`);
  process.exit(2);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    join(process.argv[1]).replace(/\//g, "\\") ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("tools/audio-lab/corpus.mjs");

if (isMain) {
  try {
    main();
  } catch (e) {
    console.error(e.message ?? e);
    process.exit(1);
  }
}
