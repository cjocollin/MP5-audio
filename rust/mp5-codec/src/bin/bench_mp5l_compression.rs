//! MP5-L compression benchmark vs PCM, v2 raw, MP5-H, MP5-C.
//!   cargo run --release -p mp5-codec --features bench_tools --bin bench_mp5l_compression

use mp5_codec::mp5c::Preset;
use mp5_codec::mp5h::{self, DecodeMode};
use mp5_codec::mp5l::{self, diag};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

struct Pcm {
    samples: Vec<i16>,
    channels: u8,
    sample_rate: u32,
}

struct Row {
    mode: String,
    bytes: usize,
    ratio_pcm: f64,
    enc_ms: f64,
    dec_ms: f64,
    bit_exact: bool,
    max_diff: i32,
    clips: u32,
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
    let pcm_bytes = pcm.samples.len() * 2;
    let duration = pcm.samples.len() as f64 / pcm.channels as f64 / pcm.sample_rate as f64;

    let mut rows = Vec::new();

    rows.push(Row {
        mode: "PCM fallback".into(),
        bytes: pcm_bytes,
        ratio_pcm: 1.0,
        enc_ms: 0.0,
        dec_ms: 0.0,
        bit_exact: true,
        max_diff: 0,
        clips: 0,
    });

    {
        eprintln!("MP5-L v2 raw (before) …");
        let t0 = Instant::now();
        let bs = mp5l::encode_v2_raw(&pcm.samples, pcm.channels);
        let enc_ms = t0.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(bs[1], 2, "v2 bitstream version must be 2, got {}", bs[1]);
        let t1 = Instant::now();
        let out = mp5l::decode_v2(&bs).expect("v2 decode");
        let dec_ms = t1.elapsed().as_secs_f64() * 1000.0;
        let (bit_exact, max_diff) = bit_exact_diff(&pcm.samples, &out);
        rows.push(Row {
            mode: "MP5-L v2 raw (before)".into(),
            bytes: bs.len(),
            ratio_pcm: bs.len() as f64 / pcm_bytes as f64,
            enc_ms,
            dec_ms,
            bit_exact,
            max_diff,
            clips: count_clips(&out),
        });
    }

    let enc_v3 = {
        let t0 = Instant::now();
        let bs = mp5l::encode(&pcm.samples, pcm.channels);
        (bs, t0.elapsed().as_secs_f64() * 1000.0)
    };
    let dec_v3 = {
        let t0 = Instant::now();
        let dec = mp5l::decode(&enc_v3.0)?;
        (dec, t0.elapsed().as_secs_f64() * 1000.0)
    };
    let (bit_exact, max_diff) = bit_exact_diff(&pcm.samples, &dec_v3.0);
    rows.push(Row {
        mode: "MP5-L v3 improved".into(),
        bytes: enc_v3.0.len(),
        ratio_pcm: enc_v3.0.len() as f64 / pcm_bytes as f64,
        enc_ms: enc_v3.1,
        dec_ms: dec_v3.1,
        bit_exact,
        max_diff,
        clips: count_clips(&dec_v3.0),
    });

    let diag_v3 = diag::analyze_bitstream(&enc_v3.0, pcm.channels)?;
    eprintln!(
        "  v3 diag: {:.2} bps, {:.1}% overhead, {} lpc / {} delta / {} silence / {} raw, {} ms",
        diag_v3.bits_per_sample,
        diag_v3.block_overhead_pct,
        diag_v3.rice_blocks,
        diag_v3.delta_blocks,
        diag_v3.silence_blocks,
        diag_v3.raw_blocks,
        diag_v3.stereo_ms_blocks
    );

