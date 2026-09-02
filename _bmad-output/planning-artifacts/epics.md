---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories"]
inputDocuments:
  - _bmad-output/specs/spec-tailor/SPEC.md
  - _bmad-output/specs/spec-tailor/canon-contract.md
  - _bmad-output/specs/spec-tailor/model-contract.md
  - _bmad-output/specs/spec-tailor/validation-and-diff.md
  - _bmad-output/specs/spec-tailor/data-model.md
  - _bmad-output/specs/spec-tailor/adapters.md
  - _bmad-output/specs/spec-tailor/tag-matching.md
  - _bmad-output/specs/spec-tailor/stack.md
  - _bmad-output/planning-artifacts/architecture/architecture-tailor-2026-08-12/ARCHITECTURE-SPINE.md
  - _bmad-output/inputs/design_handoff_resume_tailoring/README.md
  - _bmad-output/inputs/design_handoff_resume_tailoring/_ds/modernist-f8562a2f-380c-4e83-bd66-6cba1fb04c4a/readme.md
---

# tailor - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for tailor, decomposing the requirements from the SPEC kernel (which stands in for a PRD), the design handoff (which stands in for a UX design contract), and the Architecture Spine into implementable stories.

**Note on inputs.** No PRD exists — per `BMAD-PLAN.md` the PRD phase was deliberately skipped in favor of `bmad-spec`, which produced the canonical `SPEC.md` contract plus seven companions. Functional requirements below are extracted from the eleven capability success conditions and the behavioral contracts in the companions; non-functional requirements are extracted from the SPEC's Constraints section. `_bmad-output/inputs/build-spec.md` and the canonical resume seed (moved to `adapters/db/seed/resume.canon.seed.json` by Story 1.5) are the upstream sources the SPEC was distilled from and are retained for traceability only — they are not extracted from separately, since doing so would double-count. The two architecture review files under `reviews/` are also excluded as requirement sources: their findings were already folded into the spine (they produced AD-16 through AD-19, the TypeScript 5.9.3 re-pin, and the Node 24.19.0 pin).

**Content decisions taken during this breakdown (2026-08-13).** All three of the SPEC's open questions were resolved by the owner and the upstream artifacts were amended to match — `SPEC.md` Open Questions, `canon-contract.md`, and the canon seed itself:

1. **The Kyocera internship was removed from canon** rather than written. Canon now holds 3 roles and 15 bullets with **no `needs-number` and no `needs-content` bullets at all**.
2. **`basics.name` is `Rico Miles Quiblat`** — confirmed; the seed already carried it and the stale confirmation comment is gone.
3. **`basics.phone` stays `TODO` indefinitely** — a decision, not a deferral. The contact line ships with email and GitHub.

**This does not shrink the build.** FR51–FR57 (CAP-6, blocked render) and FR79 remain in full scope. The readiness gate is an invariant of the system, not a fact about any particular bullet — canon is hand-authored and a future bullet may carry either status. The practical consequence is a **testing** one, and it must be carried into the relevant stories: because canon no longer contains a bullet that can trigger either blocker, the `needs-number` and `needs-content` paths have to be exercised against purpose-built fixtures rather than against real canon data. A story that verifies the blocked-render path "by running the app" would now silently pass without ever executing the gate.

## Requirements Inventory

### Functional Requirements

**CAP-1 — Board discovery**

FR1: The user can add a job board by URL, and the watched board list persists in `boards.json` as type plus token or URL.
FR2: The system supports exactly four board types — Greenhouse, Lever, Ashby, Workable — each behind an adapter exporting `fetchJobs(boardUrl): Promise<Posting[]>` against that vendor's public JSON API.
FR3: Scanning is on demand via the `Scan boards` action; each scan fetches every watched board and populates the queue with postings.
FR4: Posting descriptions are stripped of HTML to plain text before being stored.
FR5: Postings are deduped on `(source, external_id)`, so rescanning the same board adds no duplicates.
FR6: Every posting row carries a match score computed locally at fetch time from tag overlap alone, with no model call.
FR7: The queue score is computed as `round(100 × min(1, raw / CAP))` where `raw` sums each matched tag's max canon weight with a 1.5× multiplier for title matches, and `CAP` is the sum of the six highest tag weights in the vocabulary.
FR8: The matched tags themselves are retained for display, so a row can state which tags matched rather than showing a bare number.

**CAP-2 — Queue triage**

FR9: The queue lists postings in a table with columns for selection checkbox, company/role, location, source, found date, match score, state, and actions.
FR10: Six filter chips narrow the queue by state — All, Discovered, Tailored, Approved, Submitted, Skipped — each showing a live count.
FR11: The queue can be sorted by Match score (default), Date discovered, or Company.
FR12: A full queue can be triaged with the keyboard alone: `j`/`↓` and `k`/`↑` move the cursor, `o`/`Enter` opens, `t` tailors, `s` skips, `x` toggles selection.
FR13: Clicking a row opens it by state — `Discovered` starts tailoring, `Tailored` opens review, `Approved` opens handoff, otherwise review — and the primary action button's label follows the same mapping (`Tailor` / `Review` / `Hand off` / `Open`).
FR14: Rows can be multi-selected, revealing a bulk bar offering `Skip selected` and `Clear`.
FR15: Bulk skip is undoable from the toast, restoring each posting's individual previous state.
FR16: A toast surfaces the result of skip, bulk skip, board added, metric filled, bullet dropped, file revealed, answers copied, and rescan, each with an Undo affordance where applicable, auto-dismissing after 4.2 seconds.
FR17: When no postings exist, the queue shows an empty state offering board entry, suggested companies derived from resume tags, and a summary of the canon source — mutually exclusive with the table, filters, and keyboard legend.

**CAP-3 — Tailoring run**

FR18: Starting a tailoring run returns a `runId` immediately; the run proceeds server-side as a background job.
FR19: The run executes exactly six pipeline stages in order — fetch posting, extract requirements, match against canon, rewrite selected bullets, validate, render PDF — each a discrete typed filter function.
FR20: Each stage writes its start and end timestamps to `run_steps`, along with its own detail line (source and request count, requirements found, bullets scored, *n* of *m* selected, page count).
FR21: The client polls run state and never derives progress from a timer of its own; the step list shows done, active, and pending marks with each completed step's real duration and `running` for the active one.
FR22: The run screen shows real elapsed time and a progress bar reflecting actual stage completion, never a spinner.
FR23: A `Matched so far` panel appends matched requirements as steps complete.
FR24: All model access goes through a single `tailor(input): Promise<ModelOutput>` function that shells out to `claude -p --output-format json`.
FR25: The model adapter invokes the CLI with an explicit working directory outside the project so no ambient project agent configuration can influence a run.
FR26: The system prompt carries the canon bullets (`id`, `text`, `tags`, `weight`), `excluded.rules` verbatim, and the `rendering` constraints; the user message carries the scraped JD text.
FR27: The model is instructed to return only JSON with no markdown fences or preamble, and fences are stripped defensively regardless.
FR28: Every bullet the model emits cites a canon `sourceId`; the model never writes free resume prose.
FR29: The server refuses to start a run while another is active and returns the active `runId`; the lock is held in the database, not in module scope.
FR30: Bulk queue selection drives skip only, never tailor.
FR31: A running tailoring run can be cancelled.

**CAP-4 — Fabrication rejection**

FR32: The raw model payload is parsed and shape-validated against the `ModelOutput` schema before any `sourceId` is checked against canon.
FR33: A payload failing shape validation is Outcome D (run failed), not Outcome A (fabrication).
FR34: Outcome A triggers when any `sourceId` in `selected` or `dropped` does not exist in canon.
FR35: On Outcome A nothing derived is persisted — no `diff_items`, no `answers`, no PDF — and the posting stays `Discovered`.
FR36: On Outcome A the system appends to `./data/rejections.log`: timestamp, job id, the offending bullet text, and the invalid `sourceId`.
FR37: The `runs` row and its stage timings are kept even on Outcome A, so polling and the fabrication modal stay reachable.
FR38: The fabrication modal shows the rejected bullet, why it failed, and a non-empty "closest real experience" panel.
FR39: The closest-real-experience panel ranks canon bullets by Jaccard tag overlap against the rejected text, tie-broken by weight desc, role startDate desc, then id asc, taking the top 3 and excluding `needs-content` bullets.
FR40: When every overlap is zero, the panel falls back to the top 3 bullets of the most recent role by weight desc then id asc — it is never empty.
FR41: `Re-run without this claim` re-invokes `tailor()` with the rejected text appended to the prohibitions.
FR42: Outcome D records the failing stage, does **not** write to `rejections.log`, and never demotes a posting that had already advanced.

**CAP-5 — Overclaim flagging**

FR43: A novel-quantity check extracts every numeral, percentage, currency amount, and multiplier from the proposed text and flags any that appears neither in the source bullet nor anywhere else in canon.
FR44: An escalated-verb check flags any of `led, owned, architected, founded, managed, drove, spearheaded, scaled, established, directed` appearing in the proposed text but not in the source bullet — unless the same verb appears in another canon bullet for the same role.
FR45: Each flag produces a sentence naming the specific offending tokens, never a generic warning, shown in both the accent bar and the `OVERCLAIM` band.
FR46: A flag resolves when the user edits the text or reverts to the original.
FR47: Both checks re-run on every edit; an edit that reintroduces a novel quantity re-flags.
FR48: Approve stays disabled while any flag is unresolved.
FR49: The overclaim checks live in one pure isomorphic module imported by both client (for instant per-edit feedback) and server (which re-runs them authoritatively before Approve and before render); client-reported flag state is never trusted.
FR50: The client receives a read-only canon projection carrying every bullet's id, text, tags, weight, status, and owning role id, so its checks range over the same corpus as the server's.

**CAP-6 — Blocked render**

FR51: Selecting a bullet whose canon entry is `status: "needs-number"` with an unfilled placeholder persists the run and shows the raw placeholder token verbatim in the diff.
FR52: A selected `needs-content` bullet blocks render and approval the same way an unfilled `needs-number` placeholder does.
FR53: One render-readiness gate returns every reason a run cannot render or be approved, as a list of blockers.
FR54: The UI renders every blocker through the same banner pattern.
FR55: `Fill metric` writes the value back into canon through the single write path, substituting into an existing `needs-number` field only.
FR56: `Drop bullet` removes the offending item, clearing the blocker by the other route.
FR57: An incomplete contact line is not a blocker — missing contact fields are a rendering concern, not a readiness one.

**CAP-7 — Diff review**

FR58: The diff set is built directly from the model's own mapping, not by text-diffing.
FR59: `selected` with `rephrased: true` becomes `reworded` (`old` = canon text, `neu` = model text); `selected` with `rephrased: false` becomes `kept` (`neu` = canon text, no `old`); `dropped` becomes `dropped` (`old` = canon text).
FR60: Any `selected` item failing an overclaim check is `reworded` plus `flagged: true` and `flagWhy`.
FR61: Canon bullets appearing in neither `selected` nor `dropped` are absent from the diff; no synthesized `dropped` entries.
FR62: Proposed text is directly editable inline with no edit mode, and typing updates the rendered resume pane immediately.
FR63: `revert to original` swaps in the original text and discards any user edit; reverting again restores the model's rewrite.
FR64: Dropped items offer `keep this bullet` / `drop again`.
FR65: Each diff item carries the model's one-sentence rationale on a `WHY` line.
FR66: Inline edits write through to `diff_items.user_edit` on a debounce, so a refresh does not discard a review session.
FR67: The store holds ephemeral UI state and the in-review working copy only; queue, postings, and run/step state are fetched and refetched, never mirrored long-term.

**CAP-8 — JD match marking**

FR68: Each `matchedRequirements[].quote` is located in the JD text at render time and marked in place.
FR69: A quote that is not an exact substring of the JD is dropped rather than fuzzy-matched.
FR70: JD match marking can be hidden and shown via a toggle.

**CAP-9 — Screening answers**

FR71: Work authorization, notice period, and why-this-company are pre-filled from the model's draft and are editable.
FR72: Each answer edit is carried into the handoff.
FR73: Approval covers the answers as well as the diff.

**CAP-10 — PDF render**

FR74: The review preview pane and the PDF template are the same `ResumeDocument` component rendered at different scales.
FR75: `ResumeDocument` is a pure function of fully-resolved props — no hooks, no store access, no client-only APIs.
FR76: Both call sites build those props through one shared props-builder taking a single named input type — the review screen from the Zustand slice, the PDF route from database rows.
FR77: PDFs are produced HTML → Playwright → PDF, reusing the already-installed Chromium.
FR78: After generating, the system asserts the PDF has an extractable text layer and fails loudly when it does not.
FR79: A contact field that arrives absent is emitted with no label and no separator, so preview and PDF omit identically and no placeholder sentinel can reach a submitted resume.
FR80: On Approve the PDF is re-rendered from the current validated diff and `runs.pdf_path` is replaced; stage 6's output is only a preview artifact.

**CAP-11 — Submission handoff**

FR81: The ATS is detected from the posting URL, covering the same four vendors as discovery.
FR82: Each ATS adapter exports `fill(page, job, pdfPath, answers): Promise<void>` and runs against a headed Chromium.
FR83: For a detected ATS the form opens filled with the PDF attached, and no submit control is ever clicked.
FR84: For an undetected ATS the tab opens and the system returns `unsupported`, showing the PDF path and copyable answers.
FR85: The ATS adapter refuses to attach a PDF older than the run's last persisted edit.
FR86: The handoff moves through `waiting → confirm → done`, with `unsupported` as a separate entry path that rejoins at `confirm`.
FR87: The posting becomes `Submitted` only after the user confirms he submitted it; `I bailed` keeps it `Approved` and `Skip this job` skips it.
FR88: The system never attempts to detect a confirmation page.
FR89: The done state offers `Next in queue`, which opens the next `Tailored` posting.

**Cross-cutting**

FR90: `postings.state` is one of `Discovered | Tailored | Approved | Submitted | Skipped`, and every transition goes through one core function keyed on a named event (`scanned`, `run-completed`, `approved`, `submit-confirmed`, `skipped`, `undo`).
FR91: No route handler writes `postings.state` directly and no endpoint accepts a target state as input; undo restores the recorded prior state through the same function.
FR92: One idempotent startup routine creates the data directory, seeds `resume.canon.json` from the input seed only if absent, creates `boards.json` with a documented shape, and applies versioned Drizzle migration files.
FR93: Every route handler returns the same error envelope — a stable code, a human-readable message, and the failing stage where one applies.
FR94: The prototype's mock employers and invented bullets are available for local UI development behind a `USE_MOCK_DATA` flag and are never seeded into canon.

