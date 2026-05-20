//! MP5-C bitstream diagnostics and per-window quality analysis.

use super::pack::{self, FLAG_DENSE_I16, FLAG_RICE, FLAG_SILENCE};
use super::frame_v51::{self, FLAG_BAND_LR, FLAG_BAND_MS};
use super::pack_v5::{self, FLAG_BITPACK, FLAG_GOLOMB, FLAG_PRED2, FLAG_RLE_ZERO, FLAG_SPLIT4};
use super::quant::{self, Preset};
use crate::pcm::{i16_to_f32, snr_db};

const FRAME_HDR_V3: usize = 3;
const FRAME_HDR_V4: usize = 4;
const FRAME_SIZE: usize = 2048;
const DENSE_DETAIL_MAX: usize = 32;
const DENSE_SAVINGS_SAMPLE_MAX: usize = 256;

#[derive(Debug, Clone)]
pub struct DenseFrameDetail {
    pub channel: usize,
    pub frame_index: usize,
    pub payload_bytes: usize,
    pub rice_size: usize,
    pub best_alt_flag: u8,
    pub best_alt_size: usize,
    pub savings_if_best_alt: usize,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct BitstreamDiag {
    pub version: u8,
    pub channels: u8,
    pub preset: u8,
    pub frames_per_ch: usize,
    pub total_bytes: usize,
    pub frame_header_bytes: usize,
    pub payload_bytes: usize,
    pub silence_frames: usize,
    pub rice_frames: usize,
    pub dense_frames: usize,
    pub pred2_frames: usize,
    pub bitpack_frames: usize,
    pub golomb_frames: usize,
    pub rle_frames: usize,
    pub split4_frames: usize,
    pub avg_payload_bytes: f64,
    pub max_payload_bytes: usize,
    pub overhead_pct: f64,
    pub estimated_bitrate_kbps: f64,
    pub stereo_mode: String,
    pub dense_frame_pct: f64,
    pub theoretical_savings_bytes: usize,
    pub largest_dense_payload: usize,
    pub avg_dense_payload: f64,
    pub band_frame_pct: f64,
    pub ms_stereo_frame_pct: f64,
    pub flat_frame_pct: f64,
}

#[derive(Debug, Clone)]
pub struct V51ArtifactReport {
    pub bitstream: BitstreamDiag,
    pub windows: Vec<WindowMetric>,
    pub worst_snr: f64,
    pub worst_peak: f32,
    pub ms_pair_frames: usize,
    pub ms_rejected_estimate: usize,
}

#[derive(Debug, Clone)]
pub struct WindowMetric {
    pub start_sec: f64,
    pub end_sec: f64,
    pub label: String,
    pub snr_db: f64,
    pub rms_error: f32,
    pub peak_error: f32,
    pub clipped_samples: u32,
    pub ratio_vs_pcm: f64,
}

#[derive(Debug, Clone)]
pub struct CodecDiagReport {
    pub bitstream: BitstreamDiag,
    pub windows: Vec<WindowMetric>,
    pub worst_window_snr: f64,
    pub notes: Vec<String>,
    pub dense_details: Vec<DenseFrameDetail>,
}

pub fn analyze_bitstream(data: &[u8], duration_sec: f64) -> Result<BitstreamDiag, String> {
    analyze_bitstream_inner(data, duration_sec, false).map(|(d, _)| d)
}

pub fn analyze_bitstream_with_dense(
    data: &[u8],
    duration_sec: f64,
) -> Result<(BitstreamDiag, Vec<DenseFrameDetail>), String> {
    analyze_bitstream_inner(data, duration_sec, true)
}

fn analyze_bitstream_inner(
    data: &[u8],
    duration_sec: f64,
    collect_dense: bool,
) -> Result<(BitstreamDiag, Vec<DenseFrameDetail>), String> {
    if data.len() < 8 || data[0] != 0x43 {
        return Err("not MP5-C".into());
    }
    let version = data[1];
    let ch = data[2].max(1) as usize;
    let preset = data[3];
    let frames_per_ch = u32::from_le_bytes(data[4..8].try_into().unwrap()) as usize;
    let mut pos = 8usize;
    let mut silence = 0usize;
    let mut rice = 0usize;
    let mut dense = 0usize;
    let mut pred2 = 0usize;
    let mut bitpack = 0usize;
    let mut golomb = 0usize;
    let mut rle = 0usize;
    let mut split4 = 0usize;
    let mut band_top = 0usize;
    let mut ms_pairs = 0usize;
    let mut flat_top = 0usize;
    let mut frame_hdr_bytes = 0usize;
    let mut payload_total = 0usize;
    let mut max_payload = 0usize;
    let mut theoretical_savings = 0usize;
    let mut dense_payload_sum = 0usize;
    let mut dense_count = 0usize;
    let mut largest_dense = 0usize;
    let mut dense_details = Vec::new();
    let mut dense_savings_samples = 0usize;
    let mut dense_savings_sum = 0usize;
    let frame_count = frames_per_ch * ch;

    for c in 0..ch {
        for fi in 0..frames_per_ch {
            if pos >= data.len() {
                break;
            }
            let flag = data[pos];
            let hdr_len = if version >= 6 && flag >= FLAG_BAND_LR {
                8
            } else if version >= 4 {
                4
            } else {
                3
            };
            frame_hdr_bytes += hdr_len;

            pos += 1;
            if version >= 4 {
                pos += 1;
            }
            if version >= 6 && flag >= FLAG_BAND_LR {
                pos += 4;
            }
            if pos + 2 > data.len() {
                break;
            }
            let len = u16::from_le_bytes(data[pos..pos + 2].try_into().unwrap()) as usize;
            pos += 2;
            if pos + len > data.len() {
                break;
            }
            let payload = &data[pos..pos + len];
            pos += len;
            payload_total += len;
            max_payload = max_payload.max(len);

            if version >= 6 {
                if flag == FLAG_BAND_LR {
                    band_top += 1;
                    if c == 0 {
                        flat_top += 1;
                    }
                    count_pack_flags_in_payload(payload, &mut silence, &mut rice, &mut dense, &mut pred2, &mut bitpack, &mut golomb, &mut rle, &mut split4);
                } else if flag == FLAG_BAND_MS {
                    band_top += 1;
                    if c == 0 {
                        ms_pairs += 1;
                    }
                    count_pack_flags_in_payload(payload, &mut silence, &mut rice, &mut dense, &mut pred2, &mut bitpack, &mut golomb, &mut rle, &mut split4);
                } else {
                    flat_top += 1;
                    tally_flat_flag(flag, &mut silence, &mut rice, &mut dense, &mut pred2, &mut bitpack, &mut golomb, &mut rle, &mut split4);
                }
            }

            if collect_dense && flag == FLAG_DENSE_I16 && version < 6 {
                let need_detail = dense_details.len() < DENSE_DETAIL_MAX;
                let need_sample = dense_savings_samples < DENSE_SAVINGS_SAMPLE_MAX;
                if need_detail || need_sample {
                    if let Ok(coeffs) = unpack_coeffs_for_analysis(version, flag, payload) {
                        let a = if version >= 5 {
                            pack_v5::analyze_frame_quick(&coeffs)
                        } else {
                            let rice_sz = {
                                let (_, p) = pack::pack_frame(&coeffs);
                                p.len()
                            };
                            pack_v5::FramePackAnalysis {
                                chosen_flag: FLAG_DENSE_I16,
                                chosen_size: len,
                                dense_size: coeffs.len() * 2,
                                rice_size: rice_sz,
                                best_alt_flag: FLAG_RICE,
                                best_alt_size: rice_sz,
                                savings_vs_dense: len.saturating_sub(rice_sz),
                                would_dense_win: true,
                            }
                        };
                        if need_sample {
                            dense_savings_sum += len.saturating_sub(a.best_alt_size);
                            dense_savings_samples += 1;
                        }
                        if need_detail {
                            dense_details.push(DenseFrameDetail {
                                channel: c,
                                frame_index: fi,
                                payload_bytes: len,
                                rice_size: a.rice_size,
                                best_alt_flag: a.best_alt_flag,
                                best_alt_size: a.best_alt_size,
                                savings_if_best_alt: len.saturating_sub(a.best_alt_size),
                                reason: dense_reason(&a),
                            });
                        }
                    }
                }
            } else if collect_dense && flag != FLAG_DENSE_I16 && flag != FLAG_SILENCE {
                theoretical_savings += (FRAME_SIZE * 2).saturating_sub(len);
            }

            if version < 6 {
                match flag {
                    FLAG_SILENCE => silence += 1,
                    FLAG_DENSE_I16 => {
                        dense += 1;
                        dense_payload_sum += len;
                        dense_count += 1;
                        largest_dense = largest_dense.max(len);
                    }
                    FLAG_RICE => rice += 1,
                    FLAG_PRED2 => pred2 += 1,
                    FLAG_BITPACK => bitpack += 1,
                    FLAG_GOLOMB => golomb += 1,
                    FLAG_RLE_ZERO => rle += 1,
                    FLAG_SPLIT4 => split4 += 1,
                    _ => {}
                }
            }
        }
    }

    let total = data.len();
    let overhead_pct = if total > 0 {
        (frame_hdr_bytes as f64 + 8.0) / total as f64 * 100.0
    } else {
        0.0
    };
    let bitrate = if duration_sec > 0.0 {
        (total as f64 * 8.0 / duration_sec) / 1000.0
    } else {
        0.0
    };
    let leaf_frames = silence + rice + dense + pred2 + bitpack + golomb + rle + split4;
    let dense_frame_pct = if leaf_frames > 0 {
        dense as f64 / leaf_frames as f64 * 100.0
    } else {
        0.0
    };
    let band_frame_pct = if frame_count > 0 {
        band_top as f64 / frame_count as f64 * 100.0
    } else {
        0.0
    };
    let ms_stereo_frame_pct = if frames_per_ch > 0 {
        ms_pairs as f64 / frames_per_ch as f64 * 100.0
    } else {
        0.0
    };
    let flat_frame_pct = if frame_count > 0 {
        flat_top as f64 / frame_count as f64 * 100.0
    } else {
        0.0
    };

    if dense_savings_samples > 0 && dense > dense_savings_samples {
        let avg = dense_savings_sum / dense_savings_samples;
        theoretical_savings += avg * dense;
    } else {
        theoretical_savings += dense_savings_sum;
    }

    Ok((
        BitstreamDiag {
            version,
            channels: ch as u8,
            preset,
            frames_per_ch,
            total_bytes: total,
            frame_header_bytes: frame_hdr_bytes,
            payload_bytes: payload_total,
            silence_frames: silence,
            rice_frames: rice,
            dense_frames: dense,
            pred2_frames: pred2,
            bitpack_frames: bitpack,
            golomb_frames: golomb,
            rle_frames: rle,
            split4_frames: split4,
            avg_payload_bytes: if frame_count > 0 {
                payload_total as f64 / frame_count as f64
            } else {
                0.0
            },
            max_payload_bytes: max_payload,
            overhead_pct,
            estimated_bitrate_kbps: bitrate,
            stereo_mode: if version >= 6 {
                format!("v5.1 band-aware (M/S {:.1}% pairs)", ms_stereo_frame_pct)
            } else if version >= 4 {
                "L/R".into()
            } else {
                "mid/side (v3)".into()
            },
            dense_frame_pct,
            band_frame_pct,
            ms_stereo_frame_pct,
            flat_frame_pct,
            theoretical_savings_bytes: theoretical_savings,
            largest_dense_payload: largest_dense,
            avg_dense_payload: if dense_count > 0 {
                dense_payload_sum as f64 / dense_count as f64
            } else {
                0.0
            },
        },
        dense_details,
    ))
}

fn tally_flat_flag(
    flag: u8,
    silence: &mut usize,
    rice: &mut usize,
    dense: &mut usize,
    pred2: &mut usize,
    bitpack: &mut usize,
    golomb: &mut usize,
    rle: &mut usize,
    split4: &mut usize,
) {
    match flag {
        FLAG_SILENCE => *silence += 1,
        FLAG_RICE => *rice += 1,
        FLAG_DENSE_I16 => *dense += 1,
        FLAG_PRED2 => *pred2 += 1,
        FLAG_BITPACK => *bitpack += 1,
        FLAG_GOLOMB => *golomb += 1,
        FLAG_RLE_ZERO => *rle += 1,
        FLAG_SPLIT4 => *split4 += 1,
        _ => {}
    }
}

fn count_pack_flags_in_payload(
    payload: &[u8],
    silence: &mut usize,
    rice: &mut usize,
    dense: &mut usize,
    pred2: &mut usize,
    bitpack: &mut usize,
    golomb: &mut usize,
    rle: &mut usize,
    split4: &mut usize,
) {
    let mut pos = 0usize;
    while pos < payload.len() {
        if pos >= payload.len() {
            break;
        }
        let sub = payload[pos];
        pos += 1;
        if pos + 2 > payload.len() {
            break;
        }
        let sub_len = u16::from_le_bytes(payload[pos..pos + 2].try_into().unwrap()) as usize;
        pos += 2;
        if pos + sub_len > payload.len() {
            break;
        }
        if sub == FLAG_SPLIT4 {
            let subp = &payload[pos..pos + sub_len];
            pos += sub_len;
            let mut sp = 0usize;
            while sp < subp.len() {
                if sp >= subp.len() {
                    break;
                }
                let sf = subp[sp];
                sp += 1;
                if sp + 2 > subp.len() {
                    break;
                }
                let sl = u16::from_le_bytes(subp[sp..sp + 2].try_into().unwrap()) as usize;
                sp += 2;
                if sp + sl > subp.len() {
                    break;
                }
                tally_flat_flag(sf, silence, rice, dense, pred2, bitpack, golomb, rle, split4);
                sp += sl;
            }
        } else {
            tally_flat_flag(sub, silence, rice, dense, pred2, bitpack, golomb, rle, split4);
            pos += sub_len;
        }
    }
}

pub fn analyze_v51_artifact_report(
    bitstream: &[u8],
    original: &[i16],
    decoded: &[i16],
    sample_rate: u32,
    channels: u8,
    duration_sec: f64,
    preset: Preset,
) -> Result<V51ArtifactReport, String> {
    let bs = analyze_bitstream(bitstream, duration_sec)?;
    let labels: Vec<(&str, f64, f64)> = vec![
        ("full_song", 0.0, duration_sec),
        ("intro", 0.0, 30.0),
        ("vocal_mid", 30.0, 60.0),
        ("dense_mid", 60.0, 90.0),
        ("outro_quiet", (duration_sec - 30.0).max(0.0), duration_sec),
        ("bass_intro", 0.0, 30.0),
    ];
    let windows = analyze_windows(original, decoded, sample_rate, channels, &labels);
    let worst_snr = windows
        .iter()
        .map(|w| w.snr_db)
        .fold(f64::INFINITY, f64::min);
    let worst_peak = windows
        .iter()
        .map(|w| w.peak_error)
        .fold(0f32, f32::max);
    let ms_pair_frames = (bs.ms_stereo_frame_pct / 100.0 * bs.frames_per_ch as f64).round() as usize;
    let _ = preset;
    Ok(V51ArtifactReport {
        bitstream: bs,
        windows,
        worst_snr,
        worst_peak,
        ms_pair_frames,
        ms_rejected_estimate: 0,
    })
}

impl V51ArtifactReport {
    pub fn to_markdown(&self, enc_ms: f64) -> String {
        let b = &self.bitstream;
        let mut s = format!(
            "- Top-level: {:.1}% band modes, {:.1}% flat v5 pack, {:.1}% leaf dense\n",
            b.band_frame_pct, b.flat_frame_pct, b.dense_frame_pct
        );
        s.push_str(&format!(
            "- Sub-frame packing: rice {} | pred2 {} | rle {} | split4 {} | dense {}\n",
            b.rice_frames, b.pred2_frames, b.rle_frames, b.split4_frames, b.dense_frames
        ));
        s.push_str(&format!(
            "- M/S stereo pairs: {} (~{:.1}% of frames/ch), encode {:.0} ms\n",
            self.ms_pair_frames, b.ms_stereo_frame_pct, enc_ms
        ));
        s.push_str(&format!(
            "- Worst window SNR {:.1} dB, worst peak err {:.4}\n",
            self.worst_snr, self.worst_peak
        ));
        let mut worst = self.windows[0].clone();
        for w in &self.windows {
            if w.snr_db < worst.snr_db {
                worst = w.clone();
            }
        }
        s.push_str(&format!(
            "- Lowest SNR section: **{}** ({:.1}–{:.1}s) at {:.1} dB\n",
            worst.label, worst.start_sec, worst.end_sec, worst.snr_db
        ));
        s
    }
}

fn unpack_coeffs_for_analysis(version: u8, flag: u8, payload: &[u8]) -> Result<Vec<i16>, String> {
    if version >= 5 {
        pack_v5::unpack_frame(flag, payload, FRAME_SIZE)
    } else {
        pack::unpack_frame(flag, payload, FRAME_SIZE)
    }
}

fn dense_reason(a: &pack_v5::FramePackAnalysis) -> String {
    if a.would_dense_win {
        format!(
            "no v5 mode beat dense (rice {} B, best alt {:?} {} B)",
            a.rice_size, flag_name(a.best_alt_flag), a.best_alt_size
        )
    } else {
        format!("encoder chose {:?}", flag_name(a.chosen_flag))
    }
}

fn flag_name(f: u8) -> &'static str {
    match f {
        FLAG_SILENCE => "silence",
        FLAG_RICE => "rice",
        FLAG_DENSE_I16 => "dense",
        FLAG_PRED2 => "pred2",
        FLAG_BITPACK => "bitpack",
        FLAG_GOLOMB => "golomb",
        FLAG_RLE_ZERO => "rle_zero",
        FLAG_SPLIT4 => "split4",
        _ => "unknown",
    }
}

