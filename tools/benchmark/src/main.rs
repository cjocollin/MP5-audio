use std::time::Instant;

fn main() {
    let samples: Vec<i16> = (0..44100 * 2)
        .map(|i| ((i as f32 * 0.01).sin() * 16000.0) as i16)
        .collect();

    println!("MP5 Benchmark (experimental — not a quality claim)\n");

    let t0 = Instant::now();
    let enc_l = mp5_codec::mp5l::encode(&samples, 1);
    let enc_l_ms = t0.elapsed().as_secs_f64() * 1000.0;

    let t1 = Instant::now();
    let dec_l = mp5_codec::mp5l::decode(&enc_l).expect("decode L");
    let dec_l_ms = t1.elapsed().as_secs_f64() * 1000.0;

    let bit_exact = samples == dec_l;
    let ratio_l = enc_l.len() as f64 / (samples.len() * 2) as f64;

    println!("MP5-L:");
    println!("  encode: {:.2} ms", enc_l_ms);
    println!("  decode: {:.2} ms", dec_l_ms);
    println!("  size: {} bytes (ratio {:.2})", enc_l.len(), ratio_l);
    println!("  bit-exact: {}", bit_exact);

    use mp5_codec::mp5c::Preset;
    let t2 = Instant::now();
    let enc_c = mp5_codec::mp5c::encode(&samples, 1, Preset::Standard);
    let enc_c_ms = t2.elapsed().as_secs_f64() * 1000.0;

    let t3 = Instant::now();
    let dec_c = mp5_codec::mp5c::decode(&enc_c).expect("decode C");
    let dec_c_ms = t3.elapsed().as_secs_f64() * 1000.0;

    let o = mp5_codec::pcm::i16_to_f32(&samples);
    let d = mp5_codec::pcm::i16_to_f32(&dec_c);
    let snr = mp5_codec::pcm::snr_db(&o, &d);

    println!("\nMP5-C (Standard preset):");
    println!("  encode: {:.2} ms", enc_c_ms);
    println!("  decode: {:.2} ms", dec_c_ms);
    println!("  size: {} bytes", enc_c.len());
    println!("  SNR: {:.2} dB (informational only)", snr);
}