### NonFunctional Requirements

NFR1: Validation runs server-side, after the model call, before anything is persisted or rendered. Unvalidated model output never reaches the client.
NFR2: Validation is deterministic throughout — no second LLM call. Deterministic checks are faster, free, explain themselves precisely, and cannot themselves hallucinate.
NFR3: Every validation check returns a structured result naming the offending token — never a boolean and never a generic message.
NFR4: `resume.canon.json` is read-only to the app except one write path (substituting into an existing `needs-number` field). The model never writes to it, and no code adds or alters a bullet.
NFR5: The single canon write path snapshots a timestamped backup, writes to a temp file, then renames — an interrupted write can never truncate a gitignored, irreplaceable file.
NFR6: Exactly one module opens `resume.canon.json`; reads re-parse per operation with no cache and no invalidation.
NFR7: `page.click()` is never called on a submit control, under any circumstance.
NFR8: All model access goes through `lib/model.ts` → `tailor(input): Promise<ModelOutput>`, so an API-key implementation can swap in behind the same signature with no other file touched.
NFR9: The system runs as one process on localhost via `pnpm dev`, with route handlers on the Node runtime. Nothing listens on a public interface.
NFR10: The queue must populate instantly — the pre-tailoring score is local tag overlap only, never a model call.
NFR11: Tag extraction is pure and deterministic: the same text plus the same canon plus the same alias map yields the same set, always.
NFR12: The review preview pane and the PDF template must be the same component. If they diverge the preview stops being trustworthy and the design premise collapses.
NFR13: `requireTextLayer` is non-negotiable — a rasterized PDF is invisible to every ATS.
NFR14: Tailoring progress is real — steps, elapsed, per-step durations. Never a spinner.
NFR15: Every run is kept, including rejected ones; the fabrication log is signal about the prompt.
NFR16: `rejections.log` is append-only and reserved for Outcome A alone. Operational failures go to stderr, never to that file.
NFR17: The three diff kinds must be separable without relying on color — gutter glyph, weight, strikethrough, and left-rule style carry the distinction, with color as reinforcement only.
NFR18: Desktop, wide viewport only. No responsive layouts, by design.
NFR19: Motion is limited to `tk-in`, `tk-blink`, and the 400ms progress-bar transition, all disabled under `prefers-reduced-motion: reduce`.
NFR20: Visible keyboard focus everywhere (`:focus-visible` 2px accent ring at 2px offset), real hover and active states on every control, and an accent `::selection` tint.
NFR21: The accent-to-ground pair is tuned to 3:1 — enough for chrome and large text, not for body copy. Paragraph-size text in the accent uses `--color-accent-700`.
NFR22: Design tokens are ported from the Modernist token source into `app/globals.css` as CSS custom properties; components hard-code no hex values.
NFR23: Only one tailoring run is in flight at a time — two runs would contend for a headed Chromium and a CLI model subprocess.
NFR24: Model invocation is isolated from the project's own agent configuration, so the same posting yields the same tailoring regardless of unrelated repository state.
NFR25: Every UI reference to `resume.base.yaml` is renamed to `resume.canon.json` — the empty state, the fabrication modal, and the blocked-metric banner all mention it.
NFR26: Where the build spec and the design README disagree, the build spec governs architecture, data contracts, validation, filenames, and data shapes; the design README governs visuals, copy, layout, and interaction.
NFR27: The prototype's mock employers (`Sanctum Labs`, `Northbound`) and its Foundry-test-suite bullet are invented and untrue — local UI development only, never seeded into canon.
NFR28: A tailoring run is expected to take 10–30 seconds; the run screen shows an `est. 22s` alongside real elapsed time.
NFR29: Copy voice is plain, terse, technical, sentence case, active verbs. Actions keep their name through the whole flow. Errors state what happened and what to do — no apologies, no vagueness.

### Additional Requirements

**Starter template: none.** The Architecture specifies no starter or greenfield template. This is a greenfield build with an explicitly pinned stack, so Epic 1 Story 1 is a manual scaffold against the pinned versions below, not a template instantiation.

- **Pinned stack (all versions verified against the live npm registry at architecture time):** Node.js 24.19.0 LTS, Next.js (App Router) 16.3.0, React 19.2.8, TypeScript 5.9.3, Drizzle ORM 0.45.2, drizzle-kit 0.31.10, better-sqlite3 13.0.3, Playwright 1.62.1, Zustand 5.0.14, Zod 4.4.3, pnpm 11.21.0, Claude Code CLI 2.1.229.
- **Two pins carry a reason and must not be casually bumped:** Node is pinned because `better-sqlite3@13` declares a hard `node >= 22` floor; TypeScript stays on 5.9 because 7.0 ships no JavaScript compiler API and Next.js can only reach it through an experimental `tsc`-CLI path.
- **AD-1 — The domain core has no outward imports.** No file under `core/` may import from `app/`, `adapters/`, `next/*`, `drizzle-orm`, `playwright`, or any Node built-in.
- **AD-2 — Five port families**, each a core-defined interface: `BoardPort` (`fetchJobs`), `AtsPort` (`fill`), `ModelPort` (`tailor`), `RenderPort`, `RepositoryPort`. Adapters are selected in the route handler, never inside the core.
- **AD-3 — A tailoring run is a background job with polled step state.** The start endpoint returns a `runId` immediately; the client polls and never holds an open stream.
- **AD-4 — The six run steps are the literal pipeline stages**, each a discrete filter function with typed input and output, executed by one runner that records timing and short-circuits. The set of six is a fixed contract, not a growable list.
- **AD-5 — Four run outcomes (A fabrication, B overclaim, C blocked render, D could-not-complete).** `runs.outcome` is exactly one of `rejected | failed | completed`, written once. B and C are resolvable states recomputed on read, never cached in `runs.outcome`.
- **AD-6 — Shape validation precedes semantic validation.**
- **AD-7 — The overclaim checks are one isomorphic module** under `core/` with no `fs`, no database, and no Node built-ins, plus a client canon projection carrying the whole corpus both checks range over.
- **AD-8 — One canon gateway**, atomic writes, always backed up. It normalizes canon's unfilled-field sentinel to absent for scalar `basics` fields only — never for bullet `text`, whose placeholder token CAP-6 requires showing verbatim.
- **AD-9 — `ResumeDocument` is pure, and its props come from one builder** whose input is a single named type carrying `basics`, role company/position/dates, education, and skills. This projection is distinct from AD-7's checks projection; both are declared once.
- **AD-10 — One render-readiness gate** returning a list of blockers.
- **AD-11 — One tag extractor**, over canon's own closed vocabulary, called by both the queue scorer and the closest-match matcher. Makes no model call.
- **AD-12 — Zustand owns the working copy, never the server's data.**
- **AD-13 — One error envelope.** Adapters throw typed errors carrying a stable code; only the composition root formats a response. Nothing under `core/` throws an HTTP-shaped error.
- **AD-14 — Idempotent bootstrap, versioned migrations.** Schema is never synchronized by push.
- **AD-15 — One tailoring run in flight at a time**, with the lock held in the database.
- **AD-16 — Every cross-unit type is declared once, in the core**, as a named schema with its inferred TypeScript type. Covers at minimum: `ModelOutput`, the two canon projections, the props-builder input, the run/step polling response, the readiness-blocker list, the queue row, the error envelope, and `boards.json`.
- **AD-17 — One owner for every posting state transition.**
- **AD-18 — The PDF is rendered from what was approved.**
- **AD-19 — Model invocation is isolated from the project's own agent configuration** via an explicit working directory outside the project.
- **New table `run_steps`** — `id, run_id, ordinal (1-6), slug, started_at, ended_at, detail, status`. `slug` is identity, `ordinal` is display order only, `status` is `pending | running | done | failed`, and duration is derived from timestamps, never stored.
- **Existing tables** `postings`, `runs`, `diff_items`, `answers` per the SPEC data model.
- **Source tree** — `core/` (ports, canon, pipeline, validation, diff, scoring, gates), `adapters/` (boards, ats, model, render, db), `app/` (api, screens, globals.css), `components/resume-document/`, `data/` (gitignored), `out/`, `boards.json`.
- **Files on disk** — `./data/resume.canon.json`, `./data/tailor.db`, `./data/rejections.log`, `./data/tag-aliases.json`, `./boards.json`, `./out/{id}.pdf`.
- **Naming conventions** — singular domain nouns for entities (`Posting`, `Run`, `DiffItem`, `Answer`, `CanonBullet`, `RunStep`) with plural snake_case tables; `kebab-case.ts` files; adapters named for their vendor; ports named for the capability not the vendor.
- **Identifiers** — canon bullet ids are stable strings and the only thing the model may cite; database ids are integer primary keys; a posting's external identity is the pair `(source, external_id)`.
- **Dates** — ISO 8601 strings in canon and at every boundary; timestamps stored as ISO 8601 text; canon's `endDate: null` means current.
- **Tag alias map** at `./data/tag-aliases.json`, shape `{ "<canon-tag>": ["<variant>", …] }`, hand-maintained; an alias for a tag outside the vocabulary is ignored.
- **Deferred, do not build:** the 30-minute board scan timer, multi-run concurrency, batch tailoring, board/ATS coverage beyond the four named vendors, an alternative model transport, TypeScript 7, auth, deployment, containers, CI, multi-user, mobile, and observability beyond the fabrication log and stderr.

### UX Design Requirements

**Design system port**

UX-DR1: Port `_ds/modernist-*/styles.css` `:root` into `app/globals.css` as CSS custom properties — color roles with their 100–900 OKLCH tonal ramps, `--space-1..8` (4/8/12/16/24/32px), `--radius-*` (all 0), `--shadow-sm/md/lg`, `--font-heading`/`--font-body`. Do not port `support.js`.
UX-DR2: Load Archivo at weights 400, 600, and 800 via Google Fonts.
UX-DR3: Implement the app's own dense type scale, deliberately smaller than the design system's demo scale — app/screen title Archivo 800 30px `-0.03em`; panel title 800 22px `-0.03em`; diff proposed text 15.5px/1.42 weight 600 (kept bullets weight 400); diff original text 14px/1.45 `neutral-600` with a 1px `neutral-400` line-through; body and table cells 13.5–14px; rationale 12.5px/1.45 `neutral-700`; micro-labels 10–11.5px uppercase `.06–.14em` Archivo 800; rendered resume 10.5–11px body with a 23px name; `font-variant-numeric: tabular-nums` on all scores, dates, and timers.
UX-DR4: Port the design system's component classes rather than inventing parallel ones — `.btn` (`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon`, `.btn-block`), `.tag` (`.tag-accent`, `.tag-neutral`, `.tag-outline`), `.field`/`.input`/`.radio`/`.seg`, `.card` (+ `.elev-*`), `.nav`/`.nav-brand`, `.table`, `.dialog-backdrop`/`.dialog`, `.hr`.
UX-DR5: Implement themed interaction states, never browser defaults — a `:hover` tint and a pressed state from the accent ramp on every interactive element, `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`, an accent `::selection` tint, and disabled controls at 45% opacity.
UX-DR6: Enforce the system's structural rules — zero corner radius anywhere, flush-left everything including labels inside wide buttons, strong 2px dividers between major sections, and never soften a rule into a hairline or drop it for whitespace.
UX-DR7: Use the accent sparingly — primary action and small emphasis only. Paragraph-size accent text uses `--color-accent-700`, never the raw accent.
UX-DR8: Every glyph is a text character (`−`, `+`, `✓`, `›`, `·`, `!`, `←`). No images, no icon fonts. Lucide only if icons are later wanted.

**Global chrome**

UX-DR9: Build the sticky 39px top bar — brand `tailor` (Archivo 800 16px), a 1px vertical divider, live state counts (`N discovered / tailored / approved / submitted`, 11px uppercase), and right-aligned `watching N boards`. **The prototype's top-right `jump` select is not shipped.**

**Queue screen**

UX-DR10: Lay out the queue with 16px page padding, a title row (`Queue` + subtitle + right-aligned sort select and `Scan boards` button), then the filter strip, optional bulk bar, and table.
UX-DR11: Build the filter strip as 6 chips in one 1px-bordered box, each with `border-right: 1px solid divider`, 6px/12px padding, Archivo 800 11.5px uppercase `.06em`, `white-space: nowrap`, label plus count at 55% opacity; the active chip is `background: --color-text; color: --color-bg`.
UX-DR12: Build the queue table at 13.5px with column widths — checkbox 28px, Company/role flexible, Location 150px, Source 100px uppercase 12px, Found 88px, Match 120px, State 104px, actions 150px. Company renders Archivo 800, then a `neutral-500` slash, then the role at regular weight.
UX-DR13: Build the Match cell as an Archivo 800 tabular score in a 26px-wide slot plus a 6px-tall bar on a `neutral-300` track, filled `--color-accent` at score ≥ 80 and `neutral-700` below, with width set to the score percentage.
UX-DR14: Render the State cell with `.tag` variants — Tailored `tag-accent`, Approved `tag-outline`, everything else `tag-neutral` — overridden to Archivo 800 10.5px uppercase `.08em`.
UX-DR15: Implement row states — the cursor row gets `box-shadow: inset 3px 0 0 --color-accent` plus a 5% ink tint; `Skipped` and `Submitted` rows drop to 50% opacity; hover tint comes from `.table`. The whole row is clickable, with the checkbox and buttons stopping propagation.
UX-DR16: Build the bulk bar as a full-width ink bar (`background: --color-text; color: --color-bg`) carrying `N selected`, `Skip selected` (outlined in the bg color), and `Clear`, animating in with `tk-in`.
UX-DR17: Place a keyboard legend under the table — `j / k` move, `o` open, `x` select, `s` skip, `t` tailor.
UX-DR18: Build the empty state as a single 2px-bordered block at 28px/24px padding in two columns (`420px | 1fr`, 40px gap) — left holds `Nothing discovered yet` (24px), an explanatory paragraph naming the four supported board types, an inline `.input` plus `Add board` primary button, and a line about importing a list from a file; right holds a `Suggested from your resume tags` label with wrapped `+ Company` secondary buttons, a rule, then the canon source summary. **Its copy must not mention a 30-minute scan** (the build spec overrides design-owned copy at this one point) and must reference `resume.canon.json`.