pub fn analyze_windows(
    original: &[i16],
    decoded: &[i16],
    sample_rate: u32,
    channels: u8,
    labels: &[(&str, f64, f64)],
) -> Vec<WindowMetric> {
    let ch = channels.max(1) as usize;
    let mut out = Vec::new();
    for (label, start, end) in labels {
        let i0 = (start * sample_rate as f64) as usize * ch;
        let i1 = (end * sample_rate as f64) as usize * ch;
        let i1 = i1.min(original.len()).min(decoded.len());
        if i0 >= i1 {
            continue;
        }
        let o = &original[i0..i1];
        let d = &decoded[i0..i1];
        let snr = snr_db(&i16_to_f32(o), &i16_to_f32(d));
        let mut clip = 0u32;
        let mut peak = 0f32;
        let mut err_sum = 0f64;
        for i in 0..o.len() {
            let e = (o[i] as f32 - d[i] as f32) / 32768.0;
            if e.abs() > peak {
                peak = e.abs();
            }
            err_sum += (e as f64) * (e as f64);
            if d[i].abs() >= 32767 {
                clip += 1;
            }
        }
        let rms = (err_sum / o.len() as f64).sqrt() as f32;
        out.push(WindowMetric {
            start_sec: *start,
            end_sec: *end,
            label: label.to_string(),
            snr_db: snr,
            rms_error: rms,
            peak_error: peak,
            clipped_samples: clip,
            ratio_vs_pcm: 0.0,
        });
    }
    out
}

