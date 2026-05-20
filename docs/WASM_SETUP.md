# WASM codec setup (MP5-C / MP5-L / MP5-H)

The web converter and player use Rust codecs compiled to WebAssembly. Without this step, only **PCM export** is available (honest uncompressed fallback).

## Prerequisites

1. **Rust** — https://rustup.rs/
   ```bash
   rustc --version
   cargo --version
   ```

2. **wasm-pack**
   ```bash
   cargo install wasm-pack
   wasm-pack --version
   ```

3. **Windows: MSVC Build Tools** (for linking)
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools
   ```
   Include the **Desktop development with C++** workload.

4. **Node.js 20+** and **pnpm**
   ```bash
   pnpm install
   ```

## Build WASM

From the repository root:

```bash
pnpm wasm:build
```

Output is written to `apps/web/src/wasm/pkg/` (`mp5_codec.js`, `mp5_codec_bg.wasm`).

## Run the web app

```bash
pnpm dev
```

Open the **Converter** tab. You should see **“WASM codecs ready”** when load succeeds.

## Verify codecs

### Rust (native, recommended for CI)

```bash
cargo test -p mp5-codec
```

- **MP5-L**: lossless roundtrip in `mp5l` tests
- **MP5-C**: SNR / roundtrip in `mp5c` tests
- **MP5-H**: hybrid in `mp5h` tests

### Browser

1. Convert a short WAV/FLAC with **MP5-L** selected.
2. Player **Format** panel should show **MP5-L**, not PCM.
3. Playback should sound correct.

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Converter shows “PCM export only” | Run `pnpm wasm:build`, hard-refresh |
| `link.exe` not found (Windows) | Install VS Build Tools |
| Vite error importing `/public/wasm` | Use `src/wasm/pkg` (current layout) |
| File shows PCM after choosing MP5-C | WASM failed to load; check browser console |

## MP5-C/L/H playback blockers

- File must be encoded with WASM (HEAD `codecId` 1/2/3, not 0).
- Decoder uses the same WASM module as the converter.
- Very large files may be slow in the browser; no streaming decode yet.
