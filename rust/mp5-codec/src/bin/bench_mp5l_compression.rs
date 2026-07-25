//! MP5-L compression benchmark vs PCM and FFmpeg FLAC levels 5/8.
//!   cargo run --release -p mp5-codec --features bench_tools --bin bench_mp5l_compression
//!
//! Corpora:
//! - `corpus/held-out/` — independent masters (formal gate / primary)
//! - `corpus/tuning/` + flat `origami_*.flac` — smoke / tuning only
//! - Lab listening + synth — secondary
//! Auto-seeds ORIGAMI slices into corpus root when empty (tuning).

use mp5_codec::mp5l::{self, diag};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

#[derive(Clone)]
struct Pcm {
    name: String,
    kind: &'static str,
    samples: Vec<i16>,
    channels: u8,
    sample_rate: u32,
}

#[derive(Clone)]
struct TrackRow {
    name: String,
    kind: &'static str,
    duration_s: f64,
    pcm_bytes: usize,
    mp5l_v3: usize,
    mp5l_v4: usize,
    flac5: Option<usize>,
    flac8: Option<usize>,
    v3_vs_flac5: Option<f64>,
    v4_vs_flac5: Option<f64>,
    v3_vs_flac8: Option<f64>,
    v4_vs_flac8: Option<f64>,
    ratio_pcm_v3: f64,
    ratio_pcm_v4: f64,
    enc_v3_ms: f64,
    enc_v4_ms: f64,
    bit_exact_v3: bool,
    bit_exact_v4: bool,
    realtime_v3: f64,
    realtime_v4: f64,
    v3_raw_pct: f64,
    v4_raw_pct: f64,
    v4_qlp_pct: f64,
    v4_i32_pred_pct: f64,
    qlp_warmup_verbatim_bits: usize,
    qlp_warmup_rice_counterfactual_bits: usize,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from("."));
    let bench_root = std::env::var("MP5_BENCH_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\Users\colli\OneDrive\Desktop"));
    let corpus_dir = repo.join("benchmarks/real-music/corpus");

    let ffmpeg = find_ffmpeg();
    let ffmpeg_ver = ffmpeg
        .as_ref()
        .and_then(|p| {
            Command::new(p)
                .arg("-version")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.lines().next().unwrap_or("ffmpeg").to_string())
        })
        .unwrap_or_else(|| "ffmpeg not found — FLAC columns skipped".into());

    eprintln!("FLAC tool: {ffmpeg_ver}");
    ensure_real_music_corpus(&corpus_dir, &bench_root, ffmpeg.as_deref())?;

    eprintln!("Scanning corpus …");
    let (primary, tuning, secondary, provisional) = collect_corpus(&corpus_dir, &bench_root, &repo);
    eprintln!(
        "Primary {} tracks (provisional={provisional}); tuning {}; secondary {}",
        primary.len(),
        tuning.len(),
        secondary.len()
    );

    let tmp = std::env::temp_dir().join("mp5l_flac_ab");
    let _ = fs::create_dir_all(&tmp);

    let mut primary_rows = Vec::new();
    let mut tuning_rows = Vec::new();
    let mut secondary_rows = Vec::new();
    let mut profile_notes = Vec::new();

    let primary_is_tuning_fallback = primary.first().map(|p| p.kind == "tuning").unwrap_or(false);
    let primary_only = std::env::var("MP5_BENCH_PRIMARY_ONLY")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    if primary_only {
        eprintln!("MP5_BENCH_PRIMARY_ONLY=1 — skipping tuning/secondary tables");
    }

    for (section, tracks, out) in [
        ("primary", &primary, &mut primary_rows),
        ("tuning", &tuning, &mut tuning_rows),
        ("secondary", &secondary, &mut secondary_rows),
    ] {
        // Avoid double-bench when primary fell back to a clone of tuning.
        if section == "tuning" && primary_is_tuning_fallback {
            continue;
        }
        if primary_only && section != "primary" {
            continue;
        }
        for (i, pcm) in tracks.iter().enumerate() {
            eprintln!(
                "[{section} {}/{}] {} ({}) …",
                i + 1,
                tracks.len(),
                pcm.name,
                pcm.kind
            );
            let row = bench_track(pcm, ffmpeg.as_deref(), &tmp, &mut profile_notes)?;
            eprintln!(
                "  v3={} v4={} v3/flac5={:?} v4/flac5={:?} raw% v3={:.2} v4={:.2} ×RT v4={:.2}",
                row.mp5l_v3,
                row.mp5l_v4,
                row.v3_vs_flac5,
                row.v4_vs_flac5,
                row.v3_raw_pct,
                row.v4_raw_pct,
                row.realtime_v4
            );
            eprintln!(
                "  QLP warm-up: verbatim={} bits, Rice counterfactual={} bits",
                row.qlp_warmup_verbatim_bits, row.qlp_warmup_rice_counterfactual_bits
            );
            out.push(row);
        }
    }

    let report = repo.join("benchmarks/real-music/MP5L_COMPRESSION.md");
    write_report(
        &report,
        &ffmpeg_ver,
        &primary_rows,
        &tuning_rows,
        &secondary_rows,
        &profile_notes,
        provisional,
    )?;
    eprintln!("\nWrote {}", report.display());
    print_gate_summary(&primary_rows, provisional);
    Ok(())
}

