//! v5 vs v5.1 ORIGAMI benchmark + artifact diagnostics.
//!   cargo run --release -p mp5-codec --features bench_tools --bin bench_v51_compare

use mp5_codec::mp5c::{self, analyze_bitstream, analyze_v51_artifact_report, Preset};
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
    ratio: f64,
    snr: f64,
    clips: u32,
    dense_pct: f64,
    band_pct: f64,
    ms_pct: f64,
    enc_ms: f64,
    dec_ms: f64,
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
    let mut artifact_md = String::new();

    for (preset, name) in [
        (Preset::Standard, "Standard"),
        (Preset::High, "High"),
        (Preset::Extreme, "Extreme"),
    ] {
        eprintln!("  [{name}] encoding v5 reference …");
        let t0 = Instant::now();
        let bs_v5 = mp5_codec::mp5c::encode_v5_reference(&pcm.samples, pcm.channels, preset);
        let enc_v5_ms = t0.elapsed().as_secs_f64() * 1000.0;
        let t1 = Instant::now();
        let dec_v5 = mp5c::decode(&bs_v5)?;
        let dec_v5_ms = t1.elapsed().as_secs_f64() * 1000.0;
        let n5 = pcm.samples.len().min(dec_v5.len());
        let d5 = analyze_bitstream(&bs_v5, duration)?;
        rows.push(Row {
            version: "v5",
            preset: name,
            ratio: bs_v5.len() as f64 / pcm_bytes as f64,
            snr: snr_db(&i16_to_f32(&pcm.samples[..n5]), &i16_to_f32(&dec_v5[..n5])),
            clips: count_clips(&dec_v5[..n5]),
            dense_pct: d5.dense_frame_pct,
            band_pct: 0.0,
            ms_pct: 0.0,
            enc_ms: enc_v5_ms,
            dec_ms: dec_v5_ms,
            bitrate_kbps: d5.estimated_bitrate_kbps,
        });

        eprintln!("  [{name}] encoding v5.1 …");
        let t2 = Instant::now();
        let bs_v51 = mp5c::encode(&pcm.samples, pcm.channels, preset);
        let enc_ms = t2.elapsed().as_secs_f64() * 1000.0;
        let t3 = Instant::now();
        let dec_v51 = mp5c::decode(&bs_v51)?;
        let dec_ms = t3.elapsed().as_secs_f64() * 1000.0;
        let n51 = pcm.samples.len().min(dec_v51.len());
        let d51 = analyze_bitstream(&bs_v51, duration)?;
        rows.push(Row {
            version: "v5.1",
            preset: name,
            ratio: bs_v51.len() as f64 / pcm_bytes as f64,
            snr: snr_db(&i16_to_f32(&pcm.samples[..n51]), &i16_to_f32(&dec_v51[..n51])),
            clips: count_clips(&dec_v51[..n51]),
            dense_pct: d51.dense_frame_pct,
            band_pct: d51.band_frame_pct,
            ms_pct: d51.ms_stereo_frame_pct,
            enc_ms,
            dec_ms,
            bitrate_kbps: d51.estimated_bitrate_kbps,
        });

        if matches!(preset, Preset::High) {
            let art = analyze_v51_artifact_report(
                &bs_v51,
                &pcm.samples[..n51],
                &dec_v51[..n51],
                pcm.sample_rate,
                pcm.channels,
                duration,
                preset,
            )?;
            artifact_md = art.to_markdown(enc_ms);
        }

        eprintln!(
            "  {name}: v5 {:.3}x dense {:.1}% enc {:.0}ms | v5.1 {:.3}x dense {:.1}% band {:.1}% MS {:.1}% enc {:.0}ms",
            rows[rows.len() - 2].ratio,
            rows[rows.len() - 2].dense_pct,
            rows[rows.len() - 2].enc_ms,
            rows[rows.len() - 1].ratio,
            rows[rows.len() - 1].dense_pct,
            rows[rows.len() - 1].band_pct,
            rows[rows.len() - 1].ms_pct,
            enc_ms
        );
    }

    eprintln!("Window metrics (High) …");
    let windows = bench_windows(&pcm, duration)?;
    let out = PathBuf::from("benchmarks/real-music/V5_VS_V51.md");
    write_report(&out, &rows, pcm_bytes, duration, &windows, &artifact_md)?;
    fs::copy(&out, PathBuf::from("benchmarks/real-music/listening/V5_VS_V51.md"))?;
    eprintln!("\nWrote {}", out.display());
    Ok(())
}

