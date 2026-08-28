# Gates: MP5 0.30.1 player experience

Scope: Ship native player integration, music-reactive VISU, true opt-in gapless albums, converter source/export auditioning, and library safety tools without adding format chunks or cloud behavior.

- [x] G1: All authoritative app/package versions and current public status documents report 0.30.1-beta.
  CHECK: powershell.exe -NoProfile -Command "$files = @('package.json','apps/web/package.json','apps/web/src/generated/appVersion.ts','src-tauri/tauri.conf.json','README.md','docs/CURRENT_MP5_STATUS.md','docs/MP5_FEATURE_MATRIX.md','docs/MP5_VISUAL_THEMES.md','CHANGELOG.md'); $bad = $files | Where-Object { (Get-Content -Raw $_) -notmatch '0\.30\.1-beta' }; if (-not $bad) { 'VERSION_0_30_1_PASS' }"
  EXPECT: VERSION_0_30_1_PASS
  EVIDENCE: PASS 2026-08-28 - VERSION_0_30_1_PASS; betaReadiness.test.ts also passed its version assertions.

- [x] G2: The installed web app opens .mp5 and .mp5p launches, the Tauri association advertises both extensions, and active playback exposes native media metadata plus play, pause, seek, previous, and next actions.
  CHECK: pnpm exec vitest run tests/nativePlayerIntegration.test.ts
  EXPECT: Tests 2 passed
  EVIDENCE: PASS 2026-08-28 - nativePlayerIntegration.test.ts 2/2.

- [x] G3: Now Playing has an accessible, reduced-motion-safe audio-reactive visualization driven by real analyser data and the active song's VISU colors.
  CHECK: pnpm exec vitest run tests/reactiveVisu.test.ts
  EXPECT: Tests 3 passed
  EVIDENCE: PASS 2026-08-28 - reactiveVisu.test.ts 3/3.

- [x] G4: Album creation exposes gaplessDefault and opt-in album playback preloads/schedules the next decoded track without changing ordinary queue transitions.
  CHECK: pnpm exec vitest run tests/gaplessAlbumPlayback.test.ts
  EXPECT: Tests 4 passed
  EVIDENCE: PASS 2026-08-28 - gaplessAlbumPlayback.test.ts 4/4; albumPackage.test.ts 9/9.

- [x] G5: A completed conversion can audition source and exported MP5 at the same clamped playhead with one active output and explicit accessible controls.
  CHECK: pnpm exec vitest run tests/converterAudition.test.ts
  EXPECT: Tests 4 passed
  EVIDENCE: PASS 2026-08-28 - converterAudition.test.ts 4/4.

- [x] G6: Library safety can verify every saved item, report corrupt or missing package data, and back up saved files to a chosen folder without upload or a new archive format.
  CHECK: pnpm exec vitest run tests/librarySafety.test.ts
  EXPECT: Tests 4 passed
  EVIDENCE: PASS 2026-08-28 - librarySafety.test.ts 4/4; localLibrary.test.ts 10/10.

- [x] G7: The web workspace type-checks after all five features are integrated.
  CHECK: pnpm --filter @mp5/web lint
  EXPECT: /exit code 0|Done/
  EVIDENCE: PASS 2026-08-28 - tsc -p apps/web/tsconfig.json --noEmit exited 0.

- [x] G8: The focused player, converter, album, library, version, and accessibility regression suites pass together.
  CHECK: pnpm exec vitest run tests/nativePlayerIntegration.test.ts tests/reactiveVisu.test.ts tests/gaplessAlbumPlayback.test.ts tests/converterAudition.test.ts tests/librarySafety.test.ts tests/audioPlaybackFocus.test.ts tests/albumPackage.test.ts tests/localLibrary.test.ts tests/betaReadiness.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: PASS 2026-08-28 - 9 test files, 69 tests passed.

- [x] G9: The production web build and PWA validation pass with the shipped manifest and service worker.
  CHECK: pnpm build; node scripts/pwa-check.mjs
  EXPECT: /built in|PWA check passed/
  EVIDENCE: PASS 2026-08-28 - Vite transformed 366 modules and built in 17.35s; PWA source and dist checks passed.

