# Deferred Work

Findings surfaced incidentally by review, not caused by the story that found them.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: ~~`next.config.ts` does not declare `serverExternalPackages` for `better-sqlite3` and `playwright`.~~ **Closed 2026-08-30 (spec-1-5).**
  evidence: No config change is needed. Both packages are already in Next 16.3.0's default external list — `node_modules/next/dist/lib/server-external-packages.jsonc:33` and `:76-77` — so neither is bundled. Verified while wiring `adapters/db/bootstrap.ts`, which loads `better-sqlite3` through drizzle at server start.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: Nothing creates the `out/` directory that the architecture and README both document. **Half closed 2026-09-02 (spec-1-5): `data/` is created at startup; `out/` is still nobody's job until Story 1.9.**
  evidence: `data/` is now created at every server start by `adapters/db/bootstrap.ts`, together with the canon seed, `boards.json` and the SQLite file. `out/` is still uncreated: it is gitignored, absent on disk, and the first PDF write would fail at runtime. Owned by Story 1.9, which is the first thing to render one.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: Layering is enforced outward-from-core only; no rule constrains `adapters/`, `components/`, or `app/` importing each other.
  evidence: The `boundaries/elements` settings declare all four element types but the only rule is `from: ["core"]`. The architecture names `app/api/` the composition root, which nothing enforces. AD-1 covers only the core half, so this is outside Story 1.1's scope but is a real gap in the stated architecture.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: No `.env.example` or documented environment contract.
  evidence: `.env*` is gitignored, and the model adapter, board adapters, and DB path will all need configuration. A fresh clone has no way to discover which variables exist. Owned by the first story that introduces an env var.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: `_bmad/` and `_bmad-output/` are untracked and un-ignored — no decision has been encoded about committing them.
  evidence: `git status` lists both as untracked, so `git add .` would commit roughly 800 KB of planning material. ESLint ignores them and tsconfig excludes them, but nothing stops the commit. Needs an explicit keep-or-ignore decision.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: No test runner and no `pnpm test` script.
  evidence: `scripts/verify-boundaries.mjs` is the repo's only executable assertion and it covers lint configuration only. Story 1.1 forbids business logic so there is nothing to unit-test yet, but the first story with real logic will need a runner chosen and wired.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: ~~`engines.node`~~ and `packageManager` are advisory; nothing enforces them at install time. **Half closed 2026-08-28.**
  evidence: Installing on Node 20, or with npm/yarn instead of pnpm, succeeds and fails later cryptically when `better-sqlite3` cannot load. An `.npmrc` with `engine-strict=true` would make the declared floor real, but adding install-time configuration was beyond Story 1.1's stated scope. **The `engines.node` half was closed on 2026-08-28** by Story 1.3's review round 2, which added `.npmrc` with `engine-strict=true` when the floor moved to `>=22.18` for Node's type stripping. The `packageManager` half stands: `engine-strict` does not police which package manager runs, so installing with npm or yarn still succeeds and fails later. Corepack is what enforces that, and nothing requires it.

## Deferred from: code review of spec-1-1-run-the-app-on-the-pinned-stack (2026-08-26)

- summary: `resolvesOnDisk()` scans fixture source with a regex rather than the AST.
  evidence: A relative specifier appearing inside a comment or a string literal is treated as a real import, so a clean fixture can fail the "does not resolve on disk" assertion and block the build spuriously. `scripts/verify-boundaries.mjs:170`.

- summary: Signal exit codes are inconsistent and SIGQUIT is unhandled.
  evidence: The handler exits 143 for every trapped signal, but SIGHUP should be 129 and SIGQUIT 131; SIGQUIT is not in the trapped set and cleans up only via the `exit` hook. No consumer reads these codes today (there is no CI), so the impact is latent. `scripts/verify-boundaries.mjs:146`.

- summary: `FIXTURE_EXTENSIONS` declares eight extensions; the fixture set exercises two.
  evidence: 21 `.ts` files and one `.mts`. No `.cts`, `.cjs`, `.js`, `.jsx` or `.tsx` fixture exists, so the collection machinery built to keep the walk and the lint glob in sync is itself unproven for six of its eight cases. `scripts/verify-boundaries.mjs:62`.

- summary: `next-env.d.ts` creates a build-ordering hazard.
  evidence: It now carries hard imports of `./.next/dev/types/routes.d.ts` and `root-params.d.ts`, and `build` runs `tsc --noEmit` before `next build`. Deleting `.next/` while leaving the gitignored `next-env.d.ts` in place fails typecheck before the step that would regenerate the missing files can run. A clean clone has neither file and is unaffected.