**Tailoring screen**

UX-DR19: Build the tailoring card as a 2px ink-bordered white card at max-width 1180px, with a header reading `Tailoring — {company} / {role}` and right-aligned tabular `{n}s elapsed · est. 22s`.
UX-DR20: Lay the body out as a `1fr | 320px` grid — left holds the step list, right holds `Matched so far`.
UX-DR21: Build each step row on a `22px | 1fr | auto` grid with a 1px rule between rows, using marks `✓` done (ink), `›` active (accent, `tk-blink` 1s infinite), `·` pending (`neutral-400`), and a right column showing each completed step's real duration or `running` for the active one.
UX-DR22: Place an 8px progress bar on a `neutral-300` track with an accent fill and a 400ms ease `width` transition below the step list.
UX-DR23: Append matched requirements into the right pane as steps complete, each animating in with `tk-in`.
UX-DR24: Close the card with a footer above a 2px rule carrying `Cancel` and the note that the run is local and nothing is submitted.

**Review screen**

UX-DR25: Build the action bar sticky at `top: 39px` under a 1px rule, carrying `← Queue`, company (Archivo 800 17px), role, `SOURCE · LOCATION` (12px uppercase `neutral-600`), and `MATCH {n}` (tabular 15px); right-aligned, a pending-status line, `Skip job` with a dimmed `s` hint, and `Approve and hand off` (primary, dimmed `a` hint) which drops to `:disabled` styling whenever anything is unresolved.
UX-DR26: Lay the review out as a `23fr | 42fr | 35fr` column grid at `min-height: calc(100vh - 78px)` with 2px dividers between columns, each pane scrolling in its own right and no page-level horizontal scroll.
UX-DR27: Build the left pane's two tabs (JD / Answers) flush-left and filling the width in Archivo 800 11px uppercase, with the active tab ink-filled and its text inverted.
UX-DR28: Build the JD tab with a header line (`{date} · {n} words`) plus a `hide matches` / `show matches` ghost toggle in `accent-700`, then headings (Archivo 800 11px uppercase `.1em`) over 13px/1.5 paragraphs.
UX-DR29: Mark matched JD requirements in place with `background: accent-200`, `box-shadow: inset 0 -2px 0 accent`, weight 600, and `title="Matched to your experience"`.
UX-DR30: Build the Answers tab with an 11.5px note line, then three `.field`s — Work authorization (input), Notice period (input), Why this company (textarea, min-height 150px, 13px/1.5) — each carrying its own note line.
UX-DR31: Build the diff pane as a white (`#fff`) paper field against the `#f3f2f2` app ground, with a 2px ink rule under a sticky header reading `Proposed changes` and right-aligned counts `N reworded / N kept / N dropped`.
UX-DR32: When any change is flagged, show a full-width accent bar (`background: accent; color: bg`) reading `N FLAGGED · Reads beyond your source data. Resolve before approving.` with a `Go to it` action that smooth-scrolls to the item at a 140px offset.
UX-DR33: Build each diff item as a block with a 1px bottom rule and a meta row carrying the section (`{Company} · {years}`, Archivo 800 10px uppercase), the kind label (10px uppercase `neutral-500`), and right-aligned inline actions.
UX-DR34: Implement the four diff treatments so the kinds are separable without color — **Reworded**: gutter `−` then `+` (Archivo 800 15px), old text struck in `neutral-600`, new text 15.5px weight 600 ink, `3px solid --color-text` left rule, kind label `reworded by model` / `reworded, edited by you` / `reverted to original`. **Selected, unchanged**: gutter `+` only, 15.5px weight 400 ink, `3px solid neutral-400` left rule, label `selected, unchanged`. **Dropped**: gutter `−` only in `neutral-500`, struck text with the block at 72% opacity, `3px dashed neutral-400` left rule, label `dropped from base resume`. **Flagged**: gutter `+` in accent, treated as reworded, `3px solid --color-accent` left rule, plus a full-bleed `accent-100` row tint.
UX-DR35: Implement the overclaim treatment — tint the flagged item's row `accent-100` and bleed it to the pane edges (`margin: 0 -18px; padding: 0 18px`), with an accent-filled band above the text carrying `OVERCLAIM` (Archivo 800 11.5px uppercase `.14em`) and the one sentence naming exactly what has no source.
UX-DR36: Build the proposed text as an auto-sizing borderless textarea with no edit mode, measuring height from layout (`height: auto` then `scrollHeight`) on mount, on update, on input, on font load, and on window resize. **Never estimate height from character count** — the reviewer must see the whole bullet.
UX-DR37: Place a 10.5px uppercase meta line under the text reading `model text · N words` / `your text · N words` / `unchanged from source · N words` / `original text · model rewrite discarded`.
UX-DR38: Build the rationale as a 12.5px line indented past the gutter behind a 1px `neutral-300` left rule, with a `WHY` label in Archivo 800 9.5px `accent-700`. Shown always by default, with an optional per-item `why this changed` / `hide why` toggle.
UX-DR39: Provide item actions — `revert to original` / `restore rewrite` on reworded items (also clearing any user edit), and `keep this bullet` / `drop again` on dropped items.
UX-DR40: Build the right resume pane on `--color-surface` with a header reading `Tailored resume — as it will submit` and `out/{id}.pdf · N page`, the document rendering on white with `--shadow-md` at 38px/34px padding.
UX-DR41: Render the resume document at real document proportions — name Archivo 800 23px `-0.03em`, contact line 10.5px, a 2px ink rule, then sections with 9.5px uppercase `.14em` headers over a 1px `neutral-400` rule, org in Archivo 800 11.5px with right-aligned tabular dates, an italic role line, and `—` bullets at 10.5px/1.45. Bullets are driven live from the current diff text.
UX-DR42: Place a dashed page boundary at the document's bottom edge with `page 1 of 1 · letter` and `N% of page used` beneath it.

**Blocked-metric state**

UX-DR43: Build the blocked banner spanning the content with `background: accent-200` and `border-bottom: 2px solid accent-700`, carrying `RENDER BLOCKED` (Archivo 800 12px uppercase `accent-800`) plus the sentence naming the specific incomplete field, with `Fill metric` (primary) and `Drop bullet` (secondary, `accent-700` border and text).
UX-DR44: When blocked, replace the resume document with a 2px `accent-700` box on `accent-100` reading `NO RENDER`, naming which bullet and which field is empty, and showing `Last good render: {timestamp}`.

**Fabrication modal**

UX-DR45: Build the fabrication modal over a 55% `neutral-900` scrim at 760px max-width with `--shadow-lg`, a 2px accent border, and `tk-in` entry.
UX-DR46: Give it an accent-filled header reading `TAILORING REJECTED — FABRICATED CLAIM` (11.5px uppercase `.14em`) over `{company} / {role} — nothing was written to your resume` (Archivo 800 23px).
UX-DR47: Build its body with a `Rejected bullet` label over the bullet at 14.5px weight 600 behind a 4px accent left rule, then a two-cell bordered grid holding **Why it failed** and **Closest real experience**.
UX-DR48: Give it actions `Re-run without this claim` (primary), `Open resume.canon.json`, and right-aligned `Leave it untailored`, with a footer reading `Logged to rejections.log · {n}th rejection from this model this week`.
UX-DR49: Behind the modal, the step list shows step 5 with a `!` mark and `rejected`.

**Handoff screen**