fn count_clips(dec: &[i16]) -> u32 {
    dec.iter().filter(|&&s| s.abs() >= 32767).count() as u32
}

struct WinRow {
    label: &'static str,
    v5_snr: f64,
    v51_snr: f64,
    v5_peak: f32,
    v51_peak: f32,
}

fn bench_windows(pcm: &Pcm, duration: f64) -> Result<Vec<WinRow>, Box<dyn std::error::Error>> {
    let labels: [(&str, f64, f64); 6] = [
        ("full_song", 0.0, duration),
        ("intro", 0.0, 30.0),
        ("vocal_mid", 30.0, 60.0),
        ("dense_mid", 60.0, 90.0),
        ("outro_quiet", (duration - 30.0).max(0.0), duration),
        ("bass_intro", 0.0, 30.0),
    ];
    let preset = Preset::High;
    let bs_v5 = mp5_codec::mp5c::encode_v5_reference(&pcm.samples, pcm.channels, preset);
    let bs_v51 = mp5c::encode(&pcm.samples, pcm.channels, preset);
    let dec_v5 = mp5c::decode(&bs_v5)?;
    let dec_v51 = mp5c::decode(&bs_v51)?;
    let ch = pcm.channels as usize;
    let mut out = Vec::new();
    for (label, start, end) in labels {
        let i0 = (start * pcm.sample_rate as f64) as usize * ch;
        let i1 = (end * pcm.sample_rate as f64) as usize * ch;
        let i1 = i1.min(pcm.samples.len());
        let o = &pcm.samples[i0..i1];
        let d5 = &dec_v5[i0..i1.min(dec_v5.len())];
        let d51 = &dec_v51[i0..i1.min(dec_v51.len())];
        out.push(window_metrics(label, o, d5, d51));
    }
    Ok(out)
}

fn window_metrics(label: &'static str, o: &[i16], d5: &[i16], d51: &[i16]) -> WinRow {
    let n = o.len().min(d5.len()).min(d51.len());
    let o = &o[..n];
    let d5 = &d5[..n];
    let d51 = &d51[..n];
    let mut peak5 = 0f32;
    let mut peak51 = 0f32;
    for i in 0..n {
        let e5 = (o[i] as f32 - d5[i] as f32) / 32768.0;
        let e51 = (o[i] as f32 - d51[i] as f32) / 32768.0;
        peak5 = peak5.max(e5.abs());
        peak51 = peak51.max(e51.abs());
    }
    WinRow {
        label,
        v5_snr: snr_db(&i16_to_f32(o), &i16_to_f32(d5)),
        v51_snr: snr_db(&i16_to_f32(o), &i16_to_f32(d51)),
        v5_peak: peak5,
        v51_peak: peak51,
    }
}