pub fn build_report(
    bitstream: &[u8],
    original: &[i16],
    decoded: &[i16],
    sample_rate: u32,
    channels: u8,
    duration_sec: f64,
    preset: Preset,
) -> Result<CodecDiagReport, String> {
    let (bs, dense_details) = analyze_bitstream_with_dense(bitstream, duration_sec)?;
    let mut notes = Vec::new();

    match bs.version {
        v if v < 4 => notes.push("v3 bitstream: fixed step + mid/side — may hiss on wide stereo masters.".into()),
        4 => notes.push("v4: L/R stereo + per-frame adaptive step.".into()),
        5 => notes.push("v5: v4 quant + multi-mode entropy (pred2, golomb, bitpack, split4).".into()),
        _ => {}
    }
    if bs.dense_frames > bs.rice_frames + bs.pred2_frames + bs.golomb_frames {
        notes.push(format!(
            "Dense frames {:.1}% — high-entropy quantized coefficients.",
            bs.dense_frame_pct
        ));
    }
    if bs.version >= 5 && bs.theoretical_savings_bytes > 0 {
        notes.push(format!(
            "Theoretical packing savings vs dense (all frames): {} KiB",
            bs.theoretical_savings_bytes / 1024
        ));
    }
    if !dense_details.is_empty() {
        let still_dense = dense_details.len();
        let avg_save: usize = dense_details
            .iter()
            .map(|d| d.savings_if_best_alt)
            .sum::<usize>()
            .checked_div(still_dense)
            .unwrap_or(0);
        notes.push(format!(
            "{still_dense} frames still dense; avg {} B/frame if best alt used",
            avg_save
        ));
    }

    let step = quant::step_for_preset(preset);
    notes.push(format!(
        "Base quant step for {:?}: {:.4}",
        preset, step
    ));

    let labels: Vec<(&str, f64, f64)> = vec![
        ("intro", 0.0, 30.0),
        ("vocal_mid", 30.0, 60.0),
        ("dense_mid", 60.0, 90.0),
        ("outro_tail", (duration_sec - 30.0).max(0.0), duration_sec),
    ];
    let windows = analyze_windows(original, decoded, sample_rate, channels, &labels);
    let worst = windows
        .iter()
        .map(|w| w.snr_db)
        .fold(f64::INFINITY, f64::min);

    Ok(CodecDiagReport {
        bitstream: bs,
        worst_window_snr: worst,
        windows,
        notes,
        dense_details,
    })
}
