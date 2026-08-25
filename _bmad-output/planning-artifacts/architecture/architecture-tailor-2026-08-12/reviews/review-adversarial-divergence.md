---
review: adversarial-divergence
target: ../ARCHITECTURE-SPINE.md
lens: "Construct two units one level down that each obey every AD to the letter yet still build incompatibly."
reviewer: adversarial
date: '2026-08-12'
verdict: FAIL
---

# Adversarial Divergence Review — ARCHITECTURE-SPINE.md (tailor)

**Verdict: FAIL.** Not because the spine is badly shaped — the hexagon, the pipes-and-filters run, AD-7's isomorphic module and AD-8's single gateway are the right bones. It fails because the spine is written almost entirely in **ownership rules** ("one module owns X") and almost not at all in **shape rules** ("X has exactly this type"). Ownership without shape is not enough to keep independently-built epics compatible: two agents can both call the one true module and still hand it, and read back from it, incompatible data.

Below, "Unit A / Unit B" are two epics built by separate agents from this spine with no other contact. Every construction obeys every AD literally. I found four incompatibilities that break the product's stated trust premise (an unreviewed PDF ships; the approval gate is bypassable; a rejection orphans the UI; approved work is silently demoted), plus fifteen that produce ordinary integration breakage.

The units I pitted against each other:

| Unit | Scope |
| --- | --- |
| **U-SCAN** | board adapters, `boards.json`, queue population, dedupe, queue score (CAP-1, CAP-2) |
| **U-RUN** | pipeline runner, six stages, `run_steps`, outcomes, persistence (CAP-3, CAP-4) |
| **U-PROG** | run screen — polling, step list, elapsed timer, detail lines (CAP-3 UI) |
| **U-REVIEW** | review screen, diff pane, inline edit loop, answers, JD marking (CAP-5, CAP-7, CAP-8, CAP-9) |
| **U-VALID** | validation core, outcomes A–D, overclaim checks, readiness gate (CAP-4, CAP-5, CAP-6) |
| **U-CANON** | canon gateway, projection endpoint, fill-metric write (AD-8, CAP-6) |
| **U-PDF** | `ResumeDocument`, props-builder, Playwright render, text-layer assertion (CAP-10) |
| **U-ATS** | detection, `fill()`, handoff phases, confirm → Submitted (CAP-11) |
| **U-BOOT** | bootstrap, migrations, `boards.json` creation (AD-14) |

---

## CRITICAL

### D-1 — Outcome A "writes nothing" is incompatible with AD-3's polled run. The rejection is unreachable by the client.
**Pair: U-RUN × U-PROG (and the fabrication modal in U-REVIEW).**

*What U-RUN builds, obeying every AD.* AD-3: "the start endpoint returns a `runId` immediately and the run proceeds server-side. Each stage writes its start and end to `run_steps`." The ER diagram makes `RUN_STEPS` a child of `RUNS`. So `POST /api/runs` must `INSERT INTO runs` before stage 1 in order to have (a) an id to return and (b) a parent row for the FK. U-RUN therefore inserts a run row at t=0 with a null/pending outcome, and writes six pairs of timestamps into `run_steps` as it goes.

*What U-VALID builds, obeying every AD.* AD-5 Outcome A: a `sourceId` absent from canon "discards the whole run, **writes nothing**." data-model.md agrees: "writes no run row." So on Outcome A, U-VALID's contract says the run row and its steps must not exist. If U-VALID is literal, it deletes them (or U-RUN never created them).

*The exact incompatibility.* Both readings are AD-compliant and they are mutually exclusive:
- If the run row exists from t=0, AD-5's "writes nothing" is already false at the moment stage 1 starts, and the memlog's stated intent ("a rejected run still records where the time went") conflicts with the spine's own text.
- If the run row is deleted on rejection, then U-PROG — which is polling `GET /api/runs/{runId}` or `/steps` on a 500ms interval per AD-3 — receives a `404` at the precise instant the fabrication modal is supposed to appear. U-PROG, obeying AD-13, renders a generic error envelope. **CAP-4's headline success criterion ("surfaces the fabrication modal with a non-empty closest-real-experience panel") is unreachable through the only channel AD-3 permits**, because AD-3 forbids the client from holding a stream and the POST already returned.
- Third divergence: Outcome D "record the run as failed with the failing stage" — so D writes a run row and A does not. Two sibling outcomes with opposite persistence rules and no stated reason; U-PROG cannot write one polling handler that covers both.

