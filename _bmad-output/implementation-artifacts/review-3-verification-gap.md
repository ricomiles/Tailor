# Review layer 3 — Verification Gap Reviewer

*Context-free subagent following `review-prompts/verification-gap.md`. Story 1.3, review round 2. Baseline `4a09ce8`, working tree. Every gap below was demonstrated against a served production build, not argued from the diff.*

## The e2e suite — the only thing in the repo that renders the app — is reachable only by a human typing `pnpm verify`

- **Changed surface:** `package.json:16` adds `test:e2e`, `:20` adds `verify`, and `scripts/verify-boundaries.mjs:504-518` pins `verify`'s text.
- **Impacted:** all nine assertions in `e2e/top-bar.spec.ts` — the 39px border-box, the sticky pin, the font faces, the colour tokens, the body reset — plus `top-bar.module.css` and `app/globals.css`, which they are the sole observer of.
- **Evidence:** `Broken-verification gap`. `build` is `clean:probes && lint && typecheck && test && verify:boundaries && next build`; `pnpm test` runs only 20 Node assertions over `labels.ts` and the two schemas (no CSS, no DOM), and `next build` renders nothing. `verify:boundaries` asserts the *string* of `scripts.verify`, but is itself invoked only from `build` — so a green `pnpm build` proves `verify` is well-formed and never that it ran. There is no `.github/`, no workflow, no git hook; the only in-repo references to `pnpm verify` are prose (`README.md:32`, `spec-1-3:112`). `spec-1-1:147` states the repo's own standard: "There is no CI (the story forbids it) and no hook, so without this the fixtures ran only when a human typed the command" — the reason `verify:boundaries` was chained into `build`. The new e2e link was not given that treatment.
- **Demonstration:** change `.bar { height: 39px }` to `44px`, or delete `background: var(--color-bg)`. `pnpm build` exits 0. Epic 2's action bar, pinned at `top: 39px`, ships against a 44px bar.
- **Suggested shape:** a marker in `verify-boundaries.mjs` that `test:e2e` ran against the current `.next/BUILD_ID`, or make `build` depend on it.

## `.divider` — AC #3's 1px x 18px vertical rule — is measured by nothing

- **Changed surface:** `top-bar.module.css:44-49`, rendered as an empty element at `top-bar.tsx:28`.
- **Evidence:** `Regression gap`. All nine tests read. The brand test reads only `fontWeight`/`fontSize`/`fontFamily`; the geometry tests measure the `header` box, never a child. `grep -rn "divider" e2e/ tests/` returns nothing.
- **Demonstration:** delete `height: 18px` (or `width: 1px`). The element has no content and sits in an `align-items: center` flex row, so it collapses to zero and the divider disappears. Confirmed against the served build that it is `header.children[1]` with computed background `rgba(32, 30, 29, 0.4)` — **all nine tests pass with the rule gone.**
- **Suggested shape:** `boundingBox()` on the divider asserting `{ width: 1, height: 18 }`.

## The colour-token test covers two of the bar's five token references

- **Changed surface:** `e2e/top-bar.spec.ts:128-146`, added under the rationale "No test observes any color token resolving."
- **Impacted:** `top-bar.module.css:71` (`.boards { color: var(--color-neutral-600) }`) and `:27` (`padding: 0 var(--space-4)`).
- **Evidence:** `Regression gap`. The test asserts exactly two things. `--color-divider` is covered by proxy (it is the only value in the `border-bottom` shorthand, so dropping it fails `borderBottomWidth === "2px"`), but `--color-neutral-600` and `--space-4` sit in single-property declarations with no such fallout.
- **Demonstration:** injected `:root { --color-neutral-600: initial }` against the served build. `boardsColor` moved `rgb(125, 121, 121)` -> `rgb(32, 30, 29)` — the label stops reading as muted secondary — while `barBg`, `borderBottomWidth` and `countsColor`, the only three values the suite reads, were byte-identical. **All nine tests pass on the regressed page.** Same for `--space-4`: padding drops to 0 and the brand goes flush to the viewport edge, with `box.x === 0` and `box.width === clientWidth` still true because they measure the border box.

## The "weights are actually loaded, not just declared" test reads the `@font-face` table, not the loaded faces

