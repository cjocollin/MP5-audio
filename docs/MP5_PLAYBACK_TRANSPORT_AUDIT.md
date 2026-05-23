# MP5 playback transport audit

Last updated: 2026-05-20 (karaoke / stem-mix overlap investigation)

## Architecture

| Layer | Responsibility |
|--------|----------------|
| `resolvePlaybackRequest` | Single entry for Play, seek, resume-after-prepare |
| `useMp5AudioEngine` | Full mix (AUDI PCM) — one `AudioContext`, one source |
| `useStemMixerEngine` | Stem / karaoke mix — separate `AudioContext`, N sources + gain nodes |
| `Mp5Player` | Authority switch: `useStemPlayback = stemMixActive && stemTracks.length > 0` |

**Rule:** Only one authority may output audio. Full mix and stem mix each use their own `AudioContext`, both connected to `destination` — if both run, the user hears overlap.

## Clock anchor bug (2026-05-22)

`capturePlayhead` updated `offsetRef` without re-anchoring `startedAtRef`.
The second call in `patchStemAudible` / `insertStemAtCurrentOffset` (after
the synchronous `pcmToAudioBuffer` build, which blocks the main thread for
~1–2 s on a ~9M-frame stereo stem) re-added the full elapsed-since-start.
Result: the late-joined vocal stem began tens of seconds past the rest of
the mix (verse vs. chorus on Pity Party).

Fixed by making `capturePlayhead` idempotent — every successful capture
also sets `startedAtRef = ctx.currentTime`. `resyncMasterClock` and the
inline duplicate in `wireSourceEnded` collapsed onto the same path.

Regression: `tests/stemPlayheadAnchor.test.ts`.

## Overlap causes (found)

1. **Full mix + stem mix** — Main not stopped before stem starts, or `seekMain({ start: true })` while stem sources still active (karaoke fallback, race before `useEffect` on `useStemPlayback`).
2. **Full graph restart on seamless UI** — `restartAllAudibleSourcesAtPlayhead` disposed all stems then restarted; overlapping with a concurrent `loadInitialTracksForMix` / `start_stem_mix` produced double layers.
3. **Staggered `startAllAt` (fixed)** — Sequential `src.start(0, offset)` without a shared `when` clock desynced stems; late joins then used a wrong master clock.
4. **Muted stems still running** — `applyGains(0)` left `AudioBufferSourceNode`s playing; rare bleed / extra load; stopping inaudible sources is required.
5. **Concurrent seamless ops** — Checkbox + unmute in quick succession could run two async graph mutations in parallel.
6. **Overlap detector gap** — `createTransportSnapshot` ignored overlap when `authority === "full_mix"` even if stem sources were still active.

## Seamless vs full reload

| UI action | Allowed transport op |
|-----------|-------------------|
| Checkbox / mute / unmute / volume | `insert` / `remove` / `audible` patch only |
| Prepare & enable mix, Restart stem mix, Solo stem load, Return to full mix | `loadInitialTracksForMix` / `startAllAt` |
| Seek while playing stem mix | `seekStemMix` → `startAllAt` |

Late-loaded karaoke vocals: **join one stem** at `capturePlayhead()` after buffer build — do **not** restart the whole graph on unmute.

## Invariants

1. `useStemPlayback === true` ⇒ `stopMainSource()` (Mp5Player `useEffect`).
2. `useStemPlayback === false` ⇒ `stopStemMix()` + invalidate graph generation.
3. Batch stem starts share one `when = ctx.currentTime` and one buffer `offset`.
4. Seamless ops run on a serial queue; `graphBusy` blocks duplicate `loadInitialTracksForMix`.
5. Inaudible stems (muted / solo-ducked) must not keep running sources.

## Diagnostics

- Settings / `localStorage mp5_playback_trace=1` — `tracePlayback` logs
- Transport line in player UI — `OVERLAP` when both engines report active sources
- `warnIfPlayheadResetAfterPatch` — dev guard after seamless ops

## Manual verification (Pity Party)

1. Play full mix → enable Karaoke → only backing stems audible, synced lyrics.
2. Play 1:00 → load Lead Vocal → unmute — vocal aligned, no doubled drums.
3. Pause → unmute stem — no audio until Play; Play does not stack two mixes.
4. Restart stem mix — single layer, same playhead.
5. Return to full mix — stem silent, full mix only.