fn bench_track(
    pcm: &Pcm,
    ffmpeg: Option<&Path>,
    tmp: &Path,
    profile_notes: &mut Vec<String>,
) -> Result<TrackRow, Box<dyn std::error::Error>> {
    let pcm_bytes = pcm.samples.len() * 2;
    let frames = pcm.samples.len() as f64 / pcm.channels.max(1) as f64;
    let duration = frames / pcm.sample_rate.max(1) as f64;

    let t0 = Instant::now();
    let v3 = mp5l::encode_v3(&pcm.samples, pcm.channels);
    let enc_v3_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let bit_exact_v3 = mp5l::decode(&v3)? == pcm.samples;
    let diag_v3 = diag::analyze_bitstream(&v3, pcm.channels)?;

    let t1 = Instant::now();
    let v4 = mp5l::encode_v4(&pcm.samples, pcm.channels);
    let enc_v4_ms = t1.elapsed().as_secs_f64() * 1000.0;
    let bit_exact_v4 = mp5l::decode(&v4)? == pcm.samples;
    let diag_v4 = diag::analyze_bitstream(&v4, pcm.channels)?;

    if pcm.name.contains("ORIGAMI") && pcm.kind == "real-music" {
        profile_notes.push(format!(
            "ORIGAMI full v3: {:.0} ms ({:.1}× RT), {:.2} bps, {:.3}× PCM, raw {:.2}%",
            enc_v3_ms,
            duration * 1000.0 / enc_v3_ms.max(1.0),
            diag_v3.bits_per_sample,
            v3.len() as f64 / pcm_bytes as f64,
            pct(diag_v3.raw_blocks, diag_v3.block_count)
        ));
        profile_notes.push(format!(
            "ORIGAMI full v4: {:.0} ms ({:.1}× RT), {:.2} bps, {:.3}× PCM, raw {:.2}%, QLP-ish rice {:.1}%, stereo {}",
            enc_v4_ms,
            duration * 1000.0 / enc_v4_ms.max(1.0),
            diag_v4.bits_per_sample,
            v4.len() as f64 / pcm_bytes as f64,
            pct(diag_v4.raw_blocks, diag_v4.block_count),
            diag_v4.rice_block_pct,
            diag_v4.stereo_ms_blocks
        ));
    }

    let flac5 = ffmpeg.and_then(|ff| encode_flac_bytes(ff, tmp, pcm, 5).ok());
    let flac8 = ffmpeg.and_then(|ff| encode_flac_bytes(ff, tmp, pcm, 8).ok());

    Ok(TrackRow {
        name: pcm.name.clone(),
        kind: pcm.kind,
        duration_s: duration,
        pcm_bytes,
        mp5l_v3: v3.len(),
        mp5l_v4: v4.len(),
        flac5,
        flac8,
        v3_vs_flac5: flac5.map(|f| v3.len() as f64 / f as f64),
        v4_vs_flac5: flac5.map(|f| v4.len() as f64 / f as f64),
        v3_vs_flac8: flac8.map(|f| v3.len() as f64 / f as f64),
        v4_vs_flac8: flac8.map(|f| v4.len() as f64 / f as f64),
        ratio_pcm_v3: v3.len() as f64 / pcm_bytes as f64,
        ratio_pcm_v4: v4.len() as f64 / pcm_bytes as f64,
        enc_v3_ms,
        enc_v4_ms,
        bit_exact_v3,
        bit_exact_v4,
        realtime_v3: duration * 1000.0 / enc_v3_ms.max(1.0),
        realtime_v4: duration * 1000.0 / enc_v4_ms.max(1.0),
        v3_raw_pct: pct(diag_v3.raw_blocks, diag_v3.block_count),
        v4_raw_pct: pct(diag_v4.raw_blocks, diag_v4.block_count),
        v4_qlp_pct: pct(diag_v4.qlp_blocks, diag_v4.block_count),
        v4_i32_pred_pct: pct(diag_v4.i32_pred_blocks, diag_v4.block_count),
        qlp_warmup_verbatim_bits: diag_v4.qlp_warmup_verbatim_bits,
        qlp_warmup_rice_counterfactual_bits: diag_v4.qlp_warmup_rice_counterfactual_bits,
    })
}

