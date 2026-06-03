## Summary

<!-- What changed and why? Keep scope focused. -->

## Type of change

- [ ] Bug fix
- [ ] Feature / enhancement
- [ ] Parser / container / validation
- [ ] Codec (MP5-L / MP5-C / MP5-H)
- [ ] Web app (converter / player / UI)
- [ ] Docs / specs / tooling
- [ ] Tests / CI / fixtures only

## Checklist

- [ ] Tests pass (`pnpm test`, and `cargo test -p mp5-codec` if Rust changed)
- [ ] Build passes (`pnpm lint`, `pnpm build` or relevant package build)
- [ ] Docs updated if user-facing behavior, CLI, or codec policy changed
- [ ] No copyrighted media committed (only synthetic / licensed fixtures)
- [ ] No false performance or maturity claims added (README, UI, comments)
- [ ] Parser / container changes include validation or fixture coverage where practical
- [ ] Codec changes include before/after notes or benchmark notes if relevant
- [ ] UI changes include screenshots in the PR description if visual

## MP5 mode impact (if applicable)

<!-- Which codecs or modes does this touch? -->

- [ ] MP5-L v3 (recommended path)
- [ ] PCM reference only
- [ ] MP5-C (experimental — note hiss/artifact risk)
- [ ] MP5-H (experimental — note size/CORR behavior)
- [ ] Not codec-related

## Test plan

<!-- Commands run, fixtures used, manual demo steps -->

```bash
# Example:
pnpm lint
pnpm test
cargo test -p mp5-codec
pnpm demo
```

## Screenshots / logs (if UI or playback)

<!-- Attach or paste -->

## Related issues

<!-- Fixes #123, relates to #456 -->
