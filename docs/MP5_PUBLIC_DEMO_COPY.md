# MP5 Public demo copy (Alpha)

Canonical strings for the hosted demo at **https://mp5-audio.vercel.app**.

**GitHub:** https://github.com/cjocollin/MP5-audio

Update `apps/web/src/lib/publicLinks.ts` and `publicLandingCopy.ts` when URLs change.

## Hero

- **Headline:** MP5 Audio
- **Subheadline:** An experimental smart audio format, converter, and player.
- **Supporting:** Convert audio into .mp5, play it back with MP5-L v3 lossless audio, and explore rich metadata, cover art, lyrics, content guidance, waveform data, and future interactive audio.

**Badges:** MP5 Alpha · MP5-L v3 default · Lossless · PWA-ready · Experimental

**Build label:** `MP5 Alpha · v0.10.2-alpha` (`data-testid="app-version"`)

**v0.10.2 note (stems):** Large embedded stem exports use segmented **STDF** fragments when a single **STDA** chunk would exceed the 64 MiB limit; small demos still use **STDA**. Full mix always in **AUDI**.

## Primary actions

- Try the MP5-L demo
- Convert audio
- Open player
- View GitHub

## Honesty (required on all public surfaces)

- MP5-L v3 = recommended default, lossless, bit-exact
- MP5-C = lab-only, may hiss
- MP5-H = hybrid, large, not default
- PCM = reference/debug only
- **MP5 does not claim to beat MP3, AAC, Opus, or FLAC.**

## Tone

- General-purpose audio — not recovery-only
- Content guidance = optional metadata for players, families, libraries, accessibility, specialized apps
- Haven/Recovery tags = optional specialized profile, not headline