*Closing rule.*
> **AD-16 — A run row exists from the moment `runId` is issued.** `POST /api/runs` inserts a `runs` row with `outcome = null` and returns its integer id; every stage writes to `run_steps` under it. No outcome ever deletes a run or its steps. "Writes nothing" in AD-5/Outcome A means **no `diff_items`, no `answers`, no `postings.state` change, no `pdf_path`** — it does not mean no run. Outcome A sets `runs.outcome = 'rejected'` and `runs.rejection_reason`, and the rejection payload is served from that row so the client's existing poll transitions straight into the fabrication modal.

---

### D-2 — Step 6 renders the PDF *before* the review, so the file handed to the ATS is not what was approved.
**Pair: U-RUN/U-PDF × U-REVIEW/U-ATS.**

*What U-RUN builds.* AD-4: "each of the six steps is a discrete filter function… One pipeline runner executes them in order." The six are fixed by model-contract.md and step 6 is **Render PDF** with a "page count" detail line. So U-RUN renders during the run and writes `runs.pdf_path`. The spine's own pipeline diagram shows `OK → S6`.

*What U-REVIEW builds.* AD-12: "Inline edits write through to `diff_items.user_edit` on a debounce." AD-9: the review preview renders from the Zustand slice. The user rewords three bullets, fills a metric, edits an answer, then clicks Approve. AD-10 and AD-7 tell U-REVIEW to re-run the gate and the overclaim checks server-side at Approve — **nothing in any AD tells it to re-render the PDF.**

*What U-ATS builds.* adapters.md: `fill(page, job, pdfPath, answers)`. U-ATS reads `runs.pdf_path` — the only pdf pointer that exists — and attaches it.

*The exact incompatibility.* `runs.pdf_path` points at a file rendered from the model's raw output at step 6, **before a single user edit existed**. U-ATS attaches it. The user submits a PDF containing text he edited away — possibly the exact overclaim he corrected. No AD is violated by any of the three units. This is a direct contradiction of CAP-10 ("a PDF that is exactly what the reviewer just approved") and of the product's entire trust premise, and it is silent: the preview pane looks right the whole time.

*Closing rule.*
> **AD-17 — The submittable PDF is rendered at Approve, from persisted rows, and nothing else may be handed off.** Step 6 produces the *run preview* artifact only. `POST /api/runs/{id}/approve` re-runs the readiness gate (AD-10) and the overclaim checks (AD-7), then re-renders through the same props-builder (AD-9) from `diff_items` (`user_edit ?? proposed`) and `answers`, asserts the text layer, and writes `runs.pdf_path` and `runs.approved_at`. `fill()` may only ever be given a `pdfPath` from a run with a non-null `approved_at`. Any edit after approval clears `approved_at` and invalidates the PDF.

---

### D-3 — The canon projection is undefined, and the version AD-7 describes cannot render a resume — so the preview and the PDF are built from different worlds.
**Pair: U-CANON × U-REVIEW × U-PDF.**

*What U-CANON builds.* AD-7 names the projection's contents exactly once, parenthetically: "(bullet id, text, tags, role)". U-CANON ships `GET /api/canon/projection → { bullets: Array<{ id, text, tags, role }> }`. That is faithful and minimal, and AD-8's "reads re-parse per operation" is honoured.

*What U-PDF builds.* AD-9: one shared props-builder; "the review screen from the Zustand slice, the PDF route from database rows." To render a resume the props need: `basics.name/label/email/phone/location/profiles[]`, the chosen `summaries[]` entry, and for each role `company / position / location / startDate / endDate` — plus `education[]` and `skills[]`. U-PDF gets all of that from the canon gateway server-side. Fine.

*The exact incompatibility.* The review screen calls the **same** props-builder (AD-9 requires it) but the only canon it is permitted to see is the four-field bullet projection. It has no `basics`, no company names, no dates, no education, no skills. So U-REVIEW must do one of:
1. call the shared builder with fabricated/empty values for everything the projection omits → **preview ≠ PDF**, the exact failure AD-9 exists to prevent, and the failure stack.md calls "the whole design premise collapses";
2. fork a second builder for the client → violates AD-9 in spirit while obeying its letter (it is still "one builder" per call site);
3. quietly widen the projection to full canon → now U-CANON's shape and U-REVIEW's expected shape are different objects with the same name, and the client-side overclaim check's fallback scope silently changes with it.

*Second, independent clash inside the same undefined shape.* validation-and-diff.md's novel-quantity check runs "against the source bullet text first, then against the **whole canon** as a fallback," and the verb check needs "another canon bullet **for the same role**." Server-side U-VALID reads full canon via the gateway — summaries, skills items, education, `context` strings, all of it. Client-side U-REVIEW passes it the four-field projection. Same module (AD-7 satisfied), **different corpus**. A number that appears in a summary or a skills entry passes on the server and flags on the client. The user sees a red OVERCLAIM band, edits a true sentence to make it go away, and the resume gets worse. AD-7 forbids the client being *laxer*; it never forbids it being *stricter*, and it never says the two sides must be fed the same input. Ownership was pinned; shape was not.

