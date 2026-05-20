//! Run with: cargo test -p mp5-codec mp5c_bench_report -- --nocapture

#[cfg(test)]
mod run {
    use crate::mp5c::fixtures;
    use crate::mp5c::{self, Preset};
    use crate::pcm::{i16_to_f32, snr_db};
    use std::time::Instant;

    const PRESETS: [(Preset, &str); 4] = [
        (Preset::Low, "Low"),
        (Preset::Standard, "Standard"),
        (Preset::High, "High"),
        (Preset::Extreme, "Extreme"),
    ];

    fn audible_note(preset: &str, snr: f64, ratio: f64, peak_err: f32) -> String {
        let mut parts = Vec::new();
        if snr < 20.0 {
            parts.push("low SNR — audible quantization");
        } else if snr < 28.0 {
            parts.push("moderate SNR — may hear grain on sine/noise");
        }
        if ratio > 1.0 {
            parts.push("larger than PCM (header/overhead or fine quant)");
        }
        if peak_err > 0.02 {
            parts.push("peak error >2% FS");
        }
        if preset == "Extreme" && ratio > 0.98 {
            parts.push("Extreme prioritizes quality over size");
        }
        if parts.is_empty() {
            "ok".into()
        } else {
            parts.join("; ")
        }
    }

    #[test]
    fn mp5c_bench_report() {
        println!("\n=== MP5-C experimental benchmark (v3) ===\n");

        for fx in fixtures::all_fixtures() {
            let pcm_bytes = fx.samples.len() * 2;
            println!("## Fixture: {} ({} ch, {} samples, PCM {} bytes)", 
                fx.name, fx.channels, fx.samples.len() / fx.channels as usize, pcm_bytes);

            println!(
                "| Preset | Bitstream | Ratio vs PCM | SNR dB | Peak err | RMS err | Encode ms | Decode ms | Notes |"
            );
            println!("|--------|-----------|--------------|--------|----------|---------|-----------|-----------|-------|");

            // PCM row
            println!(
                "| PCM fallback | {} | 1.000 | — | 0 | 0 | — | — | uncompressed |",
                pcm_bytes
            );

            for (preset, label) in PRESETS {
                let t0 = Instant::now();
                let enc = mp5c::encode(&fx.samples, fx.channels, preset);
                let enc_ms = t0.elapsed().as_secs_f64() * 1000.0;

                let t1 = Instant::now();
                let dec = mp5c::decode(&enc).expect("decode");
                let dec_ms = t1.elapsed().as_secs_f64() * 1000.0;

                let n = fx.samples.len().min(dec.len());
                let snr = snr_db(
                    &i16_to_f32(&fx.samples[..n]),
                    &i16_to_f32(&dec[..n]),
                );
                let peak = mp5c::peak_error(&fx.samples[..n], &dec[..n]);
                let rms = mp5c::rms_error(&fx.samples[..n], &dec[..n]);
                let ratio = enc.len() as f64 / pcm_bytes as f64;
                let note = audible_note(label, snr, ratio, peak);

                println!(
                    "| {} | {} | {:.3} | {:.1} | {:.4} | {:.4} | {:.2} | {:.2} | {} |",
                    label, enc.len(), ratio, snr, peak, rms, enc_ms, dec_ms, note
                );
            }
            println!();
        }

        // Overhead analysis on short sine
        let short = fixtures::all_fixtures()
            .into_iter()
            .find(|f| f.name == "sine_0.5s_short")
            .expect("short sine fixture");
        let enc = mp5c::encode(&short.samples, short.channels, Preset::Extreme);
        let frames = u32::from_le_bytes(enc[4..8].try_into().unwrap());
        let header = 8usize;
        let frame_hdr = 3usize;
        let per_frame = frame_hdr; // min silence payload 0
        let overhead = header + (frames as usize * 2 * per_frame);
        println!("--- Short sine Extreme overhead ---");
        println!("frames/ch: {frames}, stream header: {header} B");
        println!("min frame headers (stereo): ~{} B, total enc: {} B, PCM: {} B",
            frames as usize * 2 * per_frame, enc.len(), short.samples.len() * 2);
        println!("v3 uses 3-byte frame headers (vs v2 8-byte) + 2048-sample frames + rice/silence\n");
    }
}
