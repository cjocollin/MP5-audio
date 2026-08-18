# MP5-C listening experiments

Human-listening scaffolding for CodecId 6 (MP5-C), per
[`docs/MP5C6_ABX_PROTOCOL.md`](../../docs/MP5C6_ABX_PROTOCOL.md).

Each subdirectory is one preregistered experiment:

- `protocol.json` — preregistration (experiment id, git commit, fixtures, arm
  designs, hypotheses, pass rules). Immutable once listening starts.
- `abx320/`, `mushra192/`, `mushra128/` — level-matched stimulus WAVs.
- `answers.template.json` — listener answer sheet.
- `results.json` — outcomes (added after the human run; commit it).

Current experiments:

| Directory | Status | Notes |
|-----------|--------|-------|
| `c6-listen-phase6-r1/` | **stimuli ready — awaiting listeners** | 19 fixtures (11 dev excerpts + 8 killers), C6 ABR profile-3 defaults at 320/192/128. First formal arm run; needs ≥3 listeners for any leave-lab claim. |

Regenerate or start a new experiment:

```bash
node tools/audio-lab/gen-listening-set.mjs --experiment-id <id> --fixtures both
```

Nothing here is a quality claim until `results.json` shows the protocol's
pass rules met with multiple listeners.
