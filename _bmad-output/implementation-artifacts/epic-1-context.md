# Epic 1 Context: A running app that renders your real resume

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Stand up the substrate the whole product rests on and prove the riskiest end of it first: a developer can start the app on a clean machine, it sets itself up without ever endangering the hand-authored canonical resume, and the app renders that resume as a real document and exports it to a PDF whose text an ATS can actually extract. Nothing is tailored yet — the value delivered is that the pinned stack runs, the architecture's dependency rule is mechanically enforced, the design system is ported once, every cross-unit type is declared once in the core, and the render path is de-risked. Discovering a rasterized PDF or a forked resume template in a later epic would be expensive; both are foreclosed here.

## Stories

- Story 1.1: Run the app on the pinned stack
- Story 1.2: Port the Modernist design system
- Story 1.3: See the app's global chrome
- Story 1.4: Get one legible error shape from every endpoint
- Story 1.5: Start the app on a clean machine and have it set itself up
- Story 1.6: Read the canonical resume through a single gateway
- Story 1.7: See the canonical resume rendered as a document
- Story 1.8: Have a render blocked when a claim is incomplete
- Story 1.9: Export the resume as a PDF with a verified text layer
- Story 1.10: Develop the UI against mock data without touching canon

## Requirements & Constraints

- **One process, one machine.** Runs on localhost via `pnpm dev` with route handlers on the Node runtime. No container, no second process, no public interface, no deployment target.
- **Bootstrap is idempotent.** One startup routine creates the data directory, seeds the canonical resume from the input seed *only if absent*, creates the boards file with a documented shape, and applies versioned migrations. Repeated starts must modify nothing. Schema is never synchronized by push — a converging push could drop a column holding real history.
- **Canon is sacred and near-read-only.** The canonical resume file is gitignored and irreplaceable. In this epic the gateway exposes reads only; the single write path (substituting into an existing `needs-number` field) arrives in Epic 4. Reads re-parse per operation — no cache, no invalidation.
- **The render-readiness gate returns a list, not a boolean.** It reports *every* reason a run cannot render or be approved: an unfilled placeholder in a selected `needs-number` bullet, and a selected `needs-content` bullet. An incomplete contact line is explicitly **not** a blocker. A non-empty list refuses the render.
- **Preview and PDF are one component.** One `ResumeDocument`, one shared props-builder. A second resume template anywhere in the codebase breaks the product's premise that the preview is trustworthy.
- **The text layer is non-negotiable.** After generating, assert the PDF carries extractable text and fail loudly naming the missing layer. Never return a path as though the render succeeded.
- **Absent contact fields vanish cleanly** — no label, no separator, no dangling punctuation, and no placeholder sentinel reaching output. Preview and PDF must omit identically.
- **One error envelope everywhere** — stable machine-readable code, human message, and the failing stage where one applies, structurally identical across every endpoint.
- **Mock content is quarantined.** Invented employers and bullets exist behind a `USE_MOCK_DATA` flag for local UI work only, unreachable when the flag is off and structurally unable to reach the seeded canon under any setting.
- **Migrations directory ships the mechanism, not the tables.** `postings`, `runs`, `run_steps`, `diff_items`, and `answers` are each created by the later story that first needs them.

## Technical Decisions

- **Hexagonal core.** No file under `core/` may import from `app/`, `adapters/`, `next/*`, `drizzle-orm`, `playwright`, or any Node built-in. This must be enforced by lint or type-check and must *block the build*, not warn. `core/` contains `ports/`, `canon/`, `pipeline/`, `validation/`, `diff/`, `scoring/`, `gates/`; siblings are `adapters/`, `app/` (with `api/` as the composition root), `components/resume-document/`, plus gitignored `data/` and `out/`.
- **Ports are core-defined interfaces, adapters are selected in route handlers.** `BoardPort`, `AtsPort`, `ModelPort`, `RenderPort`, `RepositoryPort` — one interface per file, named for the capability not the vendor. This epic implements `RenderPort` (HTML → Playwright → Chromium → PDF) and the database repository.
- **Declare every cross-unit type once, in the core**, as a named schema with its inferred TypeScript type; every boundary parses through it. This epic front-loads the discipline and owns at least: the error envelope, the readiness-blocker list, and the props-builder input type. No unit may restate or structurally duplicate one of these. This is the single highest-value invariant in the epic — later epics built against unnamed shapes is precisely the failure mode being prevented.
- **Errors flow one direction.** Adapters throw typed errors carrying a stable code; only the composition root formats an HTTP response. Nothing under `core/` throws an HTTP-shaped error or sets a status code.
- **`ResumeDocument` is pure** — no hooks, no store access, no client-only APIs — a function of fully-resolved props. Its props come from one builder whose single named input type carries `basics`, role company/position/dates, education, and skills. (This is distinct from the checks projection Epic 4 owns; both are declared once.)
- **The canon gateway normalizes asymmetrically.** Canon's unfilled-field sentinel (the literal `TODO`) is normalized to absent for *scalar `basics` fields only*. A placeholder token inside a bullet's `text` is returned verbatim — later epics require showing it unchanged.
- **Pinned stack, two pins with reasons.** Node 24.19.0, Next.js 16.3.0 (App Router), React 19.2.8, TypeScript 5.9.3, Drizzle ORM 0.45.2, drizzle-kit 0.31.10, better-sqlite3 13.0.3, Playwright 1.62.1, Zustand 5.0.14, Zod 4.4.3, pnpm 11.21.0. Node is pinned because better-sqlite3 declares a hard `node >= 22` floor — declare that engine floor in the manifest. TypeScript stays on 5.9 because 7.0 reaches Next.js only through an experimental CLI path; no experimental compiler flag may be enabled.
- **Conventions.** Singular domain nouns for entities with plural snake_case tables; `kebab-case.ts` filenames; ISO 8601 strings at every boundary and in storage; `endDate: null` means current. Every validation check returns a structured result naming the offending token — never a boolean, never a generic message.
- **On-disk layout.** `./data/resume.canon.json`, `./data/tailor.db`, `./data/rejections.log`, `./data/tag-aliases.json`, `./boards.json`, `./out/{id}.pdf`.

