//! Real-music MP5-C v3 benchmark.
//!   cargo run --bin bench_real_music --release

use mp5_codec::mp5c::{self, build_report, Preset};
use mp5_codec::pcm::{i16_to_f32, snr_db};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

const PRESETS: [(Preset, &str, u8); 4] = [
    (Preset::Low, "Low", 0),
    (Preset::Standard, "Standard", 1),
    (Preset::High, "High", 2),
    (Preset::Extreme, "Extreme", 3),
];

#[derive(Debug, Deserialize)]
struct Manifest {
    sources: Vec<SourceSpec>,
    #[serde(default)]
    v2_regression: Option<V2Regression>,
}

#[derive(Debug, Deserialize)]
struct SourceSpec {
    id: String,
    file: String,
    category: String,
    #[serde(default)]
    start_sec: Option<f64>,
    #[serde(default)]
    duration_sec: Option<f64>,
    #[serde(default)]
    quiet_window_sec: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct V2Regression {
    file: String,
}

#[derive(Debug, serde::Serialize)]
struct BenchRow {
    source_id: String,
    category: String,
    preset: String,
    source_path: String,
    export_path: String,
    duration_sec: f64,
    sample_rate: u32,
    channels: u8,
    pcm_mp5_bytes: u64,
    mp5c_bytes: u64,
    ratio_vs_pcm: f64,
    encode_ms: f64,
    decode_ms: f64,
    snr_db: f64,
    peak_error: f32,
    rms_error: f32,
    clipped_samples: u32,
    duration_match: bool,
    playback_note: String,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::var("MP5_BENCH_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\Users\colli\OneDrive\Desktop"));
    let manifest_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("benchmarks/real-music/manifest.json"));
    let manifest: Manifest = serde_json::from_str(&fs::read_to_string(&manifest_path)?)?;
    let out_dir = PathBuf::from("benchmarks/real-music/exports");
    fs::create_dir_all(&out_dir)?;

    let mut rows: Vec<BenchRow> = Vec::new();

    for spec in &manifest.sources {
        let src_path = root.join(&spec.file);
        if !src_path.exists() {
            eprintln!("SKIP {} — not found: {}", spec.id, src_path.display());
            continue;
        }
        eprintln!("Processing {} …", spec.id);
        let pcm = load_flac_pcm(&src_path, spec)?;
        let pcm_bytes: &[u8] = bytemuck::cast_slice(&pcm.samples);
        let pcm_mp5 = write_mp5(
            pcm_bytes,
            pcm.channels,
            pcm.sample_rate,
            pcm.frames_per_ch,
            0,
            0,
            "MP5 PCM export (uncompressed)",
        )?;
        let pcm_path = out_dir.join(format!("{}_pcm.mp5", spec.id));
        fs::write(&pcm_path, &pcm_mp5)?;

        rows.push(make_row(
            spec,
            &src_path,
            &pcm_path,
            "PCM",
            &pcm,
            &pcm.samples,
            &pcm.samples,
            0.0,
            0.0,
            pcm_mp5.len() as u64,
            pcm_mp5.len() as u64,
            0,
            true,
        ));

        for (preset, label, preset_id) in PRESETS {
            let t0 = Instant::now();
            let bitstream = mp5c::encode(&pcm.samples, pcm.channels, preset);
            let enc_ms = t0.elapsed().as_secs_f64() * 1000.0;

            let mp5 = write_mp5(
                &bitstream,
                pcm.channels,
                pcm.sample_rate,
                pcm.frames_per_ch,
                1,
                preset_id,
                "MP5-C WASM v4 (experimental)",
            )?;
            let export_path = out_dir.join(format!("{}_mp5c_{}.mp5", spec.id, label.to_lowercase()));
            fs::write(&export_path, &mp5)?;

            let t1 = Instant::now();
            let decoded = mp5c::decode(&bitstream)?;
            let dec_ms = t1.elapsed().as_secs_f64() * 1000.0;
            let n = pcm.samples.len().min(decoded.len());
            let expected = pcm.frames_per_ch * pcm.channels as usize;
            let duration_match = decoded.len() >= expected.saturating_sub(pcm.channels as usize * mp5c::FRAME_SIZE_V3);

            rows.push(make_row(
                spec,
                &src_path,
                &export_path,
                label,
                &pcm,
                &pcm.samples[..n],
                &decoded[..n],
                enc_ms,
                dec_ms,
                pcm_mp5.len() as u64,
                mp5.len() as u64,
                count_clipped(&decoded[..n]),
                duration_match,
            ));
        }
    }

    if let Some(v2) = manifest.v2_regression {
        let p = root.join(&v2.file);
        if p.exists() {
            match test_v2_file(&p) {
                Ok(msg) => eprintln!("v2 regression: {msg}"),
                Err(e) => eprintln!("v2 regression FAIL: {e}"),
            }
        }
    }

    let report_path = PathBuf::from("benchmarks/real-music/REPORT.md");
    write_report(&report_path, &rows)?;

    if let Some(full) = rows.iter().find(|r| r.source_id == "origami_full" && r.preset == "Standard") {
        run_origami_diagnostics(root.as_path(), full)?;
    }
    run_rate_comparison(root.as_path())?;

    println!("{}", serde_json::to_string_pretty(&rows)?);
    eprintln!("Wrote {}", report_path.display());
    Ok(())
}

