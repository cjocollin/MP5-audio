# MP5-C Next (CodecId 6) — Normative Bitstream Spec

**Status:** Phase 1 normative draft (lab-only; not frozen)  
**Applies to:** `.mp5` container `HEAD.codec_id = 6` and the matching `AUDI` codec bitstream  
**Keywords:** The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119).

This document defines **CodecId 6**, the lossy MDCT codec that takes the public name **MP5-C v6**. It is the product path for a measured MP3-class size/quality ladder. It does **not** redefine CodecId 1 (classic) or CodecId 5 (bit-exact MP5-C2).

Cross-links into the container registry and UI docs are added by the orchestrator; normative identity rules here take precedence over stale summaries in older docs.

---

## 1. Naming and identity

| CodecId | Public name | Role | In scope for this spec |
|--------:|-------------|------|------------------------|
| **6** | **MP5-C v6** | Lossy MDCT; beta preview in the Converter (never default, batch stays MP5-L) until the bitstream freezes | **Yes** |
| **1** | **MP5-C classic (legacy)** | Classic time-domain lossy (`rust/mp5-codec/src/mp5c/`) | No (decode forever; not this bitstream) |
| **5** | **MP5-C2** | Bit-exact / lossless protect hybrid (`mp5c2.rs`) | **Out of scope** |

### Normative rules

1. Container writers **MUST** set `HEAD.codec_id = 6` for streams conforming to this document.
2. The public product name **MP5-C v6** **MUST** refer to CodecId **6**, not CodecId 1 or 5. (Renamed from plain "MP5-C" in UI copy: the lab menu showed three indistinguishable "MP5-C*" names; "MP5-C v6" matches the CodecId, the `mp5c6` module, and the `0x43 0x36` "C6" magic.)
3. CodecId **1** **MUST** be labeled **MP5-C classic (legacy)** in UI and docs when both exist.
4. CodecId **5** (MP5-C2) **MUST** remain a **bit-exact / lossless** lab path. Renaming, relabeling, or shipping CodecId 5 as lossy **MP5-C v6** is **forbidden**.
5. CodecId 6 **MUST NOT** become the Converter default or the batch-export codec. Batch / recommended export remains **MP5-L** (CodecId 2).

### Lab coding core (informative)

The intended loud-path coding core is the lab MDCT encoder in `rust/mp5-codec/src/mp5c3/`:

| Symbol / file | Value / behavior |
|---------------|------------------|
| `mdct::N` | `2048` samples/frame |
| `mdct::HOP` | `1024` (50% OLA) |
| `mdct::COEFFS` | `1024` |
| `NUM_BANDS` / `band_bounds` | 32 bands; quadratic edges over coeff index |
| Per-frame side info | `nb` (`u8`) + `nb` little-endian `f32` scale steps + `u32` packed length + coeff payload (`encode_channel` in `mp5c3/mod.rs`) |
| `noise_frac` / `quiet_floor` | Preset noise-fraction; absolute floor at `min_step × 0.25` (Extreme ×0.05, hard floor 1e-5) — quiet audible texture lands ~24 dB SNR (Extreme ~31 dB) instead of 1–2-bit quantization. Silence still rounds to zero. |
| `low_mask` boost cap | Masking boost from loud low bands is capped at `band_rms × 0.15` — boost × floor may not push a quiet HF band below ~27 dB SNR (previously <1 dB on bass-heavy content: HF texture replaced by noise, the "filter sound"; measured fixed on a real 48 kHz export: 18 kHz error/signal −8.2 → −22.2 dB at Extreme). |
| `transient_tighten` | Global step shrink on energy rise (`e > prev_e * 6.0` → `×0.55`) |

Standalone lab streams today use magic `0x4D 0x33` (`'M','3'`). That magic is **not** the CodecId 6 container AUDI magic (see §2).

---

## 2. Stream magic

| Bytes | Value | ASCII |
|------:|-------|-------|
| 0 | `0x43` | `'C'` |
| 1 | `0x36` | `'6'` |

### Unambiguity

| Stream | Magic | Why distinct from CodecId 6 |
|--------|-------|-----------------------------|
| Classic MP5-C (CodecId 1) | `0x43` + version byte `0x02`…`0x06` (`VERSION_V2`…`VERSION_V51` in `mp5c/mod.rs`) | Version is a small integer (`2`–`6`). CodecId 6 uses `0x36` (`'6'`, decimal 54), **not** `0x06`. |
| MP5-C2 (CodecId 5) | `0x43 0x34` (`'C','4'`) in `mp5c2.rs` | Second byte `0x34` ≠ `0x36`. |
| Lab standalone MDCT (`mp5c3`) | `0x4D 0x33` (`'M','3'`) | Different first byte; not a CodecId 6 AUDI stream. |

### Normative rules

1. Every CodecId 6 AUDI codec bitstream **MUST** begin with `0x43 0x36`.
2. Decoders for CodecId 6 **MUST** reject any stream whose first two bytes are not `0x43 0x36`.
3. Decoders **MUST** reject a stream whose magic does not match the CodecId declared in container `HEAD` (fail closed). In particular:
   - `HEAD.codec_id = 6` with magic `0x43 0x34` or `0x43 0x06` → **reject**
   - `HEAD.codec_id = 5` with magic `0x43 0x36` → **reject**
   - `HEAD.codec_id = 1` with magic `0x43 0x36` → **reject**
4. Classic MP5-C and MP5-C2 decoders **MUST NOT** accept `0x43 0x36` as a valid classic/C2 stream.

---

## 3. Stream header layout

All multi-byte integers are **little-endian**. The stream header is **28 bytes**, followed by a sequence of **units** (§4).

### 3.1 Byte-exact header

