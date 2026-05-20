//! MP5-C transparency blocker — silence, quiet fixtures, ORIGAMI artifact pass.
//!   cargo run --release -p mp5-codec --features bench_tools --bin bench_mp5c_blocker

use mp5_codec::mp5c::{self, analyze_slice, run_blocker_suite};
use mp5_codec::mp5l;
use mp5_codec::pcm::snr_db;
use std::fs;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let report = run_blocker_suite(48000, 2)?;
    let mut md = report.to_markdown();

    let root = std::env::var("MP5_BENCH_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(r"C:\\Users\\colli\\OneDrive\\Desktop"));
    let flac = root.join("- ORIGAMI!.flac");
    if flac.exists() {
        md.push_str("\n## ORIGAMI headphone path comparison\n\n");
        let pcm = load_flac(&flac)?;
        let pcm_bytes = pcm.len() * 2;
        md.push_str("| Path | Ratio | SNR | Quiet SNR | Noise floor RMS | Max abs err |\n");
        md.push_str("|------|-------|-----|-----------|-----------------|-------------|\n");

        let dec_pcm: Vec<i16> = pcm.clone();
        row(&mut md, "PCM (identity)", 1.0, &pcm, &dec_pcm, pcm_bytes);

        let bs_l = mp5l::encode(&pcm, 2);
        let dec_l = mp5l::decode(&bs_l)?;
        row(&mut md, "MP5-L", bs_l.len() as f64 / pcm_bytes as f64, &pcm, &dec_l, pcm_bytes);

        for (name, preset) in [
            ("MP5-C Standard", mp5_codec::mp5c::Preset::Standard),
            ("MP5-C High", mp5_codec::mp5c::Preset::High),
            ("MP5-C Extreme", mp5_codec::mp5c::Preset::Extreme),
        ] {
            let bs = mp5c::encode(&pcm, 2, preset);
            let dec = mp5c::decode(&bs)?;
            row(
                &mut md,
                name,
                bs.len() as f64 / pcm_bytes as f64,
                &pcm,
                &dec,
                pcm_bytes,
            );
        }
    } else {
        md.push_str("\n(Skip ORIGAMI — FLAC not found.)\n");
    }

    let out = PathBuf::from("benchmarks/real-music/MP5C_BLOCKER_REPORT.md");
    fs::create_dir_all(out.parent().unwrap())?;
    fs::write(&out, &md)?;
    eprintln!("{}", report.verdict);
    eprintln!("Wrote {}", out.display());
    Ok(())
}

fn row(md: &mut String, label: &str, ratio: f64, orig: &[i16], dec: &[i16], pcm_bytes: usize) {
    let n = orig.len().min(dec.len());
    let m = analyze_slice("full", label, &orig[..n], &dec[..n], 48000, 2, ratio);
    let max_err = (0..n)
        .map(|i| (orig[i] as i32 - dec[i] as i32).abs())
        .max()
        .unwrap_or(0);
    md.push_str(&format!(
        "| {} | {:.3} | {:.1} | {:.1} | {:.6} | {} |\n",
        label, ratio, m.full_snr_db, m.quiet_snr_db, m.noise_floor_rms, max_err
    ));
    let _ = pcm_bytes;
}

fn load_flac(path: &PathBuf) -> Result<Vec<i16>, Box<dyn std::error::Error>> {
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
    let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(2);
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
    let mut interleaved = Vec::with_capacity(frames * channels);
    for i in 0..frames {
        for c in 0..channels {
            interleaved.push(planes[c][i]);
        }
    }
    Ok(interleaved)
}
