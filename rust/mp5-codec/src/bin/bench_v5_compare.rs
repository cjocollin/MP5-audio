//! v4 vs v5 ORIGAMI benchmark + dense-frame diagnostics.
//!   cargo run --release -p mp5-codec --features bench_tools --bin bench_v5_compare

use mp5_codec::mp5c::{self, analyze_bitstream, analyze_bitstream_with_dense, Preset};
use mp5_codec::pcm::{i16_to_f32, snr_db};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

struct Pcm {
    samples: Vec<i16>,
    channels: u8,
    sample_rate: u32,
    frames: usize,
}

#[derive(Clone)]
struct Row {
    version: &'static str,
    preset: &'static str,
    bytes: u64,
    ratio: f64,
    snr: f64,
    clips: u32,
    dense_pct: f64,
    bitrate_kbps: f64,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::var("MP5_BENCH_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\\Users\\colli\\OneDrive\\Desktop"));
    let flac = root.join("- ORIGAMI!.flac");
    if !flac.exists() {
        eprintln!("Missing: {}", flac.display());
        std::process::exit(1);
    }

    eprintln!("Loading {} …", flac.display());
    let pcm = load_flac(&flac)?;
    let pcm_bytes = (pcm.samples.len() * 2) as u64;
    let duration = pcm.frames as f64 / pcm.sample_rate as f64;

    let mut rows: Vec<Row> = Vec::new();
    let mut diag_high_v5 = String::new();

    for (preset, name) in [
        (Preset::Standard, "Standard"),
        (Preset::High, "High"),
        (Preset::Extreme, "Extreme"),
    ] {
        let bs_v4 = mp5_codec::mp5c::encode_v4_reference(&pcm.samples, pcm.channels, preset);
        let dec_v4 = mp5c::decode(&bs_v4)?;
        let n = pcm.samples.len().min(dec_v4.len());
        let diag_v4 = analyze_bitstream(&bs_v4, duration)?;
        rows.push(Row {
            version: "v4",
            preset: name,
            bytes: bs_v4.len() as u64,
            ratio: bs_v4.len() as f64 / pcm_bytes as f64,
            snr: snr_db(&i16_to_f32(&pcm.samples[..n]), &i16_to_f32(&dec_v4[..n])),
            clips: count_clips(&dec_v4[..n]),
            dense_pct: diag_v4.dense_frame_pct,
            bitrate_kbps: diag_v4.estimated_bitrate_kbps,
        });

        let t0 = Instant::now();
        let bs_v5 = mp5c::encode(&pcm.samples, pcm.channels, preset);
        let enc_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let dec_v5 = mp5c::decode(&bs_v5)?;
        let n5 = pcm.samples.len().min(dec_v5.len());
        let diag_v5 = if matches!(preset, Preset::High) {
            let (d, dense_list) = analyze_bitstream_with_dense(&bs_v5, duration)?;
            diag_high_v5 = format_diag_high(&d, enc_ms, &dense_list);
            d
        } else {
            analyze_bitstream(&bs_v5, duration)?
        };
        rows.push(Row {
            version: "v5",
            preset: name,
            bytes: bs_v5.len() as u64,
            ratio: bs_v5.len() as f64 / pcm_bytes as f64,
            snr: snr_db(&i16_to_f32(&pcm.samples[..n5]), &i16_to_f32(&dec_v5[..n5])),
            clips: count_clips(&dec_v5[..n5]),
            dense_pct: diag_v5.dense_frame_pct,
            bitrate_kbps: diag_v5.estimated_bitrate_kbps,
        });

        eprintln!(
            "  {name}: v4 {:.3}x dense {:.1}% | v5 {:.3}x dense {:.1}% enc {:.0}ms",
            rows[rows.len() - 2].ratio,
            rows[rows.len() - 2].dense_pct,
            rows[rows.len() - 1].ratio,
            rows[rows.len() - 1].dense_pct,
            enc_ms
        );
    }

  // Window benchmarks (v5 only, same quant windows)
    let windows = bench_windows(&pcm, duration)?;

    let out = PathBuf::from("benchmarks/real-music/V4_VS_V5.md");
    write_report(&out, &rows, pcm_bytes, duration, &windows, &diag_high_v5)?;
    fs::copy(&out, PathBuf::from("benchmarks/real-music/listening/V4_VS_V5.md"))?;

    eprintln!("\nWrote {}", out.display());
    Ok(())
}

fn count_clips(dec: &[i16]) -> u32 {
    dec.iter().filter(|&&s| s.abs() >= 32767).count() as u32
}

