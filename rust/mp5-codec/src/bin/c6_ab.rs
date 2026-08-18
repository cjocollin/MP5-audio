//! c6_ab — tuning harness: encode a raw s16le stereo file with CodecId 6,
//! decode, write the decoded raw. Keeps psycho-model tuning at cargo speed
//! (no wasm-pack round-trip per iteration).
//!
//! Usage: c6_ab <in.raw> <out.raw> <preset 0-3> <sample_rate> <joint 0|1> <windows 0|1> <psycho 0|1>
//! Prints: stream bytes, kbps (needs duration from input), full SNR dB.

use mp5_codec::{mp5c::Preset, mp5c2, mp5c6};
use std::io::Write;

fn snr_db(a: &[i16], b: &[i16]) -> f64 {
    let mut s = 0f64;
    let mut e = 0f64;
    for i in 0..a.len().min(b.len()) {
        s += (a[i] as f64) * (a[i] as f64);
        let d = a[i] as f64 - b[i] as f64;
        e += d * d;
    }
    10.0 * (s / e.max(1e-12)).log10()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 8 {
        eprintln!("usage: c6_ab <in.raw> <out.raw> <preset> <sr> <joint> <windows> <psycho>");
        std::process::exit(1);
    }
    let raw = std::fs::read(&args[1]).expect("read input");
    let mut samples = Vec::with_capacity(raw.len() / 2);
    for ch in raw.chunks_exact(2) {
        samples.push(i16::from_le_bytes([ch[0], ch[1]]));
    }
    let preset = Preset::from_u8(args[3].parse().unwrap()).unwrap_or(Preset::High);
    let sr: u32 = args[4].parse().unwrap();
    let joint = args[5] == "1";
    let windows = args[6] == "1";
    let psycho = args[7] == "1";

    let options = mp5c6::EncodeOptions {
        profile_id: if joint || windows || psycho {
            mp5c6::PROFILE_PHASE5
        } else {
            mp5c6::DEFAULT_PROFILE
        },
        joint_stereo: joint,
        window_switching: windows,
        psycho,
    };
    let stream = mp5c6::encode_with_options(
        &samples,
        2,
        preset,
        mp5c2::ProtectParams::widened(mp5c6::PROTECT_SCALE),
        sr,
        mp5c6::RateMode::Off,
        options,
    )
    .expect("encode");
    let decoded = mp5c6::decode(&stream).expect("decode");

    let secs = samples.len() as f64 / 2.0 / sr as f64;
    let kbps = stream.len() as f64 * 8.0 / secs / 1000.0;
    println!(
        "bytes {} | {:.1} kbps | SNR {:.2} dB",
        stream.len(),
        kbps,
        snr_db(&samples, &decoded)
    );

    // Optional 9th arg: also write the encoded stream (for container wrapping).
    if let Some(stream_path) = args.get(8) {
        std::fs::write(stream_path, &stream).expect("write stream");
    }

    let mut out = Vec::with_capacity(decoded.len() * 2);
    for s in &decoded {
        out.write_all(&s.to_le_bytes()).unwrap();
    }
    std::fs::write(&args[2], out).expect("write output");
}
