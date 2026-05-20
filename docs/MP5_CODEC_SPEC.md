# MP5 Codec Specification (v0.1)

## MP5-L (lossless)

- Block size: 4096 samples/channel (configurable)
- Stereo: M/S decorrelation
- LPC order 4–8, Rice-coded residuals
- CRC32 per block
- **Guarantee:** bit-exact roundtrip

## MP5-C (lossy)

- Frame: 1152 samples (default)
- MDCT + simplified masking + uniform quantization
- Huffman entropy (fixed tables v0.1)
- Overlap-add decode
- Presets: Low 64k, Standard 128k, High 192k, Extreme 256k (target bitrates)

**Not competitive with AAC/Opus in v0.1.**

## MP5-H (hybrid)

- Base: MP5-C in AUDI
- CORR: compressed residual (i16 deltas + rice)
- Modes: `base_only`, `enhanced`

## Frame bitstream (codec-internal)

Documented in `rust/mp5-codec` module headers. Version byte `0x01` per codec sub-stream.