| Offset | Size | Type | Field | Notes |
|-------:|-----:|------|-------|-------|
| 0 | 1 | `u8` | `magic0` | **MUST** be `0x43` |
| 1 | 1 | `u8` | `magic1` | **MUST** be `0x36` |
| 2 | 1 | `u8` | `channels` | **MUST** be `1` or `2` in Phase 2; other values **MUST** fail closed until specified |
| 3 | 1 | `u8` | `profile_id` | Scalefactor / syntax profile (§3.2) |
| 4 | 4 | `u32` | `sample_rate_hz` | e.g. `44100`, `48000`; **MUST** be `≥ 8000` |
| 8 | 4 | `u32` | `total_frames` | PCM frames (samples **per channel**), matching C2’s `frames` field |
| 12 | 4 | `u32` | `mdct_frame_count` | Number of MDCT hops expected across the loud path; `0` **MAY** mean “unspecified” only in pre-freeze lab builds — released revisions **MUST** set this accurately |
| 16 | 2 | `u16` | `target_bitrate_kbps` | Nominal rate-control target; `0` = unconstrained / unknown operating point |
| 18 | 2 | `u16` | `encoder_revision` | Encoder build revision (§9) |
| 20 | 2 | `u16` | `flags` | Reserved capability bits (§3.3) |
| 22 | 2 | `u16` | `unit_size` | Protect/MDCT unit planning size in PCM frames; shipping protect path today uses `1024` (`SUB_BLOCK` in `mp5c2.rs`) |
| 24 | 4 | `u32` | `header_crc32` | CRC32-IEEE over bytes `0..23` inclusive |

Total: **28 bytes**.

### 3.2 `profile_id` (scalefactor / syntax version)

| `profile_id` | Meaning | Freeze eligibility |
|-------------:|---------|--------------------|
| `0` | **Transitional lab:** raw per-band `f32` scale steps as in `mp5c3` (`NUM_BANDS = 32` × 4 bytes per hop per channel) | **MUST NOT** be frozen as a public forever-decode syntax |
| `1` | **Coded scalefactors:** log-domain global gain + Rice-coded integer band deltas on a `1/4`-log2 (~1.505 dB) grid | Candidate for freeze after golden fixtures |
| `2` | **Partitioned coefficients (Phase 4.2):** profile 1 scalefactors + partitioned escaped-Rice coefficient records with HF zero-run truncation (§3.2.2) | Candidate for freeze after golden fixtures |
| `3` | **Phase 5 syntax family:** profile 2 coding plus joint stereo and window switching, selected by `flags` (§3.2.3, §3.3) | Candidate for freeze after golden fixtures |
| `4`–`255` | Reserved | Decoders **MUST** fail closed on unknown ids |

Writers **MUST** set `profile_id` from day one. Adding sample rate or profile later by “just bumping a reserved byte” after an id freezes is **not** allowed — see justification below.

**Encoders in this build write `profile_id = 3`** (shipping defaults: joint stereo +
window switching on; the psycho model is opt-in). Profiles `0`, `1`, and `2` remain
decodable forever.

The `TAG_MDCT` payload is **self-describing**: `mp5c3` magic `0x4D 0x33` carries raw `f32`
steps, `0x4D 0x34` coded scalefactors, `0x4D 0x35` joint stereo, `0x4D 0x36` window
switching, `0x4D 0x37` joint stereo + window switching. Decoders **MUST** cross-check the
payload magic against the header `profile_id` + `flags` and fail closed on disagreement,
so a mislabeled stream can never be decoded under the wrong syntax.

#### 3.2.1 Coded scalefactor syntax (`profile_id = 1`)

Per hop record, per channel:

| Field | Type | Meaning |
|-------|------|---------|
| `nb` | `u8` | Band count (32 in this revision) |
| `gain` | `i16` LE | Band-0 step as a grid index: `round(log2(step) × 4)` |
| `blob_len` | `u16` LE | Byte length of the delta blob |
| `blob` | bytes | `k` (3 bits), then `nb − 1` Rice-coded zigzag deltas against the previous band |

`k` is chosen by exhaustive cost search over `0..=7`, so re-encoding the same input on the
same build is **byte-identical**. Steps reconstruct as `2^(index / 4)`; the **encoder
quantizes coefficients against the reconstructed step**, so encoder and decoder share one
dequantization scale by construction and the only quality cost is the ±0.75 dB grid.

Decoders **MUST** fail closed on a truncated blob, a unary run over 64, or an index outside
`[-512, 511]`.

**Measured on the lab `dense_music` fixture (6 s, 44.1 kHz stereo, Preset::High):**

| Figure | `profile_id = 0` | `profile_id = 1` |
|--------|-----------------:|-----------------:|
| Side info | 89.8 kbps stereo | **7.2 kbps stereo** |
| Total stream | 176 626 B | **112 519 B** (−36.3%) |
| Size vs PCM | 0.167× | **0.106×** |
| SNR | 24.39 dB | 24.20 dB (**−0.19 dB**) |

This clears the Phase 4.1 acceptance bar (side info ≤ ~12 kbps stereo; `dense_music`
≤ ~0.115× PCM; SNR within ±0.3 dB of baseline). Synthetic fixture only — **not** a
music-corpus or LAME-relative claim.

#### 3.2.2 Partitioned coefficient syntax (`profile_id = 2`, Phase 4.2)

Coefficient pack records are **self-describing per record** via a leading flag byte, so
profiles `0`–`2` share one record walker and old builds fail closed (`unknown pack flag`)
on records they do not know. Profile `2` tells the *encoder* it may emit the
partitioned-Rice record (`flag = 3`); decoders accept every known flag under every
profile.