- summary: README documents `out/` for rendered PDFs, colliding with Next's static-export directory.
  evidence: `eslint.config.mjs` lists `out/**` among "Default ignores of eslint-config-next" for exactly that reason. Setting `output: "export"` would have `next build` write into the rendered-PDF folder. The spec forbids a deployment target, so this cannot bite yet.

- summary: The local `tailor` ESLint plugin object carries no `meta: { name, version }`.
  evidence: ESLint 9 uses plugin meta for `--print-config` and config inspection; without it the plugin shows up unidentified. The rule also uses a raw `message` string instead of `meta.messages` + `messageId`. `eslint.config.mjs:144`.

- summary: README's layout tree omits `scripts/` and `tools/`.
  evidence: The prose immediately below the tree discusses `tools/boundary-fixtures/`, so the tree is incomplete against its own surrounding text.

- summary: ESLint v9 is on the `maintenance` dist-tag; the v10 migration is unscheduled.
  evidence: `9.39.5` is the newest 9.x and npm marks it "no longer supported"; `latest` is 10.9.1. `eslint-config-next@16.3.0` peers `eslint >=9.0.0` so v10 may well work, but it is a real upgrade with its own flat-config and rule churn — out of scope for a code review of Story 1.1. Raised when pinning the lint toolchain on 2026-08-26.

## Deferred from: review of spec-1-2-port-the-modernist-design-system (2026-08-26)