fn run_rate_comparison(root: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let flac = root.join("- ORIGAMI!.flac");
    if !flac.exists() {
        return Ok(());
    }
    let spec = SourceSpec {
        id: "origami_full".into(),
        file: "- ORIGAMI!.flac".into(),
        category: "rate_compare".into(),
        start_sec: None,
        duration_sec: None,
        quiet_window_sec: None,
    };
    let native = load_flac_pcm(&flac, &spec)?;
    let resampled = resample_pcm(&native.samples, native.channels, native.sample_rate, 44100);

    let mut lines = vec!["## 48 kHz native vs 44.1 kHz resampled (ORIGAMI full, Standard)\n".to_string()];
    for (label, pcm, sr) in [
        ("48k native", native.samples.as_slice(), native.sample_rate),
        ("44.1k resampled", resampled.as_slice(), 44100u32),
    ] {
        let bs = mp5c::encode(pcm, native.channels, Preset::Standard);
        let dec = mp5c::decode(&bs)?;
        let n = pcm.len().min(dec.len());
        let snr = snr_db(&i16_to_f32(&pcm[..n]), &i16_to_f32(&dec[..n]));
        let pcm_b = (pcm.len() * 2) as u64;
        let dur = (pcm.len() / native.channels as usize) as f64 / sr as f64;
        lines.push(format!(
            "- **{label}**: MP5-C {} bytes, ratio {:.3}, SNR {:.1} dB, bitrate {:.0} kbps",
            bs.len(),
            bs.len() as f64 / pcm_b as f64,
            snr,
            (bs.len() as f64 * 8.0) / dur / 1000.0
        ));
    }
    lines.push("\nConverter exports at 44.1 kHz may differ from native 48 kHz FLAC bench.\n".into());
    fs::write("benchmarks/real-music/RATE_COMPARE.md", lines.join("\n"))?;
    Ok(())
}