- [x] G10: Existing user work is preserved and the diff is limited to the five requested features, their tests, version/docs sync, and this ledger.
  CHECK: git diff --check; git status --short
  EXPECT: diff check exit 0; .claude/settings.local.json remains untracked and untouched.
  EVIDENCE: PASS 2026-08-28 - diff check exited 0 on codex/mp5-0.30.1-player-experience; unrelated .claude/settings.local.json preserved.

## Second polish batch: natural product flow before MP5-I

- [x] G11: Active release checks use the current root version instead of stale hard-coded 0.27/0.29 expectations.
  CHECK: pnpm exec vitest run tests/betaReadiness.test.ts tests/deploymentReadiness.test.ts tests/developerToolkitDocs.test.ts tests/playerExperiencePolish.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: PASS 2026-08-28 - release checks derive v0.30.1-beta from root package.json; five focused files passed 62/62 tests; vercel-config-check passed.

- [x] G12: The empty Player presents one compact start surface with Open MP5, Convert audio, and Try a demo actions without the previous competing welcome card.
  CHECK: pnpm exec vitest run tests/playerExperiencePolish.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: PASS 2026-08-28 - playerExperiencePolish.test.ts passed 6/6; empty waveform, controls, and inspector stay hidden until a track exists.

- [x] G13: The shell file action label, accepted file family, and destination match Player, Converter, and Library.
  CHECK: pnpm exec vitest run tests/playerExperiencePolish.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: PASS 2026-08-28 - source checks passed; Edge flow confirmed Open MP5, Add source audio, and Add to Library labels and destinations.

- [x] G14: Persistent playback and queue controls expose one queue action and consistent shuffle/repeat state, and queue rows no longer duplicate duration or technical clutter.
  CHECK: pnpm exec vitest run tests/playerExperiencePolish.test.ts tests/audioPlaybackFocus.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: PASS 2026-08-28 - persistent state assertions and audioPlaybackFocus passed; combined regression suite passed 101/101.

- [x] G15: Converter and Library completion surfaces lead with likely next actions while rare actions and library safety use native disclosure.
  CHECK: pnpm exec vitest run tests/playerExperiencePolish.test.ts tests/converterAudition.test.ts tests/localLibrary.test.ts tests/librarySafety.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: PASS 2026-08-28 - export/library disclosure assertions, converter audition, local library, and library safety tests passed.

- [x] G16: Theme and beta-notice dismissal persist; operation feedback is announced; folder-backup capability is explained before activation.
  CHECK: pnpm exec vitest run tests/playerExperiencePolish.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: PASS 2026-08-28 - focused assertions passed; Edge reload flow confirmed both persisted preferences.

- [x] G17: The focused regression suite for both five-feature batches passes together.
  CHECK: pnpm exec vitest run tests/nativePlayerIntegration.test.ts tests/reactiveVisu.test.ts tests/gaplessAlbumPlayback.test.ts tests/converterAudition.test.ts tests/librarySafety.test.ts tests/playerExperiencePolish.test.ts tests/audioPlaybackFocus.test.ts tests/albumPackage.test.ts tests/localLibrary.test.ts tests/betaReadiness.test.ts tests/deploymentReadiness.test.ts tests/developerToolkitDocs.test.ts
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: PASS 2026-08-28 - 13 test files, 101 tests passed.

- [x] G18: The web workspace type-checks and the production build succeeds after the polish batch.
  CHECK: pnpm --filter @mp5/web lint; pnpm build
  EXPECT: /built in|Done/
  EVIDENCE: PASS 2026-08-28 - tsc --noEmit exited 0; Vite transformed 363 modules and built in 16.29s; PWA check passed.

- [x] G19: Desktop and mobile core flows are visually verified against MP5's existing design system with no horizontal overflow or competing primary actions.
  EVIDENCE: PASS 2026-08-28 - Playwright with installed Edge verified desktop, Converter, Library, persistence, and 390px mobile (scrollWidth 390, clientWidth 390); before/after screenshots were inspected at original resolution.

- [x] G20: Existing work remains preserved and the final diff passes whitespace validation.
  CHECK: git diff --check
  EXPECT: /^(?!.*error).*$/
  EVIDENCE: PASS 2026-08-28 - git diff --check exited 0; unrelated .claude/settings.local.json remains untracked and untouched.