*Third:* `role` is a string in the projection. Is it `work[].id` (`job-saib-head`), `position` (`Head of Engineering`), or `company`? The verb check's "same role" grouping depends on it. U-VALID keys on `work[].id`; U-CANON, reading "role" as prose, emits `position` — and the two SAIB roles (`job-saib-head`, `job-saib-swe`) collapse or split wrongly, changing which verbs are allowed.

*Closing rule.*
> **AD-18 — One named `CanonSnapshot` type is the single canon shape crossing every boundary.** Declared in `core/canon/types.ts` as a Zod schema, it is what the gateway returns, what the projection endpoint serves verbatim, what the overclaim module takes, and what the props-builder consumes — server and client receive byte-identical payloads for a given run. It carries `basics` (with contact fields), `roles[] { id, company, position, location, startDate, endDate, bullets[] { id, text, tags, weight, status } }`, `summaries[]`, `education[]`, `skills[]`. `role` on a bullet is always `work[].id`. Nothing may pass a hand-built subset to the shared check module or the shared props-builder. Redactions, if any are ever wanted, are a later decision — today the snapshot is total.

---

### D-4 — The posting state machine has no named owner, so the queue's generic state endpoint becomes an approval-gate bypass, and Outcome A/D demote approved work.
**Pair: U-SCAN (queue) × U-REVIEW/U-VALID (approve) × U-RUN (outcomes) × U-ATS (confirm).**

*What U-SCAN builds.* CAP-2 needs `s` skip, bulk skip, and a toast Undo that "restores previous states." The natural build is `PATCH /api/postings/{id} { state }` plus `PATCH /api/postings/bulk`. It has to accept an arbitrary member of `Discovered | Tailored | Approved | Submitted | Skipped`, because Undo must restore *whatever the prior state was* — including `Approved`. Every AD is obeyed: the mutation goes through a route handler (Mutation convention), the store doesn't write the DB (AD-12), the envelope is shared (AD-13).

*What U-REVIEW/U-VALID builds.* AD-10 blocks approval on readiness blockers; AD-7 re-runs overclaim checks before Approve; AD-12 says the server re-validates at Approve. All three describe *an* approve path; none names it as the **only** path into `Approved`.

*The exact incompatibility.* Two write paths into `postings.state`, one gated and one not. `PATCH /api/postings/{id} {state:'Approved'}` — a legitimate, AD-compliant endpoint built by U-SCAN for Undo — skips the readiness gate, the overclaim re-check, and the PDF render entirely. U-ATS then reads a posting in `Approved`, calls `fill()`, and hands off an application with no PDF and unresolved flags. The single most load-bearing gate in the product is bypassable by the queue epic's own undo feature, and neither agent did anything wrong.