| Flag | Record | Payload |
|-----:|--------|---------|
| `0` | dense | `n(u32)`, then `n` × `i16` LE |
| `1` | single-k Rice | `k(u8)`, `n(u32)`, `body_len(u32)`, Rice body |
| `2` | zero | `n(u32)`; all coefficients zero |
| `3` | **partitioned Rice + HF zero-run** | `n(u32)`, `last_nz(u32)`, `parts(u8 ≤ 16)`, `escape_bits(u8 ∈ 8..=32)`, `ceil(parts/2)` bytes of 4-bit `k` per partition, `body_len(u32)`, escaped partitioned-Rice body over coefficients `0..last_nz` |

Semantics of flag `3`:

- **HF zero-run:** coefficients from `last_nz` to `n` are implicit zeros. MDCT spectra
  after quantization have long high-frequency zero tails; they now cost 4 bytes of
  header instead of one Rice code per zero.
- **Partitioned escaped Rice:** the same machinery as MP5-L v4 (`mp5l::rice`): partition
  count and per-partition `k` chosen by exact cost search over `{1, 2, 4, 8, 16}` with a
  prefix-sum cost table, escaped unary (`ESCAPE_Q = 31`) so a single large coefficient
  cannot blow up a partition.
- **Estimator/writer bit-count equality (normative):** the search's bit estimate
  (`rice_estimate_bits_partitioned_escape`) **MUST** equal the emitted body size
  (`div_ceil(8)`), asserted by unit test. A search that prices anything other than what
  the writer emits is a lie that compounds under rate control.
- The encoder emits flag `3` only when it is no larger than the legacy candidates for
  that hop, so partitioned mode never loses to profile 1 packing on any hop.
- Decoders **MUST** fail closed on a truncated record, `parts` outside `1..=16`,
  `escape_bits` outside `8..=32`, a `k` nibble above `MAX_K` (14), `last_nz > n`, or a
  body that does not decode to exactly `last_nz` values.

**Measured on the lab `dense_music` fixture (6 s, 44.1 kHz stereo, Preset::High, coded
scalefactors in both rows):**

| Figure | profile 1 | profile 2 |
|--------|----------:|----------:|
| Total stream | 112 519 B | **65 717 B** (−41.6%) |
| Size vs PCM | 0.106× | **0.062×** |
| Decoded PCM | identical | **bit-identical** (partitioning is a lossless re-pack) |

Because quantization is unchanged and every pack record round-trips exactly, profile 2
decodes to the **same samples** as profile 1 on the same input — the entire win is
entropy coding, zero quality delta. Synthetic fixture only.

#### 3.2.3 Phase 5 syntax family (`profile_id = 3`)

Profile 3 keeps profile 2's scalefactor and coefficient records and adds two
features selected by `flags` (§3.3). Payload magic identifies the combination:
`0x4D 0x35` (joint stereo), `0x4D 0x36` (window switching), `0x4D 0x37` (both).

**Joint stereo (`joint_stereo_mode = 1`, Phase 5.1).** Per hop, a 32-bit bitmap
selects L/R or M/S per band (`M = (L+R)/2`, `S = (L−R)/2`; decode recomputes
`L = M+S`, `R = M−S`). The encoder chooses per band by exact coded cost, ties go
to L/R, and anti-phase bands are forced independent. A **side-image guard**
forces L/R when the side channel is significant but would be coded below 8 dB
predicted side SNR — measured on the dev corpus, unguarded M/S cost the image
1–2 dB of side SNR on decorrelated content ("stripped" stereo). With the guard:
side SNR ≥ independent baseline on every fixture, big M/S wins preserved on
correlated material (38.6% on the lab fixture, ~39% on decorrelated-heavy
killers), worst-1s SNR equal or better than independent on every fixture.
Measured via `tools/audio-lab/c6-distortion-diag.mjs`. Both channels share one
interleaved payload; the bitmap counts as side info.

**Window switching (`window_mode = 1`, Phase 5.2).** Each record carries a block
type (`u8`): `0` LONG (2048), `1` START (2048), `2` SHORT (512), `3` STOP (2048).
The geometry is TDAC-legal by construction (verified exact in float): the next
frame starts at `a + (3·M_A − M_B)/2`, so LONG→LONG advances 1024, START→SHORT
1408, SHORT→STOP −128 (STOP overlaps the last short), everything else 1024.
Legal transitions: LONG→{LONG,START}, START→{SHORT,STOP}, SHORT→{SHORT,STOP},
STOP→{LONG,START}; decoders **MUST** fail closed on any other sequence. The
encoder plans blocks with a deterministic 256-sample transient detector
(8× energy surge). Measured: **13.3 dB** better pre-attack error than
`tighten`-only on the lab castanet fixture (bar: ≥ 12 dB), with rate control
still hitting ABR targets (weighted allowance ∝ coefficient count).

**Encoder-side psycho model (Phase 5.3, no syntax).** Step allocation may use
the ATH/spreading/tonality/temporal model instead of the `noise_frac`
heuristics (§5); steps are written explicitly, so decode is unchanged. The NMR
screen (`nmr_screen_wasm`) is the reject filter for it.

**Boundary continuity (Phase 5.4, no syntax).** MDCT units are encoded with
their neighbors' samples seeding the overlap instead of zeros, so protect↔MDCT
and MDCT↔MDCT boundaries no longer carry a ~23 ms zero-ramp. Decoder needs no
change; units decode standalone (no preroll) and `decode_range` provides
seek/indexable access over the unit table.

### 3.3 `flags` bit allocation

| Bits | Name | Allocation |
|-----:|------|------------|
| 0–1 | `joint_stereo_mode` | `0` = independent L/R; `1` = per-band M/S (Phase 5.1, §3.2.3). Values `2`–`3` reserved — decoders **MUST** fail closed. Intensity stereo codes **MUST NOT** be assigned until M/S is proven safe in listening. |
| 2–3 | `window_mode` | `0` = long sine only; `1` = long/start/short/stop switching (Phase 5.2, §3.2.3). Values `2`–`3` reserved — decoders **MUST** fail closed. |
| 4–15 | reserved | **MUST** be zero; decoders **MUST** fail closed on any set bit. |

