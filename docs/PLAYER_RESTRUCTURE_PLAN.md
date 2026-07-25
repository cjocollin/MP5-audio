# MP5 Player — Restructure & Optimization Plan

_Consolidated from a three-agent audit (architecture · performance/memory · correctness/tests), a cross-review round where the agents critiqued each other, and direct in-browser measurement. 2026-07-23._

---

## Status — Phase 2 complete (2026-07-24)

The pure state machine (`playbackMachine.ts`), non-React controller (`playbackController.ts`), and scoped `DecodeScheduler` are built and wired as the load-lifecycle owner. **Step 3 second half — the play-intent migration — is done:** the three tangled intent refs (`playWhenReadyRef`, `autoAdvanceRef`, and the load-role of `pendingPlayTrackId`) are gone; play intent lives in the machine, consumed on `AUDIO_STARTED`.

**Intent architecture (how it works now):**
- The store's **`pendingPlayTrackId` (+ new `pendingPlaySource`) is the single track-keyed play-intent mailbox.** Every trigger (import/demo/library/converter → `external`; auto-advance → `autoAdvance`; album → `album`; next/prev/play-index/similar → `user`) deposits `(trackId, source)`.
- The **one track-load effect is the sole `controller.select()` caller.** It drains the mailbox into `select(id, {play, source})` (new track) or `playClick()` (current track). `pendingPlayTrackId` is a **reactive dependency** of that effect, so a mailbox write always re-runs the drain regardless of set-vs-index-change order.
- **`isPlaying` → machine bridge**: a `useEffect([isPlaying])` dispatches `audioStarted(currentTrackId)`/`audioStopped()` — the only thing that flips `machine.playing` and consumes intent. One-way (machine never writes `isPlaying`); the store's `isPlaying` stays the engine/UI driver.
- New controller handle **`onLoadFailed(trackId, source)`** captures the intent source before the reducer clears it → auto-advance-on-error skips only when `source==='autoAdvance'`.
- `playWhenReadyKaraokeRef` → renamed **`resumeStemsWhenPreparedRef`**, demoted to the stem/karaoke transport-prep resume (a concern the machine deliberately doesn't model).

**Verification:** typecheck clean; 628 unit tests pass (machine property test + controller intent/failure/retry tests). Two adversarial workflow rounds (per-variant find→refute, then per-fix re-verify) drove 5 confirmed regressions to fixed with the last low-severity follow-up resolved. **Caveat:** the headless MCP browser's AudioContext clock is frozen (probed: 0 ms advance), so audible playback could not be verified there — the *state machine* reaching `playing` + consuming intent was verified live. **Needs a real-browser smoke** (load+play, past-8s progressive, pause/play, rapid Next/Prev, auto-advance, embedded re-open). All Phase-2 work is **uncommitted**.

Remaining: Phase 3 (memory) and Phase 4 (engine unification) — not started.

---

## TL;DR

- **All five load/playback bugs (four already fixed this session, one still open) share one root cause:** play/load **intent** and decode **cancellation** live in mutable ref-flags and nine parallel generation counters that no single owner arbitrates. `MixDecodeWorkerClient.decode()` cancels *every* in-flight decode via a shared epoch (`mixDecodeWorkerClient.ts:266`), and React effects — not a controller — drive loading.
- **The remaining rapid-switch bug is NOT fixed by "owning intent" alone** (the architecture agent retracted that claim after cross-review). The minimal robust fix is **scoped cancellation + recoverable partial-end**; owned intent fixes the *broader* family (auto-play-that-doesn't, ghost audio after Clear).
- **The "freezes the whole browser" crash is real and reproducible** on real-size files (measured: 2× 24 MB v4 + rapid Play → main heap ~3 GB against a 4 GB cap, renderer frozen, clock corrupted to `50:00`). **Measurement corrected the memory model:** it is **main-thread heap retention from uncontrolled concurrent decode passes**, not orphaned worker realms — 0 workers were spawned or terminated during the crash; one warm worker was reused.
- **Do not rewrite from scratch.** Unanimous. Extract the ~600-line orchestration core (all root causes live there); the UI, store, engines, container, and codec are sound.

---

## The one change that buys the most margin, immediately

**`Vec::with_capacity` for the decoder output** (`rust/mp5-codec/src/mp5l/mod.rs:1053` and `:1137`), sized from `frame_count × 8192 × channels` (or the HEAD `totalSamples`).
Measured effect: worker WASM high-water **156.8 MB → ~70 MB** for a 27 MB input, and it removes the ~96 MB per-decode doubling transient. Two-line Rust change, no coordination, no architecture dependency. It does not fix the crash (the crash is main-heap, see below) but it widens every margin while the real fix lands.

---

## What the empirical measurement changed

Agent B modelled the 2.5 GB as **6–10 orphaned worker realms** (`worker.terminate()` on every cancel, ~271 MB each, invisible to DevTools JS-heap). Direct measurement (instrumenting the `Worker` constructor, loading two synthetic 24 MB v4 files, rapid-alternating Play in dev/StrictMode) **refuted the specific mechanism**:

| Signal | Measured |
|---|---|
| Worker spawns during the crash | **0** |
| Worker terminations | **0** |
| `usingFallback` | false (worker path active, one warm worker reused) |
| `decodeCache` retained | 40 MB (1 entry) |
| Main JS heap peak / after | **3063 MB / 2621 MB** (limit 4096) |
| Playback clock | `50:00 / 4:00` (corrupted) — renderer frozen |

**Corrected mechanism:** rapid play/switch spawns many overlapping `loadFile`/`loadPcm`/`upgradePcm` passes (× progressive's 3 decode passes per track × StrictMode double-invoke). Each retains `floatChannels` (80 MB) + `samples` (40 MB) + `AudioBuffer` (80 MB) + `parsed.audioFrames` (24 MB) until GC, but the passes never cleanly resolve (the wedge), so the products stack on the **main heap** faster than GC reclaims them → ~3 GB → freeze. The root (uncontrolled concurrent decode work from unscoped cancellation) is what B and the correctness agent both identified; only its **location** was wrong.

**Consequence for the plan:** the durable fix is **concurrent-pass control** (Phase 1 scoped cancellation + a single-load controller) plus **releasing decode products** (drop `floatChannels`, release `audioFrames`). Agent B's "worker recycle policy" is downgraded — workers aren't the leak. Production (no StrictMode) roughly halves the multiplier but the mechanism persists; **re-measure on a production build with `performance.measureUserAgentSpecificMemory()` before claiming the crash risk is fully gone.**

---

## The open rapid-switch bug — verified 3-stage mechanism

Repro: load a long v4/PCM track, play, add a second track, click Play on it while the first is still decoding. The new track shows duration + "Bit-exact" but Play does nothing thereafter.

1. **Stage 1 — intent delivered against a partial buffer.** "Play B" arms `playWhenReadyRef`, `setCurrentIndex(B)` (which destroys `isPlaying` in the store), → progressive `loadFile(B)`. The first 8-second window decodes and plays; the *rest* is delegated to a `void` background upgrade IIFE (`Mp5Player.tsx:1137`).
2. **Stage 2 — the upgrade is killed and the kill is swallowed.** `loading` is already false, so the neighbor-prefetch effect (`Mp5Player.tsx:1301`) fires, calls `decode()`, whose unconditional `cancelActive()` (`mixDecodeWorkerClient.ts:266`) bumps the shared epoch → the upgrade's `throwIfSuperseded` throws → the `AbortError` is swallowed at `Mp5Player.tsx:1166` with no retry. `partialBufferRef` stays true forever.
3. **Stage 3 — every later Play click is a no-op.** At the 8 s window end the engine parks and does **not** `setPlaying(false)` (`useMp5AudioEngine.ts:157`). Store `isPlaying` is stuck true with no source; Play clicks either pause-nothing or seek into the dead partial buffer (`startAt` clamps to `bufferDuration − 0.001`) → ~1 ms blip. "Bit-exact" is a stale, un-generation-guarded `scheduleIntegrity` idle callback from the *previous* track.

**Minimal fix (agreed by all three after cross-review):** `{ scoped cancellation + recoverable partial-end }`. Owned intent is required for R1/R2/R3 and the ref-flag leaks, but is **not** sufficient for this wedge on its own.

---

## Phased roadmap

Legend: **[QW]** independent quick win · **[BUG]** closes the open wedge · **[STRUCT]** structural · **[MEM]** memory.

### Phase 0 — quick wins, ship immediately (no architecture dependency)

| Item | Where | Type |
|---|---|---|
| `Vec::with_capacity` in decode output | `mp5l/mod.rs:1053,1137` | [QW][MEM] |
| Drop `floatChannels` after AudioBuffer build (cache-hit loads already run without them) | `useMp5AudioEngine.ts` `loadPcm`/`upgradePcm` | [QW][MEM] |
| JS codec fallback must **throw** for non-PCM instead of decoding a compressed bitstream as full-scale noise (hearing-damage risk) | `wasm/codec.ts:152-177` (D3) | [QW] |
| PCM odd-**length** realign (+ floor) in all three branches, incl. the unfixed stem sibling | `decodeMp5.ts:209`, `lib/stems/stemDecodeCore.ts:19`, `codec.ts:156` (D2) | [QW] |
| HEAD sanity: reject `channels==0 \|\| sampleRate==0` | `validator.ts` `validateParsedFile` (D6) | [QW] |
| Move `MAX_CHUNKS` check **inside** the parse loop (chunk-bomb DoS) | all 3 parsers (D5) | [QW] |
| Guard `recordRecentFileOpen` in `importAlbumPackageToPlayer` (sibling of the already-fixed guard) | `playerImport.ts:43` | [QW] |
| Rust `push_until` tail-drop fix — buffer the unconsumed remainder; unblocks continuation decode and fixes future seam bit-exactness | `mp5l/mod.rs:1159` | [QW] |
| STDF fragment CRC → `crc32Async` + `yieldToEventLoop` between fragments (~16 ms/stem main-thread freeze on karaoke prep the AUDI fix missed) | `lazyMp5Load.ts:118,128` (D9) | [QW] |
| Lazy-load CORR for MP5-H (>2 MB files with CORR >256 KB currently decode base-only, silently) | `indexMp5Lazy.ts:75`, add lazy `loadCorr` (D1) | [QW] |

### Phase 1 — close the open bug (dependency-ordered)

1. **Scope cancellation** — remove the unconditional `cancelActive()` from `decode()` entry; add `decode(req, { priority: "interactive" | "background" })`; background callers (prefetch, upgrade) may not cancel an interactive load or each other; make `isBusy()` true for the whole `decode()` span. **[BUG — defeats the verified repro; biggest single lever]**
   - **Constraint (both A and C flagged):** interactive jobs must **not** be cancelled via `worker.terminate()` — only genuinely superseded ones — or the Phase-3 streaming continuation decoder cannot survive a prefetch.
2. **Recoverable partial-end** — never swallow an upgrade `AbortError` while current; engine exposes `isWaitingForFullDecode()`; resolver gains a `resume_full_decode` action; `startAt` refuses to start within ~50 ms of a partial-buffer end. **[BUG — makes the wedge impossible-by-construction]**
3. **Reify owned intent** `{ trackId, gen }` — consumed only when audio actually starts for that track; route `importMp5ToPlayer` playFirst, `handleTrackEnded`, and every out-of-component caller through an `EXTERNAL_PLAY_REQUEST`; add `CLEAR`/`REMOVE` events. Closes R1 (playFirst dropped for demo/welcome/landing/library/converter), R2 (ghost load after Clear), R3, and leaks L1–L3. **[BUG]**

### Phase 2 — structural consolidation (bug stays closed, now provable)

- Extract `player/engine/trackLoader.ts` (`loadTrack(track, { signal, onStage })`) — deletes the 16 `stillCurrent()` checks; the progressive upgrade becomes a tracked child task, not a `void` orphan. **[STRUCT]**
- Add `player/engine/playbackController.ts` + `playbackMachine.ts` — one `AbortController` per load, a pure state machine (`idle | loading | readyPartial | ready | error` × transport), single writer to a new `playback` store slice. Absorbs the already-good `resolvePlaybackRequest`. **[STRUCT]**
- `player/engine/decodeService.ts` — priority queue generalizing Phase-1 scoped cancellation; move prefetch + progressive upgrade under it; delete `isBusy()` polling. **[STRUCT]**

#### Phase 2 status (2026-07-23)

**Done + verified:** `player/engine/playbackMachine.ts` — the pure state machine, property-tested (`tests/playbackIntentMachine.test.ts`, 11 cases incl. a 400-run seeded property test). Not wired in yet; the app is unchanged. This is the foundation the wiring targets.

**Wiring blueprint** (from the exhaustive recon — execute in this order, verifying each step; each is ship-green):

1. **`decodeService.ts`** — re-home the Phase-1 `MixDecodeWorkerClient` into `engine/`, keep the `interactive|background` priority + `backgroundChain`. Add its missing unit tests (mock `Worker` via `vi.stubGlobal`): background decodes don't cancel each other; interactive preempts; `isBusy()` spans the whole call. Lowest-risk; isolated from the 28 intent sites.

2. **`trackLoader.ts`** — extract `loadFile`'s body (Mp5Player ~999–1300) into `loadTrack(track, { signal, onStage, engine, decode })`. Replace the **17 `stillCurrent()` guards** (all `if (!stillCurrent()) return`, def at MP:1057) with `signal.aborted`, and the `loadFileGenRef` bump (MP:1003) + prefetch reads (MP:1331/1335/1341) + `!track` invalidation (MP:1437) with an `AbortController` owned by the controller. The progressive background upgrade (currently a `void (async…)` IIFE) becomes a child task registered on the same signal. Behavior-preserving; also lets a superseded load abort its main-thread work *before* the expensive `loadPcm`/AudioBuffer build — trimming the residual ~1.9GB churn peak.

3. **`playbackController.ts`** — owns the `playbackMachine` instance, one `AbortController` per load, the two engine handles, `decodeService`, and the prefetch scheduler. Publishes machine state into a new `playback` store slice (single writer). Migrate the intent sites to controller methods / machine events, in this dependency order so the ref-soup can be deleted incrementally:
   - **Intent (28 `playWhenReadyRef` sites)** → `controller.requestPlay(trackId, source)` emitting `PLAY_CLICK`/`SELECT`/`EXTERNAL_PLAY_REQUEST`. Sites map: `handlePlayIndex` (MP:1999) → SELECT play; `handlePlayPause` (MP:851) → PLAY_CLICK/PAUSE_CLICK; `handlePlayerNext/Prev` (MP:2153/2167) → SELECT play; album `handlePlayAlbum`/`handleAlbumTrackSelect` (MP:1807/1827/1866/1895/1903) → SELECT play; `importMp5ToPlayer` playFirst (already store-backed via `pendingPlayTrackId`) → EXTERNAL_PLAY_REQUEST; both engines' `onTrackEnded` goto (MP:326/361/381) → TRACK_ENDED then controller-issued SELECT(next, autoAdvance).
   - **`autoAdvanceRef`** folds into the intent `source: "autoAdvance"`.
   - **`loadedPcmTrackIdRef`** (MP:1143/1255/1542, cleared 2017/2093) → machine `phase === "ready" && trackId === x`.
   - **CLEAR/REMOVE** (`handleClear` MP:2093, store `clearTracks`/`removeTrack`) → machine CLEAR/REMOVE (auto-aborts the load, R2 by construction).
   - `resolvePlaybackRequest`'s 8 actions stay — the controller calls it at `startAudio` time to pick transport (full-mix vs stem vs karaoke).
   - **Stem/karaoke** (`playWhenReadyKaraokeRef`, `stemGraphGenRef`, the resume-after-prepare effect MP:815) and **embedded** (`embeddedHydrateGenRef`, `playlistPrefetchGenRef`) migrate LAST — they're the highest regression risk; keep them on their current refs until the core path is proven, then fold in.

4. **Delete** `playWhenReadyRef`, `autoAdvanceRef`, `loadedPcmTrackIdRef`, `loadFileGenRef`, the `stillCurrent`/latest-callback-ref shims, and the track-load effect body (→ a one-line `controller.onTrackChanged(track)` bridge).

**Verification gate for Phase 2:** all Phase-1 browser checks (30s v4 plays past 8s; rapid-switch churn survives + churn peak measured; clear-to-empty clean) PLUS an adversarial per-variant review (progressive / cached / stems / karaoke / manifest-album / embedded-album / session-restore) against the diff before declaring done.

### Phase 3 — structural memory (needs the Phase-2 worker seam)

- Worker-side integrity hashing — worker returns `{ audiSha256, pcmSha256 }`; main becomes a pure comparator; removes the `encodeAudiPayload` byte-identical rebuild (−94 MB idle churn). **[MEM]**
- Release `parsed.audioFrames` after decode+integrity (unblocked once hashing leaves the main thread); lazy handle re-reads from the Blob on demand. −24–27 MB per played track. **[MEM]**
- Continuation decode replacing the second full decode — measured −100 MB wasm, TTFA unchanged. Gated on the Phase-0 `push_until` fix + a streaming worker protocol under one `jobId`. **[MEM]**
- Worker-owns-AUDI-bytes — transfer the Blob/index to the worker; main keeps HEAD + chunk index + STDF only. Subsumes the previous item's main-thread win. **[MEM]**
- `decodeCache` sized **by bytes** (e.g. 128 MB) not entries; prefetch gating on `navigator.deviceMemory` / memory trend. **[MEM]**

### Phase 4 — engine unification (optional, last)

- Lift both engines into controller-owned classes sharing a **single** `AudioContext` + master gain → full-mix/stem overlap becomes structurally impossible; delete the 500 ms overlap watchdog (`Mp5Player.tsx:440`) and `onOverlapDetected`. Land chunked `copyToChannel` into a pre-created AudioBuffer (kills the 25–50 ms main-thread block + the 80.7 MB float transfer set).

---

## Test gates (write against behavior *before* the refactor; red where the bug lives)

- **`tests/playbackIntentMachine.test.ts`** — machine unit tests: intent survives abortion (exactly one `startAudio(B)`); a Play click in any `ready ∧ !playing` state always starts; no reachable `playing ∧ no-source ∧ no-pending` state; `CLEAR`/`REMOVE` cancels (R2); `EXTERNAL_PLAY_REQUEST == SELECT play` (R1); property test over random event sequences. Split abort into `LOAD_SUPERSEDED` (must not touch intent) vs `LOAD_FAILED` (surfaces).
- **`tests/mixDecodeCancellation.test.ts`** — deferred byte-source + mock worker: background decodes don't cancel each other; interactive preempts both; the progressive upgrade survives a concurrent prefetch (the direct Stage-2 regression).
- **`tests/progressiveSeam.test.ts`** — the 8 s window is a byte-exact prefix of the full decode (green today, guards against the tail-drop becoming audible); continuation-decode length == full decode (`it.fails` until the Rust fix).
- **`tests/decodeFrameAlignment.test.ts` / `tests/parserSymmetry.test.ts`** — the D1–D9 format/parser fixes.
- **Playwright** — `load-race.spec.ts` (add track, immediately Play, under `setCPUThrottlingRate {rate:6}`), `hidden-tab-load.spec.ts` (the rAF-stall class fixed this session), `queue-clear-race.spec.ts` (R2). Assert via `window.__mp5PlaybackRegression()`.

**Acceptance gate for "open bug fixed":** the machine intent-survives-abortion test + the upgrade-survives-prefetch test + `load-race.spec.ts` under CPU throttling, all green.

---

## Classification summary

- **Must-fix before the refactor:** nothing as code — only the Phase-0 characterization tests (they encode today's behavior and the bug).
- **Fixed by the refactor (write regression tests, don't hand-fix):** R1, R2, R3, R4, R5, R6, D7.
- **Independent quick wins (now):** the whole Phase 0.
- **Independent correctness (scheduled):** D1, D4, D8, D9, and the continuation-decode Rust prerequisite.