fn pct(n: usize, den: usize) -> f64 {
    if den == 0 {
        0.0
    } else {
        100.0 * n as f64 / den as f64
    }
}

fn ensure_real_music_corpus(
    corpus_dir: &Path,
    bench_root: &Path,
    ffmpeg: Option<&Path>,
) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(corpus_dir)?;
    let existing = count_audio_files(corpus_dir);
    if existing >= 20 {
        eprintln!(
            "Corpus already has {existing} files in {}",
            corpus_dir.display()
        );
        return Ok(());
    }
    let Some(ff) = ffmpeg else {
        eprintln!("WARN: cannot seed corpus without ffmpeg");
        return Ok(());
    };
    let origami = bench_root.join("- ORIGAMI!.flac");
    if !origami.exists() {
        eprintln!(
            "WARN: missing {} — cannot auto-seed ≥20 corpus",
            origami.display()
        );
        return Ok(());
    }
    eprintln!(
        "Seeding ≥20 real-music clips from ORIGAMI into {} …",
        corpus_dir.display()
    );
    // Seed into tuning/ (smoke only — never formal held-out).
    let tuning_dir = corpus_dir.join("tuning");
    fs::create_dir_all(&tuning_dir)?;
    // Full track reference
    let full = tuning_dir.join("origami_full.flac");
    if !full.exists() {
        fs::copy(&origami, &full)?;
    }
    // 19 × 8s slices spanning the track (~154s)
    for i in 0..19 {
        let out = tuning_dir.join(format!("origami_seg_{i:02}.flac"));
        if out.exists() {
            continue;
        }
        let start = i as f64 * 7.5;
        let status = Command::new(ff)
            .args([
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                &format!("{start:.1}"),
                "-t",
                "8",
                "-i",
            ])
            .arg(&origami)
            .args(["-c:a", "flac", "-compression_level", "5"])
            .arg(&out)
            .status()?;
        if !status.success() {
            eprintln!("  slice {i} failed");
        }
    }
    // README for honesty
    let readme = corpus_dir.join("README.md");
    if !readme.exists() {
        fs::write(
            readme,
            "# Real-music FLAC A/B corpus\n\n\
Auto-seeded from local ORIGAMI master into 1 full + 19×8s segments spanning the track.\n\
**Honesty:** segments share one commercial master until more multi-genre files are added.\n\
Gate language: vs FFmpeg FLAC compression_level 5 on identical decoded PCM.\n\
Add more `.flac`/`.wav` files here to diversify the primary gate.\n",
        )?;
    }
    Ok(())
}

fn count_audio_files(dir: &Path) -> usize {
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| {
                    let x = x.to_ascii_lowercase();
                    x == "flac" || x == "wav"
                })
                .unwrap_or(false)
        })
        .count()
}