Profiles `0`–`2` require `flags = 0`. Profile `3` accepts `joint_stereo_mode ∈ {0,1}`
and `window_mode ∈ {0,1}`; anything else fails closed at header parse.

### 3.4 Why sample rate and profile cannot be deferred

1. **Identity freeze.** Once CodecId 6 files exist in the wild, the header layout for that revision is forever. Retrofitting `sample_rate_hz` or `profile_id` breaks decoders that assumed fixed offsets.
2. **Psychoacoustics need Hz.** Band edges, ATH, spreading, and transient timing are functions of sample rate. The current C2 path assumes `DEFAULT_SAMPLE_RATE = 44100` when rate is omitted (`mp5c2.rs`); CodecId 6 **MUST NOT** repeat that ambiguity in the bitstream.
3. **Scalefactor coding is a syntax break.** Moving from 32×`f32` raw steps to coded side info changes the unit payload. That **MUST** be a `profile_id` (or revision) switch, not a silent encoder change under one frozen layout.

### 3.5 Frame / unit CRC

**Polynomial:** CRC-32/IEEE (ISO 3309, Ethernet/PNG), reflected poly `0xEDB88320`, init `0xFFFFFFFF`, final XOR `0xFFFFFFFF` — the same algorithm used for container chunk payloads (`MP5_CONTAINER_SPEC.md`) and MP5-L block CRC (`crc32_bytes` in `mp5l/mod.rs`).

**Coverage:**

| Region | Coverage |
|--------|----------|
| Stream header | Bytes `0..23`; stored at offset 24 |
| Each unit | CRC32-IEEE over `tag ‖ n_frames ‖ payload_len ‖ payload` (9 + `payload_len` bytes); stored as 4 bytes immediately after `payload` |

Decoders **MUST** verify both header and per-unit CRCs and **MUST** fail closed on mismatch. Truncation (declared `mdct_frame_count` / `total_frames` vs decoded) **MUST** fail closed — silent short PCM is forbidden.

**Why CRC-32/IEEE (not CRC-16):** Container and MP5-L already standardize on IEEE CRC-32 for payload integrity; reusing it avoids a third polynomial in the stack. MP5-L v4’s CRC-16/IBM is scoped to that codec’s block headers and **MUST NOT** be reused here.

### 3.6 Implementation status

§3 is **implemented** in `rust/mp5-codec/src/mp5c6.rs`: magic `0x43 0x36`, the
28-byte header above, header CRC-32/IEEE over bytes `0..23`, and a trailing per-unit CRC.
The encoder writes `profile_id = 3` (§3.2.3; profiles `0`–`2` remain decodable and are
reachable via `encode_with_profile` for baseline measurement), `flags = 5` for stereo
(joint stereo + window switching; `flags = 0` for mono), `unit_size = 1024`,
`encoder_revision = 4`
(1 = Phase 2 scaffold + Phase 4.1 coded scalefactors; 2 = Phase 4.2 partitioned
coefficients + Phase 4.3 deterministic rate control; 3 = Phase 5 joint stereo + window
switching + psycho model + boundary seeding; 4 = transient-planner recent-peak +
running-mean gates against bass-ring churn, joint bitmap hold inside short bursts,
whole-frame M/S cost guard, psycho steps capped at the legacy allocation, and
quiet-passage quality (Extreme `noise_frac` 0.006 / High 0.010 + passage-adaptive
quiet floor gated on the louder channel) — same syntax, decode unaffected),
and an accurate `mdct_frame_count` (counted from `mp5c3::hop_record_count` over every
`TAG_MDCT` payload). The decoder fails closed on bad magic, header CRC, unit CRC,
out-of-bounds `payload_len`, unknown tag, unknown `profile_id`, unsupported `channels`,
reserved/unknown `flags` bits, `sample_rate_hz < 8000`, a unit that decodes to the wrong
sample count, illegal window sequences, and any disagreement between decoded frames/hops
and the header. Golden fixtures for every syntax family live in
`tests/fixtures/c6-parity/` and are decoded bit-identically on native and WASM
(`tests/mp5c6NativeWasmParity.test.ts`).

The following remain true of the **other** codecs and are unchanged by Phase 2–4:

- `mp5c2` (CodecId 5) / `mp5c3` headers are **10 bytes** and omit `sample_rate_hz`,
  `profile_id`, `target_bitrate_kbps`, `encoder_revision`, `flags`, and header CRC.
- `mp5c3`'s own magic is `0x4D 0x33` (raw `f32` steps) or `0x4D 0x34` (coded scalefactors);
  it is CodecId 6's *payload* coding core, never a CodecId 6 stream on its own.
- Units in `mp5c2` are `tag + n + len + payload` with **no** trailing CRC (`push_unit`).
- `mp5c2` (CodecId 5) still embeds the **raw `f32`** MDCT syntax (`mp5c3::encode`) with the
  **legacy** coefficient pack — CodecId 5 bytes are byte-for-byte unchanged by the
  profile 1/2 work (asserted by the CodecId 5 compatibility fixtures).

---

## 4. Unit framing, protect semantics, and reporting contract

### 4.1 Unit layout

After the 28-byte header, the stream is a concatenation of units:

| Field | Size | Type |
|-------|-----:|------|
| `tag` | 1 | `u8` |
| `n_frames` | 4 | `u32` — PCM frames covered by this unit |
| `payload_len` | 4 | `u32` |
| `payload` | `payload_len` | bytes |
| `unit_crc32` | 4 | `u32` — CRC32-IEEE (§3.5) |

This extends the C2 layout in `mp5c2.rs` (`push_unit` / `inspect_unit_mix`) by the mandatory trailing CRC.

### 4.2 Tags