fn run_origami_diagnostics(root: &Path, _row: &BenchRow) -> Result<(), Box<dyn std::error::Error>> {
    let flac = root.join("- ORIGAMI!.flac");
    if !flac.exists() {
        return Ok(());
    }
    let spec = SourceSpec {
        id: "origami_full".into(),
        file: "- ORIGAMI!.flac".into(),
        category: "full".into(),
        start_sec: None,
        duration_sec: None,
        quiet_window_sec: None,
    };
    let pcm = load_flac_pcm(&flac, &spec)?;
    let bs = mp5c::encode(&pcm.samples, pcm.channels, Preset::Standard);
    let dec = mp5c::decode(&bs)?;
    let n = pcm.samples.len().min(dec.len());
    let report = build_report(
        &bs,
        &pcm.samples[..n],
        &dec[..n],
        pcm.sample_rate,
        pcm.channels,
        pcm.duration_sec(),
        Preset::Standard,
    )?;
    let mut md = String::from("# MP5-C codec diagnostics (ORIGAMI full, Standard v4)\n\n");
    md.push_str(&format!("{:?}\n\n", report.bitstream));
    md.push_str("\n## Notes\n");
    for n in &report.notes {
        md.push_str(&format!("- {n}\n"));
    }
    md.push_str("\n## Per-window SNR\n| Window | SNR dB | RMS err | Peak err | Clips |\n|--------|--------|---------|----------|-------|\n");
    for w in &report.windows {
        md.push_str(&format!(
            "| {} ({:.0}-{:.0}s) | {:.1} | {:.4} | {:.4} | {} |\n",
            w.label, w.start_sec, w.end_sec, w.snr_db, w.rms_error, w.peak_error, w.clipped_samples
        ));
    }
    fs::write("benchmarks/real-music/DIAGNOSTICS.md", md)?;
    Ok(())
}

fn resample_pcm(samples: &[i16], channels: u8, from_rate: u32, to_rate: u32) -> Vec<i16> {
    if from_rate == to_rate {
        return samples.to_vec();
    }
    let ch = channels.max(1) as usize;
    let in_frames = samples.len() / ch;
    let out_frames = (in_frames as u64 * to_rate as u64 / from_rate as u64) as usize;
    let mut out = Vec::with_capacity(out_frames * ch);
    for of in 0..out_frames {
        let src_f = of as f64 * from_rate as f64 / to_rate as f64;
        let i0 = src_f.floor() as usize;
        let i1 = (i0 + 1).min(in_frames.saturating_sub(1));
        let t = (src_f - i0 as f64) as f32;
        for c in 0..ch {
            let s0 = samples[i0 * ch + c] as f32;
            let s1 = samples[i1 * ch + c] as f32;
            let v = s0 * (1.0 - t) + s1 * t;
            out.push(v.round().clamp(-32768.0, 32767.0) as i16);
        }
    }
    out
}

fn make_row(
    spec: &SourceSpec,
    src: &Path,
    export: &Path,
    preset: &str,
    pcm: &PcmData,
    original: &[i16],
    decoded: &[i16],
    enc_ms: f64,
    dec_ms: f64,
    pcm_bytes: u64,
    mp5_bytes: u64,
    clipped: u32,
    duration_match: bool,
) -> BenchRow {
    let n = original.len().min(decoded.len());
    BenchRow {
        source_id: spec.id.clone(),
        category: spec.category.clone(),
        preset: preset.to_string(),
        source_path: src.display().to_string(),
        export_path: export.display().to_string(),
        duration_sec: pcm.duration_sec(),
        sample_rate: pcm.sample_rate,
        channels: pcm.channels,
        pcm_mp5_bytes: pcm_bytes,
        mp5c_bytes: mp5_bytes,
        ratio_vs_pcm: mp5_bytes as f64 / pcm_bytes as f64,
        encode_ms: enc_ms,
        decode_ms: dec_ms,
        snr_db: snr_db(&i16_to_f32(&original[..n]), &i16_to_f32(&decoded[..n])),
        peak_error: mp5c::peak_error(&original[..n], &decoded[..n]),
        rms_error: mp5c::rms_error(&original[..n], &decoded[..n]),
        clipped_samples: clipped,
        duration_match,
        playback_note: if preset == "PCM" {
            "PCM passthrough — reference".into()
        } else {
            "Decode OK — confirm by ear in player".into()
        },
    }
}

fn count_clipped(s: &[i16]) -> u32 {
    s.iter().filter(|&&x| x.abs() >= 32767).count() as u32
}

struct PcmData {
    samples: Vec<i16>,
    channels: u8,
    sample_rate: u32,
    frames_per_ch: usize,
}

impl PcmData {
    fn duration_sec(&self) -> f64 {
        self.frames_per_ch as f64 / self.sample_rate as f64
    }
}