fn collect_corpus(
    corpus_dir: &Path,
    bench_root: &Path,
    repo: &Path,
) -> (Vec<Pcm>, Vec<Pcm>, Vec<Pcm>, bool) {
    let mut held_out = Vec::new();
    let mut tuning = Vec::new();
    let mut secondary = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let held_dir = corpus_dir.join("held-out");
    push_dir_audio(&mut held_out, &mut seen, &held_dir, "held-out", 64);
    // ORIGAMI slices must never count as formal held-out (single master).
    held_out.retain(|p| !is_origami_name(&p.name));
    let hash_ok = verify_held_out_hashes(corpus_dir, &held_dir);
    if !hash_ok {
        eprintln!(
            "WARN: held-out hash manifest missing/unreadable/mismatched — forcing PROVISIONAL"
        );
    }

    // Lab listening refs are secondary smoke only — never count toward ≥20 masters.
    let listening = repo.join("benchmarks/audio-quality/listening");
    if listening.is_dir() {
        if let Ok(entries) = fs::read_dir(&listening) {
            for entry in entries.flatten() {
                let ref_wav = entry.path().join("pcm_reference.wav");
                if ref_wav.exists() && seen.insert(ref_wav.clone()) {
                    if let Ok(pcm) = load_audio(&ref_wav) {
                        secondary.push(Pcm {
                            name: format!("lab/{}", entry.file_name().to_string_lossy()),
                            kind: "lab",
                            ..pcm
                        });
                    }
                }
            }
        }
    }

    let tuning_dir = corpus_dir.join("tuning");
    push_dir_audio(&mut tuning, &mut seen, &tuning_dir, "tuning", 64);
    // Legacy flat ORIGAMI seeds at corpus root → tuning/smoke only.
    push_dir_audio(&mut tuning, &mut seen, corpus_dir, "tuning", 64);

    let has_full = tuning
        .iter()
        .any(|p| p.name == "origami_full" || p.name.eq_ignore_ascii_case("ORIGAMI"));
    let origami = bench_root.join("- ORIGAMI!.flac");
    if !has_full && origami.exists() && seen.insert(origami.clone()) {
        if let Ok(pcm) = load_audio(&origami) {
            tuning.insert(
                0,
                Pcm {
                    name: "ORIGAMI".into(),
                    kind: "tuning",
                    ..pcm
                },
            );
        }
    }

    for syn in synthetic_tracks(16) {
        secondary.push(syn);
    }

    // Formal primary = held-out only when ≥20 clips + hash OK.
    // Single-production speech corpora (e.g. one audiobook) are non-provisional for
    // size numbers but tagged SPEECH_SINGLE_PRODUCTION — they do not alone justify
    // a multi-genre “beats FLAC music” claim or default flip.
    let independent_masters = held_out.len();
    let speech_single = !held_out.is_empty()
        && held_out
            .iter()
            .all(|p| p.name.to_ascii_lowercase().starts_with("hades_"));
    let provisional = independent_masters < 20 || !hash_ok;
    eprintln!(
        "N held-out independent masters = {independent_masters} (hash_ok={hash_ok}, speech_single={speech_single})"
    );
    let primary = if provisional {
        // Prefer empty held-out + tuning smoke so ORIGAMI is never labeled formal.
        if held_out.is_empty() {
            tuning.clone()
        } else {
            // Thin held-out still shown as primary but provisional flag blocks PASS.
            held_out
        }
    } else {
        held_out
    };

    (primary, tuning, secondary, provisional)
}

fn is_origami_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with("origami") || lower.contains("origami_")
}

/// Verify `HELD_OUT_HASHES.txt` is UTF-8 and matches on-disk held-out files when entries exist.
/// Empty / comment-only manifests are OK (corpus not frozen yet) but keep provisional via count.
fn verify_held_out_hashes(corpus_dir: &Path, held_dir: &Path) -> bool {
    let path = corpus_dir.join("HELD_OUT_HASHES.txt");
    let Ok(bytes) = fs::read(&path) else {
        return false;
    };
    // Reject UTF-16 / null-heavy corruption.
    if bytes.iter().any(|&b| b == 0) {
        eprintln!("ERROR: HELD_OUT_HASHES.txt contains NUL bytes (likely UTF-16) — rewrite as UTF-8");
        return false;
    }
    let Ok(text) = String::from_utf8(bytes) else {
        eprintln!("ERROR: HELD_OUT_HASHES.txt is not valid UTF-8");
        return false;
    };
    let mut entries = 0usize;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(hash) = parts.next() else {
            continue;
        };
        let Some(filename) = parts.next() else {
            eprintln!("ERROR: bad hash line (need SHA256 + filename): {line}");
            return false;
        };
        if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
            eprintln!("ERROR: invalid SHA-256 in HELD_OUT_HASHES.txt: {hash}");
            return false;
        }
        let file = held_dir.join(filename);
        if !file.is_file() {
            eprintln!("ERROR: held-out file missing for hash entry: {filename}");
            return false;
        }
        match file_sha256_hex(&file) {
            Ok(actual) if actual.eq_ignore_ascii_case(hash) => entries += 1,
            Ok(actual) => {
                eprintln!("ERROR: hash mismatch for {filename}: expected {hash} got {actual}");
                return false;
            }
            Err(e) => {
                eprintln!("ERROR: hashing {filename}: {e}");
                return false;
            }
        }
    }
    // Comment-only file is readable/valid; count gate still makes provisional.
    let _ = entries;
    true
}

fn file_sha256_hex(path: &Path) -> Result<String, Box<dyn std::error::Error>> {
    // Prefer PowerShell / shasum without adding crate deps.
    #[cfg(windows)]
    {
        let out = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "(Get-FileHash -Algorithm SHA256 -LiteralPath '{}').Hash.ToLowerInvariant()",
                    path.display().to_string().replace('\'', "''")
                ),
            ])
            .output()?;
        if !out.status.success() {
            return Err("Get-FileHash failed".into());
        }
        let s = String::from_utf8_lossy(&out.stdout).trim().to_ascii_lowercase();
        if s.len() == 64 {
            return Ok(s);
        }
        return Err(format!("unexpected hash output: {s}").into());
    }
    #[cfg(not(windows))]
    {
        let out = Command::new("sha256sum").arg(path).output()?;
        if !out.status.success() {
            return Err("sha256sum failed".into());
        }
        let s = String::from_utf8_lossy(&out.stdout);
        let hash = s.split_whitespace().next().unwrap_or("").to_ascii_lowercase();
        if hash.len() == 64 {
            Ok(hash)
        } else {
            Err(format!("unexpected hash output: {s}").into())
        }
    }
}

