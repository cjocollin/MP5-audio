# MP5-L FLAC A/B corpus freeze

## Layout

| Role | Path | Purpose |
|------|------|---------|
| **Tuning / smoke** | `tuning/` | ORIGAMI full + segments (one master). Day-to-day encoder work only. |
| **Held-out primary** | `held-out/` | Independent masters for formal size accept + promote gate. |
| **Speech archive** | `speech-held-out/` | Hades audiobook SPEECH_PASS history (not formal primary). |
| Legacy flat files | `*.flac` at corpus root | Still loaded as tuning if present (compat). |

## Honesty

- ORIGAMI slices are **not** independent albums. Ten `altpop_mm_*` extracts come from one ORIGAMI master and count as **one album** toward diversity.
- Ten `pop_kesha_*` clips are distinct tracks from one Kesha album (**one album**, pop).
- Current held-out (2026-07-21): **20 clips / 2 commercial albums** (pop + alt-pop). Ideal bar remains >=4 genres; this corpus clears the code gate (`!speech_single`) while documenting limited album diversity.
- Hades speech (20 clips) archived under `speech-held-out/` after SPEECH_PASS (median 0.993x flac-5).

## Hash protocol

`HELD_OUT_HASHES.txt` must be **UTF-8** (NUL bytes / UTF-16 fail the bench and force PROVISIONAL).

After adding files:

```powershell
Get-ChildItem benchmarks/real-music/corpus/held-out -File -Filter *.flac |
  ForEach-Object {
    $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    "$h  $($_.Name)"
  } | ForEach-Object -Begin { $all = @("# UTF-8 hash freeze") } -Process { $all += $_ } -End {
    [System.IO.File]::WriteAllLines(
      "benchmarks/real-music/corpus/HELD_OUT_HASHES.txt",
      $all,
      (New-Object System.Text.UTF8Encoding $false)
    )
  }
```

Format: one `SHA256  filename` per line. Bench verifies hashes at load.

## Gate measurement

- Compare MP5-L AUDI bitstream bytes to FFmpeg `flac -compression_level 5` of identical 16-bit PCM.
- Median = middle of **held-out** track ratios only for formal accepts (`kind == held-out`).
- Lab listening refs and ORIGAMI tuning names never count toward the >=20 master gate when filtered.
- Decision file: `benchmarks/real-music/MP5L_GATE_DECISION.txt`.