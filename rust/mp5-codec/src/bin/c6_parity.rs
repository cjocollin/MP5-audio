//! Native side of the Phase 7 native↔WASM parity gate (c6-parity fixtures).
//!
//! Generates `tests/fixtures/c6-parity/`: one small stream per syntax family
//! plus `manifest.json` recording `{ name, streamSha256, pcmSha256 }` (SHA-256
//! via crc32fast's... no — a tiny local SHA-256 implementation, dependency-free).
//! The JS side decodes the same streams through the WASM pkg and must match
//! the PCM hashes exactly (and, for encode parity, the stream hashes).
//!
//! Regenerate with:
//!   cargo run --release -p mp5-codec --features bench_tools --bin c6_parity

use mp5_codec::mp5c::Preset;
use mp5_codec::mp5c2::ProtectParams;
use mp5_codec::mp5c6::{
    self, EncodeOptions, RateMode, ENCODER_REVISION, PROFILE_CODED_SCALEFACTORS,
    PROFILE_PARTITIONED_COEFFS, PROFILE_PHASE5, PROFILE_TRANSITIONAL_LAB, PROTECT_SCALE,
};
use std::fs;
use std::path::Path;

const SR: u32 = 44100;
const UNIT: usize = 1024;

// Minimal SHA-256 (FIPS 180-4), dependency-free.
mod sha256 {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];

    pub fn hex(data: &[u8]) -> String {
        let mut h: [u32; 8] = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
            0x5be0cd19,
        ];
        let bitlen = (data.len() as u64) * 8;
        let mut msg = data.to_vec();
        msg.push(0x80);
        while msg.len() % 64 != 56 {
            msg.push(0);
        }
        msg.extend_from_slice(&bitlen.to_be_bytes());
        for chunk in msg.chunks(64) {
            let mut w = [0u32; 64];
            for (i, c) in chunk.chunks(4).enumerate() {
                w[i] = u32::from_be_bytes(c.try_into().unwrap());
            }
            for i in 16..64 {
                let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
                let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
                w[i] = w[i - 16]
                    .wrapping_add(s0)
                    .wrapping_add(w[i - 7])
                    .wrapping_add(s1);
            }
            let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) =
                (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
            for i in 0..64 {
                let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
                let ch = (e & f) ^ ((!e) & g);
                let t1 = hh
                    .wrapping_add(s1)
                    .wrapping_add(ch)
                    .wrapping_add(K[i])
                    .wrapping_add(w[i]);
                let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
                let maj = (a & b) ^ (a & c) ^ (b & c);
                let t2 = s0.wrapping_add(maj);
                hh = g;
                g = f;
                f = e;
                e = d.wrapping_add(t1);
                d = c;
                c = b;
                b = a;
                a = t1.wrapping_add(t2);
            }
            h[0] = h[0].wrapping_add(a);
            h[1] = h[1].wrapping_add(b);
            h[2] = h[2].wrapping_add(c);
            h[3] = h[3].wrapping_add(d);
            h[4] = h[4].wrapping_add(e);
            h[5] = h[5].wrapping_add(f);
            h[6] = h[6].wrapping_add(g);
            h[7] = h[7].wrapping_add(hh);
        }
        h.iter().map(|v| format!("{v:08x}")).collect()
    }
}

fn interleave(frames: usize, ch: usize, f: impl Fn(usize, usize) -> i16) -> Vec<i16> {
    let mut s = vec![0i16; frames * ch];
    for i in 0..frames {
        for c in 0..ch {
            s[i * ch + c] = f(i, c);
        }
    }
    s
}

fn fixture_signal(frames: usize, ch: usize) -> Vec<i16> {
    interleave(frames, ch, |i, c| {
        let t = i as f64 / frames as f64;
        let amp = if t < 0.4 {
            0.5
        } else {
            0.5 * (-(t - 0.4) * 8.0).exp()
        };
        let pan = if c == 0 { 1.0 } else { 0.9 };
        ((i as f64 * 0.061).sin() * amp * pan * 14000.0 + (i as f64 * 0.017).sin() * amp * 5000.0)
            as i16
    })
}

