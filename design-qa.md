# MP5 Studio Neutral redesign — design QA

## Evidence

- Source visual truth: `/workspace/scratch/4e5255cf5284/generated_images/exec-2af95881-e436-43d7-a4d9-c6b9f3cf4cc8.png`
- Desktop browser capture: `/workspace/scratch/mp5-design-qa-implementation-desktop-final.png`
- Mobile browser capture: `/workspace/scratch/mp5-design-qa-implementation-mobile-final-cropped.png`
- Desktop full-view comparison: `/workspace/scratch/mp5-design-qa-evidence/design-qa-comparison-desktop-final.png`
- Focused title and badge comparison: `/workspace/scratch/mp5-design-qa-evidence/design-qa-comparison-badges-final.png`
- Persistent transport regression comparison: `/workspace/scratch/4e5255cf5284/mp5-transport-comparison.png`
- Desktop viewport: `1363 × 936` at DPR 1. The source was uniformly normalized to the same viewport and aspect ratio before comparison.
- Mobile viewports: `390 × 844` for the full redesign pass and `320 × 844` for the final badge-row regression check, rendered in a same-origin browser frame so the real mobile media queries were active.
- State: dark theme, Public Beta notice visible, default MP5-L v3 demo loaded, Overview selected, one queue item, paused at the start.

The selected concept was used as the visual-system truth for chrome, controls, badges, typography, and elevation. The product's already-approved desktop grid and responsive information architecture were intentionally retained because the user explicitly said the structure was fine and asked to correct the color/style treatment.

## Findings

No actionable P0, P1, or P2 differences remain within the approved visual-system scope.

- Fonts and typography: self-hosted DM Sans remains consistent across the site. The 24 px player title, brighter secondary hierarchy, technical line, and 12 px single-line badge labels closely match the source without introducing wrapping at the supported desktop width.
- Spacing and layout rhythm: existing player/sidebar proportions, equal-height columns, transport placement, responsive breakpoints, and mobile stacking were preserved. Surface radii were reduced from the generic large-card treatment to a restrained 4–8 px system. The concept's full-width presentation is an intentional mockup framing difference rather than an implementation change requested in this iteration.
- Colors and visual tokens: navy chrome, purple-to-cyan branding gradients, bright CTA gradients, and colored glows were replaced with neutral charcoal surfaces (`#111214` to `#202123`), neutral hairline borders, muted plum controls, and one violet active-state scale. Violet codec badges and cyan Lossless/Bit-exact badges remain colored as explicitly requested.
- Image quality and asset fidelity: the existing real MP5 waveform artwork is retained at full resolution with its approved crop. VISU styling no longer casts colored gradients, shadows, or title glows into application chrome; file-provided color remains functional in artwork, badges where relevant, and waveform data. Phosphor remains the single icon family.
- Copy and content: all product copy, technical labels, queue content, risk language, and transport labels remain unchanged and match the approved state.
- Icons and controls: controls retain their semantic labels and working states. Primary play/open controls now use flat muted plum fills without bloom; hover/focus behavior remains visible.
- Responsiveness and accessibility: the mobile browser checks show no page-level horizontal overflow, clipped badge text, hidden primary action, or navigation collision. The codec, Lossless, and Bit-exact badges remain on one horizontal row at 320 px; the row provides contained horizontal overflow only when user text scaling requires it. Focus rings, semantic buttons, labels, alt text, reduced-motion handling, and practical mobile tap targets remain in place.

Residual P3: the source concept applies a subtle photographic texture across charcoal surfaces, while the implementation uses deliberately flat CSS surfaces to avoid reintroducing decorative noise into the working product.

## Interaction and runtime checks

- Desktop browser: default demo hydration, persistent play/pause, Player → Converter → Player navigation, queue rendering, and all primary content regions verified.
- Mobile browser at `390 × 844`: menu open/close, bottom Converter → Player navigation, persistent play/pause, queue, mini transport, and five-tab bottom navigation verified.
- Browser console: no application-origin errors. Repeated metadata errors originated only from the cloud browser extension and were excluded from app results.
- TypeScript and production Vite build passed.
- Full unit suite passed: `89` files passed, `1` skipped; `569` tests passed, `2` skipped.

## Comparison history

### Pass 1 — blocked

- P1 colors/tokens: the live app used cool navy surfaces, a violet-to-cyan wordmark, saturated CTA/play gradients, and colored glows that were absent from the approved Studio Neutral target.
- P1 elevation/surfaces: workspace, sidebar, experimental notice, and persistent transport stacked translucent gradients and large shadows, producing the reported "vibe-coded" appearance.
- P2 visual-theme containment: inline VISU shell, cover, and title styles could override the neutral chrome with accent borders, gradients, and glow.
- Fixes: introduced one charcoal token system, split the wordmark into solid lavender/gray text, flattened all main surfaces and controls, removed UI glows and backdrop blur, tokenized waveform/volume accents, and constrained VISU color to content rather than chrome.
- Post-fix evidence: `/workspace/scratch/mp5-design-qa-evidence/design-qa-comparison-desktop.png`.

### Pass 2 — blocked

- P2 badge fidelity: violet/cyan semantics were correct, but the title and technical badges were visibly smaller than the approved reference in the focused comparison.
- Fixes: increased the title to 24 px and badges to 11 px with balanced horizontal/vertical padding while preserving `white-space: nowrap`.
- Post-fix evidence: `/workspace/scratch/mp5-design-qa-evidence/design-qa-comparison-badges-v2.png`.

### Pass 3 — blocked