fn format_diag_high(
    b: &mp5_codec::mp5c::BitstreamDiag,
    enc_ms: f64,
    dense: &[mp5_codec::mp5c::DenseFrameDetail],
) -> String {
    let mut s = format!(
        "### High v5 diagnostics\n\nEncode: {:.0} ms\n\n",
        enc_ms
    );
    s.push_str(&format!(
        "- Frames: silence {} | rice {} | pred2 {} | bitpack {} | golomb {} | rle {} | split4 {} | **dense {} ({:.1}%)**\n",
        b.silence_frames,
        b.rice_frames,
        b.pred2_frames,
        b.bitpack_frames,
        b.golomb_frames,
        b.rle_frames,
        b.split4_frames,
        b.dense_frames,
        b.dense_frame_pct
    ));
    s.push_str(&format!(
        "- Avg payload {:.0} B | max {} B | largest dense {} B | avg dense {:.0} B\n",
        b.avg_payload_bytes, b.max_payload_bytes, b.largest_dense_payload, b.avg_dense_payload
    ));
    s.push_str(&format!(
        "- Estimated savings if dense frames used best alt (sampled): {} KiB\n",
        b.theoretical_savings_bytes / 1024
    ));
    if b.dense_frame_pct > 50.0 {
        s.push_str("- Most frames still dense — quantized residuals remain high-entropy on this master.\n");
    }
    if !dense.is_empty() {
        s.push_str("\n#### Sample dense frames (first 5)\n\n");
        for d in dense.iter().take(5) {
            s.push_str(&format!(
                "- ch{} f{}: {} B payload; rice {} B; best alt {} ({} B); could save {} B — {}\n",
                d.channel,
                d.frame_index,
                d.payload_bytes,
                d.rice_size,
                d.best_alt_flag,
                d.best_alt_size,
                d.savings_if_best_alt,
                d.reason
            ));
        }
    }
    s
}

struct WinRow {
    label: &'static str,
    v4_ratio: f64,
    v5_ratio: f64,
    v4_snr: f64,
    v5_snr: f64,
    v5_dense_pct: f64,
}

fn bench_windows(pcm: &Pcm, duration: f64) -> Result<Vec<WinRow>, Box<dyn std::error::Error>> {
    let labels: [(&str, f64, f64); 5] = [
        ("full_song", 0.0, duration),
        ("intro", 0.0, 30.0),
        ("vocal_mid", 30.0, 60.0),
        ("dense_mid", 60.0, 90.0),
        ("outro_quiet", (duration - 30.0).max(0.0), duration),
    ];
    let preset = Preset::High;
    let bs_v4 = mp5_codec::mp5c::encode_v4_reference(&pcm.samples, pcm.channels, preset);
    let bs_v5 = mp5c::encode(&pcm.samples, pcm.channels, preset);
    let dec_v4 = mp5c::decode(&bs_v4)?;
    let dec_v5 = mp5c::decode(&bs_v5)?;
    let ch = pcm.channels as usize;
    let pcm_bytes_win = |start: f64, end: f64| {
        let i0 = (start * pcm.sample_rate as f64) as usize * ch;
        let i1 = (end * pcm.sample_rate as f64) as usize * ch;
        (i1 - i0) * 2
    };
    let mut out = Vec::new();
    for (label, start, end) in labels {
        let i0 = (start * pcm.sample_rate as f64) as usize * ch;
        let i1 = (end * pcm.sample_rate as f64) as usize * ch;
        let i1 = i1.min(pcm.samples.len());
        let o = &pcm.samples[i0..i1];
        let d4 = &dec_v4[i0..i1.min(dec_v4.len())];
        let d5 = &dec_v5[i0..i1.min(dec_v5.len())];
        let win_pcm = pcm_bytes_win(start, end) as f64;
        let diag_v5 = analyze_bitstream(&bs_v5, duration)?;
        out.push(WinRow {
            label,
            v4_ratio: bs_v4.len() as f64 / win_pcm,
            v5_ratio: bs_v5.len() as f64 / win_pcm,
            v4_snr: snr_db(&i16_to_f32(o), &i16_to_f32(d4)),
            v5_snr: snr_db(&i16_to_f32(o), &i16_to_f32(d5)),
            v5_dense_pct: diag_v5.dense_frame_pct,
        });
    }
    Ok(out)
}

