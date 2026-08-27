---
title: 'Story 1.3 — See the app''s global chrome'
type: 'feature'
created: '2026-08-27'
status: 'in-review'
baseline_commit: '4a09ce84ed2e5f80d6476e53efa83b6d9fdef87e'
review_loop_iteration: 1
context: ['_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every screen from here on renders inside global chrome that does not exist. Its 39px height is load-bearing — Epic 2 pins its action bar at `top: 39px` — and its pipeline counts are the first consumer of a cross-unit shape, the discipline this epic exists to establish.

**Approach:** Add a sticky, exactly-39px top bar to the root layout, styled by a CSS Module so `app/globals.css` stays diffable against its ported source. Declare the counts shape once in `core/` as a named zod schema with an inferred type, and have the layout supply a zero value today — Epic 2 swaps the supply, not the bar.

## Boundaries & Constraints

**Always:**
- The bar lives in `app/layout.tsx`, above `{children}`, so every screen carries it.
- Its border-box is exactly 39px including the 2px bottom rule. Epic 2 pins its action bar at `top: 39px`.
- Every color, space, and font value resolves through a `var(--*)` token. No hex literal.
- The counts shape is declared once, in `core/`, as a named zod schema with its inferred type, importing nothing but `zod` (AD-1).
- Copy comes verbatim from the design source.

**Ask First:**
- Reading counts or the board count from any real store. The DB and `boards.json` arrive in Story 1.5 and Epic 2.
- Any edit to `app/globals.css` — Story 1.2 froze it at six deltas from its source.

**Never:** the prototype's `jump` select or the divider preceding it; its outer shell (`min-height:100vh`, the app ground, the 14px base override); `.nav`/`.nav-brand`; app styles in `app/globals.css`; a client component, hook, or store; `app/page.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Zero state — what ships today | counts all `0`, `boardCount` `0` | `0 discovered  0 tailored  0 approved  0 submitted`; right side reads `no boards yet` | N/A |
| Boards watched | `boardCount` `14` | right side reads `watching 14 boards` | N/A |
| One board | `boardCount` `1` | right side reads `watching 1 board` | N/A |
| Invalid counts | a negative or fractional count | schema parse fails naming the offending field | throw at the boundary; never render a coerced zero |

</frozen-after-approval>

## Code Map

- `app/layout.tsx` -- 32 lines. `<body>{children}</body>` at L29. **Do not touch L10-14 or L22-25** — the latter explains why props are typed `{ children: ReactNode }` rather than Next's generated `LayoutProps<"/">`: the generated types do not exist on a clean checkout and `pnpm typecheck` must pass.
- `app/globals.css` -- **read-only.** Story 1.2 froze it as a diffable port with exactly six deltas. Supplies every token this story needs, plus global `box-sizing: border-box` and `body{margin:0;line-height:1.55}`.
- `components/top-bar/` -- new, beside `components/resume-document/`. Only `core/` is boundary-restricted.
- `core/pipeline/` -- new file lands here; the four count names are pipeline states.
- `core/boards/board-count.ts` -- new (review round 1). `boardCountSchema`, the board count's single declaration, on the same discipline as the pipeline counts.
- `tests/` -- Node `--test` unit suite. Core's tests live outside `core/` because AD-1 forbids `node:test` inside it.
- `e2e/`, `playwright.config.ts` -- new (review round 1). The only place the 39px border-box, the sticky pin, and the bar's document position are actually measured. Runs against `next start` on a production build, not `next dev`.
- `scripts/run-tests.mjs` -- new (review round 1). Collects `tests/**/*.test.mts` and fails on an empty collection, which a bare `node --test` glob does not.
- `scripts/verify-boundaries.mjs` -- **edited** (review round 1): the required `build` chain it asserts now includes `pnpm test`. Otherwise read-only.
- `eslint.config.mjs` -- read-only. AD-1: under `core/`, React, `next/*`, the ORM, Node built-ins, the `@/` alias, relative escapes, and deferred loading are all errors. `zod` is permitted.
- **Read-only, govern visuals and copy:** `_bmad-output/inputs/design_handoff_resume_tailoring/Tailor.dc.html` L23-45 (bar markup, with every size, tracking, and color token inline) and L951 (`boardsLabel`); `.../README.md` L82-85, L119-120.

## Tasks & Acceptance

**Execution:**
- [x] `core/pipeline/pipeline-counts.ts` -- declare `pipelineCountsSchema` over four non-negative integers (`discovered`, `tailored`, `approved`, `submitted`); export the inferred `PipelineCounts` type and a `ZERO_PIPELINE_COUNTS` constant derived through the schema. -- Epic 2 produces this same shape from posting statuses; declaring it here is the epic's highest-value invariant.
- [x] `components/top-bar/top-bar.module.css` -- the bar's styles: sticky at `top: 0`, `height: 39px`, `line-height: 1`, a 2px bottom rule, token-only values. -- `app/globals.css` is frozen, so app-layer styles need their own file.
- [x] `components/top-bar/top-bar.tsx` -- server component taking `{ counts: PipelineCounts; boardCount: number }`; renders the brand, the vertical divider, the four counts, and the right-aligned boards label. -- One component, no client runtime.
- [x] `app/layout.tsx` -- render `<TopBar counts={ZERO_PIPELINE_COUNTS} boardCount={0} />` inside `<body>`, above `{children}`. -- This call site is the seam Epic 2 replaces.

**Acceptance Criteria:**
- Given any screen, when it renders, then the bar is the first element the layout puts in `<body>` — ahead of `{children}` — and stays pinned to the viewport top while the page scrolls beneath it. (Measured among rendered elements: React reserves the literal first slot in `<body>` for its own hidden preamble container, so the original "first element in `<body>`" was unmeetable as written.)
- Given the rendered bar, when I measure its border-box, then it is exactly 39px tall, the 2px bottom rule included.
- Given the bar, when I inspect the brand, then it reads `tailor` in `var(--font-heading)` at weight 800 and 16px, followed by a 1px × 18px vertical divider.
- Given the repository, when I search for another declaration of those four count fields, then only `core/pipeline/pipeline-counts.ts` declares them.
- Given a negative, fractional, non-numeric, or missing count — or a board count that is negative, fractional, `NaN`, or `Infinity` — when the bar renders it, then the render throws at the label boundary and no coerced value reaches the page.

## Spec Change Log

**2026-08-27 — review round 1.** Multi-lens review (adversarial, edge-case, verification-gap) against baseline `4a09ce8`. Changes made to the spec and to the code it governs:

- **AC 1 restated.** "First element in `<body>`" is unmeetable under Next 16 — the built HTML opens `<body>` with React's hidden preamble container. Reworded to "first element the layout puts in `<body>`", and pinned by an e2e assertion over rendered elements.
- **New AC for the boundary throw.** The I/O matrix already required invalid counts to throw rather than render; nothing implemented it. `countLabels` and `boardsLabel` now parse, and the criterion is stated explicitly.
- **`boardCount` given a schema.** It was a bare `number` while `counts` had one. `core/boards/board-count.ts` declares it, on the same single-declaration discipline as the pipeline counts.
- **Tests joined the gate.** The suite existed but nothing ran it: `pnpm test` was in no chain, there is no CI, and a zero-match glob exited 0. It is now a required link in `build` (enforced by `scripts/verify-boundaries.mjs`), collects recursively, and fails on an empty collection.
- **`pnpm test:e2e` added.** The 39px contract Epic 2 depends on was human-verified only. Six Playwright assertions now cover it; both were mutation-checked (removing `height: 39px` fails two of them, removing the parse fails seven unit tests).
- **Toolchain flags.** `erasableSyntaxOnly` and `verbatimModuleSyntax`, because `allowImportingTsExtensions` let source pass `typecheck` and `build` that Node's type stripper cannot load at test time.
- **The hex-literal check was unrunnable.** As written it grepped `app/` including `globals.css`, the token table itself, so it matched 36 lines and could never report the "no matches" it expected. Scoped to exclude the token table.
- **Not changed, flagged for Story 1.2:** `app/globals.css` is untouched here, but it now differs from its ported source by 9 diff hunks where 1.2's spec claims six deltas. Either the count or the file needs reconciling in 1.2's review, not this one.

## Design Notes

**Why an explicit `height: 39px`.** 39px is not cosmetic — Epic 2's action bar is specified sticky at `top: 39px` (UX-DR25), so a drifting height opens a gap or an overlap on every posting screen. The prototype's own `padding: 9px 16px` plus a 2px rule does not produce it: under the inherited `line-height: 1.55` the 16px brand alone is 24.8px tall, giving ~44.8px. Set `height: 39px` with `line-height: 1`; the global `box-sizing: border-box` keeps the 2px rule inside the 39px.

**Why not `.nav`.** It is a site-nav component — 12/16px padding, an 18px `.nav-brand` with `margin-right: auto`. The chrome takes 9/16px and a 16px brand and carries no links, so overriding nearly every declaration is worse than a dedicated module. Story 1.2's "don't invent parallel component classes" rule guards the design system's vocabulary; this is app chrome, not a new `.btn`.

**Contrast deviation, escalated not patched.** The boards label ships at 10px `--color-neutral-600` (#7d7979) on `--color-bg` (#f3f2f2) — about 3.9:1, under the WCAG AA minimum of 4.5:1. Both the size and the token come from the design source, which this story gives authority over visuals, so the fix belongs there rather than in a local override. `--color-neutral-700` would clear it at about 5.8:1. Recorded in `top-bar.module.css` as well, so the next person to touch the file sees it. The 11px counts at `--color-neutral-700` already pass.

**Zero-state copy.** The design source sets the label to `no boards yet` when nothing is watched, `watching N boards` otherwise — so the bar this story ships reads `no boards yet`, not `watching 0 boards`. The epic's AC names only the populated form, and the epic gives the design source authority over copy. Singular `watching 1 board` has no source counterpart and is decided here.

```tsx
// app/layout.tsx — the call site Epic 2 replaces, and the only thing it replaces
<body>
  <TopBar counts={ZERO_PIPELINE_COUNTS} boardCount={0} />
  {children}
</body>
```

## Verification

**Commands:**
- `pnpm lint` -- expected exit 0.
- `pnpm typecheck` -- expected exit 0.
- `pnpm verify:boundaries` -- expected exit 0; confirms AD-1 still fires with a new `core/` file present.
- `pnpm test` -- expected exit 0; the unit suite, now a link in the `build` chain. An empty collection exits 1 rather than passing vacuously.
- `pnpm test:e2e` -- expected exit 0; measures the 39px border-box, the sticky pin, and the bar's position in the document against a production build. Requires `pnpm build` first (or use `pnpm verify`, which chains both).
- `pnpm build` -- expected exit 0.
- `SRC=_bmad-output/inputs/design_handoff_resume_tailoring/_ds/modernist-f8562a2f-380c-4e83-bd66-6cba1fb04c4a/styles.css; diff <(tail -n +3 "$SRC") <(tail -n +3 app/globals.css)` -- expected: the same six deltas Story 1.2 left, and nothing new. `diff` exits 1 whenever it prints, so read the hunks rather than gating on the code.
- `grep -rnE "#[0-9a-fA-F]{3,8}\b" app components --include='*.ts' --include='*.tsx' --include='*.css' | grep -v '^app/globals.css:'` -- expected: no matches. The `globals.css` exclusion is not a loosening: that file *is* the token table and necessarily holds every hex in the palette, so without it this command could never pass — it matched 36 lines as originally written. What it checks is that no app-layer code outside the token table hard-codes a color.
- `grep -rn "jump\|<select" app/ components/` -- expected: no matches.
- With `pnpm dev` running: `curl -sS localhost:3000` -- expected to contain `no boards yet` and `0 discovered`. Kill the server afterward.

**Manual checks (browser devtools, wide desktop viewport):**
- The bar's border-box measures exactly 39px, with the 2px rule inside it.
- Scrolling the page leaves the bar pinned at `top: 0` with content passing beneath it, no bleed-through.
- The brand's computed `font-weight` is 800 at 16px, resolving to Archivo.
- The counts are 11px uppercase and the boards label sits flush against the right edge.