- **Changed surface:** `e2e/top-bar.spec.ts:113-127`.
- **Evidence:** `Broken-verification gap`. `Array.from(document.fonts)` yields a CSS-connected `FontFace` for every `@font-face` rule regardless of whether the file was fetched; the assertion maps to `f.weight` and never touches `f.status`. Dumped against the served build: nine Archivo faces (three weights x latin/latin-ext/vietnamese), of which **weight 600 is `unloaded` on all three subsets even in the healthy build** — nothing requests 600, a fact `spec-1-2` records ("the third face is preloaded dead payload"). The test already passes on a face the browser has not loaded.
- **Demonstration:** re-ran with every `**/*.woff2` request aborted. Face statuses became `unloaded`/`error`, the brand's computed family was `Archivo, "Archivo Fallback", system-ui, sans-serif` and **every glyph rendered in the metric-adjusted fallback** — yet the weights array was still `["400","400","400","600","600","600","800","800","800"]` and `arrayContaining(["400","600","800"])` passed, as did `expect(style.family).toContain("Archivo")`. The whole app renders in the wrong face with all nine tests green.
- **Suggested shape:** `f.status === "loaded"` after `document.fonts.ready`, or `document.fonts.check('800 16px Archivo')`.

## `latin-ext`, added by this change, is not observed by the font test added alongside it

- **Changed surface:** `app/layout.tsx:20` — `subsets: ["latin"]` -> `["latin", "latin-ext"]`.
- **Evidence:** `Regression gap`. The assertion is `arrayContaining(["400","600","800"])` over `f.weight` strings with no subset or `unicodeRange` dimension. `grep -rn "latin|unicodeRange|subset" e2e/ tests/` returns nothing else.
- **Demonstration:** revert to `subsets: ["latin"]`. Three of the nine faces disappear, but each weight still appears once, so `arrayContaining` passes unchanged — as do the other eight tests. The change's only behavioural edit to `layout.tsx` is unpinned by the verification added in the same commit. Visible consumer (accented employer/candidate names) arrives with Epic 2.
- **Suggested shape:** collect `f.unicodeRange` in the same evaluate and assert both subsets are represented.

## `forbidOnly` is gated on a `CI` variable this repo never sets

- **Changed surface:** `playwright.config.ts:18`.
- **Evidence:** `Broken-verification gap`. No `.github/` and no CI configuration anywhere; `spec-1-1:147` states CI is forbidden by design — so `process.env.CI` is unset on every run and `forbidOnly` is permanently `false`. Checked `eslint.config.mjs` for a compensating rule: none forbids focused tests. `grep -rn "\.only|\.skip" e2e/ tests/` is clean today, so this is a latent gate, not a present defect.
- **Demonstration:** someone commits `test.only` at `e2e/top-bar.spec.ts:17`. `pnpm verify` runs one test, reports "1 passed", exits 0 — the sticky pin, colour tokens, font faces, body reset and zero-state copy all go unrun with no signal. The unit suite's equivalent hole is closed by `run-tests.mjs`; the e2e suite's is not.

## Other findings

- `scripts/run-tests.mjs:17-18` collects only files under `tests/` ending in `.test.mts`. A test written as `tests/foo.test.ts`, or placed outside `tests/`, is silently never run while `pnpm build` stays green — the exact silent-skip the script's header says it exists to prevent. Its guard covers only the total-zero case. `tsconfig.json`'s `include` covers `**/*.ts`, so such a file typechecks and lints cleanly, giving no other signal.
- The two new focus corrections (`app/globals.css:179`, `:217`) have **no consumer in the repo** — `grep -rn "seg-opt|btn-primary|className=\"input" app components` matches only `app/globals.css` itself. There is nothing to test today, so their absence from the suite is not a gap; noted so the green suite is not mistaken for coverage of deltas 6 and 7.
- Ran the design-source parity command: `diff <(tail -n +3 "$SRC") <(tail -n +3 app/globals.css)` prints **12 hunks**, of which 8 are value/declaration changes and 4 are comment-only port notes. The header's "eight marked deltas" holds semantically; `spec-1-3:337`'s "9 diff hunks" flag is now resolved. The check remains human-only — `diff` exits 1 whenever it prints, so it cannot gate anything.
- Verification housekeeping: running the suites required a rebuild after an interrupted `next build` (a running `next start` holds Next 16's build lock; a killed build leaves `.next/BUILD_ID` missing). `.next` was rebuilt cleanly, `pnpm test` reports 20/20 and `pnpm test:e2e` 9/9, and `git status` matches its pre-review state.
