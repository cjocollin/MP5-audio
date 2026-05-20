//! Fresh ORIGAMI listening set + validation report.
//!   cargo run --release -p mp5-codec --features bench_tools --bin export_listening_set

use mp5_codec::mp5c::{self, build_report, Preset};
use mp5_codec::pcm::{i16_to_f32, snr_db};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

struct Pcm {
    samples: Vec<i16>,
    channels: u8,
    sample_rate: u32,
    frames: usize,
}

struct Row {
    label: String,
    version: u8,
    preset: String,
    mp5_bytes: u64,
    pcm_bytes: u64,
    ratio: f64,
    snr: f64,
    peak_err: f32,
    rms_err: f32,
    clipped: u32,
    bitrate_kbps: f64,
    path: String,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::var("MP5_BENCH_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\\Users\\colli\\OneDrive\\Desktop"));
    let flac = root.join("- ORIGAMI!.flac");
    if !flac.exists() {
        eprintln!("Missing source: {}", flac.display());
        std::process::exit(1);
    }

    let out_repo = PathBuf::from("benchmarks/real-music/listening");
    let out_desktop = root.join("ORIGAMI-listening-exports");
    fs::create_dir_all(&out_repo)?;
    fs::create_dir_all(&out_desktop)?;

    eprintln!("Loading {} …", flac.display());
    let pcm = load_flac_full(&flac)?;
    let pcm_bytes_len = (pcm.samples.len() * 2) as u64;
    let duration = pcm.frames as f64 / pcm.sample_rate as f64;

    let mut rows: Vec<Row> = Vec::new();

    // PCM fallback
    let pcm_mp5 = write_mp5(
        bytemuck::cast_slice(&pcm.samples),
        pcm.channels,
        pcm.sample_rate,
        pcm.frames,
        0,
        0,
        "MP5 PCM export (uncompressed)",
    )?;
    let p_repo = out_repo.join("ORIGAMI_pcm_fallback.mp5");
    let p_desk = out_desktop.join("ORIGAMI_pcm_fallback.mp5");
    fs::write(&p_repo, &pcm_mp5)?;
    fs::write(&p_desk, &pcm_mp5)?;
    rows.push(metric_row(
        "PCM fallback",
        0,
        "PCM",
        &pcm_mp5,
        pcm_bytes_len,
        duration,
        &pcm.samples,
        &pcm.samples,
        p_desk.display().to_string(),
    ));

    // v3 Standard reference
    let bs_v3 = mp5c::encode_v3_reference(&pcm.samples, pcm.channels, Preset::Standard);
    let mp3 = write_mp5(
        &bs_v3,
        pcm.channels,
        pcm.sample_rate,
        pcm.frames,
        1,
        1,
        "MP5-C WASM v3 (experimental)",
    )?;
    let p3 = out_repo.join("ORIGAMI_mp5c_standard_v3.mp5");
    let p3d = out_desktop.join("ORIGAMI_mp5c_standard_v3.mp5");
    fs::write(&p3, &mp3)?;
    fs::write(&p3d, &mp3)?;
    let dec3 = mp5c::decode(&bs_v3)?;
    let n = pcm.samples.len().min(dec3.len());
    rows.push(metric_row(
        "MP5-C Standard v3",
        3,
        "Standard",
        &mp3,
        pcm_bytes_len,
        duration,
        &pcm.samples[..n],
        &dec3[..n],
        p3d.display().to_string(),
    ));

    struct ExportSpec {
        label: &'static str,
        ver: u8,
        preset: Preset,
        preset_id: u8,
        encode: fn(&[i16], u8, Preset) -> Vec<u8>,
        encoder_tag: &'static str,
        fname: &'static str,
    }

    let exports: [ExportSpec; 6] = [
        ExportSpec {
            label: "MP5-C Standard v5",
            ver: 5,
            preset: Preset::Standard,
            preset_id: 1,
            encode: mp5c::encode_v5_reference,
            encoder_tag: "MP5-C Standard v5",
            fname: "ORIGAMI_mp5c_Standard_v5.mp5",
        },
        ExportSpec {
            label: "MP5-C High v4",
            ver: 4,
            preset: Preset::High,
            preset_id: 2,
            encode: mp5c::encode_v4_reference,
            encoder_tag: "MP5-C High v4",
            fname: "ORIGAMI_mp5c_High_v4.mp5",
        },
        ExportSpec {
            label: "MP5-C High v5",
            ver: 5,
            preset: Preset::High,
            preset_id: 2,
            encode: mp5c::encode_v5_reference,
            encoder_tag: "MP5-C High v5",
            fname: "ORIGAMI_mp5c_High_v5.mp5",
        },
        ExportSpec {
            label: "MP5-C High v5.1",
            ver: 6,
            preset: Preset::High,
            preset_id: 2,
            encode: mp5c::encode,
            encoder_tag: "MP5-C High v5.1",
            fname: "ORIGAMI_mp5c_High_v51.mp5",
        },
        ExportSpec {
            label: "MP5-C Extreme v5",
            ver: 5,
            preset: Preset::Extreme,
            preset_id: 3,
            encode: mp5c::encode_v5_reference,
            encoder_tag: "MP5-C Extreme v5",
            fname: "ORIGAMI_mp5c_Extreme_v5.mp5",
        },
        ExportSpec {
            label: "MP5-C Extreme v5.1",
            ver: 6,
            preset: Preset::Extreme,
            preset_id: 3,
            encode: mp5c::encode,
            encoder_tag: "MP5-C Extreme v5.1 (default)",
            fname: "ORIGAMI_mp5c_Extreme_v51.mp5",
        },
    ];

    for spec in &exports {
        let bs = (spec.encode)(&pcm.samples, pcm.channels, spec.preset);
        let mp5 = write_mp5(
            &bs,
            pcm.channels,
            pcm.sample_rate,
            pcm.frames,
            1,
            spec.preset_id,
            spec.encoder_tag,
        )?;
        let pr = out_repo.join(spec.fname);
        let pd = out_desktop.join(spec.fname);
        fs::write(&pr, &mp5)?;
        fs::write(&pd, &mp5)?;
        let dec = mp5c::decode(&bs)?;
        let n = pcm.samples.len().min(dec.len());
        rows.push(metric_row(
            spec.label,
            spec.ver,
            match spec.preset {
                Preset::Standard => "Standard",
                Preset::High => "High",
                Preset::Extreme => "Extreme",
                Preset::Low => "Low",
            },
            &mp5,
            pcm_bytes_len,
            duration,
            &pcm.samples[..n],
            &dec[..n],
            pd.display().to_string(),
        ));
    }

    write_listening_report(&out_repo.join("LISTENING_VALIDATION.md"), &rows, duration, &pcm)?;
    fs::copy(
        out_repo.join("LISTENING_VALIDATION.md"),
        out_desktop.join("LISTENING_VALIDATION.md"),
    )?;

    // Diagnostics for High v5.1 (retuned quant)
    let bs_high = mp5c::encode(&pcm.samples, pcm.channels, Preset::High);
    let dec_high = mp5c::decode(&bs_high)?;
    let n = pcm.samples.len().min(dec_high.len());
    let diag = build_report(
        &bs_high,
        &pcm.samples[..n],
        &dec_high[..n],
        pcm.sample_rate,
        pcm.channels,
        duration,
        Preset::High,
    )?;

    let mut diag_md = String::from("## High v5.1 diagnostics\n\n");
    diag_md.push_str(&format!("{:?}\n", diag.bitstream));
    fs::write(out_repo.join("DIAGNOSTICS_HIGH_V4.md"), &diag_md)?;

    eprintln!("\nExports written to:");
    eprintln!("  {}", out_repo.display());
    eprintln!("  {}", out_desktop.display());
    Ok(())
}