- P1 state consistency: active shuffle/repeat controls still used the legacy bright-violet utilities instead of the Studio Neutral tokens.
- P1 hierarchy: technical labels and 11 px badge text were slightly too faint at screenshot scale.
- P2 contrast/polish: arbitrary dark VISU accents could reduce optional theme-badge contrast, primary controls were slightly darker than the sampled target, and the browser cursor obscured the Player label in evidence.
- Fixes: tokenized active transport styling, lifted secondary labels to `#85868a`, increased badges to 12 px with stronger same-hue borders, made optional VISU badge text contrast-safe, lightened the flat plum control token, and moved the cursor out of the interface before capture.
- Post-fix evidence: `/workspace/scratch/mp5-design-qa-evidence/design-qa-comparison-desktop-final.png` and `/workspace/scratch/mp5-design-qa-evidence/design-qa-comparison-badges-final.png`.

### Final pass — passed

- The flat charcoal hierarchy, muted plum controls, two-tone wordmark, low-radius surfaces, neutral borders, and violet/cyan badge semantics now match the approved visual direction.
- Desktop and mobile browser states are functional, readable, and free of application errors.
- Final evidence: `/workspace/scratch/mp5-design-qa-evidence/design-qa-comparison-desktop-final.png` and `/workspace/scratch/mp5-design-qa-implementation-mobile-final-cropped.png`.

### Mobile badge regression pass — passed

- P1 responsive layout: the title badges could wrap into a vertical stack in a narrow or text-scaled mobile viewport.
- Fix: the badge group now uses a single non-wrapping flex row; each badge keeps its existing violet/cyan color and single-line label, with contained horizontal scrolling reserved for extreme text scaling.
- Verification: at `320 × 844`, all three visible badges share the same top coordinate, use `white-space: nowrap`, and fit without scrolling (`268 px` client width and `268 px` scroll width).

### Persistent transport regression pass — passed

- P1 component targeting: the earlier badge correction covered the main Now Playing card, while the reported screenshot was the separate fixed persistent transport.
- P1 responsive layout: the persistent transport exposed its secondary badges from 640 px upward and explicitly allowed wrapping. At tablet widths or enlarged Android text, the badge rows forced the fixed dock to expand vertically over the page.
- Correction after review: an over-broad compact-layout response hid the artist, badges, timeline, volume, and secondary controls. That redesign was reverted so the persistent transport retains its original content and five-column layout.
- Final fix: only the persistent badge group changed. It now uses `nowrap` with contained horizontal overflow, and the same badges use compact spacing from 640–1159 px so all three fit the existing metadata column without changing the surrounding transport.
- Verification: at 1024 px the restored transport measured its original 106 px height, retained the artist, controls, timeline, volume, and queue actions, and rendered MP5-L v3, Lossless, and Bit-exact on the same top coordinate with equal client/scroll widths (`174 px`). Side-by-side evidence is recorded in `/workspace/scratch/4e5255cf5284/mp5-transport-comparison.png`.

### Mobile navigation height regression pass — superseded

- P1 Android layout: the user-supplied Player and Converter captures were both `688 × 1536`, but the visible bottom navigation measured approximately `125 px` high on Player and `95 px` on Converter. The top padding and tab alignment matched; Converter was losing roughly `30 px` of bottom safe-area space.
- Root cause: the shared navigation used an automatic height with a fixed `76 px` minimum while safe-area padding was calculated separately. The Player-only persistent transport also assumed the navigation was exactly `76 px`, so the fixed layers did not share one complete border-box height contract during Android visual-viewport changes.
- First correction: introduced a shared navigation height derived from the browser safe-area inset. This did not fix the user-observed Android behavior because that inset can change when the Converter mount alters the browser's visual-viewport/compositor state.

### Mobile bottom-stack corrective pass — verification in progress

- Corrected cause: two state changes were visible at once. The Player-only persistent transport disappeared when `Mp5Player` unmounted, and the fixed navigation was painted inside a sticky, stacked header while its height still depended on a changing browser inset.
- Fix: keep the player controller and persistent transport mounted across tabs while hiding only the inactive Player workspace; use one constant `104 px` navigation border-box with a fixed `65 px` interactive row and a reserved safe-area region; remove sticky/stacking behavior from the mobile header; and temporarily override the global smooth-scroll rule during tab changes so the visual viewport resets immediately.
- Safe area: `env(safe-area-inset-bottom)` remains supported, but it only changes how the already-reserved lower region is allocated. It can no longer change the navigation's outer height or move its interactive row.
- Regression coverage: the mobile smoke test now uses touch/mobile emulation, repeats Player ↔ Converter three times after two animation frames of settling, requires the transport to remain directly above the navigation, and requires the navigation's height and vertical position to remain unchanged.

## Implementation checklist

- [x] Remove neon/glass chrome without changing product behavior.
- [x] Preserve violet MP5-L v3 and cyan Lossless/Bit-exact badge semantics.
- [x] Remove VISU-driven shell, cover-frame, and title glow overrides.
- [x] Preserve desktop equal-height layout and mobile responsive structure.
- [x] Verify desktop and mobile primary interactions in the browser.
- [x] Keep codec, Lossless, and Bit-exact badges in one horizontal row on narrow mobile screens.
- [x] Prevent persistent badge stacking without changing the transport's content or surrounding layout.
- [x] Keep the Android bottom navigation height and safe-area reserve identical across tabs.
- [x] Pass TypeScript, production build, focused theme tests, and full unit suite.

final result: pending confirmation in the reported Android Custom Tab