fn load_flac_pcm(path: &Path, spec: &SourceSpec) -> Result<PcmData, Box<dyn std::error::Error>> {
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
        .ok_or("no audio track")?
        .clone();
    let track_id = track.id;
    let mut decoder =
        symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default())?;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let channels = track
        .codec_params
        .channels
        .map(|c| c.count())
        .unwrap_or(2) as u8;

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

    let total_frames = planes[0].len();
    let mut interleaved = Vec::with_capacity(total_frames * channels as usize);
    for i in 0..total_frames {
        for c in 0..channels as usize {
            interleaved.push(planes[c].get(i).copied().unwrap_or(0));
        }
    }

    let (start, len) = select_window(&interleaved, channels, sample_rate, spec, total_frames);
    let off = start * channels as usize;
    let end = off + len * channels as usize;
    Ok(PcmData {
        samples: interleaved[off..end].to_vec(),
        channels,
        sample_rate,
        frames_per_ch: len,
    })
}

fn select_window(
    interleaved: &[i16],
    channels: u8,
    sample_rate: u32,
    spec: &SourceSpec,
    total_frames: usize,
) -> (usize, usize) {
    if let Some(qsec) = spec.quiet_window_sec {
        let win = (qsec * sample_rate as f64) as usize;
        let mut best_start = 0usize;
        let mut best_rms = f64::MAX;
        let step = (sample_rate as usize / 4).max(1);
        let mut start = 0usize;
        while start + win <= total_frames {
            let mut sum = 0.0f64;
            for i in start..start + win {
                for c in 0..channels as usize {
                    let s = interleaved[i * channels as usize + c] as f64 / 32768.0;
                    sum += s * s;
                }
            }
            let rms = (sum / (win as f64 * channels as f64)).sqrt();
            if rms < best_rms {
                best_rms = rms;
                best_start = start;
            }
            start += step;
        }
        return (best_start, win.min(total_frames.saturating_sub(best_start)));
    }
    let start = (spec.start_sec.unwrap_or(0.0) * sample_rate as f64) as usize;
    let len = spec
        .duration_sec
        .map(|d| (d * sample_rate as f64) as usize)
        .unwrap_or(total_frames.saturating_sub(start));
    let start = start.min(total_frames);
    (start, len.min(total_frames.saturating_sub(start)))
}

fn crc32(data: &[u8]) -> u32 {
    crc32fast::hash(data)
}