fn metric_row(
    label: &str,
    version: u8,
    preset: &str,
    mp5: &[u8],
    pcm_bytes: u64,
    duration: f64,
    orig: &[i16],
    dec: &[i16],
    path: String,
) -> Row {
    Row {
        label: label.to_string(),
        version,
        preset: preset.to_string(),
        mp5_bytes: mp5.len() as u64,
        pcm_bytes,
        ratio: mp5.len() as f64 / pcm_bytes as f64,
        snr: snr_db(&i16_to_f32(orig), &i16_to_f32(dec)),
        peak_err: mp5c::peak_error(orig, dec),
        rms_err: mp5c::rms_error(orig, dec),
        clipped: orig
            .iter()
            .zip(dec.iter())
            .filter(|(_, d)| d.abs() >= 32767)
            .count() as u32,
        bitrate_kbps: (mp5.len() as f64 * 8.0 / duration) / 1000.0,
        path,
    }
}

fn write_listening_report(
    path: &Path,
    rows: &[Row],
    duration: f64,
    pcm: &Pcm,
) -> Result<(), Box<dyn std::error::Error>> {
    let std_v3 = rows.iter().find(|r| r.label.contains("v3"));
    let std_v5 = rows.iter().find(|r| r.label == "MP5-C Standard v5");
    let high_v51 = rows.iter().find(|r| r.label == "MP5-C High v5.1");
    let extreme = rows.iter().find(|r| r.label == "MP5-C Extreme v5.1");
    let pcm_r = rows.iter().find(|r| r.label == "PCM fallback");

    let mut md = String::from("# ORIGAMI listening validation (hiss investigation exports)\n\n");
    md.push_str("Generated by `pnpm export:origami-listening`. MP5-C is **experimental**.\n\n");
    md.push_str(&format!(
        "Source: `- ORIGAMI!.flac` — {:.1}s, {} Hz, {} ch\n\n",
        duration, pcm.sample_rate, pcm.channels
    ));

    md.push_str("## Fresh export table\n\n");
    md.push_str("| Export | Ver | Ratio vs PCM | SNR | Peak err | RMS err | Clips | Bitrate | Path |\n");
    md.push_str("|--------|-----|--------------|-----|----------|---------|-------|---------|------|\n");
    for r in rows {
        md.push_str(&format!(
            "| {} | v{} | {:.3} | {:.1} dB | {:.4} | {:.4} | {} | {:.0} kbps | `{}` |\n",
            r.label, r.version, r.ratio, r.snr, r.peak_err, r.rms_err, r.clipped, r.bitrate_kbps, r.path
        ));
    }

    md.push_str("\n## A/B comparisons (metrics)\n\n");
    if let (Some(a), Some(b)) = (std_v3, std_v5) {
        md.push_str(&format!(
            "- **Standard v5 vs v3**: SNR {:.1} → {:.1} dB (+{:.1}); ratio {:.3} → {:.3}\n",
            a.snr, b.snr, b.snr - a.snr, a.ratio, b.ratio
        ));
    }
    if let (Some(a), Some(b)) = (std_v5, high_v51) {
        md.push_str(&format!(
            "- **Standard v5 vs High v5.1**: SNR {:.1} → {:.1} dB (+{:.1}); ratio {:.3} → {:.3}\n",
            a.snr, b.snr, b.snr - a.snr, a.ratio, b.ratio
        ));
    }
    if let (Some(a), Some(b)) = (high_v51, extreme) {
        md.push_str(&format!(
            "- **High v5.1 vs Extreme v5.1**: SNR {:.1} → {:.1} dB (+{:.1}); ratio {:.3} → {:.3}\n",
            a.snr, b.snr, b.snr - a.snr, a.ratio, b.ratio
        ));
    }
    if let (Some(a), Some(_)) = (extreme, pcm_r) {
        md.push_str(&format!(
            "- **Extreme v5.1 vs PCM**: {:.1} dB SNR; {:.1}% of PCM size\n",
            a.snr,
            a.ratio * 100.0
        ));
    }

    md.push_str("\n## Ear-test focus (hiss investigation)\n\n");
    md.push_str("A/B these exports in order:\n\n");
    md.push_str("1. `ORIGAMI_pcm_fallback.mp5` — reference\n");
    md.push_str("2. `ORIGAMI_mp5c_Extreme_v51.mp5` — **converter default**\n");
    md.push_str("3. `ORIGAMI_mp5c_High_v51.mp5` — retuned High quant\n");
    md.push_str("4. `ORIGAMI_mp5c_High_v4.mp5` / `High_v5.mp5` — same quant as v5.1 on flat path\n");
    md.push_str("5. `ORIGAMI_mp5c_Standard_v5.mp5` — expect more hiss\n\n");
    md.push_str("See `benchmarks/real-music/HISS_INVESTIGATION.md` for quiet/HF metrics.\n\n");

    md.push_str("## Preset recommendation\n\n");
    md.push_str("| Preset | Role |\n|--------|------|\n");
    md.push_str("| Low | Preview only |\n");
    md.push_str("| Standard | Smaller — **may hiss** |\n");
    md.push_str("| High | Balanced — retuned; ear-test before restoring as default |\n");
    md.push_str("| **Extreme** | **Default for listening** — cleanest quiet metrics |\n\n");
    md.push_str("### Default: **Extreme v5.1**\n\n");
    md.push_str("High hiss was quantization-limited, not packing. Do not relax v5.1 band heuristics until ear validation passes.\n\n");

    fs::write(path, md)?;
    Ok(())
}