fn push_dir_audio(
    out: &mut Vec<Pcm>,
    seen: &mut std::collections::HashSet<PathBuf>,
    dir: &Path,
    kind: &'static str,
    limit: usize,
) {
    if !dir.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut paths: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            if p.is_dir() {
                return false;
            }
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| {
                    let e = e.to_ascii_lowercase();
                    e == "flac" || e == "wav"
                })
                .unwrap_or(false)
        })
        .collect();
    paths.sort();
    for path in paths.into_iter().take(limit) {
        if !seen.insert(path.clone()) {
            continue;
        }
        if let Ok(pcm) = load_audio(&path) {
            out.push(Pcm {
                name: path
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| path.display().to_string()),
                kind,
                ..pcm
            });
        }
    }
}

fn synthetic_tracks(n: usize) -> Vec<Pcm> {
    let mut out = Vec::new();
    let base: &[(&str, fn(usize) -> Vec<i16>)] = &[
        ("synth/noise-burst", |frames| {
            let mut x = 1u32;
            (0..frames)
                .flat_map(|i| {
                    x = x.wrapping_mul(1664525).wrapping_add(1013904223);
                    let n = ((x >> 16) as i16).wrapping_mul(if i % 4000 < 800 { 40 } else { 2 });
                    [n, n.wrapping_neg()]
                })
                .collect()
        }),
        ("synth/piano-ish", |frames| {
            (0..frames)
                .flat_map(|i| {
                    let t = i as f32 / 48000.0;
                    let s = ((t * 440.0 * std::f32::consts::TAU).sin()
                        + 0.4 * (t * 880.0 * std::f32::consts::TAU).sin())
                        * 12000.0;
                    [s as i16, (s * 0.92) as i16]
                })
                .collect()
        }),
        ("synth/full-scale-ms", |frames| {
            (0..frames)
                .flat_map(|i| {
                    if i % 2 == 0 {
                        [i16::MAX, i16::MIN]
                    } else {
                        [i16::MIN, i16::MAX]
                    }
                })
                .collect()
        }),
        ("synth/sparse-clicks", |frames| {
            (0..frames)
                .flat_map(|i| {
                    let s = if i % 3000 == 0 {
                        20000
                    } else {
                        ((i % 17) as i16) - 8
                    };
                    [s, s / 2]
                })
                .collect()
        }),
    ];
    for (name, gen) in base.iter().take(n.min(base.len())) {
        out.push(Pcm {
            name: (*name).into(),
            kind: "synthetic",
            samples: gen(48_000 * 4),
            channels: 2,
            sample_rate: 48_000,
        });
    }
    // Extra independent synth masters for secondary diversity (not gate primary).
    let freqs = [
        110.0, 220.0, 330.0, 550.0, 660.0, 880.0, 990.0, 1320.0, 1760.0, 1980.0, 2640.0, 3520.0,
    ];
    for (i, &hz) in freqs.iter().enumerate() {
        if out.len() >= n {
            break;
        }
        let samples: Vec<i16> = (0..48_000 * 3)
            .flat_map(|t| {
                let x = ((t as f32 / 48000.0) * hz * std::f32::consts::TAU).sin() * 8000.0;
                [x as i16, (x * 0.85) as i16]
            })
            .collect();
        out.push(Pcm {
            name: format!("synth/tone-{i:02}-{hz:.0}hz"),
            kind: "synthetic",
            samples,
            channels: 2,
            sample_rate: 48_000,
        });
    }
    out
}

fn encode_flac_bytes(
    ffmpeg: &Path,
    tmp: &Path,
    pcm: &Pcm,
    level: u8,
) -> Result<usize, Box<dyn std::error::Error>> {
    let stem = format!(
        "t_{}_{}",
        level,
        pcm.name
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect::<String>()
    );
    let wav = tmp.join(format!("{stem}.wav"));
    let flac = tmp.join(format!("{stem}.flac"));
    write_wav(&wav, pcm)?;
    let status = Command::new(ffmpeg)
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(&wav)
        .args(["-c:a", "flac", "-compression_level", &level.to_string()])
        .arg(&flac)
        .status()?;
    if !status.success() {
        return Err(format!("ffmpeg flac level {level} failed").into());
    }
    Ok(fs::metadata(&flac)?.len() as usize)
}