| Tag | Value | Name | Semantics for CodecId 6 |
|-----|------:|------|-------------------------|
| `TAG_LOSSLESS` | `0x4C` (`'L'`) | Broadband quiet protect | Payload **MUST** be MP5-L; decode **MUST** be sample-exact vs source for that span |
| `TAG_BAND` | `0x42` (`'B'`) | Fragile / tail protect | Payload **MUST** be MP5-L; decode **MUST** be sample-exact |
| `TAG_MDCT` | `0x4D` (`'M'`) | Lossy MDCT loud path | Payload **MUST** decode under `profile_id`; **not** bit-exact |
| `TAG_LOSSY` | `0x43` (`'C'`) | Legacy classic loud | Decode-only for migration fixtures; new CodecId 6 encoders **MUST NOT** write this tag |
| `TAG_SR` | `0x46` (`'F'`) | C2 signal-relative | **MUST NOT** appear in CodecId 6 streams (C2-only) |

Unknown tags **MUST** fail closed.

### 4.3 Protect islands vs MDCT units

1. Encoders **MAY** route quiet / fragile / decaying sub-blocks to `TAG_LOSSLESS` / `TAG_BAND` using protect logic descended from `ProtectParams` / `decide_tags` in `mp5c2.rs` (shipping widen scale today: **1.5**).
2. Loud runs **MUST** use `TAG_MDCT` under CodecId 6 (not `TAG_SR`).
3. Protect islands **MUST** remain **sample-exact** after round-trip. This is a correctness gate, not a quality score (§5).
4. `TAG_MDCT` **MUST** be counted as its own category in mix reports. It **MUST NEVER** be merged into “protected”.

### 4.4 Mandatory three-figure report

Every CodecId 6 encode report, bench row, and UI inspect summary **MUST** publish all three figures:

| Figure | Definition |
|--------|------------|
| **(a) Coded-path bitrate** | Bits spent on **lossy units only** (`TAG_MDCT`, and legacy `TAG_LOSSY` if present in old fixtures), divided by media duration in seconds. Protect-unit payload bits are **excluded**. |
| **(b) Protected percentages** | **Protected-sample %** = `(lossless_L_frames + lossless_B_frames) / total_frames × 100`. **Protected-byte %** = `(lossless_L_bytes + lossless_B_bytes) / total_payload_bytes × 100`. Both **MUST** be shown. Fields mirror `UnitMix` in `mp5c2.rs` (`lossless_l`, `lossless_b`, `mdct`, …). |
| **(c) Total file size** | Full `.mp5` size (container + all chunks), and **SHOULD** also report raw AUDI codec-bitstream size. |

Rust/JS parity: Phase 2 **MUST** export an `inspect_unit_mix` (or equivalent) for CodecId 6 so `%protected` cannot diverge across WASM and native.

**Implemented shape (Phase 2).** `mp5c6::inspect_unit_mix(&[u8]) -> Result<UnitMix, String>`
is exported to JS as `inspect_unit_mix(data: Uint8Array): string` returning a JSON object.
It accepts a CodecId 6 stream *or* a CodecId 5 (`0x43 0x34`) stream so the two can be
compared through one code path; CodecId 6 input is validated exactly as strictly as
`decode` (header CRC, unit CRCs, bounds, declared frame and hop totals) minus the audio
decode itself. Numbers are exact integers except the three derived figures.

```jsonc
{
  "codec_id": 6,                 // 6 for MP5-C, 5 when a C2 stream was inspected
  "channels": 2,
  "sample_rate_hz": 44100,       // 0 for CodecId 5 (that format carries no rate)
  "profile_id": 0,               // null for CodecId 5
  "encoder_revision": 1,         // null for CodecId 5
  "target_bitrate_kbps": 0,      // null for CodecId 5; 0 = unconstrained
  "unit_size": 1024,
  "declared_frames": 262144,     // header total_frames
  "declared_mdct_frames": 210,   // header mdct_frame_count; null for CodecId 5
  "total_frames": 262144,        // frames actually covered by units
  "total_units": 27,
  "total_payload_bytes": 411204,
  "stream_bytes": 411583,        // whole codec bitstream incl. header + framing
  "duration_seconds": 5.944,     // null when sample_rate_hz is 0
  "tags": {                      // per-tag unit / frame / payload-byte counts
    "lossless_l":       { "units": 6, "frames": 40960, "payload_bytes": 82110 },
    "lossless_b":       { "units": 4, "frames": 20480, "payload_bytes": 40120 },
    "mdct":             { "units": 17, "frames": 200704, "payload_bytes": 288974 },
    "legacy_lossy":     { "units": 0, "frames": 0, "payload_bytes": 0 },
    "signal_relative":  { "units": 0, "frames": 0, "payload_bytes": 0 },
    "unknown":          { "units": 0, "frames": 0, "payload_bytes": 0 }
  },
  "protected_sample_pct": 23.4375,   // figure (b), samples
  "protected_byte_pct": 29.7,        // figure (b), bytes
  "coded_path_bytes": 288974,        // lossy payload only
  "coded_path_kbps": 388.9           // figure (a); null when sample_rate_hz is 0
}
```

Figure (c) is split deliberately: `stream_bytes` is the raw AUDI codec bitstream, and the
full `.mp5` size is the container's job to report — this function never sees the container.

### 4.5 Failure modes this contract defends

| Failure mode | How it cheats | How the three figures catch it |
|--------------|---------------|--------------------------------|
| **SNR-laundering** | High protect % makes full-file SNR look excellent while the loud MDCT path is poor | Full-file SNR **MUST NOT** be used as a loud-path quality claim; coded-path metrics and listening apply to MDCT; protect % is disclosed |
| **Protect-laundering** | Hitting a size target by shoving difficult audio into large protect islands | Protected-byte % and coded-path bitrate expose the tax; size claims **MUST** disclose protect contribution |