fn write_mp5(
    audi_payload: &[u8],
    channels: u8,
    sample_rate: u32,
    frames_per_ch: usize,
    codec_id: u8,
    preset_id: u8,
    encoder: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let total_samples = frames_per_ch as u64;
    let mut parts: Vec<Vec<u8>> = Vec::new();

    let mut head = vec![0u8; 32];
    head[0] = codec_id;
    head[1] = channels;
    head[2] = 16;
    head[3] = preset_id;
    head[4..8].copy_from_slice(&sample_rate.to_le_bytes());
    head[8..16].copy_from_slice(&total_samples.to_le_bytes());
    head[16..18].copy_from_slice(&1u16.to_le_bytes());

    let mut audi = Vec::with_capacity(10 + audi_payload.len());
    audi.extend_from_slice(&0u32.to_le_bytes());
    audi.extend_from_slice(&(audi_payload.len() as u32).to_le_bytes());
    audi.push(0);
    audi.push(0);
    audi.extend_from_slice(audi_payload);

    let title = encoder.as_bytes();
    let mut meta = Vec::new();
    meta.extend_from_slice(&(1u32.to_le_bytes()));
    meta.push(5);
    meta.extend_from_slice(b"title");
    meta.extend_from_slice(&(title.len() as u32).to_le_bytes());
    meta.extend_from_slice(title);

    let mut info = Vec::new();
    info.extend_from_slice(&(1u32.to_le_bytes()));
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

    let mut seek = vec![0u8; 16];
    seek[0..8].copy_from_slice(&0u64.to_le_bytes());
    seek[8..16].copy_from_slice(&0u64.to_le_bytes());

    push_chunk(&mut parts, "HEAD", &head);
    push_chunk(&mut parts, "META", &meta);
    push_chunk(&mut parts, "AUDI", &audi);
    push_chunk(&mut parts, "SEEK", &seek);
    push_chunk(&mut parts, "WAVE", &wave);
    push_chunk(&mut parts, "INFO", &info);

    let mut out = Vec::new();
    out.extend_from_slice(b"MP5A");
    out.extend_from_slice(&1u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    for p in parts {
        out.extend_from_slice(&p);
    }
    Ok(out)
}

fn push_chunk(parts: &mut Vec<Vec<u8>>, fourcc: &str, payload: &[u8]) {
    let mut header = vec![0u8; 16];
    for (i, b) in fourcc.bytes().enumerate() {
        header[i] = b;
    }
    header[4..8].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    header[8..10].copy_from_slice(&1u16.to_le_bytes());
    header[12..16].copy_from_slice(&crc32(payload).to_le_bytes());
    let mut chunk = header;
    chunk.extend_from_slice(payload);
    parts.push(chunk);
}

fn test_v2_file(path: &Path) -> Result<String, String> {
    let data = fs::read(path).map_err(|e| e.to_string())?;
    let audi = extract_audi(&data).ok_or("no AUDI")?;
    if audi.len() < 2 || audi[0] != 0x43 {
        return Err("not MP5-C bitstream".into());
    }
    if audi[1] != 2 {
        return Err(format!("expected v2, got version {}", audi[1]));
    }
    let decoded = mp5c::decode(audi)?;
    Ok(format!(
        "v2 decode OK, {} samples, version byte {}",
        decoded.len(),
        audi[1]
    ))
}

fn extract_audi(file: &[u8]) -> Option<&[u8]> {
    if file.len() < 12 || &file[0..4] != b"MP5A" {
        return None;
    }
    let mut pos = 12usize;
    while pos + 16 <= file.len() {
        let fourcc = std::str::from_utf8(&file[pos..pos + 4]).ok()?;
        let len = u32::from_le_bytes(file[pos + 4..pos + 8].try_into().ok()?) as usize;
        pos += 16;
        if pos + len > file.len() {
            break;
        }
        if fourcc == "AUDI" {
            let payload = &file[pos..pos + len];
            if payload.len() > 10 {
                let blen = u32::from_le_bytes(payload[4..8].try_into().ok()?) as usize;
                if 10 + blen <= payload.len() {
                    return Some(&payload[10..10 + blen]);
                }
            }
        }
        pos += len;
    }
    None
}

fn write_report(path: &Path, rows: &[BenchRow]) -> Result<(), Box<dyn std::error::Error>> {
    let mut md = String::from("# MP5-C v3 real music validation report\n\n");
    md.push_str("Generated by `pnpm bench:real-music`. MP5-C is **experimental**.\n\n");
    if rows.is_empty() {
        md.push_str("_No sources found. Set MP5_BENCH_ROOT or add FLAC files._\n");
        fs::write(path, md)?;
        return Ok(());
    }
    md.push_str("| Source | Category | Preset | PCM MP5 | MP5-C | Ratio | SNR | Peak err | RMS | Clip | Dur OK | Encode ms | Decode ms | Notes |\n");
    md.push_str("|--------|----------|--------|---------|-------|-------|-----|----------|-----|------|--------|-----------|-----------|-------|\n");
    for r in rows {
        md.push_str(&format!(
            "| {} | {} | {} | {} | {} | {:.3} | {:.1} | {:.4} | {:.4} | {} | {} | {:.0} | {:.0} | {} |\n",
            r.source_id,
            r.category,
            r.preset,
            r.pcm_mp5_bytes,
            r.mp5c_bytes,
            r.ratio_vs_pcm,
            r.snr_db,
            r.peak_error,
            r.rms_error,
            r.clipped_samples,
            if r.duration_match { "yes" } else { "no" },
            r.encode_ms,
            r.decode_ms,
            r.playback_note,
        ));
    }
    fs::write(path, md)?;
    Ok(())
}