fn write_wav(path: &Path, pcm: &Pcm) -> Result<(), Box<dyn std::error::Error>> {
    let data_bytes = pcm.samples.len() * 2;
    let mut out = Vec::with_capacity(44 + data_bytes);
    out.extend_from_slice(b"RIFF");
    out.extend(&(36 + data_bytes as u32).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend(&16u32.to_le_bytes());
    out.extend(&1u16.to_le_bytes());
    out.extend(&(pcm.channels as u16).to_le_bytes());
    out.extend(&pcm.sample_rate.to_le_bytes());
    let byte_rate = pcm.sample_rate * pcm.channels as u32 * 2;
    out.extend(&byte_rate.to_le_bytes());
    out.extend(&(pcm.channels as u16 * 2).to_le_bytes());
    out.extend(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend(&(data_bytes as u32).to_le_bytes());
    for s in &pcm.samples {
        out.extend(&s.to_le_bytes());
    }
    fs::write(path, out)?;
    Ok(())
}

fn write_report(
    path: &Path,
    ffmpeg_ver: &str,
    primary: &[TrackRow],
    tuning: &[TrackRow],
    secondary: &[TrackRow],
    profile_notes: &[String],
    provisional: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut v4_vs5: Vec<f64> = primary.iter().filter_map(|r| r.v4_vs_flac5).collect();
    v4_vs5.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median = v4_vs5.get(v4_vs5.len() / 2).copied();
    let worst = v4_vs5.last().copied();
    let all_exact = primary
        .iter()
        .chain(tuning.iter())
        .chain(secondary.iter())
        .all(|r| r.bit_exact_v3 && r.bit_exact_v4);
    let speech_single = !primary.is_empty()
        && primary
            .iter()
            .all(|r| r.name.to_ascii_lowercase().starts_with("hades_"));
    // Size beat on speech-only corpus is recorded, but default promote requires
    // multi-genre music masters (not a single audiobook production).
    let size_beat = !provisional
        && primary.len() >= 20
        && median.map(|m| m < 1.00).unwrap_or(false)
        && worst.map(|w| w <= 1.20).unwrap_or(false)
        && all_exact;
    let beat = size_beat && !speech_single;
    let near = median.map(|m| m <= 1.05).unwrap_or(false)
        && worst.map(|w| w <= 1.20).unwrap_or(false)
        && all_exact;
    let qlp_warmup_verbatim_bits: usize = primary
        .iter()
        .chain(tuning.iter())
        .chain(secondary.iter())
        .map(|row| row.qlp_warmup_verbatim_bits)
        .sum();
    let qlp_warmup_rice_counterfactual_bits: usize = primary
        .iter()
        .chain(tuning.iter())
        .chain(secondary.iter())
        .map(|row| row.qlp_warmup_rice_counterfactual_bits)
        .sum();

    let held_out_masters = primary.iter().filter(|r| r.kind == "held-out").count();
    let primary_is_tuning_smoke = primary.iter().any(|r| r.kind == "tuning") || held_out_masters == 0;

    let mut md = String::new();
    md.push_str("# MP5-L compression benchmark (FLAC A/B)\n\n");
    md.push_str(&format!(
        "Generated: {} · N held-out independent masters = {} · primary table rows: {} · provisional: {} · tool: `{ffmpeg_ver}`\n\n",
        chrono_date(),
        held_out_masters,
        primary.len(),
        provisional
    ));
    md.push_str("**Primary gate:** median **MP5-L v4** size **&lt; 1.00×** ");
    md.push_str("FFmpeg `flac -compression_level 5` on identical 16-bit PCM; ");
    md.push_str("no track worse than **1.20×**; bit-exact; held-out ≥20 independent masters.\n");
    md.push_str("See `corpus/CORPUS_MANIFEST.md`. Never claim “beats FLAC” until gate is green on held-out.\n");
    md.push_str("Lab listening refs and ORIGAMI slices never count toward the ≥20 master gate.\n\n");

    md.push_str(&format!(
        "## Gate status: {}\n\n",
        if provisional {
            "PROVISIONAL — held-out &lt;20 independent masters (or hash freeze incomplete); keep **v3 default**; do not claim beats FLAC"
        } else if beat {
            "PASS — beats FFmpeg flac -5 median on multi-genre held-out; eligible to promote v4 default"
        } else if size_beat && speech_single {
            "SPEECH_PASS — beats FFmpeg flac -5 median on single-production speech held-out; keep **v3 default** until multi-genre music corpus PASSes"
        } else if near {
            "NEAR — ≤1.05× flac -5 median on held-out; keep **v3 default**; do not claim beats FLAC"
        } else {
            "MISS — keep **v3 default**; honest narrative: between WAV and FLAC-class"
        }
    ));
    if speech_single {
        md.push_str(
            "**Honesty:** held-out is **HADES audiobook** (one narrator/production, speech). Size win here does **not** alone justify a multi-genre music “beats FLAC” claim or default flip.\n\n",
        );
    }
    if primary_is_tuning_smoke {
        md.push_str(
            "**Honesty:** primary table below is **tuning smoke** (e.g. ORIGAMI), not a formal multi-genre held-out corpus.\n\n",
        );
    }
    if let (Some(m), Some(w)) = (median, worst) {
        md.push_str(&format!(
            "- Median v4 / FFmpeg flac -5: **{m:.3}×** (beat &lt; 1.00×; near ≤ 1.05×)\n"
        ));
        md.push_str(&format!(
            "- Worst v4 / FFmpeg flac -5: **{w:.3}×** (target ≤ 1.20×)\n"
        ));
    } else {
        md.push_str("- FLAC columns unavailable.\n");
    }
    md.push_str(&format!(
        "- Bit-exact (v3+v4): {}\n",
        if all_exact { "yes" } else { "NO" }
    ));
    md.push_str(&format!(
        "- Default encoder: **{}**\n\n",
        if beat {
            "MP5-L v4 (promoted)"
        } else {
            "MP5-L v3 (unchanged)"
        }
    ));

    if !profile_notes.is_empty() {
        md.push_str("## Encode profile\n\n");
        for n in profile_notes {
            md.push_str(&format!("- {n}\n"));
        }
        md.push('\n');
    }

    if primary_is_tuning_smoke {
        md.push_str("## Primary table (tuning smoke — not formal gate)\n\n");
    } else {
        md.push_str("## Primary (held-out / formal)\n\n");
    }
    append_table(&mut md, primary);

    if !tuning.is_empty() && !primary_is_tuning_smoke {
        md.push_str("\n## Tuning / smoke (ORIGAMI — not formal gate)\n\n");
        append_table(&mut md, tuning);
    } else if !tuning.is_empty() && primary_is_tuning_smoke {
        // Tuning already shown as primary; skip duplicate unless distinct names remain.
        let primary_names: std::collections::HashSet<&str> =
            primary.iter().map(|r| r.name.as_str()).collect();
        let extra: Vec<&TrackRow> = tuning
            .iter()
            .filter(|r| !primary_names.contains(r.name.as_str()))
            .collect();
        if !extra.is_empty() {
            md.push_str("\n## Additional tuning rows\n\n");
            let owned: Vec<TrackRow> = extra.into_iter().cloned().collect();
            append_table(&mut md, &owned);
        }
    }

    if !secondary.is_empty() {
        md.push_str("\n## Secondary (lab / synthetic — not gate)\n\n");
        append_table(&mut md, secondary);
    }

    md.push_str("\n## Notes\n\n");
    md.push_str("- Layout: `corpus/held-out/` formal, `corpus/tuning/` + ORIGAMI smoke, lab/synth secondary.\n");
    md.push_str("- v4 encoder: QLP, predicted i32 side, escape-aware Rice; experimental disposable bitstream until freeze.\n");
    md.push_str(&format!(
        "- QLP warm-up totals: **{qlp_warmup_verbatim_bits} verbatim bits** vs **{qlp_warmup_rice_counterfactual_bits} Rice counterfactual bits** across all tables.\n"
    ));
    md.push_str("- Raw-block % is a fallback-rate proxy (verify-then-raw must stay near 0%).\n");
    md.push_str("\n---\n*Generated by `bench_mp5l_compression` · MP5 Audio v0.29.0-beta*\n");

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, md)?;

    // Persist promote decision for honesty docs.
    let mut decision = repo_relative_decision(beat, near, provisional);
    if size_beat && speech_single {
        decision = "SPEECH_PASS_HELD_OUT\nKEEP_V3_PENDING_MUSIC\n# Speech/audiobook held-out median <1.00× flac-5. Do not promote v4 default until multi-genre music held-out also PASSes.\n".into();
    } else if speech_single && !provisional {
        decision.push_str("# held-out = HADES audiobook speech (single production)\n");
    }
    let _ = fs::write(
        path.parent()
            .unwrap_or(Path::new("."))
            .join("MP5L_GATE_DECISION.txt"),
        decision,
    );
    Ok(())
}

fn chrono_date() -> String {
    // Avoid chrono crate dep; UTC date from system clock is enough for reports.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Rough YYYY-MM-DD via days since epoch (good enough for bench stamps).
    let days = secs / 86400;
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

fn repo_relative_decision(beat: bool, near: bool, provisional: bool) -> String {
    if provisional {
        "PROVISIONAL_HELD_OUT\nKEEP_V3_NEAR\n# Held-out primary <20 independent masters or hash freeze incomplete; ORIGAMI/tuning only. Do not promote v4 default.\n".into()
    } else if beat {
        "PROMOTE_V4\n".into()
    } else if near {
        "KEEP_V3_NEAR\n".into()
    } else {
        "KEEP_V3_MISS\n".into()
    }
}

fn append_table(md: &mut String, rows: &[TrackRow]) {
    md.push_str("| Track | Kind | s | v3 | v4 | flac5 | flac8 | v3/f5 | v4/f5 | v4/f8 | ×PCM v4 | v4 ms | ×RT v4 | raw%v4 | QLP% | pred% | Exact |\n");
    md.push_str("|-------|------|--:|---:|---:|------:|------:|------:|------:|------:|--------:|------:|-------:|-------:|-----:|------:|:-----:|\n");
    for r in rows {
        md.push_str(&format!(
            "| {} | {} | {:.1} | {} | {} | {} | {} | {} | {} | {} | {:.3} | {:.0} | {:.1} | {:.2} | {:.1} | {:.1} | {} |\n",
            r.name,
            r.kind,
            r.duration_s,
            r.mp5l_v3,
            r.mp5l_v4,
            opt_usize(r.flac5),
            opt_usize(r.flac8),
            opt_f64(r.v3_vs_flac5),
            opt_f64(r.v4_vs_flac5),
            opt_f64(r.v4_vs_flac8),
            r.ratio_pcm_v4,
            r.enc_v4_ms,
            r.realtime_v4,
            r.v4_raw_pct,
            r.v4_qlp_pct,
            r.v4_i32_pred_pct,
            if r.bit_exact_v3 && r.bit_exact_v4 {
                "yes"
            } else {
                "no"
            }
        ));
    }
}

fn opt_usize(v: Option<usize>) -> String {
    v.map(|n| n.to_string()).unwrap_or_else(|| "—".into())
}

fn opt_f64(v: Option<f64>) -> String {
    v.map(|n| format!("{n:.3}")).unwrap_or_else(|| "—".into())
}

fn print_gate_summary(rows: &[TrackRow], provisional: bool) {
    let mut vs: Vec<f64> = rows.iter().filter_map(|r| r.v4_vs_flac5).collect();
    vs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    if vs.is_empty() {
        eprintln!("Gate: no FLAC numbers (provisional={provisional})");
        return;
    }
    let median = vs[vs.len() / 2];
    let worst = *vs.last().unwrap();
    eprintln!(
        "Gate summary (v4/flac5): median = {median:.3}×, worst = {worst:.3}× provisional={provisional} (beat <1.00 / near ≤1.05 / worst ≤1.20)"
    );
}

fn find_ffmpeg() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("FFMPEG") {
        let path = PathBuf::from(p);
        if path.exists() {
            return Some(path);
        }
    }
    which("ffmpeg")
}

fn which(cmd: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(cmd);
        if candidate.exists() {
            return Some(candidate);
        }
        let exe = dir.join(format!("{cmd}.exe"));
        if exe.exists() {
            return Some(exe);
        }
    }
    None
}

fn load_audio(path: &Path) -> Result<Pcm, Box<dyn std::error::Error>> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::errors::Error;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let src = fs::File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(src), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let probed = symphonia::default::get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    )?;
    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("no track")?
        .clone();
    let track_id = track.id;
    let mut decoder =
        symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default())?;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(48000);
    let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(2) as u8;
    let mut planes: Vec<Vec<i16>> = (0..channels).map(|_| Vec::new()).collect();
    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let mut buf = SampleBuffer::<i16>::new(decoded.capacity() as u64, spec);
                buf.copy_interleaved_ref(decoded);
                let ch = spec.channels.count();
                for (i, &s) in buf.samples().iter().enumerate() {
                    planes[i % ch].push(s);
                }
            }
            Err(Error::IoError(_)) => break,
            Err(Error::DecodeError(_)) => continue,
            Err(_) => break,
        }
    }
    let frames = planes[0].len();
    let mut interleaved = Vec::with_capacity(frames * channels as usize);
    for i in 0..frames {
        for c in 0..channels as usize {
            interleaved.push(planes[c][i]);
        }
    }
    Ok(Pcm {
        name: String::new(),
        kind: "unknown",
        samples: interleaved,
        channels,
        sample_rate,
    })
}