fn load_flac_full(path: &Path) -> Result<Pcm, Box<dyn std::error::Error>> {
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

fn write_mp5(
    audi: &[u8],
    channels: u8,
    sample_rate: u32,
    frames_per_ch: usize,
    codec_id: u8,
    preset_id: u8,
    encoder: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut head = vec![0u8; 32];
    head[0] = codec_id;
    head[1] = channels;
    head[2] = 16;
    head[3] = preset_id;
    head[4..8].copy_from_slice(&sample_rate.to_le_bytes());
    head[8..16].copy_from_slice(&(frames_per_ch as u64).to_le_bytes());
    head[16..18].copy_from_slice(&1u16.to_le_bytes());
    let mut audi_wr = Vec::with_capacity(10 + audi.len());
    audi_wr.extend_from_slice(&0u32.to_le_bytes());
    audi_wr.extend_from_slice(&(audi.len() as u32).to_le_bytes());
    audi_wr.push(0);
    audi_wr.push(0);
    audi_wr.extend_from_slice(audi);
    let title = encoder.as_bytes();
    let mut meta = Vec::new();
    meta.extend_from_slice(&1u32.to_le_bytes());
    meta.push(5);
    meta.extend_from_slice(b"title");
    meta.extend_from_slice(&(title.len() as u32).to_le_bytes());
    meta.extend_from_slice(title);
    let mut info = Vec::new();
    info.extend_from_slice(&1u32.to_le_bytes());
    info.push(7);
    info.extend_from_slice(b"encoder");
    info.extend_from_slice(&(encoder.len() as u32).to_le_bytes());
    info.extend_from_slice(encoder.as_bytes());
    let wave = {
        let mut w = vec![0u8; 16];
        w[0..4].copy_from_slice(&3u32.to_le_bytes());
        w[4..8].copy_from_slice(&0.1f32.to_le_bytes());
        w[8..12].copy_from_slice(&0.5f32.to_le_bytes());
        w[12..16].copy_from_slice(&0.9f32.to_le_bytes());
        w
    };
    let seek = [0u8; 16];
    let mut parts: Vec<Vec<u8>> = Vec::new();
    for (fourcc, payload) in [
        ("HEAD", head.as_slice()),
        ("META", meta.as_slice()),
        ("AUDI", audi_wr.as_slice()),
        ("SEEK", seek.as_slice()),
        ("WAVE", wave.as_slice()),
        ("INFO", info.as_slice()),
    ] {
        let mut header = vec![0u8; 16];
        for (i, b) in fourcc.bytes().enumerate() {
            header[i] = b;
        }
        header[4..8].copy_from_slice(&(payload.len() as u32).to_le_bytes());
        header[8..10].copy_from_slice(&1u16.to_le_bytes());
        header[12..16].copy_from_slice(&crc32fast::hash(payload).to_le_bytes());
        let mut chunk = header;
        chunk.extend_from_slice(payload);
        parts.push(chunk);
    }
    let mut out = Vec::new();
    out.extend_from_slice(b"MP5A");
    out.extend_from_slice(&1u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    for p in parts {
        out.extend_from_slice(&p);
    }
    Ok(out)
}