### 4.6 Side-info tax (informative, from code)

At `N=2048` / `HOP=1024`, each MDCT hop writes `1 + 32×4 + 4 = 133` bytes of scale/length overhead per channel before coeff entropy (`encode_channel` in `mp5c3/mod.rs`). At 44.1 kHz stereo:

\[
\frac{44100}{1024} \times 2 \times 133 \times 8 \approx 91.6\ \mathrm{kbps}
\]

On the lab `dense_music` fixture, MDCT High is documented at **~0.167× PCM** (`docs/MP5C_VNEXT_RESULTS.md`); that overhead is on the order of **~39%** of a dense loud bitstream at that operating point (plan measurement; derive from the formula above + fixture ×PCM). **Freezing profile 0’s 32×`f32` layout is an anti-pattern** (§8).

**Status:** the tax is closed out in two steps. Profile 1 (§3.2.1) cuts side info
89.8 → **7.2 kbps** stereo; profile 2 (§3.2.2) then cuts total stream a further 41.6%
(112 519 → **65 717 B**, 0.106× → **0.062×** PCM) with bit-identical decoded PCM.
Cumulative on `dense_music`: 176 626 → 65 717 B (**−62.8%**, 0.167× → 0.062× PCM).

### 4.7 Implementation status

- CodecId 6 container identity and magic `0x43 0x36` are wired: `CodecId.MP5C6 = 6` in
  `packages/mp5-container/src/constants.ts`, encode/decode in `rust/mp5-codec/src/mp5c6.rs`,
  WASM exports `encode_mp5c6` / `encode_mp5c6_at` / `encode_mp5c6_vbr` / `encode_mp5c6_opt`
  / `decode_mp5c6` / `decode_mp5c6_range` / `inspect_unit_mix` / `nmr_screen_wasm`.
- The 28-byte header and per-unit CRC are present and verified on decode.
- Protect islands are planned by `mp5c2::plan_protect_units` — the *same* function CodecId 5
  uses — so `%protected` cannot drift between the two codecs by construction.
- Coded-path bitrate and both protect percentages are computed by `inspect_unit_mix` (§4.4).
- Profile 1 coded scalefactors (§3.2.1), profile 2 partitioned coefficients (§3.2.2), and
  the profile 3 Phase 5 family (§3.2.3: joint stereo, window switching, boundary seeding,
  seek via `decode_range`) are implemented in `mp5c3`, with self-describing payload magics
  cross-checked against header profile+flags on decode.
- Deterministic rate control (§6.3) is implemented: VBR quality index, ABR/CBR targets,
  reservoir, protect islands budgeted ahead of the MDCT pool; the joint path shares one
  reservoir so a quiet side channel cannot strand budget.
- Phase 5.3 psycho model (ATH/spreading/tonality/temporal) is implemented encoder-side
  (opt-in) with the NMR screen as reject filter; operating-point tuning is a listening
  iteration item (Phase 6), not claimed.
- Phase 7 hardening is in place: fuzz/malformed fail-closed tests, native↔WASM decode
  parity (bit-exact) with per-build encode determinism, perf budgets measured
  (`benchmarks/audio-quality/c6-perf.json`), golden fixtures per syntax family.
- MDCT rides inside CodecId 5 as well (`encode_mdct` / `TAG_MDCT`); that path is unchanged
  and remains lab-only.

---

## 5. Quality gate split

Three **independent** gate families. Passing one never implies another.

| Family | Applies to | Role |
|--------|------------|------|
| **(a) Protect sample-exact** | `TAG_LOSSLESS` / `TAG_BAND` islands | **Hard correctness.** Decode **MUST** match source PCM sample-for-sample on those spans. |
| **(b) Loud-path objective screen** | `TAG_MDCT` / perceptual path | **Reject filter only** (NMR / ODG / similar). **MUST NOT** be cited as evidence of transparency or “MP3-class quality”. |
| **(c) ABX / MUSHRA listening** | Qualified bitrates | **Only** evidence that may qualify a bitrate for release / leave-lab (§6). |

### Hiss / SNR gate scope

Existing hiss-risk and quiet-window SNR gates (audio lab / vNext validate tooling) **MUST** apply **only to protect islands** (and to bit-exact CodecId 5 paths).

They **MUST NOT** be applied as pass/fail criteria to the perceptual loud path. A competent psychoacoustic coder **deliberately** has modest full-band SNR on loud MDCT units (lab MDCT High full SNR on the real-track validate table is **~26.8 dB** at **~0.214× PCM** — `docs/MP5C_VNEXT_RESULTS.md`). Low loud-path SNR alone is **not** a defect signal.

### ABX protocol retarget (normative process requirement)

CodecId 5 CI **MUST** use sample equality only (ABX on a bit-exact codec is meaningless). CodecId 6 listening uses **`docs/MP5C6_ABX_PROTOCOL.md`** (Phase 6: ABX-320 transparency arm, MUSHRA-192/128 vs LAME anchors, preregistered experiments under `benchmarks/listening/`, ≥3 listeners for leave-lab). The C6 protocol landed before any listening qualification claims were made; the old C2 document survives only for CodecId 5 sample-equality checks.

---

## 6. Definition of Done — dual gate and bitrate ladder

### 6.1 Dual gates (per bitrate)

| Gate | Meaning |
|------|---------|
| **Lab-listening ready** | CodecId 6 wired; PR tests green; protect islands sample-exact; `%protected` (sample + byte) shown; **320** operating point within ~5% of LAME 3.100 CBR 320 size on the **dev** corpus; informal A/B on killer fixtures; public copy remains experimental-only |
| **Leave lab** | Held-out size gates; objective non-inferiority proxies as reject filters; formal **ABX** (320 vs source) and **MUSHRA** (192 / 128 vs LAME); multi-listener; no systematic hiss/pre-echo/stereo collapse/clip/duration drift; UI **MAY** expose only bitrates that have left lab |

