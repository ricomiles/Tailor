# Deferred Work

Findings surfaced incidentally by review, not caused by the story that found them.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: `next.config.ts` does not declare `serverExternalPackages` for `better-sqlite3` and `playwright`.
  evidence: Both are native/runtime-heavy packages that Next will otherwise attempt to bundle into the server build. `better-sqlite3` loads a `.node` binding. Belongs to the DB and render adapter stories that first import them.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: Nothing creates the `data/` and `out/` directories that the architecture and README both document.
  evidence: Both are gitignored and neither exists on disk nor in the `.gitkeep` seed, so the first write to either fails at runtime. Needs a setup script or `mkdirSync(..., { recursive: true })` at the adapter boundary; owned by the DB/render stories.

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
  summary: `engines.node` and `packageManager` are advisory; nothing enforces them at install time.
  evidence: Installing on Node 20, or with npm/yarn instead of pnpm, succeeds and fails later cryptically when `better-sqlite3` cannot load. An `.npmrc` with `engine-strict=true` would make the declared floor real, but adding install-time configuration is beyond this story's stated scope.

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

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: Mechanize the "no hex color literal in a component file" rule as a `tailor/no-hex-color-literal` ESLint rule that blocks the build, with fixtures and a `verify:tokens` script proving it fires.
  evidence: Story 1.2 AC #2 asserts no component file contains a hex literal. Today that is vacuously true — no component carries color yet — so the port satisfies it by inspection. Making it a standing invariant needs its own config block in `eslint.config.mjs` (the `tailor` plugin is registered only for `CORE_FILES` at L300), a `tools/token-fixtures/` set, a `scripts/verify-tokens.mjs`, and a lockstep edit to `EXPECTED_BUILD_CHAIN` at `scripts/verify-boundaries.mjs:493-503` plus the README script table. That is a second independently shippable deliverable, split out on 2026-08-26 to keep the port spec inside the scope standard. Must land before Story 1.3 writes the first components that carry color, or it becomes a retrofit.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The app-specific style layer the prototype implies — button size ramp, dense table padding, uppercase kickers, the sticky 39px bar, the 14px app base size, and the `tk-in`/`tk-blink` keyframes with their `prefers-reduced-motion` guard.
  evidence: `Tailor.dc.html` contributes only four CSS rules and roughly 500 inline `style` attributes; it uses 5 of the ~30 design system classes and overrides properties on all five. None of it is design system and none of it appears in Story 1.2's acceptance criteria, so the port does not cover it. Story 1.3 (global chrome) is the first story that needs it. Recorded so it is not rediscovered mid-implementation.

## Deferred from: review of spec-1-2-port-the-modernist-design-system (2026-08-26)

Faithfully ported defects present in the design source, plus gaps the port exposed. None are caused by Story 1.2, which was required to port verbatim.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: A focused-and-checked `.seg-opt` shows no visible focus indicator.
  evidence: `.seg-opt:has(input:focus-visible)` draws `2px solid var(--color-accent)` at `outline-offset: -2px` — inside the element — while `.seg-opt:has(input:checked)` has already filled it with `var(--color-accent)`. Accent on accent is invisible, so the selected segment is the one state with no keyboard focus cue. Verbatim from the source stylesheet.

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
  summary: `--color-divider` sits near 2.4:1 against the ground, and several muted `color-mix` steps fall below 4.5:1.
  evidence: The divider is the only border on `.input`, `.seg`, and `.btn-secondary` — the elements whose boundary carries meaning — and 3:1 is the non-text minimum. `.card-meta` at 50% and `.text-muted`/`figcaption` at 55% are 10–12px text below the normal-text threshold. Design-source values; changing them is a design decision, not a port.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `--color-divider` and the three `--shadow-*` tokens hardcode hexes that duplicate other tokens.
  evidence: `--color-divider` embeds `#201e1d`, the value of `--color-text`; the shadows embed `#2d2b2b`, the value of `--color-neutral-900`. Retuning the ink or the neutral ramp silently leaves dividers and shadows on the old value. `color-mix(in srgb, var(--color-text) 40%, transparent)` keeps the derivation live at no cost.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: The design's `←` and `✓` glyphs fall outside every Archivo subset and render in the fallback face.
  evidence: The epic mandates text characters rather than icons (`−`, `+`, `✓`, `›`, `·`, `!`, `←`). U+2190 and U+2713 are in neither the `latin` nor the `latin-ext` Google Fonts subset, so they resolve to `system-ui` mid-line. `−` (U+2212), `·`, and `›` (U+203A) are covered. First visible in Story 1.3's `← Queue` control and the tailoring step list's `✓`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md`
  summary: `<strong>`, `<b>`, and unstyled `<th>` request weight 700, which is not loaded.
  evidence: Only 400/600/800 ship, so CSS font matching resolves a 700 request upward to 800. The rendered weight stays inside the sanctioned set, so this is not a defect today, but any component relying on default bold gets 800 rather than the 600 the type scale uses for emphasis. Worth an explicit `strong, b { font-weight: 600 }` when the app layer lands.

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