fn write_report(
    path: &std::path::Path,
    rows: &[Row],
    pcm_bytes: u64,
    duration: f64,
    windows: &[WinRow],
    diag_high: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut md = String::from("# MP5-C v4 vs v5 — ORIGAMI benchmark\n\n");
    md.push_str("Generated by `pnpm bench:v5-compare`. MP5-C is **experimental**.\n\n");
    md.push_str(&format!(
        "Source: `- ORIGAMI!.flac` — {:.1}s, PCM reference {} bytes\n\n",
        duration, pcm_bytes
    ));

    md.push_str("## Full song — preset comparison\n\n");
    md.push_str("| Ver | Preset | Ratio vs PCM | SNR | Clips | Dense % | Bitrate |\n");
    md.push_str("|-----|--------|--------------|-----|-------|---------|--------|\n");
    for r in rows {
        md.push_str(&format!(
            "| {} | {} | {:.3} | {:.1} dB | {} | {:.1}% | {:.0} kbps |\n",
            r.version, r.preset, r.ratio, r.snr, r.clips, r.dense_pct, r.bitrate_kbps
        ));
    }

    md.push_str("\n## v4 → v5 deltas (same preset)\n\n");
    for name in ["Standard", "High", "Extreme"] {
        let v4 = rows.iter().find(|r| r.version == "v4" && r.preset == name).unwrap();
        let v5 = rows.iter().find(|r| r.version == "v5" && r.preset == name).unwrap();
        let dense_red = v4.dense_pct - v5.dense_pct;
        let size_red = (1.0 - v5.ratio / v4.ratio) * 100.0;
        md.push_str(&format!(
            "- **{name}**: ratio {:.3}→{:.3} ({size_red:+.1}% smaller); SNR {:.1}→{:.1} dB; clips {}→{}; dense {:.1}%→{:.1}% (**−{dense_red:.1} pp**)\n",
            v4.ratio,
            v5.ratio,
            v4.snr,
            v5.snr,
            v4.clips,
            v5.clips,
            v4.dense_pct,
            v5.dense_pct,
            dense_red = dense_red
        ));
    }

    md.push_str("\n## High preset — song sections (v5)\n\n");
    md.push_str("| Section | v4 ratio* | v5 ratio* | v4 SNR | v5 SNR |\n");
    md.push_str("|---------|-----------|-----------|--------|--------|\n");
    md.push_str("*Whole-file ratio scaled to window PCM bytes (approximate)\n\n");
    for w in windows {
        md.push_str(&format!(
            "| {} | {:.3} | {:.3} | {:.1} dB | {:.1} dB |\n",
            w.label, w.v4_ratio, w.v5_ratio, w.v4_snr, w.v5_snr
        ));
    }

    md.push_str("\n");
    md.push_str(diag_high);

    md.push_str("\n## Quality gates (ORIGAMI full)\n\n");
    let high_v5 = rows.iter().find(|r| r.version == "v5" && r.preset == "High").unwrap();
    let high_v4 = rows.iter().find(|r| r.version == "v4" && r.preset == "High").unwrap();
    md.push_str(&format!(
        "| Gate | Target | High v5 actual | Pass? |\n|------|--------|----------------|-------|\n"
    ));
    md.push_str(&format!(
        "| SNR | ≥ 35.5 dB | {:.1} dB | {} |\n",
        high_v5.snr,
        if high_v5.snr >= 35.5 { "yes" } else { "no" }
    ));
    md.push_str(&format!(
        "| Ratio | ≤ 0.88× PCM | {:.3}× | {} |\n",
        high_v5.ratio,
        if high_v5.ratio <= 0.88 { "yes" } else { "no" }
    ));
    md.push_str(&format!(
        "| SNR vs v4 | ≥ v4 − 0.5 dB | {:.1} vs {:.1} | {} |\n",
        high_v5.snr,
        high_v4.snr,
        if high_v5.snr >= high_v4.snr - 0.5 {
            "yes"
        } else {
            "no"
        }
    ));
    md.push_str(&format!(
        "| Clips | 0 | {} | {} |\n",
        high_v5.clips,
        if high_v5.clips == 0 { "yes" } else { "no" }
    ));

    md.push_str("\n### Default preset\n\n");
    md.push_str("**High remains the listening default** — v5 changes packing only; preset steps unchanged.\n");

    fs::write(path, md)?;
    Ok(())
}

fn load_flac(path: &std::path::Path) -> Result<Pcm, Box<dyn std::error::Error>> {
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
        samples: interleaved,
        channels,
        sample_rate,
        frames,
    })
}