Gates are **per bitrate**. A 128 failure **MUST NOT** block a qualified 320 mode.

### 6.2 Bitrate ladder order

1. Stabilize **320** first  
2. Then **192**  
3. Then **128** as a stretch  

Anchors: **LAME 3.100 CBR 128 / 192 / 320**, optionally V0.

### 6.3 Rate-control honesty

**Deterministic rate control exists (Phase 4.3, implemented).** Modes:

| Mode | Semantics | Header `target_bitrate_kbps` |
|------|-----------|------------------------------|
| Off | Preset quality, no target | `0` |
| **VBR QI** | Quality index in 1/4-log2 step-grid units (positive = finer), no rate claim | `0` |
| **ABR** | Long-run average target; wide reservoir (bank up to 64 hop allowances) | target |
| **CBR** | Narrow-reservoir target (+8/−4 hop allowances) | target |

Normative properties:

- **Bounded search only.** Per hop, a fixed-iteration bisection (10 steps over a
  2^-9..2^6 step-multiplier range) buys the largest record that fits the frame budget;
  `k`/partition searches are exhaustive over fixed candidate sets. **No unbounded
  search is permitted**, so re-encoding the same input on the same build is
  **byte-identical** (asserted by test at ABR/CBR/VBR and container level).
- **Protect islands consume budget first.** Their bytes are subtracted from the target
  pool before any MDCT budget is distributed, and the tax is disclosed through the
  mandatory three-figure report (§4.4). It **MUST NOT** be laundered into the loud path.
- **No saturation.** The encoder never picks a step multiplier fine enough to clamp a
  quantized coefficient past the i16 wire range (per-band saturation guard), so "buying
  quality" with spare budget cannot inject clamp error.
- **Targets are overshoot bars, not padding rules.** A stream whose content is exhausted
  at maximum quality undershoots its target; padding to reach the number would be
  size-laundering and is **forbidden**. Undershoot beyond ±3% is disclosed per row in
  the harness (`rateAccuracyPct`), never hidden. The two-sided ±3% bar is asserted on
  demanding content (Rust/WASM rate-control tests; dev corpus rows land within ±1.2%).

**Measured (this build).** `dense_music` fixture, 6 s stereo, ABR: 320 → 318.8 kbps,
192 → 191.3, 128 → 127.5 (all 0.4% off); CBR identical. Container level with protect
islands (24.4% of samples): 317.0 / 190.3 / 126.9 (≤ 0.94% off), islands sample-exact.
Dev corpus + killers, ABR, aggregate MP5 ÷ LAME CBR size: **0.990** at 320, **0.990** at
192, **0.990** at 128 — inside the Phase 4.4 corpus bar of LAME + 2%, with two
protect-dominated killers disclosed (protect tax alone 99–149% of the 128/192 budget).
Artifacts: `benchmarks/audio-quality/lame-gate-{128,192,320}-abr.json`.

Wording rules, now that rate control exists:

- Matched-bitrate wording ("MP5-C ABR 192") is permitted **only** for streams actually
  encoded at that target (header field set), and **only** alongside the three figures.
- **No** "beats MP3" / quality-superiority wording at any bitrate until preregistered
  listening (§7). Size parity at a matched rate is a **size** statement, not a quality
  statement.
- The harness enforces this in code: `RATE_CONTROL_READY = true` in
  `tools/audio-lab/claimFlags.mjs` enables *size-gate* verdicts only.

### 6.4 Corpus discipline

1. **Dev** and **held-out** corpora **MUST** be registered **before** any psychoacoustic tuning (Phase 3 acceptance).
2. Held-out **MUST** remain sealed until release-candidate evaluation.
3. Retuning after peeking at held-out results **MUST NOT** occur without opening a **new experiment revision** (new `encoder_revision` / experiment id and logged protocol change).

---

## 7. Non-goals and claim discipline

Aligned with `docs/MP5_COMPATIBILITY_POLICY.md` public-claim rules:

| Rule | Normative text |
|------|----------------|
| Default / batch | CodecId 6 **MUST NEVER** become the default or batch-export codec |
| “Beats MP3” | **Forbidden** without a preregistered listening win at a **specifically named** bitrate that has left lab |
| “MP3-class quality” | Same bar as above |
| Interim wording | **Permitted:** “experimental lossy targeting MP3-class sizes” |
| Size-only claims | Citing ~0.21× PCM (real-track MDCT High in `MP5C_VNEXT_RESULTS.md`; MP3-320 corpus ~0.2189× WAV in `benchmarks/real-music/FORMAT_COMPARISON_FLAC_MP3_WAV.md`) **MUST NOT** be equated to MP3-320 **quality** |
| Other codecs | No beats-AAC/Opus/FLAC/WAV claims |

---

## 8. Risks and anti-patterns

| Anti-pattern | Why it is forbidden / dangerous |
|--------------|----------------------------------|
| Relabeling CodecId **5** as lossy MP5-C | Violates bit-exact identity; destroys trust; blocked by §1 |
| Freezing **32×`f32`** scalefactors into the bitstream | ~91.6 kbps stereo side-info tax at 44.1 kHz (§4.6); blocks honest rate ladder |
| Claiming MP3-class from ×PCM alone | Size class ≠ quality; listening required |
| **SNR-laundering** via high `%protected` + full-song SNR | Masks bad loud path; blocked by §4–§5 |
| **Protect-laundering** to hit size targets | Masks coded-path inefficiency; blocked by three-figure report |
| ABX on bit-exact C2 | Meaningless; C6 protocol is `MP5C6_ABX_PROTOCOL.md` |
| Intensity stereo before safe M/S | Image collapse risk; flags reserve M/S first (§3.3) |
| `transient_tighten` as the only pre-echo fix | Global step shrink is a lab stopgap; window switching required for leave-lab pre-echo claims |
| Whole-file-only decode while claiming streamability | Seek / indexed frames required before streamability claims (Phase 7) |
| Peeking held-out then silent retune | Invalidates RC evidence; requires new experiment revision |