    bench_codec(
        &mut rows,
        "MP5-H High + CORR",
        &pcm,
        |s, c| {
            let (base, corr) = mp5h::encode(s, c, Preset::High);
            let mut out = vec![0x48, 0x01];
            out.extend(&(base.len() as u32).to_le_bytes());
            out.extend(&base);
            out.extend(&(corr.len() as u32).to_le_bytes());
            out.extend(&corr);
            out
        },
        |d| {
            if d.len() < 6 || d[0] != 0x48 {
                return Err("invalid MP5-H wrapper".into());
            }
            let base_len = u32::from_le_bytes(d[2..6].try_into().unwrap()) as usize;
            let base = &d[6..6 + base_len];
            let corr_off = 6 + base_len;
            let corr_len = u32::from_le_bytes(d[corr_off..corr_off + 4].try_into().unwrap()) as usize;
            let corr = &d[corr_off + 4..corr_off + 4 + corr_len];
            mp5h::decode(base, Some(corr), DecodeMode::Enhanced)
        },
        pcm_bytes,
    );

    bench_codec(
        &mut rows,
        "MP5-C High (lab)",
        &pcm,
        |s, c| mp5_codec::mp5c::encode(s, c, Preset::High),
        |d| mp5_codec::mp5c::decode(d),
        pcm_bytes,
    );

    let report = PathBuf::from("benchmarks/real-music/MP5L_COMPRESSION.md");
    write_report(&report, &flac, duration, pcm_bytes, &rows, &diag_v3)?;
    eprintln!("\nWrote {}", report.display());
    Ok(())
}

fn bench_codec(
    rows: &mut Vec<Row>,
    name: &str,
    pcm: &Pcm,
    enc: fn(&[i16], u8) -> Vec<u8>,
    dec: fn(&[u8]) -> Result<Vec<i16>, String>,
    pcm_bytes: usize,
) {
    eprintln!("{name} …");
    let t0 = Instant::now();
    let bs = enc(&pcm.samples, pcm.channels);
    let enc_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let t1 = Instant::now();
    let out = dec(&bs).expect("decode");
    let dec_ms = t1.elapsed().as_secs_f64() * 1000.0;
    let (bit_exact, max_diff) = bit_exact_diff(&pcm.samples, &out);
    rows.push(Row {
        mode: name.to_string(),
        bytes: bs.len(),
        ratio_pcm: bs.len() as f64 / pcm_bytes as f64,
        enc_ms,
        dec_ms,
        bit_exact,
        max_diff,
        clips: count_clips(&out),
    });
}

fn bit_exact_diff(a: &[i16], b: &[i16]) -> (bool, i32) {
    let n = a.len().min(b.len());
    let mut max = 0i32;
    for i in 0..n {
        let d = (a[i] as i32 - b[i] as i32).abs();
        max = max.max(d);
    }
    (max == 0 && a.len() == b.len(), max)
}

fn count_clips(s: &[i16]) -> u32 {
    s.iter().filter(|&&x| x.abs() >= 32767).count() as u32
}

