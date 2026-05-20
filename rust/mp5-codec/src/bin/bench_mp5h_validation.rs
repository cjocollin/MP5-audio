//! MP5-H validation benchmark — compare PCM, MP5-L, MP5-C, MP5-H on real music.
//!   cargo run --release -p mp5-codec --features bench_tools --bin bench_mp5h_validation

use mp5_codec::mp5c::Preset;
use mp5_codec::mp5h::validate::{bench_mp5c_row, bench_mp5h_row, bench_mp5l_row};
use std::fs;
use std::path::PathBuf;

struct Pcm {
    samples: Vec<i16>,
    channels: u8,
    sample_rate: u32,
}

#[derive(Debug, Clone)]
struct Row {
    mode: String,
    file_bytes: usize,
    ratio_vs_pcm: f64,
    ratio_vs_mp5l: Option<f64>,
    ratio_vs_mp5c_base: Option<f64>,
    full_snr_db: Option<f64>,
    quiet_snr_db: Option<f64>,
    clips: u32,
    bit_exact: bool,
    enc_ms: f64,
    dec_ms: f64,
    corr_present: bool,
    enhanced_decode: bool,
    max_diff: i32,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::var("MP5_BENCH_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\Users\colli\OneDrive\Desktop"));
    let flac = root.join("- ORIGAMI!.flac");
    if !flac.exists() {
        eprintln!("Missing: {}", flac.display());
        std::process::exit(1);
    }

    eprintln!("Loading {} …", flac.display());
    let pcm = load_flac(&flac)?;
    let pcm_bytes = (pcm.samples.len() * 2) as u64;
    let duration = pcm.samples.len() as f64 / pcm.channels as f64 / pcm.sample_rate as f64;
    eprintln!(
        "  {:.1}s, {} Hz, {} ch, {} PCM bytes",
        duration, pcm.sample_rate, pcm.channels, pcm_bytes
    );

    let mut rows: Vec<Row> = Vec::new();

    rows.push(Row {
        mode: "PCM fallback".into(),
        file_bytes: pcm_bytes as usize,
        ratio_vs_pcm: 1.0,
        ratio_vs_mp5l: None,
        ratio_vs_mp5c_base: None,
        full_snr_db: None,
        quiet_snr_db: None,
        clips: 0,
        bit_exact: true,
        enc_ms: 0.0,
        dec_ms: 0.0,
        corr_present: false,
        enhanced_decode: false,
        max_diff: 0,
    });

    eprintln!("MP5-L …");
    let (l_bytes, l_ratio_pcm, l_snr, l_quiet, l_clips, l_enc, l_dec, l_exact) =
        bench_mp5l_row(&pcm.samples, pcm.channels)?;
    rows.push(Row {
        mode: "MP5-L".into(),
        file_bytes: l_bytes,
        ratio_vs_pcm: l_ratio_pcm,
        ratio_vs_mp5l: Some(1.0),
        ratio_vs_mp5c_base: None,
        full_snr_db: Some(l_snr),
        quiet_snr_db: Some(l_quiet),
        clips: l_clips,
        bit_exact: l_exact,
        enc_ms: l_enc,
        dec_ms: l_dec,
        corr_present: false,
        enhanced_decode: false,
        max_diff: if l_exact { 0 } else { -1 },
    });

    for (preset, name) in [
        (Preset::Standard, "Standard"),
        (Preset::High, "High"),
        (Preset::Extreme, "Extreme"),
    ] {
        let label = format!("MP5-C {name}");
        eprintln!("{label} …");
        let (bytes, ratio_pcm, snr, quiet, clips, enc, dec) =
            bench_mp5c_row(&label, &pcm.samples, pcm.channels, pcm.sample_rate, preset, pcm_bytes)?;
        rows.push(Row {
            mode: label,
            file_bytes: bytes,
            ratio_vs_pcm: ratio_pcm,
            ratio_vs_mp5l: Some(bytes as f64 / l_bytes as f64),
            ratio_vs_mp5c_base: Some(1.0),
            full_snr_db: Some(snr),
            quiet_snr_db: Some(quiet),
            clips,
            bit_exact: false,
            enc_ms: enc,
            dec_ms: dec,
            corr_present: false,
            enhanced_decode: false,
            max_diff: -1,
        });
    }

    for (preset, name) in [
        (Preset::Standard, "Standard"),
        (Preset::High, "High"),
        (Preset::Extreme, "Extreme"),
    ] {
        let label = format!("MP5-H {name} base+CORR");
        eprintln!("{label} …");
        let h = bench_mp5h_row(
            &label,
            &pcm.samples,
            pcm.channels,
            pcm.sample_rate,
            preset,
            pcm_bytes,
            l_bytes as u64,
        )?;
        rows.push(Row {
            mode: label,
            file_bytes: h.hybrid_bytes,
            ratio_vs_pcm: h.ratio_vs_pcm,
            ratio_vs_mp5l: Some(h.ratio_vs_mp5l),
            ratio_vs_mp5c_base: Some(h.ratio_vs_mp5c_base),
            full_snr_db: Some(h.full_snr_db),
            quiet_snr_db: Some(h.quiet_snr_db),
            clips: h.clips,
            bit_exact: h.bit_exact,
            enc_ms: h.enc_ms,
            dec_ms: h.dec_ms,
            corr_present: h.corr_present,
            enhanced_decode: h.enhanced_decode,
            max_diff: h.max_sample_diff,
        });

        let base_label = format!("MP5-H {name} base only (no CORR)");
        eprintln!("  {base_label} (reference) …");
        rows.push(Row {
            mode: base_label,
            file_bytes: h.base_bytes,
            ratio_vs_pcm: h.base_bytes as f64 / pcm_bytes as f64,
            ratio_vs_mp5l: Some(h.base_bytes as f64 / l_bytes as f64),
            ratio_vs_mp5c_base: Some(1.0),
            full_snr_db: Some(h.base_only_snr_db),
            quiet_snr_db: None,
            clips: 0,
            bit_exact: false,
            enc_ms: 0.0,
            dec_ms: 0.0,
            corr_present: false,
            enhanced_decode: false,
            max_diff: -1,
        });
    }

    let report_path = PathBuf::from("benchmarks/real-music/MP5H_VALIDATION.md");
    write_report(&report_path, &flac, duration, pcm_bytes, l_bytes, &rows)?;
    eprintln!("\nWrote {}", report_path.display());
    Ok(())
}