## UX & Interaction Patterns

- **Port the design system, don't reinvent it.** Bring the Modernist token source into `app/globals.css` as CSS custom properties — color roles with 100–900 tonal ramps, `--space-1..8` (4/8/12/16/24/32px), all `--radius-*` at 0, `--shadow-sm/md/lg`, heading/body font vars. Port its component classes (`.btn` family, `.tag` family, `.field`/`.input`/`.radio`/`.seg`, `.card`, `.nav`, `.table`, `.dialog-*`, `.hr`) rather than inventing parallel ones. Do not port the bundle's `support.js`. Components hard-code no hex values.
- **Type.** Archivo at 400/600/800 only. The app runs a deliberately denser scale than the design system's demo scale. `font-variant-numeric: tabular-nums` on all scores, dates, and timers.
- **Structural rules are absolute.** Zero corner radius anywhere. Flush-left labels, including inside wide buttons. Strong 2px dividers between major sections — never softened to a hairline or replaced by whitespace.
- **Interaction states are themed, never browser defaults.** `:focus-visible` gives a 2px accent outline at 2px offset on every interactive element; real hover and pressed states from the accent ramp; accent `::selection` tint; disabled controls at 45% opacity.
- **Accent is used sparingly** — primary action and small emphasis only. The accent-to-ground pair is tuned to 3:1, so paragraph-size accent text must use the 700 step, not the raw accent.
- **Glyphs are text characters** (`−`, `+`, `✓`, `›`, `·`, `!`, `←`). No images, no icon fonts.
- **Global chrome.** A sticky 39px top bar on every screen: brand `tailor` (Archivo 800, 16px), a 1px vertical divider, live pipeline counts (`N discovered / tailored / approved / submitted`, 11px uppercase), and right-aligned `watching N boards`. It must render cleanly with all counts at zero. The prototype's top-right `jump` select is **not** shipped.
- **The resume document's own proportions belong here**, not to the later review screen: name Archivo 800 23px at `-0.03em`, 10.5px contact line, a 2px ink rule, section headers 9.5px uppercase at `.14em` over a 1px rule, org lines Archivo 800 11.5px with right-aligned tabular dates above an italic role line, em-dash bullets at 10.5px/1.45 — plus a dashed page boundary at the bottom edge with `page 1 of 1 · letter` and the percentage of page used beneath it.
- **Desktop, wide viewport only.** No responsive layouts, by design. Motion is limited to a short fade-and-rise, a 1s blink, and a 400ms progress-bar transition, all disabled under `prefers-reduced-motion: reduce`.
- **Copy voice** is plain, terse, technical, sentence case, active verbs. Errors state what happened and what to do — no apologies, no vagueness. Every user-facing reference to the resume source names `resume.canon.json`.
- Where the build spec and the design source disagree: the build spec governs architecture, data contracts, validation, filenames, and data shapes; the design source governs visuals, copy, layout, and interaction.

## Cross-Story Dependencies

- Story 1.1 (scaffold, directory boundaries, enforced dependency rule) gates every other story in the epic.
- Story 1.6's canon gateway is the only source of resume data for Story 1.7's document and Story 1.8's gate.
- Story 1.7's `ResumeDocument` and props-builder are the input to Story 1.9's PDF render; Story 1.9 also consumes Story 1.8's gate, since a non-empty blocker list must refuse the export.
- Story 1.4's declare-once discipline is a standing constraint on Stories 1.6–1.9 and on all later epics, not a one-time deliverable.
- **Outward:** the gate function built in Story 1.8 is deliberately split from its UI — the blocker banner, the `NO RENDER` pane, and the fill-metric write path land in Epic 4. Epic 4 also reuses `ResumeDocument` unchanged; restyling it there would recreate exactly the preview/PDF divergence this epic exists to prevent. The bootstrap's migration mechanism is extended table-by-table by Epics 2–4.
- **Testing constraint carried into Story 1.8:** the seeded canon contains no `needs-number` and no `needs-content` bullet, so both blocking paths must be exercised against purpose-built fixtures. A test that verifies the gate "by running the app" would pass without ever executing it.