fn write_report(
    path: &PathBuf,
    flac: &PathBuf,
    duration: f64,
    pcm_bytes: usize,
    rows: &[Row],
    diag: &diag::Mp5lDiagnostics,
) -> Result<(), Box<dyn std::error::Error>> {
    let v2 = rows.iter().find(|r| r.mode.contains("v2"));
    let v3 = rows.iter().find(|r| r.mode.contains("v3 improved"));

    let mut md = String::new();
    md.push_str("# MP5-L compression benchmark\n\n");
    md.push_str(&format!("Source: `{}` ({:.1}s)\n\n", flac.display(), duration));
    md.push_str(&format!("PCM reference: {} bytes\n\n", pcm_bytes));

    md.push_str("## Before / after\n\n");
    md.push_str("| Mode | Bytes | vs PCM | Encode ms | Decode ms | Bit-exact | Max diff | Clips |\n");
    md.push_str("|------|-------|--------|-----------|-----------|-----------|----------|-------|\n");
    for r in rows {
        md.push_str(&format!(
            "| {} | {} | {:.3}x | {:.0} | {:.0} | {} | {} | {} |\n",
            r.mode,
            r.bytes,
            r.ratio_pcm,
            r.enc_ms,
            r.dec_ms,
            if r.bit_exact { "yes" } else { "no" },
            r.max_diff,
            r.clips
        ));
    }

    if let (Some(b), Some(a)) = (v2, v3) {
        let savings = 100.0 * (1.0 - a.bytes as f64 / b.bytes as f64);
        md.push_str("\n## MP5-L v3 vs v2 raw\n\n");
        md.push_str(&format!(
            "- v2 raw: {} bytes ({:.3}x PCM)\n",
            b.bytes, b.ratio_pcm
        ));
        md.push_str(&format!(
            "- v3 improved: {} bytes ({:.3}x PCM)\n",
            a.bytes, a.ratio_pcm
        ));
        md.push_str(&format!("- Size change vs v2: {:.1}%\n", savings));
        md.push_str(&format!(
            "- **Smaller than PCM:** {}\n",
            if a.ratio_pcm < 1.0 { "yes" } else { "no" }
        ));
        md.push_str(&format!(
            "- **≤ 0.80× PCM target:** {}\n",
            if a.ratio_pcm <= 0.80 { "yes" } else { "no (stretch)" }
        ));
    }

    md.push_str("\n## MP5-L v3 diagnostics\n\n");
    md.push_str(&format!("- Version: {}\n", diag.version));
    md.push_str(&format!("- Bits per sample: {:.2}\n", diag.bits_per_sample));
    md.push_str(&format!(
        "- Block overhead: {:.1}% of file\n",
        diag.block_overhead_pct
    ));
    md.push_str(&format!("- Blocks: {} (avg {:.0} samples)\n", diag.block_count, diag.avg_block_samples));
    md.push_str(&format!(
        "- Block types: {} lpc, {} delta, {} silence, {} const, {} raw, {} stereo M/S\n",
        diag.rice_blocks,
        diag.delta_blocks,
        diag.silence_blocks,
        diag.const_blocks,
        diag.raw_blocks,
        diag.stereo_ms_blocks
    ));
    md.push_str(&format!("- Avg predictor order (rice blocks): {:.2}\n", diag.avg_predictor_order));
    md.push_str(&format!(
        "- Residual entropy estimate: {:.2} bits/sample\n",
        diag.residual_entropy_bits_per_sample
    ));

    md.push_str("\n### Worst blocks (largest)\n\n");
    md.push_str("| # | Samples | Flag | Payload B | Total B | bps |\n");
    md.push_str("|---|---------|------|-----------|---------|-----|\n");
    for b in &diag.worst_blocks {
        md.push_str(&format!(
            "| {} | {} | {} | {} | {} | {:.2} |\n",
            b.index,
            b.samples,
            diag::flag_name(b.flag),
            b.payload_bytes,
            b.total_bytes,
            b.bits_per_sample
        ));
    }

    md.push_str("\n### Best blocks (smallest)\n\n");
    md.push_str("| # | Samples | Flag | Payload B | Total B | bps |\n");
    md.push_str("|---|---------|------|-----------|---------|-----|\n");
    for b in &diag.best_blocks {
        md.push_str(&format!(
            "| {} | {} | {} | {} | {} | {:.2} |\n",
            b.index,
            b.samples,
            diag::flag_name(b.flag),
            b.payload_bytes,
            b.total_bytes,
            b.bits_per_sample
        ));
    }

    md.push_str("\n## Default export policy\n\n");
    md.push_str("**MP5-L remains the recommended default** — bit-exact, no hiss.\n");
    if let Some(a) = v3 {
        if a.ratio_pcm < 1.0 {
            md.push_str("v3 achieves smaller-than-PCM on this track.\n");
        } else {
            md.push_str("v3 does not yet beat PCM on this track; further tuning (Rice bits, stereo M/S, block sizing) needed.\n");
        }
    }

    md.push_str("\n---\n*Generated by `bench_mp5l_compression`*\n");
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
