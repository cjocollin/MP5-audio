# MP5 Moonshot Features (spec-only)

**Do not implement until Phases 1–9 complete and gate checklist passes.**

## Chunks

ADPT, BRCH, RESP, EXPR, COMM, RULS, HEAL, TIME, CLEAN, LIVE, LANG, MAST, DNA_, SAMP, AIRG

## Rules

- All optional; playback = HEAD + AUDI only
- Unknown chunks: skip safely
- TIME: local/private by default
- AIRG, LICN, RULS, SIGN: expressive metadata, not legal enforcement

## Gate checklist

- [ ] Container tests green
- [ ] Codec roundtrips green
- [ ] Converter + player MVP shipped
- [ ] Advanced chunk stubs documented