UX-DR50: Build the handoff card at 880px with a 2px ink border on white, its title changing by phase (`Handing off to your browser` → `Did you submit it?` → `Submitted`, or `Manual submission`) with `{company} / {role} · {source}` right-aligned.
UX-DR51: Build the waiting phase with the explanatory sentence and a 4-step list (rendered PDF → opened form → filled fields and attached PDF → **you review and click submit**, the last marked `›` in accent with `tk-blink`), plus `Reopen window`, `Back to queue`, and a right-aligned waiting note.
UX-DR52: Build the confirm phase with the question, `I submitted it` (primary), `I bailed — keep it approved`, `Skip this job`, and the footnote explaining why the app asks rather than guessing.
UX-DR53: Build the done phase with `Marked submitted · {timestamp}`, a line counting tailored applications still waiting, and `Next in queue` / `Back to queue`.
UX-DR54: Build the unsupported state with a 4px accent left rule carrying `NO ADAPTER FOR THIS FORM` and its explanation, then a two-cell bordered grid holding **On disk** (PDF path, page count and render time, `Reveal file` / `Copy answers`) and **Answers to paste** (each answer's short form on its own ruled line), then `I filled it in` (primary) advancing to confirm.

**Cross-screen behavior**

UX-DR55: Build the toast as a bottom-left ink chip (`background: --color-text; color: --color-bg`, 8px/12px, `tk-in`) carrying a message plus `Undo`, auto-dismissing at 4.2s.
UX-DR56: Implement exactly three motions — `tk-in` (opacity plus a 4px rise, 120–150ms ease-out), `tk-blink` (1s infinite, on the active step glyph only), and the 400ms progress-bar width transition — all disabled under `prefers-reduced-motion: reduce`.
UX-DR57: Ignore all keyboard shortcuts while focus is inside an input, textarea, or select. `Esc` returns to the queue from anywhere and also dismisses the fabrication modal.
UX-DR58: Build no responsive layouts. Desktop, wide viewport only, by design.

### FR Coverage Map

Every one of the 94 FRs maps to exactly one epic. No gaps, no duplicates.

**Epic 1 — A running app that renders your real resume**

- FR53: Epic 1 — Render-readiness gate returns a list of blockers
- FR57: Epic 1 — An incomplete contact line is explicitly not a blocker
- FR74: Epic 1 — Preview and PDF are the same `ResumeDocument` component
- FR75: Epic 1 — `ResumeDocument` is a pure function of resolved props
- FR76: Epic 1 — One shared props-builder taking a single named input type
- FR77: Epic 1 — HTML → Playwright → PDF using the installed Chromium
- FR78: Epic 1 — Text-layer assertion, failing loudly
- FR79: Epic 1 — Absent contact fields omitted with no label or separator
- FR92: Epic 1 — Idempotent bootstrap, canon seeded only if absent, versioned migrations
- FR93: Epic 1 — One error envelope across every route handler
- FR94: Epic 1 — `USE_MOCK_DATA` flag, never seeded into canon

**Epic 2 — Postings arrive and can be triaged fast**

- FR1: Epic 2 — Add a board by URL; watched list persists in `boards.json`
- FR2: Epic 2 — Four board adapters behind `fetchJobs(boardUrl)`
- FR3: Epic 2 — On-demand scan via `Scan boards`
- FR4: Epic 2 — HTML stripped to plain text before storing
- FR5: Epic 2 — Dedupe on `(source, external_id)`
- FR6: Epic 2 — Local tag-overlap score at fetch time, no model call
- FR7: Epic 2 — The queue score formula
- FR8: Epic 2 — Matched tags retained for display
- FR9: Epic 2 — Queue table with its eight columns
- FR10: Epic 2 — Six state filter chips with live counts
- FR11: Epic 2 — Sort by match score, date discovered, or company
- FR12: Epic 2 — Full keyboard triage
- FR13: Epic 2 — Row opens by state; action label follows the same mapping
- FR14: Epic 2 — Multi-select and the bulk bar
- FR15: Epic 2 — Bulk skip undo restores individual prior states
- FR16: Epic 2 — Toast with Undo, auto-dismissing at 4.2s
- FR17: Epic 2 — Empty state with board entry and canon summary
- FR90: Epic 2 — Posting state machine behind one event-keyed transition function
- FR91: Epic 2 — No direct state writes, no endpoint accepting a target state

**Epic 3 — A run either produces validated work or is rejected outright**

- FR18: Epic 3 — Run starts as a background job returning `runId` immediately
- FR19: Epic 3 — Six pipeline stages as discrete typed filters
- FR20: Epic 3 — Per-stage timings and detail lines written to `run_steps`
- FR21: Epic 3 — Client polls; never derives progress from its own timer
- FR22: Epic 3 — Real elapsed time and a progress bar, never a spinner
- FR23: Epic 3 — `Matched so far` appends as steps complete
- FR24: Epic 3 — All model access through one `tailor()` function
- FR25: Epic 3 — CLI invoked with a working directory outside the project
- FR26: Epic 3 — System prompt carries canon, `excluded.rules` verbatim, rendering constraints
- FR27: Epic 3 — JSON-only instruction with defensive fence stripping
- FR28: Epic 3 — Every emitted bullet cites a canon `sourceId`
- FR29: Epic 3 — Single-run lock held in the database
- FR30: Epic 3 — Bulk selection drives skip, never tailor
- FR31: Epic 3 — A running run can be cancelled
- FR32: Epic 3 — Shape validation before any semantic check
- FR33: Epic 3 — Shape failure is Outcome D, not Outcome A
- FR34: Epic 3 — Outcome A triggers on a `sourceId` absent from canon
- FR35: Epic 3 — Outcome A persists nothing derived; posting stays `Discovered`
- FR36: Epic 3 — Append to `rejections.log`
- FR37: Epic 3 — The `runs` row and stage timings are kept even on Outcome A
- FR38: Epic 3 — Fabrication modal with rejected bullet and why it failed
- FR39: Epic 3 — Closest-experience ranking by Jaccard overlap with a total tie-break chain
- FR40: Epic 3 — Fallback so the panel is never empty
- FR41: Epic 3 — `Re-run without this claim` appends to the prohibitions
- FR42: Epic 3 — Outcome D records the failing stage, writes no log, demotes nothing

**Epic 4 — Every proposed change is reviewed line by line before anything is approved**

- FR43: Epic 4 — Novel-quantity check
- FR44: Epic 4 — Escalated-verb check with the same-role exemption
- FR45: Epic 4 — Flag sentence names the specific tokens
- FR46: Epic 4 — Flag resolves on edit or revert
- FR47: Epic 4 — Checks re-run on every edit; reintroduction re-flags
- FR48: Epic 4 — Approve disabled while any flag is unresolved
- FR49: Epic 4 — One isomorphic overclaim module; client flag state never trusted
- FR50: Epic 4 — Client receives the whole-corpus canon projection
- FR51: Epic 4 — `needs-number` bullet persists the run and shows the raw token
- FR52: Epic 4 — A selected `needs-content` bullet blocks the same way
- FR54: Epic 4 — Every blocker rendered through one banner
- FR55: Epic 4 — `Fill metric` writes through the single canon write path
- FR56: Epic 4 — `Drop bullet` clears the blocker by the other route
- FR58: Epic 4 — Diff built from the model's mapping, never text-diffed
- FR59: Epic 4 — The three kind mappings
- FR60: Epic 4 — Failing items carry `flagged` and `flagWhy`
- FR61: Epic 4 — Unconsidered canon bullets are absent, not synthesized
- FR62: Epic 4 — Inline editing with no edit mode, updating the resume pane live
- FR63: Epic 4 — Revert and restore-rewrite semantics
- FR64: Epic 4 — `keep this bullet` / `drop again` on dropped items
- FR65: Epic 4 — The `WHY` rationale line
- FR66: Epic 4 — Debounced write-through to `diff_items.user_edit`
- FR67: Epic 4 — Store holds the working copy only, never mirrored server data
- FR68: Epic 4 — JD spans located at render time and marked in place
- FR69: Epic 4 — Non-exact quotes dropped, never fuzzy-matched
- FR70: Epic 4 — Hide/show matches toggle
- FR71: Epic 4 — Three screening answers pre-filled and editable
- FR72: Epic 4 — Answer edits carried into the handoff
- FR73: Epic 4 — Approval covers the answers as well as the diff
- FR80: Epic 4 — PDF re-rendered from the current validated diff on Approve

**Epic 5 — A filled form opens in a real browser and Rico submits it himself**

- FR81: Epic 5 — ATS detected from the posting URL across four vendors
- FR82: Epic 5 — `fill(page, job, pdfPath, answers)` against a headed Chromium
- FR83: Epic 5 — Form opens filled with the PDF attached; no submit control clicked
- FR84: Epic 5 — Undetected ATS returns `unsupported` with path and copyable answers
- FR85: Epic 5 — Adapter refuses a PDF older than the last persisted edit
- FR86: Epic 5 — `waiting → confirm → done`, with `unsupported` rejoining at confirm
- FR87: Epic 5 — `Submitted` only on user confirmation
- FR88: Epic 5 — No attempt to detect a confirmation page
- FR89: Epic 5 — `Next in queue` opens the next `Tailored` posting

## Epic List

### Epic 1: A running app that renders your real resume

Rico can start the app and render his canonical resume to a submittable PDF with a verified text layer.

**FRs covered:** FR53, FR57, FR74, FR75, FR76, FR77, FR78, FR79, FR92, FR93, FR94

**Implementation notes:** Front-loads the substrate every later epic builds on — the scaffold against the pinned stack, the idempotent bootstrap and versioned migrations, all five tables including the new `run_steps`, the single canon gateway with its atomic backed-up write path, the design token port and global chrome, the pure `ResumeDocument` with its shared props-builder, the readiness gate, and the error envelope. Critically it front-loads **AD-16**: every cross-unit type declared once under `core/`. The adversarial review found 16 of its 22 divergence pairs were one failure — owner named, shape unnamed — and that failure only surfaces when later epics are built against unnamed shapes. It also de-risks `requireTextLayer` first, since a rasterized PDF is invisible to every ATS and discovering that in Epic 5 would be expensive. Covers UX-DR1–9, plus UX-DR41 and UX-DR42 — the resume document's own proportions and page boundary belong to `ResumeDocument` itself, which is built here. Styling it here and restyling it in Epic 4 would be exactly the divergence AD-9 and NFR12 exist to prevent.

### Epic 2: Postings arrive and can be triaged fast

Rico can add job boards, scan them on demand, and move through a full queue with the keyboard alone — skipping most postings and opening the few worth tailoring.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR90, FR91

**Implementation notes:** Owns the four board adapters behind `BoardPort`, the single tag extractor over canon's closed vocabulary (AD-11) with its alias map, the queue screen, and the posting state machine (AD-17), first needed here for `scanned`, `skipped`, and `undo`. **Seam into Epic 3:** the state-routing map and every other destination are built here; the `Tailor` destination lands in Epic 3. Epic 2 functions completely without it. Covers UX-DR10–18.

### Epic 3: A run either produces validated work or is rejected outright

Rico can run a posting against his canonical resume, watch real per-step progress, and trust that a run inventing an experience is rejected outright with nothing written to his resume.

**FRs covered:** FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42

**Implementation notes:** Delivers the product's trust premise, and delivers it as the negative case the SPEC names as the proof the system works. Owns the six-stage pipeline and its runner (AD-4), the model adapter with its configuration isolation (AD-19), the database-held single-run lock (AD-15), shape-before-semantic validation (AD-6), Outcomes A and D (AD-5), `rejections.log`, and the fabrication modal with its closest-real-experience panel. **Seam into Epic 4:** a completed run persists a diff that Epic 4 renders, but Epic 3 closes on its own — a run either completes and persists or is rejected with the modal shown. Covers UX-DR19–24 and UX-DR45–49.

### Epic 4: Every proposed change is reviewed line by line before anything is approved

Rico can read every proposed change against its source, resolve overclaim flags in place, edit bullets inline and watch the resume update live, answer the screening questions, and approve — with approval blocked while anything is unresolved.

**FRs covered:** FR43, FR44, FR45, FR46, FR47, FR48, FR49, FR50, FR51, FR52, FR54, FR55, FR56, FR58, FR59, FR60, FR61, FR62, FR63, FR64, FR65, FR66, FR67, FR68, FR69, FR70, FR71, FR72, FR73, FR80

**Implementation notes:** The consolidation epic and the largest — CAP-5, CAP-6, CAP-7, CAP-8, and CAP-9 all live in the same screen, diff pane, and store slice, so they are ordered stories here rather than five epics churning the same files. Owns the three-column review screen, diff construction from the model's own mapping, the isomorphic overclaim module and its whole-corpus client projection (AD-7), inline editing with debounced write-through (AD-12), JD match marking, screening answers, the blocked-metric UI with the single canon write path, and the re-render on Approve (AD-18). **CAP-6 is the one capability deliberately split across epics:** the gate function is Epic 1, its banner, `NO RENDER` pane, and fill-metric write are here. Covers UX-DR25–40, UX-DR43, and UX-DR44 — UX-DR40 is the review pane's wrapper, while the document it wraps is built in Epic 1. **Testing note:** canon contains no `needs-number` or `needs-content` bullet, so FR51, FR52, FR54, FR55, and FR56 must be exercised against purpose-built fixtures.

### Epic 5: A filled form opens in a real browser and Rico submits it himself

Rico gets the application form opened in a real browser with his tailored PDF attached and the answers filled, submits it himself, and confirms afterward so the posting is marked accurately.

**FRs covered:** FR81, FR82, FR83, FR84, FR85, FR86, FR87, FR88, FR89

**Implementation notes:** Owns ATS detection from the posting URL, the four `AtsPort` fill adapters, the stale-PDF refusal (AD-18), and the four handoff phases. The prohibition on clicking a submit control and the refusal to detect a confirmation page are both absolute. Covers UX-DR50–54.

## Epic 1: A running app that renders your real resume

Rico can start the app and render his canonical resume to a submittable PDF with a verified text layer. This epic establishes the substrate every later epic builds on — the pinned stack, the architecture's dependency rule, the canon gateway, the design system, the pure resume document, the readiness gate, and the PDF render path — and de-risks the text-layer requirement before anything depends on it.

### Story 1.1: Run the app on the pinned stack

As a developer building tailor,
I want the project scaffolded on the exact pinned stack with the architecture's directory boundaries mechanically enforced,
So that every later story builds on the same substrate and the domain core cannot silently acquire outward dependencies.

**Acceptance Criteria:**

**Given** a machine with Node 24.19.0 and pnpm 11.21.0
**When** I run `pnpm install` followed by `pnpm dev`
**Then** the app starts as a single process and serves on localhost
**And** no container, external service, or second process is required

**Given** the installed dependency tree
**When** I inspect the resolved versions
**Then** Next.js is 16.3.0, React 19.2.8, TypeScript 5.9.3, Drizzle ORM 0.45.2, drizzle-kit 0.31.10, better-sqlite3 13.0.3, Playwright 1.62.1, Zustand 5.0.14, and Zod 4.4.3
**And** the package manifest declares a Node engine floor of `>= 22` so `better-sqlite3`'s hard requirement is enforced at install time

**Given** the repository
**When** I list the source tree
**Then** `core/`, `adapters/`, `app/`, and `components/` exist as laid out in the architecture's structural seed
**And** `core/` contains `ports/`, `canon/`, `pipeline/`, `validation/`, `diff/`, `scoring/`, and `gates/`

**Given** a file under `core/`
**When** it imports from `app/`, `adapters/`, `next/*`, `drizzle-orm`, `playwright`, or any Node built-in
**Then** the lint or type-check step fails with an error naming the offending import
**And** the failure blocks the build rather than emitting a warning

**Given** the repository
**When** I inspect `.gitignore`
**Then** `./data` and `./out` are both ignored

**Given** any TypeScript file in the project
**When** I run the type-check
**Then** it completes against TypeScript 5.9.3 with no experimental compiler flag enabled

### Story 1.2: Port the Modernist design system

As Rico,
I want the app to carry the Modernist design system's tokens and component classes,
So that every screen built afterwards is visually consistent without any component inventing its own colors, spacing, or focus styling.

**Acceptance Criteria:**

**Given** `app/globals.css`
**When** I inspect its `:root` block
**Then** it declares the color roles with their 100–900 tonal ramps, `--space-1` through `--space-8` at 4/8/12/16/24/32px, `--radius-*` values of 0, `--shadow-sm/md/lg`, and `--font-heading`/`--font-body`
**And** every value matches the corresponding declaration in `_ds/modernist-*/styles.css`

**Given** any component file in the project
**When** I search it for a hex color literal
**Then** none is found, because every color resolves through a `var(--color-*)` reference

**Given** the app running in a browser
**When** any text renders
**Then** it is set in Archivo at weight 400, 600, or 800

**Given** the ported stylesheet
**When** I inspect its component layer
**Then** `.btn` (with `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon`, `.btn-block`), `.tag` (with `.tag-accent`, `.tag-neutral`, `.tag-outline`), `.field`/`.input`/`.radio`/`.seg`, `.card`, `.nav`/`.nav-brand`, `.table`, `.dialog-backdrop`/`.dialog`, and `.hr` are all present

**Given** any interactive element
**When** I focus it with the keyboard
**Then** it shows a 2px solid accent outline at 2px offset
**And** the browser's default focus ring never appears

**Given** any interactive element
**When** I hover or press it
**Then** it shows a themed state drawn from the accent ramp rather than a browser default

**Given** a disabled control
**When** it renders
**Then** it drops to 45% opacity

**Given** any element in the app
**When** I inspect its computed `border-radius`
**Then** it is 0

**Given** a button wider than its own label
**When** it renders
**Then** the label sits flush left at the padding edge rather than centered

**Given** paragraph-size text rendered in the accent
**When** I inspect its computed color
**Then** it uses `--color-accent-700` rather than the raw accent, satisfying the 3:1 pairing

**Given** the design bundle's `support.js`
**When** I search the project for it
**Then** it has not been ported

### Story 1.3: See the app's global chrome

As Rico,
I want a persistent top bar showing my pipeline counts,
So that I can see the state of my applications from any screen without navigating back to the queue.

**Acceptance Criteria:**

**Given** any screen in the app
**When** it renders
**Then** a sticky top bar 39px tall sits at the top of the viewport

**Given** the top bar
**When** it renders
**Then** it shows the brand `tailor` in Archivo 800 at 16px followed by a 1px vertical divider

**Given** the top bar
**When** it renders
**Then** live state counts appear in the form `N discovered / N tailored / N approved / N submitted` at 11px uppercase
**And** `watching N boards` is right-aligned

**Given** no postings exist yet
**When** the top bar renders
**Then** every count reads 0 and the bar renders without error

**Given** the shipped application
**When** I inspect the top bar
**Then** the prototype's top-right `jump` select is absent

### Story 1.4: Get one legible error shape from every endpoint

As a developer building tailor,
I want every route handler to fail with the same error envelope,
So that the client never grows bespoke error handling per endpoint and a failure names the stage it came from.

**Acceptance Criteria:**

**Given** any route handler under `app/api`
**When** it returns an error
**Then** the response body carries a stable machine-readable code, a human-readable message, and the failing stage where one applies
**And** the shape is byte-identical in structure across every endpoint

**Given** the error envelope type
**When** I locate its declaration
**Then** it is declared exactly once under `core/` as a named schema with an inferred TypeScript type

**Given** an adapter that fails
**When** the failure propagates outward
**Then** the adapter throws a typed error carrying a stable code
**And** only the composition root under `app/api` translates it into the response envelope

**Given** any module under `core/`
**When** I inspect its error handling
**Then** it throws no HTTP-shaped error and sets no status code

**Given** any cross-unit type introduced by a later story
**When** it is declared
**Then** it is declared once under `core/` as a named schema with its inferred type
**And** no other unit restates or structurally duplicates it

### Story 1.5: Start the app on a clean machine and have it set itself up

As Rico,
I want the app to create everything it needs on first run and change nothing on later runs,
So that I can start it on a clean machine and restart it freely without ever risking my canonical resume.

**Acceptance Criteria:**

**Given** a machine with no `./data` directory
**When** the app starts
**Then** `./data` is created
**And** `resume.canon.json` is seeded into it from the input seed
**And** `boards.json` is created with its documented shape
**And** versioned migrations are applied

**Given** `./data/resume.canon.json` already exists carrying my own edits
**When** the app starts again
**Then** the existing file is left byte-for-byte untouched
**And** no seed is written over it

**Given** the app has already started successfully at least once
**When** I start it repeatedly
**Then** every run completes without error and without modifying any existing file

**Given** the migration mechanism
**When** I inspect how schema is applied
**Then** it applies versioned Drizzle migration files
**And** the project contains no schema-push path that could converge by dropping a column or a table

**Given** this story's scope
**When** I inspect the migrations directory
**Then** it holds the migration mechanism with no content tables yet
**And** `postings`, `runs`, `run_steps`, `diff_items`, and `answers` are each created later by the story that first needs them

### Story 1.6: Read the canonical resume through a single gateway

As Rico,
I want exactly one module in the codebase to open my canonical resume,
So that no part of the app can invent its own parsing rules or reach the file that holds everything true about me.

**Acceptance Criteria:**

**Given** the codebase
**When** I search for code that opens `./data/resume.canon.json`
**Then** exactly one module does so

**Given** the canon gateway
**When** two operations read canon in sequence
**Then** each re-parses the file from disk
**And** no cache or invalidation logic exists anywhere in the module

**Given** a scalar field under `basics` carrying canon's unfilled-field sentinel
**When** canon is read through the gateway
**Then** that field is normalized to absent before any downstream module observes it

**Given** a bullet whose `text` contains a placeholder token
**When** canon is read through the gateway
**Then** the token is returned verbatim
**And** it is never normalized, stripped, or substituted

**Given** the canon gateway within this story's scope
**When** I inspect its exported surface
**Then** it exposes read operations only
**And** the single `needs-number` write path is absent until Epic 4 introduces it

**Given** any module outside the gateway
**When** it needs canon data
**Then** it obtains that data from the gateway and never opens the file itself

### Story 1.7: See the canonical resume rendered as a document

As Rico,
I want to see my canonical resume rendered as a real document,
So that I know exactly what a submitted resume looks like before any tailoring is involved.

**Acceptance Criteria:**

**Given** the app is running
**When** I open the resume view
**Then** my canonical resume renders as a document at real document proportions

**Given** the `ResumeDocument` component
**When** I inspect its implementation
**Then** it uses no hooks, no store access, and no client-only APIs
**And** it is a pure function of fully-resolved props

**Given** the props `ResumeDocument` receives
**When** I trace where they are built
**Then** they are built by exactly one shared props-builder
**And** that builder's input is a single named type declared once under `core/`, carrying `basics`, role company/position/dates, education, and skills

**Given** the rendered document
**When** I inspect its typography
**Then** the name is Archivo 800 at 23px with `-0.03em`, the contact line is 10.5px, a 2px ink rule follows, section headers are 9.5px uppercase at `.14em` over a 1px `neutral-400` rule, org lines are Archivo 800 11.5px with right-aligned tabular dates above an italic role line, and bullets are 10.5px/1.45 preceded by an em dash

**Given** `basics.phone` carries no real value
**When** the document renders
**Then** the phone is omitted entirely with no label and no separator
**And** the contact line reads cleanly with email and GitHub only, carrying no dangling punctuation

**Given** `basics.phone` carries the literal string `TODO`
**When** the document renders
**Then** `TODO` appears nowhere in the output

**Given** the rendered document
**When** I look at its bottom edge
**Then** a dashed page boundary is drawn
**And** `page 1 of 1 · letter` and the percentage of the page used appear beneath it

### Story 1.8: Have a render blocked when a claim is incomplete

As Rico,
I want the app to refuse to render a resume that contains an incomplete claim,
So that an unfilled placeholder or an unwritten bullet can never reach a PDF I submit.

**Acceptance Criteria:**

**Given** a fixture canon in which a selected bullet carries `status: "needs-number"` with an unfilled placeholder
**When** the readiness gate runs
**Then** it returns a blocker naming that specific bullet and that specific field

**Given** a fixture canon in which a selected bullet carries `status: "needs-content"`
**When** the readiness gate runs
**Then** it returns a blocker naming that bullet

**Given** a case carrying more than one incomplete claim
**When** the readiness gate runs
**Then** it returns every blocking reason in a single list
**And** it does not stop at the first one found

**Given** a canon in which `basics.phone` holds no real value and no selected bullet carries a `status`
**When** the readiness gate runs
**Then** it returns an empty blocker list
**And** the incomplete contact line is not reported as a blocker

**Given** the readiness gate
**When** I locate its implementation
**Then** it is a single function under `core/`
**And** its returned blocker-list type is declared once under `core/`

**Given** a non-empty blocker list
**When** a render is attempted
**Then** the render does not proceed

**Given** that canon as currently seeded contains no `needs-number` and no `needs-content` bullet
**When** this story's tests run
**Then** both blocking paths are exercised against purpose-built fixtures rather than against real canon
**And** the tests would fail if the gate stopped detecting either condition

### Story 1.9: Export the resume as a PDF with a verified text layer

As Rico,
I want to export my resume as a PDF whose text an ATS can actually extract,
So that an application I submit is machine-readable rather than an invisible image.

**Acceptance Criteria:**

**Given** the resume renders on screen
**When** I export it as a PDF
**Then** the PDF is produced by rendering the same `ResumeDocument` component through Playwright's Chromium
**And** no second resume template exists anywhere in the codebase

**Given** a generated PDF
**When** the render step completes
**Then** the system asserts that the PDF carries an extractable text layer

**Given** a PDF generated without an extractable text layer
**When** the assertion runs
**Then** the render fails loudly with an error naming the missing text layer
**And** no PDF path is returned as though the render had succeeded

**Given** a successful export
**When** I inspect the output location
**Then** the PDF is written under `./out`

**Given** the PDF rendering capability
**When** I trace how it is invoked
**Then** it sits behind a core-defined `RenderPort` interface
**And** the concrete adapter is selected in the route handler, never inside `core/`

**Given** a readiness gate returning a non-empty blocker list
**When** a PDF export is attempted
**Then** the export is refused
**And** the blockers are returned to the caller

### Story 1.10: Develop the UI against mock data without touching canon

As a developer building tailor,
I want a flag that swaps in mock content for local UI work,
So that I can build screens against realistic data without that invented content ever reaching my canonical resume.

**Acceptance Criteria:**

**Given** `USE_MOCK_DATA` is enabled
**When** the app runs
**Then** mock postings and mock resume content are available to the UI

**Given** `USE_MOCK_DATA` is disabled or unset
**When** the app runs
**Then** no mock content is reachable from any screen

**Given** the mock dataset
**When** I inspect its contents
**Then** the invented employers `Sanctum Labs` and `Northbound` and the invented Foundry test-suite bullet exist only there

**Given** any code path that seeds or writes `resume.canon.json`
**When** I trace what it is able to write
**Then** no mock content can reach it under any setting of the flag

**Given** the seeded `./data/resume.canon.json`
**When** I search it for mock content
**Then** none is present

## Epic 2: Postings arrive and can be triaged fast

Rico can add job boards, scan them on demand, and move through a full queue with the keyboard alone — skipping most postings and opening the few worth tailoring. Every posting arrives already scored against his own experience, computed locally so the queue populates instantly.

### Story 2.1: Add a job board so the app knows where to look

As Rico,
I want to add a job board by URL from the very first screen,
So that the app has somewhere to look before I have discovered anything at all.

**Acceptance Criteria:**

**Given** no postings exist
**When** I open the app
**Then** the queue shows its empty state
**And** the filter strip, the table, and the keyboard legend are all hidden
**And** the subtitle reads `No postings yet · 0 boards watched`

**Given** the empty state
**When** it renders
**Then** it is a single 2px-bordered block at 28px/24px padding laid out in two columns of `420px | 1fr` with a 40px gap

**Given** the empty state's left column
**When** it renders
**Then** it shows `Nothing discovered yet` at 24px, a paragraph naming the four supported board types, an inline `.input` beside an `Add board` primary button, and a line about importing a list from a file

**Given** the empty state's copy
**When** I read it in full
**Then** it makes no mention of a 30-minute scan or any automatic scanning interval

**Given** the empty state's right column
**When** it renders
**Then** it shows a `Suggested from your resume tags` label above wrapped `+ Company` secondary buttons, then a rule, then the canon source summary

**Given** any UI copy naming the source resume
**When** it renders
**Then** it reads `resume.canon.json`
**And** the string `resume.base.yaml` appears nowhere in the app

**Given** I enter a board URL and activate `Add board`
**When** the action completes
**Then** the board is written to `boards.json`
**And** the watched-board count in the top bar increases

**Given** `boards.json`
**When** I inspect its shape
**Then** it stores each watched board as a type plus its token or URL
**And** that shape is declared once under `core/` as a named schema

**Given** a board I have already added
**When** I add it a second time
**Then** it is not duplicated in `boards.json`

**Given** a board URL matching none of the four supported types
**When** I try to add it
**Then** the app rejects it with a message naming the four supported types
**And** nothing is written to `boards.json`

**Given** a board is added successfully
**When** the action completes
**Then** a toast appears bottom-left as an ink chip at 8px/12px padding, entering with `tk-in`
**And** it auto-dismisses after 4.2 seconds

### Story 2.2: Scan a Greenhouse board and have its postings stored

As Rico,
I want to scan a watched Greenhouse board on demand,
So that real postings land in the app without my entering any of them by hand.

**Acceptance Criteria:**

**Given** a watched Greenhouse board
**When** I activate `Scan boards`
**Then** the app fetches `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`
**And** no authentication and no browser are involved

**Given** a fetched posting
**When** it is stored
**Then** its description is plain text with all HTML stripped

**Given** a posting already stored by an earlier scan
**When** I rescan the same board
**Then** no duplicate row is created
**And** dedupe is keyed on the pair `(source, external_id)`

**Given** a scan completes
**When** I look at the top bar
**Then** the discovered count reflects the number of postings now stored

**Given** the board-fetching capability
**When** I trace how it is invoked
**Then** it sits behind a core-defined `BoardPort` interface exporting `fetchJobs(boardUrl)`
**And** the concrete adapter is selected in the route handler rather than inside `core/`

**Given** the `postings` table
**When** I inspect the migration that creates it
**Then** it carries `id`, `source`, `external_id`, `company`, `role`, `location`, `url`, `description`, `found_at`, `score`, and `state`
**And** that migration is introduced by this story, not by an earlier one

**Given** a newly stored posting
**When** I inspect its state
**Then** it is `Discovered`

**Given** any change to a posting's state
**When** I trace the code performing it
**Then** it goes through a single core transition function taking the current state and a named event
**And** this story introduces the `scanned` event

**Given** any route handler in the project
**When** I inspect it
**Then** it never writes `postings.state` directly
**And** it never accepts a target state as an input parameter

**Given** a board that errors or an unreachable host
**When** the scan runs
**Then** the failure is returned in the standard error envelope
**And** postings stored by earlier scans are left unchanged

### Story 2.3: Scan Lever, Ashby, and Workable boards

As Rico,
I want the other three board types scanned the same way,
So that every board I watch is covered regardless of which vendor a company happens to use.

**Acceptance Criteria:**

**Given** a watched Lever board
**When** I scan
**Then** the app fetches `api.lever.co/v0/postings/{token}?mode=json`

**Given** a watched Ashby board
**When** I scan
**Then** the app fetches `api.ashbyhq.com/posting-api/job-board/{token}`

**Given** a watched Workable board
**When** I scan
**Then** the app fetches `apply.workable.com/api/v1/widget/accounts/{token}?details=true`

**Given** each of the three adapters
**When** I inspect its implementation
**Then** it implements the same `BoardPort` interface as Greenhouse
**And** it lives at `adapters/boards/{vendor}.ts`

**Given** a posting from any of the three
**When** it is stored
**Then** its description is plain text
**And** it is deduped on `(source, external_id)` exactly as a Greenhouse posting is

**Given** watched boards of all four types
**When** I activate `Scan boards` once
**Then** postings from every type populate the queue in that single scan

**Given** one board type fails while the others succeed
**When** the scan completes
**Then** postings from the succeeding boards are stored
**And** the failure is reported without discarding them

### Story 2.4: See how well each posting matches my experience

As Rico,
I want each posting scored against my own experience the moment it arrives,
So that I can tell at a glance which postings are worth opening.

**Acceptance Criteria:**

**Given** canon
**When** the tag vocabulary is derived
**Then** it is the union of `work[].bullets[].tags[]`, `basics.summaries[].tags[]`, and `skills[].items[]`
**And** no term outside that set can contribute to any score

**Given** text to extract tags from
**When** extraction runs
**Then** it case-folds, trims, strips surrounding punctuation, and collapses internal whitespace before matching
**And** it matches vocabulary terms and aliases at word boundaries rather than as substrings

**Given** a multi-word alias
**When** extraction runs
**Then** phrases match longest-first, so `smart contracts` wins over `contracts`

**Given** `./data/tag-aliases.json`
**When** it is read
**Then** each alias resolves to its canon tag
**And** an alias naming a tag outside the vocabulary is ignored rather than added

**Given** the same text, the same canon, and the same alias map
**When** extraction runs repeatedly
**Then** it returns an identical tag set every time

**Given** a posting
**When** its score is computed
**Then** `score = round(100 × min(1, raw / CAP))`, where `raw` sums each matched tag's maximum canon weight with a 1.5× multiplier for tags found in the title, and `CAP` is the sum of the six highest tag weights in the vocabulary

**Given** a scan
**When** postings are stored
**Then** each row's score is computed and persisted at fetch time
**And** no model call occurs anywhere in that path

**Given** a scored posting
**When** I inspect what was retained alongside the number
**Then** the matched tags themselves are available for display

**Given** the tag extractor
**When** I locate its implementation
**Then** exactly one module under `core/` performs extraction
**And** it is the same module the fabrication modal's closest-match panel will call in Epic 3

**Given** a posting whose text matches no vocabulary term at all
**When** it is scored
**Then** it receives a score of 0 and is stored normally

### Story 2.5: Read the queue as a dense table

As Rico,
I want the queue rendered as one dense table,
So that I can take in twenty postings at once instead of scrolling through cards.

**Acceptance Criteria:**

**Given** postings exist
**When** the queue renders
**Then** a table at 13.5px shows columns for a selection checkbox (28px), company/role, location (150px), source (100px, uppercase 12px), found (88px), match (120px), state (104px), and actions (150px)

**Given** a row
**When** its company and role render
**Then** the company is Archivo 800, followed by a `neutral-500` slash, followed by the role at regular weight

**Given** a row's match cell
**When** it renders
**Then** the score is Archivo 800 tabular in a 26px-wide slot beside a 6px-tall bar on a `neutral-300` track
**And** the bar's width equals the score percentage

**Given** a posting scoring 80 or above
**When** its match bar renders
**Then** the fill is `--color-accent`

**Given** a posting scoring below 80
**When** its match bar renders
**Then** the fill is `neutral-700`

**Given** a row's state cell
**When** it renders
**Then** it uses `.tag` variants — `tag-accent` for Tailored, `tag-outline` for Approved, `tag-neutral` otherwise — overridden to Archivo 800 10.5px uppercase at `.08em`

**Given** the row under the keyboard cursor
**When** it renders
**Then** it carries `box-shadow: inset 3px 0 0 --color-accent` plus a 5% ink tint

**Given** a row in state `Skipped` or `Submitted`
**When** it renders
**Then** the whole row drops to 50% opacity

**Given** the queue page
**When** it renders
**Then** it has 16px padding and a title row carrying `Queue`, a subtitle, and a right-aligned sort select beside a `Scan boards` button

**Given** a row
**When** I click anywhere on it other than the checkbox or an action button
**Then** the row's primary action fires

**Given** a row's checkbox or action button
**When** I click it
**Then** the click does not also trigger the row action

### Story 2.6: Narrow and reorder the queue

As Rico,
I want to filter and sort the queue,
So that I can look at only the postings I still need to act on.

**Acceptance Criteria:**

**Given** the queue
**When** the filter strip renders
**Then** six chips — All, Discovered, Tailored, Approved, Submitted, Skipped — sit inside one 1px-bordered box, each carrying `border-right: 1px solid divider` and 6px/12px padding

**Given** a filter chip
**When** it renders
**Then** its label is Archivo 800 11.5px uppercase at `.06em` with `white-space: nowrap`
**And** its count sits beside the label at 55% opacity

**Given** a filter chip
**When** it shows its count
**Then** the count reflects the live number of postings currently in that state

**Given** I activate a filter chip
**When** the queue re-renders
**Then** only postings in that state are listed
**And** the active chip renders with `background: --color-text` and `color: --color-bg`

**Given** the All filter is active
**When** the queue renders
**Then** every posting is listed regardless of state

**Given** a filter matching no postings
**When** it is active
**Then** the table renders empty without error
**And** the first-run empty state is not shown in its place

**Given** the sort select
**When** it renders
**Then** it offers Match score, Date discovered, and Company
**And** it uses `.input` at a 30px minimum height

**Given** no sort has been chosen
**When** the queue first renders
**Then** it is sorted by match score

**Given** I choose a different sort option
**When** the queue re-renders
**Then** the ordering changes accordingly
**And** the active filter is preserved

### Story 2.7: Triage the queue with the keyboard alone

As Rico,
I want to move through the queue without touching the mouse,
So that I can clear twenty postings in the time it would take to click through five.

**Acceptance Criteria:**

**Given** the queue has focus
**When** I press `j` or `ArrowDown`
**Then** the cursor moves to the next row

**Given** the queue has focus
**When** I press `k` or `ArrowUp`
**Then** the cursor moves to the previous row

**Given** the cursor sits on the last row
**When** I press `j`
**Then** the cursor does not move past the end and the view does not error

**Given** a row under the cursor
**When** I press `o` or `Enter`
**Then** that posting opens

**Given** a row under the cursor
**When** I press `t`
**Then** a tailoring run is requested for that posting

**Given** a row under the cursor
**When** I press `s`
**Then** that posting is skipped

**Given** a row under the cursor
**When** I press `x`
**Then** that posting's selection toggles

**Given** focus is inside an input, a textarea, or a select
**When** I press any of `j`, `k`, `o`, `t`, `s`, or `x`
**Then** the character is typed into the field
**And** no shortcut fires

**Given** any screen in the app
**When** I press `Escape`
**Then** I return to the queue

**Given** the queue
**When** it renders
**Then** a keyboard legend appears beneath the table listing `j / k` move, `o` open, `x` select, `s` skip, and `t` tailor

**Given** the cursor moves to a row outside the viewport
**When** the move completes
**Then** that row is scrolled into view

### Story 2.8: Open a posting by its state

As Rico,
I want opening a posting to take me wherever that posting actually needs me,
So that I never have to think about which screen a given posting belongs on.

**Acceptance Criteria:**

**Given** a posting in state `Discovered`
**When** I open it
**Then** the app navigates to the tailoring destination for that posting

**Given** a posting in state `Tailored`
**When** I open it
**Then** its review destination opens

**Given** a posting in state `Approved`
**When** I open it
**Then** its handoff destination opens

**Given** a posting in any other state
**When** I open it
**Then** its review destination opens

**Given** a posting row
**When** its primary action button renders
**Then** the label is `Tailor` for Discovered, `Review` for Tailored, `Hand off` for Approved, and `Open` otherwise

**Given** a posting row
**When** I click the row and separately when I click its primary action button
**Then** both resolve to the same destination

**Given** the routing map
**When** I inspect its implementation
**Then** the state-to-destination mapping is defined in exactly one place
**And** it is not duplicated between the row handler and the button handler

**Given** this epic's scope
**When** a destination is reached
**Then** routing and navigation are complete and correct here
**And** what each destination renders is delivered by Epics 3, 4, and 5 without any change to this mapping

### Story 2.9: Skip postings and undo it

As Rico,
I want to skip postings individually or in bulk and be able to take it back,
So that I can clear the queue aggressively without fear of losing something I meant to keep.

**Acceptance Criteria:**

**Given** a posting in any state
**When** I skip it
**Then** its state becomes `Skipped` through the same core transition function, using the `skipped` event

**Given** at least one row is selected
**When** the queue renders
**Then** a full-width bulk bar appears with `background: --color-text` and `color: --color-bg`, showing `N selected`, a `Skip selected` button outlined in the background color, and `Clear`

**Given** the bulk bar appears
**When** it enters
**Then** it animates with `tk-in`

**Given** no rows are selected
**When** the queue renders
**Then** the bulk bar is absent

**Given** several selected postings sitting in different states
**When** I activate `Skip selected`
**Then** every selected posting becomes `Skipped`
**And** each posting's own prior state is recorded individually

**Given** a bulk skip has just occurred
**When** I activate `Undo` in the toast
**Then** every affected posting returns to its own prior state rather than to one shared state
**And** the restoration goes through the same core transition function, using the `undo` event

**Given** a skip or a bulk skip completes
**When** the toast appears
**Then** it carries the message and an `Undo` action
**And** it auto-dismisses after 4.2 seconds

**Given** the toast has auto-dismissed
**When** I look for `Undo`
**Then** it is no longer available

**Given** rows are selected
**When** I activate `Clear` in the bulk bar
**Then** all selections clear and the bulk bar disappears
**And** no posting's state changes

**Given** a bulk selection
**When** I look for a bulk tailoring action
**Then** none exists
**And** bulk selection drives skip only, so it can never fan out into parallel model calls

## Epic 3: A run either produces validated work or is rejected outright

Rico can run a posting against his canonical resume, watch real per-step progress, and trust that a run inventing an experience is rejected outright with nothing written. This epic delivers the product's trust premise, and delivers it as the negative case the SPEC names as the proof the system works.

### Story 3.1: Call the model through one isolated entry point

As Rico,
I want every model call to go through a single function running in isolation from this project's own configuration,
So that the same posting produces the same tailoring regardless of unrelated repository state, and the transport can be replaced later without touching anything else.

**Acceptance Criteria:**

**Given** the codebase
**When** I search for code that invokes the model
**Then** exactly one module does so, exporting a single function `tailor(input): Promise<ModelOutput>`

**Given** the model capability
**When** I trace how it is invoked
**Then** it sits behind a core-defined `ModelPort` interface
**And** the adapter is selected in the route handler rather than inside `core/`

**Given** a tailoring call
**When** the CLI is invoked
**Then** it runs `claude -p --output-format json`
**And** it runs with an explicit working directory outside the project

**Given** tailor's own agent configuration — its instructions, hooks, plugins, and MCP servers
**When** the CLI runs
**Then** none of it is inherited by the model invocation

**Given** a tailoring call
**When** the system prompt is constructed
**Then** it carries each canon bullet's `id`, `text`, `tags`, and `weight`
**And** it carries `excluded.rules` verbatim, with no paraphrase, reordering, or summarization
**And** it carries the `rendering` constraints

**Given** a tailoring call
**When** the user message is constructed
**Then** it carries the scraped JD text

**Given** a model response wrapped in markdown fences
**When** it is parsed
**Then** the fences are stripped defensively and the JSON is read successfully

**Given** the `ModelOutput` type
**When** I locate its declaration
**Then** it is declared once under `core/` as a named schema with an inferred TypeScript type

**Given** a returned `ModelOutput`
**When** I inspect its `selected` entries
**Then** each carries `sourceId`, `text`, `rephrased`, and `why`
**And** no resume prose exists anywhere in the payload outside a `sourceId`-cited entry

**Given** the transport were replaced with an API-key implementation
**When** I trace what would have to change
**Then** only this module changes, because every caller depends on the `tailor()` signature alone

### Story 3.2: Start a tailoring run and get an id immediately

As Rico,
I want a run to start in the background and hand me an id right away,
So that a refresh mid-run cannot orphan it and I never sit on a blocked request.

**Acceptance Criteria:**

**Given** a posting
**When** I start a tailoring run
**Then** the endpoint returns a `runId` immediately
**And** the run continues server-side after the response is sent

**Given** a run has started
**When** I inspect the database
**Then** a `runs` row exists from that moment, so polling and stage timing always have a parent

**Given** the `runs` table
**When** I inspect its migration
**Then** it carries `id`, `posting_id`, `created_at`, `model_output_json`, `outcome`, `rejection_reason`, and `pdf_path`

**Given** the `run_steps` table
**When** I inspect its migration
**Then** it carries `id`, `run_id`, `ordinal`, `slug`, `started_at`, `ended_at`, `detail`, and `status`
**And** `status` is one of `pending`, `running`, `done`, or `failed`

**Given** `run_steps`
**When** I inspect how a step's duration is obtained
**Then** it is derived from `started_at` and `ended_at` at read time
**And** no duration column exists, so it cannot drift from the timestamps

**Given** a run is already active
**When** I start another run
**Then** the server refuses it and returns the active `runId`

**Given** the single-run lock
**When** I trace where it is held
**Then** it is held in the database rather than in module scope
**And** a dev-server module reload cannot silently release it

**Given** a run has reached any terminal state
**When** I start a new run
**Then** it is accepted

**Given** the queue's bulk selection
**When** I look for any path from it that starts a run
**Then** none exists, so a bulk action can never fan out into parallel model calls

**Given** I refresh the browser mid-run
**When** I return to the run
**Then** its current state is fully recoverable from the `runId`

### Story 3.3: Watch a run move through its six real steps

As Rico,
I want to watch the run move through its six actual steps with real timings,
So that I can see what it is doing and how long each part genuinely took, rather than staring at a spinner.

**Acceptance Criteria:**

**Given** the pipeline
**When** I inspect its implementation
**Then** it consists of exactly six discrete filter functions with typed input and output, executed in order by one runner
**And** the set of six is a fixed contract rather than a growable list

**Given** a stage begins
**When** it runs
**Then** its start is written to `run_steps`
**And** its end and status are written on completion

**Given** a completed stage
**When** it reports its detail line
**Then** step 1 names the source and request count, step 2 the requirements found, step 3 the bullets scored, step 4 *n* of *m* selected, and step 6 the page count

**Given** the UI displays a step
**When** I inspect what it keys on
**Then** it keys on the step's `slug`
**And** `ordinal` is used for display order only, never as identity

**Given** a run in progress
**When** the client shows progress
**Then** it polls the server
**And** it holds no open stream and derives no progress from a timer of its own

**Given** the run screen
**When** it renders
**Then** it is a 2px ink-bordered card at max-width 1180px whose header reads `Tailoring — {company} / {role}` with a right-aligned tabular `{n}s elapsed · est. 22s`

**Given** the run screen body
**When** it renders
**Then** it is a `1fr | 320px` grid with the step list on the left and `Matched so far` on the right

**Given** a step row
**When** it renders
**Then** it uses a `22px | 1fr | auto` grid with a 1px rule between rows
**And** a completed step is marked `✓` in ink, the active step `›` in accent with `tk-blink`, and a pending step `·` in `neutral-400`

**Given** a step's right column
**When** it renders
**Then** a completed step shows its real elapsed duration and the active step shows `running`

**Given** the progress bar
**When** it renders
**Then** it is 8px tall on a `neutral-300` track with an accent fill and a 400ms ease `width` transition

**Given** a matched requirement is produced
**When** it appears in the right pane
**Then** it animates in with `tk-in`

**Given** `prefers-reduced-motion: reduce`
**When** the run screen renders
**Then** `tk-blink` and the progress-bar transition are both disabled

**Given** a run passes validation
**When** it completes
**Then** the posting moves to `Tailored` through the core transition function, using the `run-completed` event

**Given** validation fails at step 5 for any reason
**When** the run ends
**Then** nothing derived is persisted and step 6 never runs
**And** the run is recorded as failed, with the distinction between an invented claim and an infrastructure failure refined by Stories 3.4 and 3.5

### Story 3.4: Have a malformed response reported as a failure, not a lie

As Rico,
I want a response that does not match the contract reported as a failed run,
So that my fabrication log stays a record of the model lying rather than a record of network blips.

**Acceptance Criteria:**

**Given** a raw model payload
**When** validation runs
**Then** the payload is parsed and shape-validated against the `ModelOutput` schema before any `sourceId` is checked against canon

**Given** a payload that parses as JSON but does not match the `ModelOutput` shape
**When** validation runs
**Then** the run ends as Outcome D
**And** it is never classified as a fabrication

**Given** an Outcome D run
**When** it ends
**Then** nothing is appended to `rejections.log`

**Given** an Outcome D run
**When** I inspect the `runs` row
**Then** `outcome` is `failed`
**And** the failing stage is recorded

**Given** a missing model CLI, a timeout, a non-JSON response, a board fetch failure, or a Chromium failure
**When** any of them occurs
**Then** the run ends as Outcome D

**Given** a posting already in `Tailored` or `Approved`
**When** a later run ends as Outcome D
**Then** the posting is not demoted
**And** Outcome D declines to advance a posting but never moves one backwards

**Given** a posting in `Discovered`
**When** a run ends as Outcome D
**Then** it stays `Discovered`

**Given** an Outcome D failure
**When** it surfaces to the client
**Then** it arrives in the standard error envelope naming the failing stage

**Given** an operational failure of any kind
**When** it is logged
**Then** it goes to stderr
**And** never to `rejections.log`

**Given** `runs.outcome`
**When** I inspect its possible values
**Then** it is exactly one of `rejected`, `failed`, or `completed`
**And** it is written once

### Story 3.5: Have a run that invents an experience write nothing at all

As Rico,
I want a run citing an experience I never had discarded entirely,
So that a fabricated claim cannot reach my resume even partially.

**Acceptance Criteria:**

**Given** a shape-valid `ModelOutput`
**When** any `sourceId` in `selected` or `dropped` does not exist in canon
**Then** the run ends as Outcome A

**Given** an Outcome A run
**When** it ends
**Then** no `diff_items`, no `answers`, and no PDF are written

**Given** an Outcome A run
**When** I inspect the posting
**Then** it is still `Discovered`

**Given** an Outcome A run
**When** I inspect the `runs` row
**Then** it exists with `outcome` of `rejected` and its stage timings are kept
**And** the run is not lost, so the fabrication modal stays reachable

**Given** an Outcome A run
**When** it ends
**Then** a line is appended to `./data/rejections.log` carrying the timestamp, the job id, the offending bullet text, and the invalid `sourceId`

**Given** `rejections.log`
**When** I inspect how it is written
**Then** it is append-only
**And** nothing but Outcome A ever writes to it

**Given** a run containing a fabricated claim
**When** step 5 completes
**Then** step 6 never runs

**Given** validation
**When** I inspect where and how it runs
**Then** it runs server-side after the model call and before anything is persisted or rendered
**And** it makes no second model call

**Given** a validation check fires
**When** it returns its result
**Then** the result names the offending `sourceId` and text
**And** it is not a bare boolean or a generic message

### Story 3.6: See exactly which claim had no source

As Rico,
I want a rejected run to show me the invented claim beside the real experience closest to it,
So that a rejection teaches me something about my prompt instead of merely failing.

**Acceptance Criteria:**

**Given** a run rejected for fabrication
**When** the client polls its state
**Then** the fabrication modal is shown

**Given** the modal
**When** it renders
**Then** it sits over a 55% `neutral-900` scrim at 760px max-width with `--shadow-lg` and a 2px accent border, entering with `tk-in`

**Given** the modal header
**When** it renders
**Then** it is accent-filled and reads `TAILORING REJECTED — FABRICATED CLAIM` at 11.5px uppercase `.14em`, above `{company} / {role} — nothing was written to your resume` in Archivo 800 at 23px

**Given** the modal body
**When** it renders
**Then** a `Rejected bullet` label sits above the bullet at 14.5px weight 600 behind a 4px accent left rule
**And** a two-cell bordered grid below it holds `Why it failed` and `Closest real experience`

**Given** the closest-experience panel
**When** it ranks candidates
**Then** it uses Jaccard overlap between the rejected text's extracted tags and each canon bullet's tags
**And** it takes the top 3

**Given** candidates tie on overlap
**When** the ranking resolves them
**Then** it orders by weight descending, then role `startDate` descending, then bullet `id` ascending
**And** the resulting panel is reproducible for any given rejection

**Given** a canon bullet carrying `status: "needs-content"`
**When** candidates are ranked
**Then** it is excluded, because it carries no real text to show

**Given** every candidate scores zero overlap
**When** the panel renders
**Then** it falls back to the top 3 bullets of the most recent role by weight descending then `id` ascending
**And** the panel is never empty

**Given** the tag extraction used for this ranking
**When** I trace it
**Then** it calls the same core module the queue score calls

**Given** the modal's actions
**When** they render
**Then** `Re-run without this claim` is primary, `Open resume.canon.json` sits beside it, and `Leave it untailored` is right-aligned

**Given** I activate `Re-run without this claim`
**When** the new run starts
**Then** `tailor()` is re-invoked with the rejected text appended to the prohibitions

**Given** the modal footer
**When** it renders
**Then** it reads `Logged to rejections.log` alongside the count of rejections from this model this week

**Given** the modal is open
**When** I press `Escape`
**Then** it is dismissed

**Given** the modal is open
**When** I look at the step list behind it
**Then** step 5 carries a `!` mark and reads `rejected`

### Story 3.7: Cancel a run in flight

As Rico,
I want to cancel a run I no longer want,
So that a posting I misjudged does not tie up the one run slot.

**Acceptance Criteria:**

**Given** a run in progress
**When** I activate `Cancel`
**Then** the run stops

**Given** the run screen footer
**When** it renders
**Then** it sits above a 2px rule carrying `Cancel` and the note that the run is local and nothing is submitted

**Given** a cancelled run
**When** it ends
**Then** the single-run lock is released
**And** a new run can be started immediately

**Given** a cancelled run
**When** I inspect the posting
**Then** it has not advanced

**Given** a cancelled run
**When** I inspect `rejections.log`
**Then** nothing was appended

**Given** a cancelled run
**When** I inspect the `runs` row
**Then** the run and its recorded stage timings are kept, in keeping with keeping every run

## Epic 4: Every proposed change is reviewed line by line before anything is approved

Rico can read every proposed change against its source, resolve overclaim flags in place, edit bullets inline and watch the resume update live, answer the screening questions, and approve — with approval blocked while anything is unresolved. This is the screen the product exists for, and the epic consolidates five capabilities that all live in the same screen, diff pane, and store slice.

### Story 4.1: Build the diff set from the model's own mapping

As Rico,
I want the diff built from what the model said it did,
So that what I review is the model's actual mapping rather than a text comparison guessing at it.

**Acceptance Criteria:**

**Given** a validated `ModelOutput`
**When** the diff set is built
**Then** it is constructed directly from the model's own mapping
**And** no text-diffing algorithm is used anywhere in the path

**Given** a `selected` entry with `rephrased: true`
**When** it becomes a diff item
**Then** its kind is `reworded`, with `old` set to the canon text and `neu` set to the model text

**Given** a `selected` entry with `rephrased: false`
**When** it becomes a diff item
**Then** its kind is `kept`, with `neu` set to the canon text and no `old` value

**Given** a `dropped` entry
**When** it becomes a diff item
**Then** its kind is `dropped`, with `old` set to the canon text

**Given** a canon bullet appearing in neither `selected` nor `dropped`
**When** the diff set is built
**Then** it is absent from the diff entirely
**And** no synthesized `dropped` entry is created for it

**Given** the `diff_items` table
**When** I inspect its migration
**Then** it carries `id`, `run_id`, `source_id`, `kind`, `original`, `proposed`, `user_edit`, `why`, `flagged`, `flag_why`, and `resolved`
**And** that migration is introduced by this story

**Given** `diff_items.kind`
**When** I inspect its allowed values
**Then** it is one of `reworded`, `kept`, or `dropped`

**Given** a persisted diff
**When** I inspect each item's `source_id`
**Then** it references a canon bullet id that exists, because the run passed validation before the diff was built

**Given** a completed run
**When** I inspect the persisted diff
**Then** it holds exactly one row per `selected` and `dropped` entry

### Story 4.2: Open a posting for review

As Rico,
I want the review screen laid out as three columns I can scan at once,
So that I can hold the posting, the proposed changes, and the resulting resume in view together.

**Acceptance Criteria:**

**Given** a posting in `Tailored`
**When** I open it
**Then** the review screen opens

**Given** the review screen
**When** it renders
**Then** it is a `23fr | 42fr | 35fr` column grid at `min-height: calc(100vh - 78px)` with 2px dividers between columns

**Given** content overflowing any column
**When** I scroll
**Then** each pane scrolls in its own right
**And** the page itself never scrolls horizontally

**Given** the action bar
**When** it renders
**Then** it is sticky at `top: 39px` beneath a 1px rule

**Given** the action bar
**When** it renders
**Then** it carries `← Queue`, the company in Archivo 800 17px, the role, `SOURCE · LOCATION` at 12px uppercase `neutral-600`, and `MATCH {n}` tabular at 15px

**Given** the action bar's right side
**When** it renders
**Then** it carries a pending-status line, `Skip job` with a dimmed `s` hint, and `Approve and hand off` as primary with a dimmed `a` hint

**Given** the match score shown in the action bar
**When** I trace its source
**Then** it is the model's post-tailoring score
**And** it is not the queue's local tag-overlap score

**Given** the left pane
**When** it renders
**Then** two tabs labelled JD and Answers fill the width flush-left in Archivo 800 11px uppercase
**And** the active tab is ink-filled with inverted text

**Given** the review screen
**When** I press `s`
**Then** the posting is skipped

**Given** the review screen
**When** I press `Escape`
**Then** I return to the queue

### Story 4.3: Read each proposed change against its source

As Rico,
I want each proposed change shown against the bullet it came from,
So that I can judge every rewrite on whether it still describes what I actually did.

**Acceptance Criteria:**

**Given** the diff pane
**When** it renders
**Then** it is a white `#fff` paper field against the app ground, with a 2px ink rule beneath a sticky header

**Given** the diff header
**When** it renders
**Then** it reads `Proposed changes` with right-aligned counts in the form `N reworded / N kept / N dropped`

**Given** a diff item
**When** it renders
**Then** it is a block with a 1px bottom rule and a meta row carrying the section as `{Company} · {years}` in Archivo 800 10px uppercase, the kind label at 10px uppercase `neutral-500`, and right-aligned inline actions

**Given** a reworded item
**When** it renders
**Then** the gutter shows `−` then `+` in Archivo 800 15px, the old text is struck in `neutral-600`, the new text is 15.5px weight 600 in ink, and the new text carries a `3px solid --color-text` left rule

**Given** a kept item
**When** it renders
**Then** the gutter shows `+` only, the text is 15.5px weight 400 in ink behind a `3px solid neutral-400` left rule, and the kind label reads `selected, unchanged`

**Given** a dropped item
**When** it renders
**Then** the gutter shows `−` only in `neutral-500`, the text is struck with the block at 72% opacity, the left rule is `3px dashed neutral-400`, and the kind label reads `dropped from base resume`

**Given** the three diff kinds
**When** color is removed from the rendering entirely
**Then** reworded, kept, and dropped remain distinguishable by gutter glyph, weight, strikethrough, and left-rule style alone

**Given** a diff item's rationale
**When** it renders
**Then** it is a 12.5px line indented past the gutter behind a 1px `neutral-300` left rule, with a `WHY` label in Archivo 800 9.5px `accent-700`

**Given** an item renders for the first time
**When** I look for its rationale
**Then** it is shown by default

**Given** the model's one-sentence `why` for an item
**When** the rationale renders
**Then** it is that sentence

### Story 4.4: Edit a proposed bullet and watch the resume update

As Rico,
I want to type directly into a proposed bullet and see the resume change as I type,
So that I can fix a rewrite in place without leaving the review or guessing at the result.

**Acceptance Criteria:**

**Given** a proposed bullet
**When** I click into it
**Then** I can type directly, with no edit mode to enter first

**Given** the proposed text control
**When** it renders
**Then** it is a borderless auto-sizing textarea

**Given** the textarea
**When** its height is set
**Then** it is measured from layout by setting `height: auto` and reading `scrollHeight`
**And** this happens on mount, on update, on input, on font load, and on window resize

**Given** a long bullet
**When** it renders
**Then** the whole bullet is visible
**And** its height is never estimated from character count

**Given** I type in a proposed bullet
**When** the text changes
**Then** the right-hand resume pane updates immediately

**Given** the resume pane
**When** it renders the document
**Then** it renders through the same `ResumeDocument` component built in Epic 1
**And** no second resume template exists anywhere in the codebase

**Given** the resume pane's wrapper
**When** it renders
**Then** it uses `--color-surface` with a header reading `Tailored resume — as it will submit` and `out/{id}.pdf · N page`
**And** the document sits on white with `--shadow-md` at 38px/34px padding

**Given** a bullet I have edited
**When** its meta line renders
**Then** it reads `your text · N words` at 10.5px uppercase

**Given** an unedited model rewrite
**When** its meta line renders
**Then** it reads `model text · N words`

**Given** a kept bullet
**When** its meta line renders
**Then** it reads `unchanged from source · N words`

**Given** I edit a bullet
**When** editing pauses
**Then** the edit is written through to `diff_items.user_edit` on a debounce

**Given** I have edited several bullets and I refresh the browser
**When** the review screen reloads
**Then** every edit is still present

**Given** the Zustand store
**When** I inspect what it holds
**Then** it holds ephemeral UI state and the in-review working copy only
**And** queue, posting, and run state are fetched and refetched rather than mirrored long-term

### Story 4.5: Revert a rewrite or bring back a dropped bullet

As Rico,
I want to undo the model's proposal one bullet at a time,
So that I can reject a rewrite or rescue a bullet it dropped without abandoning the whole run.

**Acceptance Criteria:**

**Given** a reworded item
**When** its actions render
**Then** `revert to original` is offered

**Given** I revert a reworded item
**When** the revert completes
**Then** the original canon text replaces the proposed text
**And** any user edit on that item is discarded

**Given** a reverted item
**When** its meta line renders
**Then** it reads `original text · model rewrite discarded`

**Given** a reverted item
**When** its kind label renders
**Then** it reads `reverted to original`

**Given** a reverted item
**When** its actions render
**Then** `restore rewrite` is offered

**Given** I activate `restore rewrite`
**When** the restore completes
**Then** the model's proposed text returns

**Given** a dropped item
**When** its actions render
**Then** `keep this bullet` is offered

**Given** I keep a dropped bullet
**When** the action completes
**Then** it is included in the resume pane

**Given** a bullet I have kept back
**When** its actions render
**Then** `drop again` is offered

**Given** I revert, restore, keep, or drop
**When** the action completes
**Then** the resume pane reflects it immediately

**Given** an item I have edited by hand
**When** its kind label renders
**Then** it reads `reworded, edited by you`

### Story 4.6: Be warned when a rewrite claims more than my source

As Rico,
I want any rewrite asserting more than its source supports flagged with the exact words at fault,
So that I never approve a sentence that quietly overstates what I did.

**Acceptance Criteria:**

**Given** a proposed text
**When** the novel-quantity check runs
**Then** it extracts every numeral, percentage, currency amount, and multiplier
**And** it flags any that appears neither in the source bullet nor anywhere else in canon

**Given** a proposed text
**When** the escalated-verb check runs
**Then** it flags any of `led`, `owned`, `architected`, `founded`, `managed`, `drove`, `spearheaded`, `scaled`, `established`, or `directed` appearing in the text but not in the source bullet

**Given** an escalated verb that appears in another canon bullet for the same role
**When** the check runs
**Then** it is not flagged

**Given** a flag fires
**When** its sentence is generated
**Then** it names the specific offending tokens
**And** it is never a generic warning

**Given** a flagged item
**When** it renders
**Then** its row is tinted `accent-100` and bled to the pane edges with `margin: 0 -18px` and `padding: 0 18px`

**Given** a flagged item
**When** it renders
**Then** an accent-filled band sits above the text carrying `OVERCLAIM` in Archivo 800 11.5px uppercase `.14em` beside the sentence naming exactly what has no source

**Given** a flagged item
**When** its gutter renders
**Then** the `+` is in accent and the left rule is `3px solid --color-accent`

**Given** any item is flagged
**When** the diff pane renders
**Then** a full-width accent bar reads `N FLAGGED · Reads beyond your source data. Resolve before approving.` beside a `Go to it` action

**Given** I activate `Go to it`
**When** the scroll completes
**Then** the flagged item has been scrolled to smoothly at a 140px offset

**Given** I edit a flagged bullet
**When** the edit is made
**Then** both checks re-run

**Given** an edit removing the offending token
**When** the checks re-run
**Then** the flag clears

**Given** an edit introducing a different novel quantity
**When** the checks re-run
**Then** the item flags again

**Given** I revert a flagged item to its original
**When** the revert completes
**Then** the flag clears

**Given** any flag is unresolved
**When** the action bar renders
**Then** `Approve and hand off` is disabled at 45% opacity

**Given** the overclaim checks
**When** I locate their implementation
**Then** they live in a single pure module under `core/` with no `fs`, no database access, and no Node built-ins

**Given** the client
**When** it evaluates flags for instant per-edit feedback
**Then** it imports that same module

**Given** the server
**When** Approve or a render is requested
**Then** it re-runs that same module authoritatively
**And** client-reported flag state is never trusted

**Given** the client's canon projection
**When** I inspect what it carries
**Then** it carries every bullet's `id`, `text`, `tags`, `weight`, `status`, and owning role id
**And** the client's checks therefore range over the same corpus the server's do, so no flag vanishes on save

### Story 4.7: See which requirements the tailoring matched

As Rico,
I want the posting's requirements marked where they appear,
So that I can see which parts of the job my experience actually answers.

**Acceptance Criteria:**

**Given** the JD tab
**When** it renders
**Then** a header line shows `{date} · {n} words` beside a `hide matches` / `show matches` ghost toggle in `accent-700`

**Given** the JD body
**When** it renders
**Then** headings are Archivo 800 11px uppercase at `.1em` over 13px/1.5 paragraphs

**Given** a matched requirement quote
**When** its span is determined
**Then** it is computed by locating the quote in the JD text at render time

**Given** a matched span
**When** it renders
**Then** it carries `background: accent-200`, `box-shadow: inset 0 -2px 0 accent`, weight 600, and `title="Matched to your experience"`

**Given** a quote that is not an exact substring of the JD text
**When** spans are computed
**Then** that quote is dropped
**And** no fuzzy matching is attempted

**Given** matches are shown
**When** I activate `hide matches`
**Then** the marking is removed and the JD reads plainly

**Given** matches are hidden
**When** I activate `show matches`
**Then** the marking returns

**Given** a quote appearing more than once in the JD
**When** spans are computed
**Then** the marking is deterministic rather than varying between renders

### Story 4.8: Review and edit the screening answers

As Rico,
I want the standard screening answers drafted and editable here,
So that I approve the whole application at once instead of rewriting answers in a form later.

**Acceptance Criteria:**

**Given** the Answers tab
**When** it renders
**Then** a note at 11.5px explains that the answers are pre-filled from source data and that edits here are part of what is approved

**Given** the Answers tab
**When** it renders
**Then** it shows three `.field` controls — Work authorization as an input, Notice period as an input, and Why this company as a textarea with a 150px min-height at 13px/1.5

**Given** each field
**When** it renders
**Then** it carries its own note line beneath it

**Given** a completed run
**When** the Answers tab first opens
**Then** all three fields are pre-filled from the model's drafted answers

**Given** the `answers` table
**When** I inspect its migration
**Then** it carries `run_id`, `field`, and `value`
**And** `field` is one of `workAuthorization`, `noticePeriod`, or `whyThisCompany`

**Given** I edit an answer
**When** editing pauses
**Then** the edit is persisted

**Given** I have edited answers and I refresh the browser
**When** the review screen reloads
**Then** my edited answers are present

**Given** I have edited an answer
**When** I later reach the handoff
**Then** the edited value is what is carried there

### Story 4.9: Have approval blocked while a claim is incomplete

As Rico,
I want the app to stop me approving a resume containing an incomplete claim,
So that a placeholder cannot reach a PDF I submit.

**Acceptance Criteria:**

**Given** a selected bullet whose canon entry carries `status: "needs-number"` with an unfilled placeholder
**When** the run completes
**Then** the run is persisted and the diff renders normally

**Given** such a bullet
**When** it renders in the diff
**Then** the raw placeholder token is visible verbatim in the text

**Given** a selected bullet carrying `status: "needs-content"`
**When** the readiness gate runs
**Then** it blocks render and approval exactly as an unfilled placeholder does

**Given** any blocker
**When** the banner renders
**Then** it spans the content with `background: accent-200` and `border-bottom: 2px solid accent-700`, carrying `RENDER BLOCKED` in Archivo 800 12px uppercase `accent-800` beside a sentence naming the specific incomplete field

**Given** the banner
**When** its actions render
**Then** `Fill metric` is primary and `Drop bullet` is secondary with `accent-700` border and text

**Given** more than one blocker exists
**When** the banner renders
**Then** every blocking reason surfaces through that same banner
**And** no second banner pattern is introduced

**Given** a blocked run
**When** the resume pane renders
**Then** the document is replaced by a 2px `accent-700` box on `accent-100` reading `NO RENDER`, naming which bullet and which field is empty, and showing the last good render timestamp

**Given** a blocked run
**When** the action bar renders
**Then** `Approve and hand off` is disabled

**Given** I activate `Fill metric` and supply a value
**When** the write completes
**Then** the value is substituted into the existing `needs-number` field in `resume.canon.json`

**Given** that write
**When** I inspect how it was performed
**Then** it went through the canon gateway's single write path
**And** a timestamped backup was taken, the write was made to a temp file, and the file was then renamed

**Given** that write
**When** I compare canon before and after
**Then** no bullet was added and no other field was altered

**Given** I activate `Drop bullet` instead
**When** the action completes
**Then** the offending item is removed from the diff and the blocker clears

**Given** a blocker cleared by either route
**When** the gate re-runs
**Then** the banner disappears and Approve becomes available

**Given** that canon as currently seeded contains no `needs-number` and no `needs-content` bullet
**When** this story is tested
**Then** both blocking paths and the fill-metric write are exercised against purpose-built fixtures

### Story 4.10: Approve the application

As Rico,
I want approving to lock in exactly what I reviewed,
So that the PDF handed to the form is the version I actually read, including my edits.

**Acceptance Criteria:**

**Given** no unresolved flags and no blockers
**When** the action bar renders
**Then** `Approve and hand off` is enabled

**Given** the review screen
**When** I press `a`
**Then** approval is triggered

**Given** I approve
**When** the server processes it
**Then** it re-runs the overclaim checks and the readiness gate authoritatively
**And** it does so regardless of what the client believed

**Given** the server's re-validation fails
**When** approval is processed
**Then** approval is refused
**And** the reason is returned in the standard error envelope

**Given** approval succeeds
**When** the PDF is produced
**Then** it is re-rendered from the current validated diff, including my inline edits

**Given** the re-render completes
**When** I inspect the run
**Then** `runs.pdf_path` has been replaced with the newly rendered PDF

**Given** stage 6's PDF from the pipeline
**When** I trace its role
**Then** it was a preview artifact only
**And** it is never the file handed to the ATS

**Given** approval succeeds
**When** the answers are considered
**Then** my edited answers are approved along with the diff

**Given** approval succeeds
**When** the posting's state changes
**Then** it moves to `Approved` through the core transition function, using the `approved` event

**Given** approval succeeds
**When** the screen changes
**Then** the handoff opens

**Given** a re-rendered PDF failing the text-layer assertion
**When** approval is processed
**Then** approval fails loudly
**And** the posting does not advance

## Epic 5: A filled form opens in a real browser and Rico submits it himself

Rico gets the application form opened in a real browser with his tailored PDF attached and his answers filled, submits it himself, and confirms afterward so the posting is marked accurately. The app never clicks submit and never guesses whether he did.

### Story 5.1: Have my application opened in a browser, filled and attached

As Rico,
I want the application form opened in a real browser with my tailored PDF attached and the answers filled,
So that all that is left for me to do is read it and click submit myself.

**Acceptance Criteria:**

**Given** an approved posting
**When** the handoff begins
**Then** the ATS is detected from the posting URL

**Given** a detected ATS
**When** the handoff runs
**Then** Chromium launches with `headless: false`

**Given** a detected ATS
**When** the form is filled
**Then** the adapter fills the fields and attaches the tailored PDF
**And** it leaves the page open and returns

**Given** any ATS adapter
**When** I inspect its implementation
**Then** it exports `fill(page, job, pdfPath, answers): Promise<void>`
**And** it implements the core-defined `AtsPort` interface

**Given** the supported vendors
**When** I inspect `adapters/ats/`
**Then** one adapter exists per vendor, covering the same four vendors as discovery

**Given** any ATS adapter
**When** I search it for a click on a submit control
**Then** none exists
**And** `page.click()` is never called on a submit control under any circumstance

**Given** a PDF older than the run's last persisted edit
**When** the adapter is asked to attach it
**Then** it refuses
**And** the stale PDF is not attached

**Given** the handoff card
**When** it renders
**Then** it is 880px wide with a 2px ink border on white
**And** its header reads `Handing off to your browser` with `{company} / {role} · {source}` right-aligned

**Given** the waiting phase
**When** it renders
**Then** it explains that a browser window is opening with the form already filled, and that this app never submits on the user's behalf

**Given** the waiting phase's step list
**When** it renders
**Then** it shows four steps — rendered PDF, opened form, filled fields and attached PDF, and `you review and click submit`
**And** the last is marked `›` in accent with `tk-blink`

**Given** the waiting phase's actions
**When** they render
**Then** `Reopen window` and `Back to queue` are offered beside a right-aligned note that the app is waiting on the user

**Given** `prefers-reduced-motion: reduce`
**When** the waiting phase renders
**Then** `tk-blink` is disabled

**Given** a handoff holding a headed browser open
**When** a tailoring run is requested
**Then** contention for the headed Chromium is governed by the same single-run lock

### Story 5.2: Confirm whether I actually submitted it

As Rico,
I want the app to ask me whether I submitted rather than guess,
So that a posting is never marked submitted on the strength of something the app cannot actually observe.

**Acceptance Criteria:**

**Given** the waiting phase
**When** control returns to the app
**Then** the confirm phase is entered

**Given** the confirm phase
**When** it renders
**Then** the header reads `Did you submit it?`
**And** the body asks whether I submitted the application to the company

**Given** the confirm phase's actions
**When** they render
**Then** `I submitted it` is primary, alongside `I bailed — keep it approved` and `Skip this job`

**Given** the confirm phase's footnote
**When** it renders
**Then** it explains that only the user knows what happened in that window, so the app asks instead of guessing

**Given** I activate `I submitted it`
**When** the action completes
**Then** the posting moves to `Submitted` through the core transition function, using the `submit-confirmed` event

**Given** I activate `I bailed — keep it approved`
**When** the action completes
**Then** the posting remains `Approved`

**Given** I activate `Skip this job`
**When** the action completes
**Then** the posting moves to `Skipped`

**Given** the application
**When** I search for code inspecting the opened page for a confirmation or success page
**Then** none exists
**And** the app never attempts to detect whether a submission occurred

**Given** a posting that has reached `Submitted`
**When** I trace how it got there
**Then** the only path is explicit user confirmation

**Given** the done phase
**When** it renders
**Then** the header reads `Submitted` and the body shows `Marked submitted · {timestamp}` above a line counting the tailored applications still waiting

### Story 5.3: Fill an unsupported form by hand without losing the work

As Rico,
I want a form the app cannot fill to still hand me everything I need,
So that an unrecognized ATS costs me a few minutes of typing rather than the whole tailoring run.

**Acceptance Criteria:**

**Given** a posting URL matching no supported ATS
**When** the handoff runs
**Then** the tab is opened
**And** the handoff returns `unsupported`

**Given** the unsupported state
**When** the card header renders
**Then** it reads `Manual submission`

**Given** the unsupported state
**When** it renders
**Then** a 4px accent left rule carries `NO ADAPTER FOR THIS FORM` above an explanation that the tab is open and the tailored PDF is on disk

**Given** the unsupported state
**When** its grid renders
**Then** a two-cell bordered grid holds `On disk` and `Answers to paste`

**Given** the `On disk` cell
**When** it renders
**Then** it shows the PDF path, its page count and render time, and `Reveal file` and `Copy answers` actions

**Given** the `Answers to paste` cell
**When** it renders
**Then** each answer's short form sits on its own ruled line

**Given** I activate `Reveal file` or `Copy answers`
**When** the action completes
**Then** a toast confirms it

**Given** the answers shown here
**When** I compare them against the review screen
**Then** they are my edited answers rather than the model's original drafts

**Given** I activate `I filled it in`
**When** the action completes
**Then** the handoff advances to the confirm phase

**Given** a detected ATS whose form the adapter cannot successfully fill
**When** the failure occurs
**Then** this same unsupported path is offered as the fallback

**Given** the unsupported path
**When** the posting's state is considered
**Then** it stays `Approved` until I confirm through the confirm phase

### Story 5.4: Move straight to the next tailored posting

As Rico,
I want to go straight from a finished handoff to the next posting waiting on me,
So that I can work through a batch of approved applications without returning to the queue each time.

**Acceptance Criteria:**

**Given** the done phase
**When** its actions render
**Then** `Next in queue` and `Back to queue` are both offered

**Given** at least one posting remains in `Tailored`
**When** I activate `Next in queue`
**Then** the next `Tailored` posting opens for review

**Given** no posting in `Tailored` remains
**When** the done phase renders
**Then** `Next in queue` is absent or disabled rather than opening nothing

**Given** I activate `Back to queue`
**When** the navigation completes
**Then** the queue opens with the just-submitted posting reflected in its state and in the top bar counts

**Given** the done phase
**When** the waiting-applications line renders
**Then** it counts the tailored applications still awaiting action