Faithfully ported defects present in the design source, plus gaps the port exposed. None are caused by Story 1.2, which was required to port verbatim.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: Mechanize the "no hex color literal in a component file" rule as a `tailor/no-hex-color-literal` ESLint rule that blocks the build, with fixtures and a `verify:tokens` script proving it fires.
  evidence: Story 1.2 AC #2 asserts no component file contains a hex literal. Today that is vacuously true — no component carries color yet — so the port satisfies it by inspection. Making it a standing invariant needs its own config block in `eslint.config.mjs` (the `tailor` plugin is registered only for `CORE_FILES` at L300), a `tools/token-fixtures/` set, a `scripts/verify-tokens.mjs`, and a lockstep edit to `EXPECTED_BUILD_CHAIN` at `scripts/verify-boundaries.mjs:493-503` plus the README script table. That is a second independently shippable deliverable, split out on 2026-08-26 to keep the port spec inside the scope standard. **Deadline passed (noted 2026-08-27):** Story 1.3 shipped in `a8e0f6a` and this never landed, so it is now the retrofit it warned against. AC #2 itself still holds — `components/top-bar/top-bar.module.css` resolves every colour through `var()` — so the invariant is intact but unenforced, and the next component to carry colour is the one that can break it silently.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The app-specific style layer the prototype implies — button size ramp, dense table padding, uppercase kickers, the sticky 39px bar, the 14px app base size, and the `tk-in`/`tk-blink` keyframes with their `prefers-reduced-motion` guard.
  evidence: `Tailor.dc.html` contributes only four CSS rules and roughly 500 inline `style` attributes; it uses 5 of the ~30 design system classes and overrides properties on all five. None of it is design system and none of it appears in Story 1.2's acceptance criteria, so the port does not cover it. Story 1.3 (global chrome) is the first story that needs it. Recorded so it is not rediscovered mid-implementation.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: A focused-and-checked `.seg-opt` shows no visible focus indicator. **Reopened 2026-08-28** — the correction that closed it is itself clipped.
  evidence: `.seg-opt:has(input:focus-visible)` drew `2px solid var(--color-accent)` at `outline-offset: -2px` — inside the element — while `.seg-opt:has(input:checked)` had already filled it with `var(--color-accent)`. Accent on accent is invisible, so the selected segment was the one state with no keyboard focus cue. Verbatim from the source stylesheet. The 08-27 code review moved the offset to `+2px`, which satisfies AC #5 and puts the ring outside the fill — but `.seg` sets `overflow: hidden` (`app/globals.css:202`), and an ancestor's overflow clips a descendant's outline. A ring painted 2px outside the `.seg-opt` border box therefore lands outside `.seg`'s padding box on the group's outer edges and is cut. So the defect traded "invisible because accent-on-accent" for "invisible because clipped" rather than closing. **Reopened 2026-08-28 by review round 2 of Story 1.3, not fixed:** `.seg-opt` has no consumer in the repo — grep matches only `app/globals.css` — so the clipped ring breaks nothing today. Fix it when the first segmented control ships, either with `.seg { overflow: visible }` (a further delta to a port whose count is already reconciled at eight) or by returning to `-2px` with a `var(--color-bg)` ring on the checked state.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The 45% disabled treatment covers `.btn` and `.input` but not `.radio` or `.seg-opt`.
  evidence: A disabled radio or segmented option renders identically to an enabled one, so the control looks live and does nothing. `.radio:has(input:disabled)` and `.seg-opt:has(input:disabled)` would close it. Story 1.2 deliberately stopped at `.input`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `.btn:disabled` never matches an anchor, yet `.btn` is written for anchors.
  evidence: `.btn` sets `text-decoration: none` and styles `.btn svg`, implying `<a class="btn">` usage, but `:disabled` matches only form elements. A disabled link-button renders fully active and stays clickable. Needs a `.btn[aria-disabled='true']` companion with `pointer-events: none`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `.dialog-backdrop` declares no `z-index` and `.dialog` no `max-height`/`overflow`.
  evidence: The backdrop is `position: fixed` with no stacking order, so any later stacking context paints over it. A dialog taller than the viewport clips at both ends with its actions unreachable and no scroll. This will bite the fabrication-rejection modal in Epic 3 (760px card, substantial body) and the blocked-metric dialog in Epic 4.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `--color-divider` sits near 2.4:1 against the ground, and several muted `color-mix` steps fall below 4.5:1. (Inventory extended 2026-08-27 — see the `.btn-primary` entry in the 08-27 section for `.table th`, the opacity-based muting, and the primary button's own label.)
  evidence: The divider is the only border on `.input`, `.seg`, and `.btn-secondary` — the elements whose boundary carries meaning — and 3:1 is the non-text minimum. `.card-meta` at 50% and `.text-muted`/`figcaption` at 55% are 10–12px text below the normal-text threshold. Design-source values; changing them is a design decision, not a port.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `--color-divider` and the three `--shadow-*` tokens hardcode hexes that duplicate other tokens.
  evidence: `--color-divider` embeds `#201e1d`, the value of `--color-text`; the shadows embed `#2d2b2b`, the value of `--color-neutral-900`. Retuning the ink or the neutral ramp silently leaves dividers and shadows on the old value. `color-mix(in srgb, var(--color-text) 40%, transparent)` keeps the derivation live at no cost.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The design's `←` and `✓` glyphs fall outside every Archivo subset and render in the fallback face.
  evidence: The epic mandates text characters rather than icons (`−`, `+`, `✓`, `›`, `·`, `!`, `←`). U+2190 and U+2713 are in neither the `latin` nor the `latin-ext` Google Fonts subset, so they resolve to `system-ui` mid-line. `−` (U+2212), `·`, and `›` (U+203A) are covered. First visible in Story 1.3's `← Queue` control and the tailoring step list's `✓`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `<strong>`, `<b>`, and `.table th` request weight 700, which is not loaded.
  evidence: Only 400/600/800 ship, so CSS font matching resolves a 700 request upward to 800. The rendered weight stays inside the sanctioned set, so this is not a defect today, but any component relying on default bold gets 800 rather than the 600 the type scale uses for emphasis. Worth an explicit `strong, b { font-weight: 600 }` when the app layer lands. **Corrected 2026-08-27:** `<th>` is not "unstyled" — `.table th` is a design-system class that simply never resets `font-weight`, so it inherits the UA's `bold` and resolves to 800. A `strong, b` rule alone therefore misses the one case that lives inside the system; the fix needs `.table th` too.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The deferred `verify:tokens` script must scan `.css`, not just `.ts`/`.tsx`.
  evidence: A hex literal in this design system is most likely written in a stylesheet, which is exactly what an extension-filtered grep cannot open. The check needs to read `.css` under `app/` and `components/` while allowing the sanctioned sites — inside `:root` — rather than excluding the file type wholesale. Refines the already-deferred hex-rule entry.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `.field` has no bare-class definition and the form layer has no error or invalid state.
  evidence: Only `.field > label` is styled, so stacked fields carry no spacing, no `display`, and no relationship to help or error text; there is no `aria-invalid` treatment, hint line, or error color anywhere. Epic 4's answers pane and Epic 1's blocked-metric flows both need one.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: Hover and active states still repaint on disabled `.btn` and `.input`.
  evidence: `.btn:disabled` sets opacity and cursor but `.btn-primary:hover`/`:active` and `.input:hover` are unguarded, so a disabled control still lightens or highlights its border under the pointer and reads as interactive at 45% opacity. Needs `:disabled` exclusions on the hover/active selectors. Verbatim from the source.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The checked radio's punch-out is hardcoded to `--color-bg` and breaks on surface-colored grounds.
  evidence: `.radio input:checked + .dot` uses `box-shadow: inset 0 0 0 4px var(--color-bg)` to cut the donut hole. Inside `.card` or `.dialog` — both `--color-surface` — the hole paints the app ground instead, leaving a visibly mismatched ring. Epic 4's answers pane puts radios on exactly those surfaces.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `.radio` and `.seg-opt` absolutely position their hidden inputs with no positioned ancestor.
  evidence: `.radio input, .seg-opt input { position: absolute; opacity: 0; width: 0; height: 0 }` while neither wrapper declares `position: relative`, so the inputs resolve against the initial containing block at the page origin. They are invisible, but keyboard focus and scroll-into-view target the page's top-left and can jump the viewport on tab. Needs `position: relative` on the wrappers or a clip-based visually-hidden pattern.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `--color-surface` sits about 1.06:1 against `--color-bg` and `.card` ships no border.
  evidence: `#eae9e9` on `#f3f2f2` with zero radius, no border, and opt-in `.elev-*` means cards read as flat rectangles that barely separate from the page. Whether `.card` gets a default hairline or 2px rule is a design decision worth settling before Story 1.3 builds screens on it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `next/font/google` moves the Google dependency from runtime to build time; `pnpm build` needs network on a cold cache.
  evidence: The port removes the runtime `@import`, but `next/font/google` fetches the Archivo binaries when `.next/cache` is empty, so "given a clean tree, `pnpm build` exits 0" is not reproducible offline. Practically this matches the existing `pnpm install` network requirement, but Story 1.5 (start the app on a clean machine and have it set itself up) owns the clean-machine contract and should either state the dependency or vendor the faces via `next/font/local`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The deferred `verify:tokens` script should also assert the `--font-archivo` coupling and anchor its hex match to color contexts.
  evidence: The `variable:` literal in `layout.tsx` and `var(--font-archivo)` in `globals.css` are a bare-string coupling that `tsc`, ESLint, and `next build` all ignore — break either end and every glyph silently renders in the fallback face with all gates green. The same script should assert the two ends match. Separately, a bare `#[0-9a-fA-F]{3,8}` also matches URL fragments and element ids while missing `rgb()`, `hsl()`, and named colors, so the check needs anchoring to color contexts rather than raw hex shape.

## Deferred from: code review of spec-1-2-port-the-modernist-design-system (2026-08-27)

Source-level gaps the port carried faithfully, plus invariants the port asserts but nothing enforces. None are caused by Story 1.2. The six-delta claim was verified against the in-repo source and holds.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `.dialog-backdrop` has no `z-index` and the app has no `--z-*` scale — extends the existing backdrop entry with a concrete conflict.
  evidence: `components/top-bar/top-bar.module.css:17` already claims `z-index: 40`. A `position: fixed` backdrop with no stacking order paints *under* the sticky global chrome, so the first modal in Epic 3 or 4 opens behind the bar. The design system defines no z-index scale at all, so every consumer will invent one.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: Forced-colors / Windows High Contrast strips every background-only state in the component layer.
  evidence: `.seg-opt:has(input:checked)` and `.radio input:checked + .dot` both signal selection with `background` alone. Under `forced-colors: active` the UA overrides backgrounds, so checked and unchecked render identically. Needs a `@media (forced-colors: active)` block using `Highlight`/`HighlightText` with `forced-color-adjust: none`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `::selection` is unreadable over the two accent-filled surfaces.
  evidence: `app/globals.css:115` tints selection with `color-mix(in srgb, var(--color-accent) 30%, transparent)` and never sets a selection `color`. Over `.btn-primary` and checked `.seg-opt` — both near-white text on accent — selected text sits on an accent-tinted highlight at roughly the same value. Setting an explicit selection `color` closes it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The form layer covers only text inputs — no placeholder, no `select`, no checkbox, no toggle — and `.tag` has no default.
  evidence: `.input` sets `width: 100%; min-height: 36px`, which stretches a checkbox or radio to full width and 36px tall, and leaves `select` with native chrome. `.input::placeholder` is unstyled, so placeholders fall to UA gray outside the palette. `.tag` with no variant class renders as inherited text with padding and no chip boundary. A filter bar or answers pane needs all of these.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `.table tbody th` row headers render as column headers, and bare `.btn` has no interactive feedback.
  evidence: `.table th` is scoped to all `th`, so a `<th scope="row">` shrinks to 11px uppercase muted. Separately, hover and active states are defined only on `.btn-primary`, `.btn-secondary`, and `.btn-ghost` — a bare `.btn` or `.btn-icon` is transparent with no pointer feedback at all.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: Programmatic focus on `tabindex="-1"` shows no ring.
  evidence: `:focus { outline: none }` at `app/globals.css:113` clears the default and `:focus-visible` restores it only for heuristic keyboard focus. Calling `element.focus()` on a `tabindex="-1"` target — the standard route-change and dialog-open pattern — matches `:focus` but not `:focus-visible`, so the keyboard user loses their position silently.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The palette has one accent, no semantic status colors, and no form error state; `--color-accent-2-*` collapses onto the accent ramp.
  evidence: There is no success/warning/error/info token, no `aria-invalid` treatment, and no hint or error line anywhere. `--color-accent-2-100` is byte-identical to `--color-accent-100` and the design readme states the mono palette outright ("accent-2 reads the same as accent") — but nothing in this repo records it, so a consumer reaching for `.tag-accent-2` expecting a second semantic color gets the same red. Epics 3 and 4 need pipeline states, blocked metrics, and fabrication rejections to be colour-distinguishable.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The readme's "prefer ramp steps over ad-hoc `color-mix()`" rule ships unimplemented and unrecorded.
  evidence: 18 rules use raw `color-mix()` (`.btn-secondary` hover/active, `.btn-ghost` hover/active, `.input:hover`, `.field > label`, `.text-muted`, `figcaption`, `.card-meta`, `.table th`, `.table tbody tr:hover`, `.dialog-backdrop`, `::selection`, `--color-divider`, three `--shadow-*`). Porting verbatim is defensible because the readme says "prefer" rather than "never" — but the spec's Always-clause ("where the source contradicts its readme, the readme governs") is stated absolutely and the five-correction list is closed, so the tension belongs somewhere explicit.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The diffability invariant is asserted in the file header but nothing enforces it, though it is scriptable.
  evidence: `app/globals.css:1` declares "this file must stay diffable against that source" and the spec admits "nothing else enforces it". The source sits in-repo at a fixed path, so `diff <(tail -n +3 "$SRC") <(tail -n +3 app/globals.css)` is a mechanizable `verify:design-parity` link of the same shape as the already-deferred `verify:tokens`. Story 1.2's Boundaries forbid touching `scripts/` or the build chain, so it could not land here. Note also that every fix listed above edits `app/globals.css` and therefore trades away diffability — each needs a decision on whether it goes upstream into `styles.css`, into a fork, or into an app-layer override sheet.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `.btn-primary`'s own label misses AA at 3.76:1 — the app's most-used action, and the one contrast defect the earlier entry omitted.
  evidence: `background: var(--color-accent)` with `color: var(--color-bg)` is `#f3f2f2` on `#ec3013` = 3.76:1 at 14px; 800 weight at 14px is not WCAG large text, so the threshold is 4.5:1, not 3:1. Checked `.seg-opt` uses the same pair at 13px. Pure white reaches only 4.2:1, so no fix stays inside the palette — clearing AA requires retuning `--color-accent` itself. Deferred on 2026-08-27 as a design-value decision rather than a port correction, matching how the divider and muted-step contrast defects were handled. Note the earlier contrast entry's inventory is also incomplete: it omits `.table th` (60% mix at 11px ≈ 4.2:1) and the opacity-based muting on `.card-body` (0.8) and `.dialog-body` (0.85).

## Deferred from: code review of spec-1-3-see-the-app-s-global-chrome (2026-08-27)

Round-2 review, four layers. Items that are either deliberate, already tracked elsewhere, or inherited from an earlier story. Everything actionable stayed in the story file as a patch or a decision.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-see-the-app-s-global-chrome.md`
  summary: `.bar { overflow: hidden }` silently truncates the counts and boards label, and the 380px e2e test enshrines a narrow viewport as covered while asserting only the height.
  evidence: `components/top-bar/top-bar.module.css:34` clips deliberately — the module comment argues that a 39px contract means nothing inside may grow the bar, and that wrapped text on a sticky element would drag every screen down. The epic scopes the app to a wide desktop viewport with no responsive layouts, so there is no consumer today. What is worth revisiting when Epic 2 lands multi-digit counts: `e2e/top-bar.spec.ts:101-105` sets a 380px viewport and asserts only `box.height === 39`, so it reads as narrow-viewport coverage while the content it would clip goes unmeasured. A `toBeInViewport()` on the boards label would close that without changing the clip.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-see-the-app-s-global-chrome.md`
  summary: `z-index: 40` ships as an unexplained literal in a file that justifies every other literal it carries.
  evidence: `components/top-bar/top-bar.module.css:17`. The value is faithful to the design source (`Tailor.dc.html:23`), and the module header explains why 39px/20px/14px/18px ship as literals rather than being rounded onto the `--space-*` scale — but says nothing about stacking order. The concrete conflict it creates is already tracked in the 2026-08-27 Story 1.2 entry above (`.dialog-backdrop` with no `z-index` paints under the chrome). Recorded here only so the two are read together; the fix is a `--z-*` scale, which belongs to whichever story first needs a modal.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-see-the-app-s-global-chrome.md`
  summary: `playwright` is a runtime dependency of a private app, now duplicated by `@playwright/test` in devDependencies.
  evidence: `package.json:26` pins `playwright@1.62.1` under `dependencies`; this story adds `@playwright/test@1.62.1` under `devDependencies` (`:33`). The README's core-ban list names `playwright` explicitly as something the architecture excludes. Pre-existing — added in `56ee9ca` (Story 1.1) — and not simply removable: `tools/boundary-fixtures/core/canon/forbidden-package-playwright.ts:2` imports `chromium` from it as the fixture proving AD-1 fires on that package. The fix is to move it to `devDependencies` alongside its sibling, which is a manifest change Story 1.3's Code Map does not sanction.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-see-the-app-s-global-chrome.md`
  summary: This file's own fix-list is becoming a chain of cross-references rather than a set of standalone items.
  evidence: Two separate `.dialog-backdrop` z-index entries now exist (the 2026-08-26 one and the 2026-08-27 one that "extends" it) rather than one amended entry, and the 2026-08-27 `.btn-primary` contrast entry closes by listing what an *earlier* contrast entry omits (`.table th`, `.card-body`, `.dialog-body`) instead of amending it. A reader triaging this register has to reconstruct each defect from two or three places. Housekeeping, not a code defect — worth a pass before Epic 2 adds its own entries.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-see-the-app-s-global-chrome.md`
  summary: Story 1.2's correction 6 is a no-op — it re-declares the value it already inherits — so one of the eight counted deltas changes nothing.
  evidence: The base rule at `app/globals.css:125` is already `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`. Correction 6 writes `.input:focus-visible { border-color: var(--color-accent); outline-offset: 2px }` (`:179`), whose offset is identical to what the base rule supplies. Deleting the source's `outline-offset: 0` override would produce the same rendered result, be a smaller diff against `styles.css`, and be self-documenting; as written a reader cannot tell the declaration is redundant. Harmless as shipped, and a Story 1.2 port-discipline call rather than a Story 1.3 defect.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-see-the-app-s-global-chrome.md`
  summary: AC #5's throw is proven at the label functions, not at the render path — the whole gate stays green with the validation removed from the component.
  evidence: `components/top-bar/labels.ts` parses and throws, and eleven unit tests cover it. Nothing proves `top-bar.tsx` calls it. Mutation-tested during review round 2: replacing `countLabels`/`boardsLabel` in the component with direct interpolation left `pnpm build` at exit 0 and the full Playwright suite passing. Deferred 2026-08-28: `app/layout.tsx` supplies `ZERO_PIPELINE_COUNTS` unconditionally, so no call site can exercise the throw until Epic 2 swaps the supply — revisit as part of that swap. Closing it needs either a fixture route rendering `TopBar` with invalid counts (Story 1.3's Never list scopes routes out) or a CSS-Module stub loader for the Node suite; neither is justified while the only input is a frozen zero constant.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-see-the-app-s-global-chrome.md`
  summary: The top bar's boards label ships below WCAG AA at about 3.9:1 — the one contrast defect this story introduces rather than inherits.
  evidence: `.boards` is 10px `var(--color-neutral-600)` (`#7d7979`) on `var(--color-bg)` (`#f3f2f2`) in `components/top-bar/top-bar.module.css:69-72`, roughly 3.9:1 against the 4.5:1 minimum for normal text. Both the size and the token come from the design source, which Story 1.3 gives authority over visuals, so the fix belongs upstream rather than in a local override — `--color-neutral-700` would clear it at about 5.8:1. The story's Design Notes called this "escalated not patched", but the escalation never reached this register; it lived only in a spec paragraph and a CSS comment. Filed here on 2026-08-28 by review round 2 so it sits with the other contrast defects (`--color-divider`, the muted `color-mix` steps, `.btn-primary`) rather than alone. The 11px counts at `--color-neutral-700` already pass.

## Deferred from: build review of spec-1-4-get-one-legible-error-shape-from-every-endpoint (2026-08-28)

Three review layers over the story-1.4 diff. Everything mechanically fixable was patched into the change; these are the findings that are real but belong to another story or another decision.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-get-one-legible-error-shape-from-every-endpoint.md`
  summary: The two new HTTP rules are scoped to `core/` only, so an adapter may still build a `Response` or set a status.
  evidence: Both rules are wired under `CORE_FILES` in the `tailor/core-boundary` block. The story's own doc strings say "errors flow one direction — only `app/api/` formats HTTP", and the epic makes adapters the throwers of typed errors, but `adapters/` is where sqlite, fetch and chromium failures actually originate and nothing there is constrained. This is the concrete, now-demonstrable case of the Story 1.1 deferral above ("Layering is enforced outward-from-core only; no rule constrains `adapters/`, `components/`, or `app/`"). Out of scope here because both the epic's AD-13 and Story 1.4's acceptance criterion are worded against `core/` specifically; widening to `adapters/` is a layering decision, not a fix to this story.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-get-one-legible-error-shape-from-every-endpoint.md`
  summary: The error envelope carries no correlation id and the translator writes no log line, so a reported failure cannot be tied to anything server-side.
  evidence: `toErrorResponse` copies `error.message` verbatim into the JSON and logs nothing on either branch, so an `internal` error can put a file path, SQL fragment or model output in the response body, and a user-reported failure has no identifier to trace. Severity is bounded today — the app is explicitly one process on localhost with no public interface — which is why this is recorded rather than fixed. The framework-sanctioned reporting hook is `instrumentation.ts`'s `onRequestError` (stable since Next 15, `context.routeType === "route"`), which pairs cleanly with a translator that only shapes the response. Revisit when the first real endpoint lands in Story 1.6.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-get-one-legible-error-shape-from-every-endpoint.md`
  summary: `errorEnvelopeSchema` is not `.strict()`, so an unknown key is silently stripped rather than refused.
  evidence: `errorEnvelopeSchema.parse({ code, message, hint: "leak" })` succeeds and drops `hint`. The file's own doc comment claims "`app/api/` formats the HTTP response *around* this schema and adds no keys of its own" — `.strict()` is the mechanical form of that claim. Left as a decision rather than a patch because the same question was answered the other way for `pipelineCountsSchema` during Story 1.3's review (strict mode would break Epic 2's DB rows, which carry extra columns), and the two should be settled together rather than diverging by accident.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-get-one-legible-error-shape-from-every-endpoint.md`
  summary: `PIPELINE_STAGES` and `PIPELINE_STATES` are one letter apart, in the same directory, and mean different things.
  evidence: `core/pipeline/pipeline-counts.ts` exports `PIPELINE_STATES` — the four posting states (discovered/tailored/approved/submitted) — and `core/pipeline/pipeline-stages.ts` now exports `PIPELINE_STAGES`, the six run stages. Adjacent files, near-identical identifiers, unrelated concepts; a misimport typechecks in neither direction only because the value types differ, and a reader has nothing but the letter to go on. Renaming one (e.g. `RUN_STAGES`) is the obvious fix, but the name came from the approved spec, so it is a naming decision to take deliberately rather than a defect to patch. Worth settling before Epic 3's runner imports the stages.


## Deferred from: code review of story-1.4 (2026-08-29)

- **Inbound HTTP types are unconstrained under `core/`.** The invariant is stated as "errors flow one direction", but only the outbound half is policed. `Request`, `Headers`, `NextRequest` and `URLSearchParams` are globals or imports that put transport shape into `core/` just as directly — verified: `export function h(req: Request): Headers { return req.headers; }` lints clean under `core/` today. Deferred because closing it means a new prohibition class rather than a fix to this story's two rules, and the spec's "Ask First" list scopes this story to what the translator needs. The story that first defines a `Port` taking a request-shaped input is where this becomes load-bearing.
- **`core/errors/` is not in the epic's listed core subdirectories.** `epic-1-context.md` says `core/` contains `ports/`, `canon/`, `pipeline/`, `validation/`, `diff/`, `scoring/`, `gates/`. Story 1.3 already added `core/boards/` without amending it, so the list is non-exhaustive in practice. Deferred as a planning-doc amendment, not a code change — worth folding into the epic-1 retrospective rather than patching one story's spec.
- **Commit `e3aaa18`'s message miscounts its own fixtures.** It claims "11 new fixtures, one shape each"; `git show --name-status` shows 17 added under `tools/boundary-fixtures/core/canon/` (15 violating, 2 clean). Deferred rather than patched because the commit is already pushed to `origin/main` and amending it would rewrite published history for a cosmetic miscount.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-start-the-app-on-a-clean-machine-and-have-it-set-itself-up.md`
  summary: `boardEntrySchema.token` accepts a pasted board URL as a valid token.
  evidence: `token` is any non-empty trimmed string, and SPEC.md's own wording was "type plus token or URL" — so a user following the spec pastes a URL, it validates, and the board adapter builds a broken API URL from it. Story 2.1 already owns rejecting an unsupported board URL with a message naming the four types; this validation belongs there, next to that error copy.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-start-the-app-on-a-clean-machine-and-have-it-set-itself-up.md`
  summary: `boardsFileSchema` silently strips unknown top-level and per-entry keys.
  evidence: No `.strict()`, so a hand-edited `boards.json` carrying `boardz:` or a typo'd key parses clean and yields zero boards with no error. The same module refuses an empty `label` rather than letting a consumer guess what it means; dropping a whole misspelled key without a word is the larger version of that. Deferred because strictness changes what an existing file means, which is Epic 2's call once a real reader and its error surface exist.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-start-the-app-on-a-clean-machine-and-have-it-set-itself-up.md`
  summary: Nothing enforces `(type, token)` uniqueness inside `boards.json`.
  evidence: A duplicated entry is scanned twice and yields duplicate postings under one `postings.source`. Epic 2's Story 2.1 has the explicit AC "it is not duplicated in `boards.json`", so the constraint has a named owner; declaring it in the schema now would put the rule a story ahead of the code that reports it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-start-the-app-on-a-clean-machine-and-have-it-set-itself-up.md`
  summary: Two servers starting together can fail the second with `SQLITE_BUSY` during `migrate()`.
  evidence: The file creates are exclusive-create and race harmlessly, but the migration step has no busy timeout or retry, so the bootstrap I/O matrix's "concurrent start is harmless" row holds for the files and not for the database. Low priority while the epic's "one process, one machine" constraint stands; it becomes real the first time a dev runs `pnpm dev` and `pnpm verify` at once.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-start-the-app-on-a-clean-machine-and-have-it-set-itself-up.md`
  summary: A canon path occupied by a directory or a dangling symlink is reported `left-untouched` though no readable file exists.
  evidence: `COPYFILE_EXCL` raises `EEXIST` for both, which `createOnce` treats as the success case. Bootstrap then reports success and Story 1.6's gateway is the first thing to discover there is nothing to read. Guarding needs a `statSync(..., { throwIfNoEntry: false })?.isFile()` check on the `EEXIST` branch; deferred as exotic relative to the complexity it adds to the story's central invariant.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-start-the-app-on-a-clean-machine-and-have-it-set-itself-up.md`
  summary: `PUSH_SCAN_EXEMPT` is a hole in the `drizzle-kit push` ban by construction.
  evidence: The two files whose job is to name the pattern are exempt from the scan that looks for it, so an invocation hidden in either passes the build. The exemption list is exported and asserted short, but that assertion is a tripwire rather than a proof. Closing it properly needs the pattern held as split fragments the scanner reassembles, so no file needs an exemption.

## Deferred from: code review of spec-1-5-start-the-app-on-a-clean-machine-and-have-it-set-itself-up.md (2026-09-02)

- **`EEXIST` on a directory or dangling symlink is reported as success.** `adapters/db/bootstrap.ts:97` — `isAlreadyExists()` treats any `EEXIST` as the success case, and both `COPYFILE_EXCL` and the `wx` flag raise `EEXIST` for a directory. Round 2 note: the existing item above covers only the canon path; `boards.json` has the identical hole and Epic 2's reader is what discovers it.
- **`PUSH_SCAN_EXEMPT` is a by-construction hole in the `drizzle-kit push` ban.** `scripts/verify-boundaries.mjs:683` — re-confirmed in round 2 and already recorded above; carried here so the round-2 finding set is complete.
- **`eslint.config.mjs` has no element type for repo-root source.** `eslint.config.mjs:719` — `instrumentation.ts` and `drizzle.config.ts` are the repo's first root-level modules and match none of the four `boundaries/elements` patterns, the blind spot the config's own comment warns about. No live consequence today: `boundaries/element-types` is `default: "allow"` and constrains only `from: ["core"]`, so nothing about core's protection is weakened. Worth an entry when root-level source grows.
- **`epic-1-context.md`'s `core/` list was not amended for `core/bootstrap/`.** `_bmad-output/implementation-artifacts/epic-1-context.md:37` — extends the existing `core/errors/` item above; the list is now three subdirectories behind (`boards`, `bootstrap`, `errors`). Fold into the epic-1 retrospective rather than patching one story's spec.
- **`adapters.md`'s `fetchJobs(boardUrl)` contradicts the boards shape Story 1.5 declared.** `_bmad-output/specs/spec-tailor/adapters.md:10` fixes AD-2's port signature as `fetchJobs(boardUrl)`; `core/boards/boards-file.ts` declares a board as `{ type, token }`, and Story 1.5's Design Notes record why the token wins (it is the only part a human types, it is reused as `postings.source` and as the adapter registry key, and a stored URL admits four spellings of one board that no longer compare equal). The consequence is that `BoardPort` takes the entry rather than a URL and each adapter builds its own. Deferred because `adapters.md` is a spec companion, not this story's file; Epic 2's first board story is where the signature actually lands, and it should amend the companion in the same change.