---

## 9. Version and freeze policy

### 9.1 Pre-freeze numbering

| Field | Policy |
|-------|--------|
| `encoder_revision` | Monotonic `u16` for encoder semantics/tooling; bump on any bitstream or protect-default change |
| `profile_id` | Syntax family for scalefactor/payload coding |
| Experiment / lab tags | Pre-freeze builds **SHOULD** mark INFO/tool metadata as `experimental` |

Pre-freeze CodecId 6 files are **lab artifacts**. Interop across machines **SHOULD** pin commit hash + `encoder_revision` + `profile_id` in INFO.

### 9.2 Freeze

A freeze **MUST** include:

1. Frozen byte layouts for header, units, and the frozen `profile_id`
2. Golden encode/decode fixtures committed under version control
3. Explicit forever-decode obligation (below)
4. Container registry + compat matrix updates (orchestrator)

`profile_id = 0` (raw `f32` scales) **MUST NOT** be frozen.

### 9.3 Forever-decode obligation

After a CodecId 6 revision is **released/frozen**:

1. Reference decoders **MUST** decode that revision’s bitstreams indefinitely (bit-exact PCM for protect islands; conforming PCM for MDCT units).
2. Newer encoders **MAY** stop writing old profiles but **MUST NOT** break decode of prior frozen profiles.
3. Removing decode support for a frozen revision **MUST NOT** ship without a documented compatibility break and major container/policy revision.

Classic CodecId 1 and CodecId 5 forever-decode obligations are unchanged by this document.

---

## 10. Test Definition of Done (cadence matrix)

Derived from the product-path testing matrix. Layers are additive.

| Test layer | Cadence | Gate family |
|------------|---------|-------------|
| Unit: MDCT OLA, pack/unpack, silence, magic reject, protect islands sample-exact | **Every PR** | Correctness |
| CodecId 6 convert/decode smoke + classic C / C2 regression | **Every PR** | Correctness |
| Synthetic fixtures + hiss-risk on **protect islands** + `%protected` parity | **Every PR** (`pnpm audio:gates`) | Correctness + bytes |
| Full synthetic × bitrates; native/WASM PCM hash parity; malformed corpus fail-closed | **Nightly** | Correctness / security |
| Dev music vs LAME 128/192/320 objective (size + reject-filter metrics) | **Nightly** after Phase 3 harness | Bytes/rate + objective screen |
| Held-out corpus | **Release candidate only** | Leave-lab |
| ABX smoke (maintainer) | Major codec milestones | Listening |
| Formal ABX / MUSHRA | **Leave-lab RC** | Listening (release) |
| Fuzz / seek / stream / WASM perf | **Nightly** after Phase 5; **hard gate** at Phase 7 | Correctness / perf |
| Backward compat CodecId 1 / 5 / frozen CodecId 6 revisions | **Every PR after freeze** | Forever-decode |

**Every** engineering milestone **MUST** consider three gates: **correctness/security**, **bytes/rate**, and **perceptual quality** (proxies until listening; listening overrides proxies).

---

## 11. Informative: mapping to current tree

| Concern | Current code | CodecId 6 target |
|---------|--------------|------------------|
| Loud MDCT | `mp5c3` (`0x4D 0x33`) | Coding core under magic `0x43 0x36`, `profile_id ≥ 1` for freeze |
| Protect + unit mix | `mp5c2::encode_mdct`, `inspect_unit_mix` | Same tags/semantics; new magic/header/CRC; CodecId 6 |
| Classic lossy | `mp5c` magic `0x43`+`0x02`…`0x06` | Remains CodecId 1 “classic” |
| Bit-exact hybrid | `mp5c2` magic `0x43 0x34`, `TAG_SR` | Remains CodecId 5; out of scope |
| Container ids | `CodecId` in `packages/mp5-container/src/constants.ts` | **Done (Phase 2):** `MP5C6 = 6` |
| CodecId 6 stream | `rust/mp5-codec/src/mp5c6.rs` | Magic `0x43 0x36`, 28-byte header, per-unit CRC |
| WASM surface | `encode_mp5c6`, `decode_mp5c6`, `inspect_unit_mix` in `rust/mp5-codec/src/lib.rs` | Bound in `apps/web/src/wasm/codec.ts` |
| Converter / player | `LAB_ONLY_CODECS` in `ConverterPanel.tsx`; `decodeMp5.ts` | Lab-gated export, honest lossy label |

---

## 12. Document control

| Item | Value |
|------|-------|
| Phase | 1 — normative spec; §3 / §4 implemented in Phase 2; §3.2.2 / §6.3 in Phase 4; §3.2.3 in Phase 5; Phase 6 scaffolding in Phase 6; Phase 7 hardening in Phase 7 |
| Implementation | `rust/mp5-codec/src/mp5c6.rs` (identity, CRC, `inspect_unit_mix`, rate control, seek), `mp5c3` (scalefactors, coefficient pack, rate shaping, joint stereo, window switching, psycho model, NMR screen), WASM bindings, lab-gated converter + player |
| Freeze | Not granted by this document; golden fixtures prepared under `tests/fixtures/c6-parity/` — the freeze declaration itself is a maintainer decision after Phase 6 listening |
| Related | `docs/MP5_CONTAINER_SPEC.md`, `docs/MP5_COMPATIBILITY_POLICY.md`, `docs/MP5C6_ABX_PROTOCOL.md` (Phase 6 listening), `docs/MP5C_VNEXT_RESULTS.md` (lab measurements) |