fn write_report(
    path: &std::path::Path,
    rows: &[Row],
    pcm_bytes: u64,
    duration: f64,
    windows: &[WinRow],
    artifact_md: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut md = String::from("# MP5-C v5 vs v5.1 — ORIGAMI benchmark\n\n");
    md.push_str("Generated by `pnpm bench:v51-compare`. MP5-C is **experimental**.\n\n");
    md.push_str(&format!(
        "Source: `- ORIGAMI!.flac` — {:.1}s, PCM {} bytes\n\n",
        duration, pcm_bytes
    ));

    md.push_str("## Full song\n\n");
    md.push_str("| Ver | Preset | Ratio | SNR | Clips | Dense % | Band % | M/S % | Encode ms | Decode ms |\n");
    md.push_str("|-----|--------|-------|-----|-------|---------|--------|-------|-----------|----------|\n");
    for r in rows {
        md.push_str(&format!(
            "| {} | {} | {:.3} | {:.1} dB | {} | {:.1} | {:.1} | {:.1} | {:.0} | {:.0} |\n",
            r.version, r.preset, r.ratio, r.snr, r.clips, r.dense_pct, r.band_pct, r.ms_pct, r.enc_ms, r.dec_ms
        ));
    }

    md.push_str("\n## v5 → v5.1 deltas\n\n");
    for name in ["Standard", "High", "Extreme"] {
        let v5 = rows.iter().find(|r| r.version == "v5" && r.preset == name).unwrap();
        let v51 = rows.iter().find(|r| r.version == "v5.1" && r.preset == name).unwrap();
        let size_red = (1.0 - v51.ratio / v5.ratio) * 100.0;
        let dense_red = v5.dense_pct - v51.dense_pct;
        md.push_str(&format!(
            "- **{name}**: ratio {:.3}→{:.3} ({size_red:+.1}% smaller); SNR {:.1}→{:.1} dB; clips {}→{}; dense {:.1}%→{:.1}% (**−{dense_red:.1} pp**)\n",
            v5.ratio, v51.ratio, v5.snr, v51.snr, v5.clips, v51.clips, v5.dense_pct, v51.dense_pct
        ));
    }

    md.push_str("\n## High preset — windows\n\n");
    md.push_str("| Section | v5 SNR | v5.1 SNR | v5 peak err | v5.1 peak err |\n");
    md.push_str("|---------|--------|----------|-------------|---------------|\n");
    for w in windows {
        md.push_str(&format!(
            "| {} | {:.1} dB | {:.1} dB | {:.4} | {:.4} |\n",
            w.label, w.v5_snr, w.v51_snr, w.v5_peak, w.v51_peak
        ));
    }

    md.push_str("\n## Mode usage (v5.1 High)\n\n");
    md.push_str(artifact_md);

    let high_v5 = rows.iter().find(|r| r.version == "v5" && r.preset == "High").unwrap();
    let high_v51 = rows.iter().find(|r| r.version == "v5.1" && r.preset == "High").unwrap();
    md.push_str("\n## Quality gates (High v5.1)\n\n");
    md.push_str("| Gate | Target | Actual | Pass? |\n|------|--------|--------|-------|\n");
    md.push_str(&format!(
        "| SNR | ≥ 35.5 dB | {:.1} dB | {} |\n",
        high_v51.snr,
        if high_v51.snr >= 35.5 { "yes" } else { "no" }
    ));
    md.push_str(&format!(
        "| Ratio | ≤ 0.90× (stretch 0.88×) | {:.3}× | {} |\n",
        high_v51.ratio,
        if high_v51.ratio <= 0.90 {
            "yes"
        } else if high_v51.ratio <= 0.88 {
            "stretch"
        } else {
            "no"
        }
    ));
    md.push_str(&format!(
        "| Clips | 0 | {} | {} |\n",
        high_v51.clips,
        if high_v51.clips == 0 { "yes" } else { "no" }
    ));
    md.push_str(&format!(
        "| SNR vs v5 | ≥ v5 − 0.5 dB | {:.1} vs {:.1} | {} |\n",
        high_v51.snr,
        high_v5.snr,
        if high_v51.snr >= high_v5.snr - 0.5 {
            "yes"
        } else {
            "no"
        }
    ));

    md.push_str("\n### Default preset\n\n**High remains the listening default.**\n\n");

    md.push_str("### Listening notes (bench-guided)\n\n");
    md.push_str("| Aspect | v5 High | v5.1 High |\n|--------|---------|----------|\n");
    md.push_str("| SNR / hiss risk | 36.4 dB, 0 clips | Same quant floor — expect match if gates pass |\n");
    md.push_str("| Bass / vocals | v5 reference | Band steps preserve LF/MF multipliers ≤ 1.02× |\n");
    md.push_str("| HF / cymbals | — | HF bands allow slightly coarser step (≤ 1.28× High) |\n");
    md.push_str("| Stereo width | L/R | M/S only when correlation > 0.87 & low side energy |\n");
    md.push_str("| Quiet sections | Adaptive frame scale | Finer LF, controlled HF quant in gaps |\n\n");

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
