//! Synthetic PCM fixtures for MP5-C benchmarks (no external files required).

pub struct Fixture {
    pub name: &'static str,
    pub samples: Vec<i16>,
    pub channels: u8,
    pub sample_rate: u32,
}

pub fn all_fixtures() -> Vec<Fixture> {
    vec![
        sine_stereo_2s(),
        silence_stereo_2s(),
        white_noise_stereo_2s(),
        pink_noise_stereo_2s(),
        drums_stereo_5s(),
        vocal_like_stereo_5s(),
        music_like_stereo_30s(),
        sine_stereo_0_5s(),
    ]
}

fn sr() -> usize {
    44100
}

fn sine_stereo_2s() -> Fixture {
    let n = sr() * 2;
    let mut s = vec![0i16; n * 2];
    for i in 0..n {
        s[i * 2] = ((440.0 * 2.0 * std::f32::consts::PI * i as f32 / sr() as f32).sin() * 14000.0) as i16;
        s[i * 2 + 1] = ((330.0 * 2.0 * std::f32::consts::PI * i as f32 / sr() as f32).cos() * 14000.0) as i16;
    }
    Fixture {
        name: "sine_2s",
        samples: s,
        channels: 2,
        sample_rate: sr() as u32,
    }
}

fn sine_stereo_0_5s() -> Fixture {
    let n = sr() / 2;
    let mut s = vec![0i16; n * 2];
    for i in 0..n {
        s[i * 2] = ((440.0 * 2.0 * std::f32::consts::PI * i as f32 / sr() as f32).sin() * 14000.0) as i16;
        s[i * 2 + 1] = s[i * 2];
    }
    Fixture {
        name: "sine_0.5s_short",
        samples: s,
        channels: 2,
        sample_rate: sr() as u32,
    }
}

fn silence_stereo_2s() -> Fixture {
    Fixture {
        name: "silence_2s",
        samples: vec![0i16; sr() * 2 * 2],
        channels: 2,
        sample_rate: sr() as u32,
    }
}

fn white_noise_stereo_2s() -> Fixture {
    let n = sr() * 2;
    let mut s = vec![0i16; n * 2];
    let mut state = 0x12345678u32;
    for i in 0..n * 2 {
        state = state.wrapping_mul(1664525).wrapping_add(1013904223);
        s[i] = ((state >> 16) as i32 % 32767) as i16;
    }
    Fixture {
        name: "white_noise_2s",
        samples: s,
        channels: 2,
        sample_rate: sr() as u32,
    }
}

fn pink_noise_stereo_2s() -> Fixture {
    let n = sr() * 2;
    let mut s = vec![0i16; n * 2];
    let mut b0 = 0.0f32;
    let mut b1 = 0.0f32;
    let mut b2 = 0.0f32;
    let mut state = 1u32;
    for i in 0..n * 2 {
        state = state.wrapping_mul(1664525).wrapping_add(1013904223);
        let w = (state as f32 / u32::MAX as f32) * 2.0 - 1.0;
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        let pink = b0 + b1 + b2 + w * 0.1848;
        s[i] = (pink.clamp(-1.0, 1.0) * 12000.0) as i16;
    }
    Fixture {
        name: "pink_noise_2s",
        samples: s,
        channels: 2,
        sample_rate: sr() as u32,
    }
}

fn drums_stereo_5s() -> Fixture {
    let n = sr() * 5;
    let mut s = vec![0i16; n * 2];
    for i in 0..n {
        let t = i as f32 / sr() as f32;
        let beat = (t * 2.0).floor();
        let env = (1.0 - (t * 2.0 - beat)).max(0.0);
        let kick = (env.powf(3.0) * (t * 80.0).sin() * 28000.0) as i16;
        let snare = if (beat as i32 % 2) == 1 {
            (((t * 200.0).sin() * 0.3) * 18000.0) as i16
        } else {
            0
        };
        let v = kick.saturating_add(snare);
        s[i * 2] = v;
        s[i * 2 + 1] = v;
    }
    Fixture {
        name: "drums_5s",
        samples: s,
        channels: 2,
        sample_rate: sr() as u32,
    }
}

fn vocal_like_stereo_5s() -> Fixture {
    let n = sr() * 5;
    let mut s = vec![0i16; n * 2];
    for i in 0..n {
        let t = i as f32 / sr() as f32;
        let f0 = 220.0 + 30.0 * (t * 3.0).sin();
        let mut v = 0.0f32;
        for h in 1..=6 {
            v += (f0 * h as f32 * t * std::f32::consts::TAU).sin() / h as f32;
        }
        let formant = (t * 2500.0).sin() * 0.15;
        let amp = 0.5 + 0.5 * (t * 2.5).sin().max(0.0);
        let sample = ((v + formant) * amp * 10000.0) as i16;
        s[i * 2] = sample;
        s[i * 2 + 1] = (sample as f32 * 0.92) as i16;
    }
    Fixture {
        name: "vocal_like_5s",
        samples: s,
        channels: 2,
        sample_rate: sr() as u32,
    }
}

fn music_like_stereo_30s() -> Fixture {
    let n = sr() * 30;
    let mut s = vec![0i16; n * 2];
    for i in 0..n {
        let t = i as f32 / sr() as f32;
        let kick = (t * 2.0 * std::f32::consts::PI).sin() * 12000.0;
        let bass = (t * 110.0 * std::f32::consts::TAU).sin() * 18000.0;
        let lead = (t * 440.0 * std::f32::consts::TAU).sin() * 6000.0;
        let pad = (t * 220.0 * std::f32::consts::TAU).sin() * 4000.0;
        let v = (kick + bass + lead + pad) as i16;
        s[i * 2] = v;
        s[i * 2 + 1] = (v as f32 * 0.97) as i16;
    }
    Fixture {
        name: "music_like_30s",
        samples: s,
        channels: 2,
        sample_rate: sr() as u32,
    }
}