fn pcm_bytes(pcm: &[i16]) -> Vec<u8> {
    pcm.iter().flat_map(|s| s.to_le_bytes()).collect()
}

pub fn main() {
    let out_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/c6-parity");
    fs::create_dir_all(&out_dir).expect("create c6-parity dir");

    let s = fixture_signal(UNIT * 6, 2);
    let protect = ProtectParams::widened(PROTECT_SCALE);
    let mut entries: Vec<(String, Vec<u8>)> = vec![
        (
            "p0_transitional".into(),
            mp5c6::encode_with_profile(&s, 2, Preset::High, SR, PROFILE_TRANSITIONAL_LAB).unwrap(),
        ),
        (
            "p1_coded_sf".into(),
            mp5c6::encode_with_profile(&s, 2, Preset::High, SR, PROFILE_CODED_SCALEFACTORS)
                .unwrap(),
        ),
        (
            "p2_partitioned".into(),
            mp5c6::encode_with_profile(&s, 2, Preset::High, SR, PROFILE_PARTITIONED_COEFFS)
                .unwrap(),
        ),
        (
            "p3_default".into(),
            mp5c6::encode(&s, 2, Preset::High, SR).unwrap(),
        ),
        (
            "p3_independent_nowin".into(),
            mp5c6::encode_with_options(
                &s,
                2,
                Preset::High,
                protect,
                SR,
                RateMode::Off,
                EncodeOptions {
                    profile_id: PROFILE_PHASE5,
                    joint_stereo: false,
                    window_switching: false,
                    psycho: false,
                },
            )
            .unwrap(),
        ),
        (
            "p3_full_stack_abr192".into(),
            mp5c6::encode_with_options(
                &s,
                2,
                Preset::High,
                protect,
                SR,
                RateMode::Abr { kbps: 192 },
                EncodeOptions {
                    profile_id: PROFILE_PHASE5,
                    joint_stereo: true,
                    window_switching: true,
                    psycho: true,
                },
            )
            .unwrap(),
        ),
        (
            "p3_mono_window".into(),
            mp5c6::encode(
                &s.iter().step_by(2).copied().collect::<Vec<_>>(),
                1,
                Preset::High,
                SR,
            )
            .unwrap(),
        ),
    ];

    let mut manifest = format!(
        "{{\n  \"schema\": \"mp5.c6-parity.v1\",\n  \"encoderRevision\": {ENCODER_REVISION},\n  \"sampleRate\": 44100,\n  \"fixtures\": {{\n"
    );
    let mut rows = Vec::new();
    for (name, stream) in entries.drain(..) {
        let pcm = mp5c6::decode(&stream).expect("native decode");
        let stream_hash = sha256::hex(&stream);
        let pcm_hash = sha256::hex(&pcm_bytes(&pcm));
        fs::write(out_dir.join(format!("{name}.c6stream")), &stream).expect("write stream");
        // Native decoded PCM for the cross-target decode-parity gate
        // (tolerance-based: platform IMDCT rounding may differ by 1 LSB).
        fs::write(out_dir.join(format!("{name}.pcm.raw")), pcm_bytes(&pcm)).expect("write pcm");
        rows.push(format!(
            "    \"{name}\": {{ \"streamSha256\": \"{stream_hash}\", \"pcmSha256\": \"{pcm_hash}\", \"bytes\": {} }}",
            stream.len()
        ));
    }
    manifest.push_str(&rows.join(",\n"));
    manifest.push_str("\n  }\n}\n");
    fs::write(out_dir.join("manifest.json"), manifest).expect("write manifest");
    eprintln!("wrote {} fixtures to {}", rows.len(), out_dir.display());
}