*Second clash, same pair.* AD-5 says Outcome A and Outcome D "leave the posting `Discovered`." U-RUN reads that as an instruction and writes `state = 'Discovered'`. But re-tailoring a posting that is already `Tailored`, `Approved`, or even `Submitted` is legal (nothing forbids it; the queue's row-open mapping even encourages returning to a posting). A model CLI timeout on a re-run therefore **demotes an approved posting to `Discovered`**, orphaning its PDF, its answers, and its handoff state. U-SCAN's queue, meanwhile, is written on the assumption that states only advance except via Skip. Concrete loss: real work destroyed by a network blip — precisely the class of thing AD-5's Outcome D was invented to prevent.

*Third:* `Skipped → Discovered: undo restores the previous state` requires storing the previous state. `postings` has no such column and the spine adds none. U-SCAN will either add `postings.previous_state` (a schema change no AD sanctions, invisible to U-BOOT's migration set) or hold it in Zustand — which AD-12 arguably forbids and which loses bulk-undo on refresh.

*Closing rule.*
> **AD-19 — Every posting state transition has exactly one named owner, and there is no generic state endpoint.** The transitions and their sole owners are: `→ Discovered` board scan (U-SCAN); `Discovered → Tailored` the pipeline runner on a persisted, non-rejected run; `Tailored → Approved` **only** `POST /api/runs/{id}/approve` after the AD-10 gate and AD-7 re-check pass; `Approved → Submitted` **only** the handoff confirm endpoint on explicit user confirmation; `* → Skipped` and its undo, the queue endpoints. A failed or rejected run **never changes `postings.state`** — AD-5's "leaves the posting `Discovered`" means "does not advance it," and is restated that way. `postings.previous_state` is added to the schema and is written only by the skip path.

---

## HIGH

### D-5 — `run_steps` has no defined columns, no step identity format, and no defined polling response.
**Pair: U-RUN × U-PROG.**

The spine says "Full column shapes stay in the spec's data model" — but data-model.md **has no `run_steps` table**; the spine itself says "`run_steps` is new." The deferral points at a document that does not contain the thing. So:

- U-RUN writes `run_steps(run_id, step_index INTEGER 1..6, started_at, ended_at, status)`. U-PROG expects `{ steps: [{ name: 'fetch-posting', durationMs, state: 'running' }] }`. Neither is wrong; they don't compose.
- **Step identity** is the string two units must agree on and the spine never pins: `1..6`? `'fetch-posting'`? `'FETCH_POSTING'`? AD-13's envelope also carries "the failing stage," and AD-5 says Outcome D records "the failing stage" — so this identifier appears in three places (`run_steps`, the error envelope, `runs`) and is pinned in none.
- **Duration** — who computes it? AD-3 forbids the client deriving progress "from a timer of its own," yet model-contract.md requires "the elapsed timer runs live." U-PROG either violates AD-3 or renders a clock that jumps in poll-interval steps. AD-3 conflates *step state* (server-owned) with *the elapsed clock* (must interpolate) and forbids both.
- **Detail lines** — model-contract.md specifies six ("source + request count", "count found", "bullets scored", "*n* of *m* selected", "page count"). These are computed from stage internals only U-RUN sees, but no column holds them. U-PROG will invent them client-side from whatever it can reach, and they will not match the real work — which is exactly what AD-4 exists to prevent.

> **AD-20 — The run state resource is a pinned shape.** `run_steps(run_id, step INTEGER 1–6, started_at, ended_at, status 'pending'|'running'|'done'|'failed'|'rejected', detail TEXT)`, `detail` written by the stage itself. Step identity is the integer 1–6 everywhere — `run_steps.step`, `runs.failed_step`, and the AD-13 envelope's `stage`. `GET /api/runs/{id}` returns `{ runId, postingId, outcome, failedStep, startedAt, endedAt, steps: RunStep[] }` and is the only run-state resource. The client computes elapsed as `now - startedAt` for display only; every step boundary and duration comes from the server.

### D-6 — Two fetches of the JD text, one exact-substring requirement. CAP-8 silently renders zero matches.
**Pair: U-SCAN × U-RUN × U-REVIEW.**

U-SCAN's adapter strips HTML and stores `postings.description` (adapters.md). U-RUN's stage 1 is literally named **"Fetch posting"** with a detail line of "source + request count" — a plain reading is that it fetches the posting from the board, and it is the stage that hands JD text to the model (model-contract: "User message carries the scraped JD text"). U-REVIEW then computes `matchedRequirements[].quote` spans by locating each quote in the JD **at render time** — against `postings.description`, the only JD text a screen can reach.

If stage 1 re-fetches, or normalizes whitespace/entities even slightly differently from the scan-time strip, every quote fails exact substring match. Per model-contract, a non-exact quote is **dropped, never fuzzy-matched**. CAP-8 degrades to an empty state with no error, no envelope, no log line. Nobody owns "the JD text of record."

> **AD-21 — One JD text of record.** `postings.description` is written once by the board adapter through a single shared HTML-strip/normalize function in `core/`, and is the *only* text ever sent to the model and the *only* text spans are located in. Pipeline stage 1 resolves the posting from the repository; it re-fetches from the board only when the posting is absent, and any re-fetch writes back through the same normalizer before the model call.

### D-7 — `runs.outcome` is an unpinned enum, its four values are not mutually exclusive, and it goes stale the moment the user edits.
**Pair: U-VALID × U-REVIEW.**

AD-5 presents "four run outcomes" as if exhaustive and exclusive. They are not. A single run can simultaneously be persisted, carry an Outcome B flag on bullet 3, and carry an Outcome C blocker on bullet 5 — and the fully-clean case has no letter at all. U-VALID must write one column. It writes `'C'` (blocker wins) and loses the flag; U-REVIEW branches on `outcome === 'B'` to decide whether to show the OVERCLAIM band and gets nothing. Or U-VALID writes `'ok'` for anything persisted and U-REVIEW's blocked-render banner never fires. Values are unpinned too: `A|B|C|D` vs `rejected|flagged|blocked|failed` vs `success`.

Worse: outcome is a *snapshot of validation at run time*, but B and C are both resolvable by the user during review. After the user fills the metric and edits the flagged bullet, `runs.outcome = 'C'` is a lie. AD-10 says blockers come from a gate function computed live; AD-5 says outcome is a stored property. No AD says which one the UI, or the Approve endpoint, is to believe.

> **AD-22 — Outcome is terminal-only; resolvable conditions are computed, never stored as outcome.** `runs.outcome ∈ { null (in flight), 'ok', 'rejected' (A), 'failed' (D) }` — the two terminal, unrecoverable results. Outcome B lives per-row in `diff_items.flagged/flag_why/resolved`; Outcome C is never persisted at all — it is the live return of the AD-10 gate. Approve and render consult the live gate and live flags, never `runs.outcome`.

### D-8 — Postings have many runs; nothing names "the current run," and no run is marked approved.
**Pair: U-REVIEW × U-PDF × U-ATS.**

The ER diagram is `POSTINGS ||--o{ RUNS`. Re-tailoring and "Re-run without this claim" (CAP-4) both create additional runs. Given a posting in `Approved`, three units must independently answer "which run?": U-REVIEW opens the latest by `created_at`; U-PDF renders the one it was handed; U-ATS looks for the one with a non-null `pdf_path` — and after a re-run, two runs have one. `runs` has no `approved_at`, no `is_current`, and `postings` has no `current_run_id`. A re-run that ends in Outcome D leaves the posting `Approved` (per D-4's fix) with U-REVIEW now showing the *failed* run because it is the newest. The handoff attaches the wrong PDF and the wrong answers with no error anywhere.

> **AD-23 — A posting points at its current run.** `postings.current_run_id` is set by the pipeline runner when (and only when) a run persists successfully, and by nothing else. `runs.approved_at` marks the approved run (AD-17). Every screen and adapter resolves work through `postings.current_run_id`; "latest by timestamp" is never used as an identity rule.

### D-9 — Two write paths into `diff_items.flagged/resolved`, one of them the client's.
**Pair: U-VALID × U-REVIEW.**

AD-12 says inline edits "write through to `diff_items.user_edit` on a debounce." AD-7 says "client-reported flag state is never trusted." U-REVIEW, having just run the isomorphic check locally for instant feedback, has flag state in hand and a debounced PATCH going out anyway — the obvious build is `PATCH /api/diff-items/{id} { userEdit, flagged, flagWhy, resolved }`. That is not forbidden by any AD's letter (AD-7 constrains *trust*, not the request body), and it makes the store and DB agree. U-VALID meanwhile re-computes flags at Approve and writes the same columns. Last writer wins; the column that gates the Approve button has two owners, one of them the client. A stale or optimistic client write leaves `resolved = 1` on a bullet the server would flag, and `resolved` is exactly what CAP-5 says keeps Approve disabled.

> **AD-24 — The edit write-through carries text only.** `PATCH /api/diff-items/{id}` accepts `{ userEdit }` and nothing else. The handler re-runs the AD-7 module server-side on every write and is the sole writer of `flagged`, `flag_why`, and `resolved`; it returns the authoritative flag state, which the client displays. Client-computed flags are render-time-only and are never serialized.

### D-10 — `boards.json` shape, the `source` string, and `external_id`'s type are the three strings four units must agree on, and none is pinned.
**Pair: U-BOOT × U-SCAN × U-ATS.**

AD-14 says bootstrap "creates `boards.json` with a documented shape" and then documents no shape; SPEC.md flags this explicitly as an assumption ("the build spec names the file as the config location but not its shape"). U-BOOT writes `[{ "type": "greenhouse", "token": "acme" }]`; U-SCAN, whose port signature is `fetchJobs(boardUrl)` (AD-2, fixed and "not re-opened"), expects a URL and has to reconstruct one from a token — or U-BOOT writes URLs and U-SCAN has to regex the vendor back out. Both are AD-compliant; only one file exists.

Compounding, two identity strings are unpinned:
- **`postings.source`** — `'greenhouse'` / `'Greenhouse'` / `'gh'`. Dedupe is on `(source, external_id)`, so a casing change between the scan epic and a later fix reintroduces duplicates, failing CAP-1's explicit success criterion. U-ATS separately detects the vendor from the posting URL and selects an adapter — if its vendor keys don't match U-SCAN's `source` values, detection silently returns `unsupported` for every posting.
- **`external_id`** — Greenhouse ids are numeric, Lever's and Ashby's are UUID strings, Workable's is a `shortcode`. `String(id)` vs `id` gives two different dedupe keys for the same job across a schema tweak.

Also unowned: the domain type `Posting` returned by `fetchJobs` cannot include `score` (needs `core/scoring`) or `state`, so the adapter's `Posting` and the DB row's `Posting` are different types with one name.

> **AD-25 — Vendor identity and the board config are pinned once.** `core/vendors.ts` exports `type Vendor = 'greenhouse' | 'lever' | 'ashby' | 'workable'` — lowercase, used as `postings.source`, as the board adapter registry key, and as the ATS adapter registry key. `boards.json` is `{ "boards": [{ "type": Vendor, "token": string, "label"?: string }] }`; URL construction from `(type, token)` lives in the board adapter. `external_id` is always `String(...)` of the vendor's own id. `fetchJobs` returns `FetchedPosting` (`source, externalId, company, role, location, url, description`) — scoring and state are applied by the route handler, never by an adapter.

### D-11 — Fill-metric updates canon but not the persisted diff, so `{{payments.throughput_usd}}` can render into the PDF.
**Pair: U-CANON × U-REVIEW × U-PDF × U-VALID.**

U-RUN persists `diff_items.proposed` containing the raw placeholder token (validation-and-diff.md requires it be *shown* raw). U-CANON's fill-metric write substitutes the value into `resume.canon.json` — AD-8's one write path — and returns success. U-REVIEW's AD-10 gate re-runs, reads canon, sees no placeholder, and **unblocks**. But `diff_items.proposed` still contains `{{payments.throughput_usd}}`, and per AD-9 the PDF route builds props **from database rows**. The approved PDF ships the literal placeholder. Meanwhile the preview, if U-REVIEW re-fetched the projection, shows the filled value. Preview ≠ PDF, and the failure mode is a raw template token in a document sent to an employer.

Three sub-holes feed it: the placeholder **token syntax** is only ever an "e.g."; whether the gateway **clears `status: "needs-number"`** after a fill is unstated (U-VALID detecting blockers by `status` blocks forever while U-VALID detecting by regex passes — two AD-compliant detection strategies); and canon-contract.md's write rule is self-contradictory ("substitute a value into an existing needs-number field… never alters bullet text" — substituting *is* altering the text).

> **AD-26 — Placeholders are resolved at one point, and the fill path repairs the run.** Placeholder syntax is `{{path.to.metric}}`, matched by one exported regex in `core/canon`. "Unfilled" is defined solely as *the token is present in the bullet text*; `status` is advisory metadata. The fill endpoint (a) writes canon through the gateway, clearing `status`, and (b) in the same handler rewrites every `diff_items.original/proposed/user_edit` for the affected `source_id` in the current run, then (c) re-runs the AD-7 checks on the touched rows. Neither the props-builder nor the renderer performs placeholder substitution.

### D-12 — The error envelope's field names are never given, and AD-15's response cannot be expressed in it.
**Pair: every route-handler unit × U-REVIEW's fetch layer.**

AD-13 names three *concepts* — "a stable code, a human-readable message, and the failing stage" — and no field names, no nesting, no success shape, no HTTP-status rule. U-RUN ships `{ error: { code, message, stage } }` with a 500; U-SCAN ships `{ ok: false, code, message }` with a 200; U-CANON ships `{ code, message }` with a 422. The client writes one wrapper against the first shape it meets and mis-parses the other two — and because the success shape is equally unpinned (`data` envelope vs bare body), it cannot even reliably tell success from failure.

Sharper: **AD-15 requires returning "the active `runId`" on refusal, and AD-13's envelope has no field that can carry it.** One AD mandates a payload the other AD's shape forbids. U-RUN adds a top-level `runId`; the client's AD-13-conformant parser drops unknown fields; the "a run is already in flight — resume it?" affordance silently degrades to a generic error.

> **AD-27 — One envelope, both directions, with a details slot.** Success: `200` with the bare resource. Failure: the mapped HTTP status with `{ error: { code: string, message: string, stage?: 1–6, details?: Record<string, unknown> } }`. `code` values live in one exported union in `core/errors.ts`. AD-15's refusal is `409 { error: { code: 'RUN_IN_FLIGHT', message, details: { runId } } }`. One typed client fetch wrapper is written once and imported by every screen.

---

## MEDIUM

### D-13 — Nobody owns the page budget, so the preview and the PDF disagree about which bullets exist.
**U-REVIEW × U-PDF.** Canon's `rendering` gives `maxPages: 1`, `bulletsPerRole {current:4, recent:4, older:2}`, and `include: "when-space"` on `job-kyocera`. These are passed into the model's system prompt as *steers* — the model may return more. AD-9's props-builder is shared, but nothing says whether it enforces the budget. U-REVIEW's diff pane shows every `selected` item (CAP-7 requires the user see them all); U-PDF's renderer must fit one page. If the builder truncates, the preview shows six bullets and the PDF has four. If it doesn't, `maxPages: 1` is violated silently. And `include: "when-space"` is an **unowned decision that requires a measurement only the renderer can make** — no unit can decide it without rendering first.

> **AD-28 — The props-builder is the sole enforcer of the render budget, and the preview renders its output.** It applies `bulletsPerRole` and `include` deterministically (by canon `weight`, ties broken by canon order) and returns `{ props, omitted: [{ sourceId, reason }] }`. The review pane renders exactly `props` and surfaces `omitted` as a "not on the page" affordance in the diff. `include: "when-space"` resolves deterministically from the budget, never from a measured page height; `maxPages` overflow is a render-time assertion that fails loudly like `requireTextLayer`.

### D-14 — Answers have no persistence rule and no pinned handoff shape.
**U-REVIEW × U-ATS.** AD-12's debounced write-through is specified for `diff_items.user_edit` only. U-REVIEW may reasonably keep answer edits in the store until Approve; U-ATS reads the `answers` table for `fill(page, job, pdfPath, answers)`. Refresh mid-review and the diff edits survive while the answers silently revert — a split that violates the stated reason for AD-12 (never lose a paid session). And `answers` is rows in the DB but an object in the model contract; `fill()`'s parameter shape is unpinned, so U-ATS receives `{field, value}[]` and expects `{workAuthorization, noticePeriod, whyThisCompany}`.

> **AD-29 — Answers follow the same write-through as diff items and cross boundaries as one object.** `PATCH /api/runs/{id}/answers { field, value }` on the same debounce; `answers` rows are `(run_id, field)`-keyed and `field ∈ {workAuthorization|noticePeriod|whyThisCompany}`. `core` exports `type Answers = Record<AnswerField, string>`; the repository maps rows to it and `fill()` receives only that.

### D-15 — AD-15's lock covers the model call but not the two other exclusive resources, and a crash wedges it forever.
**U-RUN × U-PDF × U-ATS.** AD-15's stated rationale is contention over "a headed Chromium and a CLI model subprocess," but its rule only refuses *starting a run*. The Approve re-render (D-2) and `fill()` both launch Chromium outside any run. Concrete: U-ATS has a headed browser open in the `waiting` phase while the user, in another tab, hits Approve on a different posting and U-PDF launches a second headed Chromium. Separately, "active" is presumably `outcome IS NULL` — so a `pnpm dev` restart mid-run leaves a permanently active row and every subsequent run is refused, with no reaper named in AD-14's bootstrap.

> **AD-30 — One exclusive-resource lock, released on startup.** A single in-process mutex guards the model subprocess and every Chromium launch (run step 6, approve re-render, ATS handoff). The bootstrap routine (AD-14) marks any `runs` row with `outcome IS NULL` as `'failed'` on startup before serving traffic.

### D-16 — The overlap score's scale and formula are unowned, and rescans never rescore.
**U-SCAN × U-VALID (fabrication modal).** AD-11 pins the *extractor*, not the *score*. `postings.score` feeds a UI threshold (`≥ 80` fills with accent) and the model's own `score` is separately 0–100 — so scale is load-bearing. U-SCAN computes `matched/jdTags * 100`; the closest-real-experience matcher computes a raw intersection count; the two "scores" are incomparable and one of them silently never crosses 80. Also: dedupe on rescan means an existing posting is not re-inserted — is its `description` refreshed, and if so is `score` recomputed? Unowned; scores go stale against an edited JD.

> **AD-31 — One scorer, one scale, recomputed on every write of `description`.** `core/scoring` exports `overlapScore(a: string[], b: string[]): number` returning an integer 0–100 by one documented formula, used by both consumers. Any write to `postings.description` recomputes `postings.score` in the same handler.

### D-17 — Editing a `kept` bullet escapes the overclaim checks.
**U-VALID × U-REVIEW.** validation-and-diff.md's construction table applies Outcome B checks to `selected` items; the flagged case is listed under `reworded`. U-VALID, reading the table literally, runs checks on rows where `kind = 'reworded'`. U-REVIEW lets the user edit any bullet in the pane, including `kept` ones (CAP-7 says "typing in a proposed bullet"; it doesn't carve out kept). A user edits a `kept` bullet to add "$40M TVL" — `kind` is still `kept`, the check never runs, Approve is enabled, and a fabricated number reaches the PDF through the one hole in the gate the whole product is built around. Nobody owns whether an edit mutates `kind`.

> **AD-32 — Checks run on effective text, not on `kind`.** Every AD-7 evaluation runs over `user_edit ?? proposed` for **every** diff item whose kind is not `dropped`, regardless of `kind`. A user edit never changes `kind`; `kind` records the model's mapping only.

### D-18 — `diff_items` has no ordering column.
**U-REVIEW × U-PDF.** The store holds an array (model order); the PDF route reads rows and, absent an `ORDER BY`, gets insertion order — usually the same, until a re-validate or a fill-metric repair (D-11) rewrites rows, or SQLite returns them differently after an update. The rendered resume must also group by role and order roles by date, which requires a canon join neither unit is told to own. Divergence here is invisible: both documents contain the same sentences in different places.

> **AD-33 — `diff_items.position INTEGER NOT NULL`, assigned at construction from the model's array order.** The props-builder groups by canon role (roles ordered by `startDate` descending, `endDate: null` first) and orders bullets within a role by `position`. Every read is `ORDER BY position`.

---

## LOW

- **D-19 — `USE_MOCK_DATA` has no owner.** AD-1 forbids `core` reading env; the Configuration convention permits the flag but names no reader. U-SCAN branches inside the board adapter; U-REVIEW branches inside the store; the two mock worlds disagree about ids and the queue shows postings no run can find. *Rule:* the flag is read in exactly one place — the composition root's adapter selection — and mocks are alternate adapter implementations, never client-side branches.
- **D-20 — The canon projection vs AD-12's "never mirrored long-term."** The projection is server data that the review session must hold for the whole session to run per-keystroke checks. U-REVIEW either caches it (contradicting AD-12's letter) or refetches per debounce (needless, and a race where the corpus changes mid-edit). *Rule:* AD-12 exempts the `CanonSnapshot`, which is fetched once per review session, is read-only, and is re-fetched after any fill-metric write.
- **D-21 — Canon `schemaVersion` is never validated.** Canon is hand-editable configuration. A malformed or v2 file surfaces as… what? U-BOOT's bootstrap failure, U-CANON's typed error, or U-RUN's Outcome D at stage 3? Three units, three behaviours. *Rule:* the gateway validates against the Zod `CanonSnapshot` schema and asserts `schemaVersion` on every read; failure is a single typed `CANON_INVALID` error, surfaced at bootstrap and as Outcome D mid-run.
- **D-22 — `out/{id}.pdf` — which id?** stack.md says `{id}`; `runs.pdf_path` implies run. U-PDF writes `out/{runId}.pdf`, U-ATS reconstructs `out/{postingId}.pdf` instead of reading the column. *Rule:* the path is `out/run-{runId}.pdf`, written once into `runs.pdf_path`, and every consumer reads the column — no consumer ever constructs the path.

---

## Summary of proposed additions

| New/tightened | Closes | Severity |
| --- | --- | --- |
| AD-16 run row exists from `runId` issue; "writes nothing" scoped | D-1 | critical |
| AD-17 PDF rendered at Approve; `approved_at` gates handoff | D-2 | critical |
| AD-18 one `CanonSnapshot` type, identical server and client | D-3 | critical |
| AD-19 one owner per state transition; no generic state endpoint; failed runs never demote | D-4 | critical |
| AD-20 `run_steps` columns, integer step identity, pinned run resource | D-5 | high |
| AD-21 one JD text of record | D-6 | high |
| AD-22 outcome is terminal-only; B/C computed live | D-7 | high |
| AD-23 `postings.current_run_id` + `runs.approved_at` | D-8 | high |
| AD-24 edit write-through carries text only | D-9 | high |
| AD-25 `Vendor` union, `boards.json` shape, `external_id` as string | D-10 | high |
| AD-26 placeholder syntax + fill repairs the run's diff rows | D-11 | high |
| AD-27 one envelope with `details`, both directions | D-12 | high |
| AD-28 props-builder owns the render budget | D-13 | medium |
| AD-29 answers write-through + `Answers` object at boundaries | D-14 | medium |
| AD-30 one exclusive-resource lock, released at bootstrap | D-15 | medium |
| AD-31 one scorer, one 0–100 scale, recomputed on description write | D-16 | medium |
| AD-32 checks run on effective text, not `kind` | D-17 | medium |
| AD-33 `diff_items.position` and a canonical ordering | D-18 | medium |
| (four low rules inline) | D-19–D-22 | low |

**The pattern worth naming.** Sixteen of these twenty-two findings are the same failure: an AD names a single *owner* and never names the *shape* that owner emits. `run_steps`, the canon projection, the error envelope, `boards.json`, `Posting`, `Answers`, `runs.outcome`, the step identifier, the vendor string, the placeholder token, the props-builder's return — every one is a contract two epics must agree on letter-for-letter, and every one is currently a noun phrase in prose. The cheapest global fix is a single rule with teeth:

> **AD-34 — Every type that crosses a unit boundary is declared once, in `core/`, as a named Zod schema with an inferred TypeScript type.** No epic may define, widen, or hand-roll a shape that another epic reads: not a route response, not a table row mapping, not an adapter return, not a props object. If a shape has two authors, it has no author.