fn write_report(
    path: &PathBuf,
    flac: &PathBuf,
    duration: f64,
    pcm_bytes: u64,
    mp5l_bytes: usize,
    rows: &[Row],
) -> Result<(), Box<dyn std::error::Error>> {
    let mut md = String::new();
    md.push_str("# MP5-H validation benchmark\n\n");
    md.push_str(&format!("Source: `{}` ({:.1}s)\n\n", flac.display(), duration));
    md.push_str(&format!("PCM reference: {} bytes\n\n", pcm_bytes));
    md.push_str(&format!("MP5-L reference: {} bytes ({:.1}% of PCM)\n\n", mp5l_bytes, 100.0 * mp5l_bytes as f64 / pcm_bytes as f64));

    md.push_str("## Comparison table\n\n");
    md.push_str("| Mode | File bytes | vs PCM | vs MP5-L | vs MP5-C base | Full SNR | Quiet SNR | Clips | Bit-exact | Encode ms | Decode ms | CORR | Enhanced |\n");
    md.push_str("|------|------------|--------|----------|---------------|----------|------------|-------|-----------|-----------|-----------|------|----------|\n");

    for r in rows {
        let vs_l = r
            .ratio_vs_mp5l
            .map(|x| format!("{:.2}x", x))
            .unwrap_or_else(|| "—".into());
        let vs_c = r
            .ratio_vs_mp5c_base
            .map(|x| format!("{:.2}x", x))
            .unwrap_or_else(|| "—".into());
        let snr = r
            .full_snr_db
            .map(|x| format!("{:.1}", x))
            .unwrap_or_else(|| "—".into());
        let quiet = r
            .quiet_snr_db
            .map(|x| format!("{:.1}", x))
            .unwrap_or_else(|| "—".into());
        md.push_str(&format!(
            "| {} | {} | {:.2}x | {} | {} | {} | {} | {} | {} | {:.0} | {:.0} | {} | {} |\n",
            r.mode,
            r.file_bytes,
            r.ratio_vs_pcm,
            vs_l,
            vs_c,
            snr,
            quiet,
            r.clips,
            if r.bit_exact { "yes" } else { "no" },
            r.enc_ms,
            r.dec_ms,
            if r.corr_present { "yes" } else { "no" },
            if r.enhanced_decode { "yes" } else { "no" },
        ));
    }

    let mp5h_high = rows.iter().find(|r| r.mode == "MP5-H High base+CORR");
    let mp5h_std = rows.iter().find(|r| r.mode == "MP5-H Standard base+CORR");
    let mp5h_ext = rows.iter().find(|r| r.mode == "MP5-H Extreme base+CORR");

    md.push_str("\n## Policy summary\n\n");
    if let Some(h) = mp5h_high {
        md.push_str(&format!(
            "- **MP5-H High vs MP5-L:** {:.2}x size ({}) than MP5-L\n",
            h.ratio_vs_mp5l.unwrap_or(0.0),
            if h.ratio_vs_mp5l.unwrap_or(1.0) < 1.0 {
                "smaller"
            } else {
                "larger"
            }
        ));
        md.push_str(&format!(
            "- **MP5-H High bit-exact (enhanced):** {}\n",
            if h.bit_exact {
                "yes".into()
            } else {
                format!("no (max diff {})", h.max_diff)
            }
        ));
        md.push_str(&format!(
            "- **MP5-H High full SNR:** {:.1} dB; quiet SNR: {:.1} dB\n",
            h.full_snr_db.unwrap_or(0.0),
            h.quiet_snr_db.unwrap_or(0.0)
        ));
    }

    let recommend_mp5h_default = mp5h_high
        .map(|h| h.bit_exact && h.ratio_vs_mp5l.unwrap_or(2.0) < 1.0)
        .unwrap_or(false);

    md.push_str("\n### Recommended export default\n\n");
    if recommend_mp5h_default {
        md.push_str("**MP5-H High** — clean enhanced decode, smaller than MP5-L on this track. Use as recommended hybrid default.\n");
    } else if let Some(h) = mp5h_high {
        if h.bit_exact {
            md.push_str("**MP5-L** remains default quality export — MP5-H is bit-exact but larger than MP5-L. Label MP5-H as recommended hybrid when size tradeoff is acceptable.\n");
        } else {
            md.push_str("**MP5-L** remains default — MP5-H enhanced decode did not meet bit-exact target on full song.\n");
        }
    }
    md.push_str("- **MP5-C alone:** research/lab only (hiss blocker).\n");
    md.push_str("- **PCM:** reference fallback.\n");

    if let (Some(h), Some(c)) = (
        mp5h_high,
        rows.iter().find(|r| r.mode == "MP5-C High"),
    ) {
        md.push_str("\n### MP5-H vs MP5-C base\n\n");
        md.push_str(&format!(
            "- Hybrid total {:.2}x MP5-C base only; enhanced SNR {:.1} dB vs base {:.1} dB\n",
            h.ratio_vs_mp5c_base.unwrap_or(0.0),
            h.full_snr_db.unwrap_or(0.0),
            c.full_snr_db.unwrap_or(0.0)
        ));
    }

    md.push_str("\n---\n*Generated by `bench_mp5h_validation`*\n");
    fs::write(path, md)?;
    Ok(())
}

fn load_flac(path: &PathBuf) -> Result<Pcm, Box<dyn std::error::Error>> {
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
    })
}
