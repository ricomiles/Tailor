# Review layer 1 — Blind Hunter

*Context-free subagent. Story 1.3, review round 2. Baseline `4a09ce8`, working tree. Findings as returned, unranked.*

- **Correction 7 does not actually produce a visible focus ring.** `.seg { display: inline-flex; overflow: hidden }` (`app/globals.css:202-204`) clips descendant ink overflow, and an outline at `outline-offset: 2px` is painted entirely outside the `.seg-opt` border box. The ported `-2px` was at least drawn inside the clip. The change therefore likely replaces "invisible because accent-on-accent" with "invisible because clipped" — yet `deferred-work.md` marks the defect struck through and Closed 2026-08-27, and the spec's Iteration 3 log records it as resolved.
- **Correction 6 is a no-op.** The base rule at `app/globals.css:125` is already `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`. `.input:focus-visible { border-color: ...; outline-offset: 2px }` re-declares the identical value it inherits. Expressing the correction as a deletion of the override would be smaller against the source and self-documenting.
- **Neither adopted correction is covered by a test**, in a diff whose stated purpose is closing verification gaps.
- **The diffability invariant is further out of true and still unreconciled.** The spec's own command yields 12 hunks against a header and spec claiming eight deltas. Two new hunks (`[port note: ...]` blocks) are not deltas, are not enumerated in Design Notes, and are not in the Verification line's expected set. Spec 1.3's change log had already flagged this as "needs reconciling in 1.2's review" — this is that review, and it was not done.
- **The font-rebind comment introduces a "Delta 1 of 8" numbering scheme used exactly once.** Two competing conventions for marking the same thing.
- **Spec 1.3's frozen block is stale in three places** — Boundaries/Ask First, Code Map, and Verification all still say "six deltas".
- **`spec-1-2`'s frontmatter still reads `review_loop_iteration: 1`** while the diff appends Iteration 3 to its change log.
- **`playwright@1.62.1` remains in `dependencies`** while `@playwright/test` is added to `devDependencies`. Test tooling ships as a runtime dependency of a private app; the README's core-ban list names `playwright` explicitly.
- **Nothing installs the Playwright browsers.** No `postinstall`, no README step. On a clean clone `pnpm verify` fails at the webServer step.
- **`reuseExistingServer: !process.env.CI` silently defeats the suite's own rationale.** No CI exists, so the flag is always `true`: anything already listening on 3100 gets measured instead of the fresh build.
- **`pnpm test:e2e` never builds.** The README calls it "Playwright against a served production build", but the script is bare `playwright test` and `webServer.command` is `next start`, which serves whatever `.next` holds.
- **`verify` is pinned in shape but nothing executes it.** `verify-boundaries.mjs` asserts `verify === "pnpm build && pnpm test:e2e"`, but `build` excludes e2e, there is no CI and no git hook. The guard proves the chain exists, not that it runs.
- **The emptiness guard is asymmetric.** `run-tests.mjs` fails on a zero-file unit collection; there is no equivalent for e2e.
- **`run-tests.mjs` throws an unhandled `ENOENT` in the exact scenario its comment claims to cover.** `readdirSync("tests", ...)` is unguarded, so moving `tests/` produces a raw stack trace rather than the crafted message.
- **The font test does not prove what its name claims.** `Array.from(document.fonts)` enumerates CSS-connected `FontFace` objects as soon as the `@font-face` rules are parsed, each `status: "unloaded"` until used. Proving load requires `await document.fonts.ready` plus `f.status === "loaded"`, or `document.fonts.check(...)`. There is also no wait, making it race-prone.
- **The colour test hard-codes palette values outside the token table.** `rgb(243, 242, 242)` and `rgb(96, 93, 93)` duplicate `--color-bg` and `--color-neutral-700` in a second file, and the story's hex grep covers neither `e2e/` nor the `rgb()` form.
- **`role="status"` on the counts container is a polite live region.** Epic 2 exists to make the counts change, at which point every update announces all four labels on every screen. `role="group"` matches static chrome.
- **`z-index: 40` is an unexplained magic literal**, introduced in the same diff whose new deferred entry says "the design system defines no z-index scale at all". The module header justifies `39px`/`20px`/`14px`/`18px` and says nothing about stacking order.
- **`overflow: hidden` on `.bar` is the same clipping mechanism as finding 1.** Any focusable control added later gets its `outline-offset: 2px` ring clipped; `.boards` truncates with no ellipsis and no title.
- **The document-order test hard-codes framework internals and reaches outside the story's scope.** The filter is tuned to one Next/React preamble form, and `expect(rendered).toContain("main")` couples the chrome test to `app/page.tsx`.
- **`BAR = "header:has-text('tailor')"` selects by copy.** A copy change breaks every test with "locator resolved to 0 elements". `getByRole("banner")` or a testid is stable.
- **`BoardCount` is exported and never used.** `TopBar`'s prop and `boardsLabel`'s parameter are both bare `number`, so the schema change is runtime-only.
- **`pipelineCountsSchema` is non-strict.** `z.object` strips unknown keys silently.
- **One unit test is tautological.** `"every state the schema declares gets a label, and none other"` asserts `countLabels(...).map(l => l.split(" ")[1])` equals `PIPELINE_STATES`, but `countLabels` is implemented as `PIPELINE_STATES.map(...)`. Both assertions hold by construction.
- **`"type": "module"` and `engines.node: ">=22.18"` land with no explanation anywhere** — no comment, no change-log entry, no README update. The README still states the floor is `>=22`, "set by better-sqlite3".
- **Spec 1.3's change log describes `allowImportingTsExtensions` as pre-existing** while the same diff adds it to `tsconfig.json`.
- **The README Layout tree is not updated** for `tests/`, `e2e/`, or `playwright.config.ts`.
- **Story 1.3's own escalated WCAG deviation gets no `deferred-work.md` entry.** The 10px `--color-neutral-600` boards label at ~3.9:1 lives only in a CSS comment and a spec paragraph.
- **`deferred-work.md` now carries two separate `.dialog-backdrop` z-index entries** rather than one amended entry, and the contrast entry forward-references a later section for its own missing inventory.
- **`forbidOnly` and `/blob-report` are written for infrastructure that does not exist.** `forbidOnly: !!process.env.CI` is permanently `false`; `/blob-report` is gitignored though no blob reporter is configured, and no `outputDir` is set.
