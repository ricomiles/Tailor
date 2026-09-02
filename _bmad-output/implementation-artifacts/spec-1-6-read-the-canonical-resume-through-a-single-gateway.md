---
title: 'Story 1.6 — Read the canonical resume through a single gateway'
type: 'feature'
created: '2026-09-02'
status: 'done'
baseline_commit: '5ca4cbd0188f583a7f35c6618dee115508a0ede3'
review_loop_iteration: 1
context: ['_bmad-output/implementation-artifacts/epic-1-context.md', '_bmad-output/specs/spec-tailor/canon-contract.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing in the app has ever opened `data/resume.canon.json`. Story 1.5 places the file and deliberately refuses to parse it, so the shape of the one document that holds everything true about Rico is declared nowhere. The next three stories all need that data, and if each reaches for the file it gets three parsers, three ideas of the shape, and three chances to normalize the unfilled-field sentinel differently.

**Approach:** One reader, split the way AD-1 forces: the shape, the sentinel and the normalization rule are declared once under `core/canon/` as Zod schemas with inferred types; a single `adapters/canon/` module performs the `fs` read and parses through them. Reads re-parse from disk every time — no cache, no invalidation, no staleness question. The "exactly one module opens it" criterion becomes a build-blocking project invariant rather than a sentence in a doc.

## Boundaries & Constraints

**Always:**
- Every read re-opens and re-parses the file. No memoization, no module-level cache, no invalidation hook — not as an optimization deferred, but as an absent mechanism.
- The unfilled-field sentinel (the literal string `TODO`) is normalized to absent for **scalar `basics` fields only**. Normalization happens inside the parse, so it cannot be bypassed by a caller who forgets to call a helper.
- A placeholder token inside a bullet's `text` is returned **verbatim** — never stripped, substituted, trimmed or flagged. Epic 4 requires showing it unchanged.
- The shape is declared once under `core/`, as named schemas with `z.infer` types, following `core/boards/boards-file.ts` exactly (`as const` + `z.enum`, no `enum`; `Object.freeze` at every level; `z.string().trim().min(1)`).
- The path `data/resume.canon.json` is declared exactly once and imported by both the gateway and `adapters/db/bootstrap.ts`.
- Failures throw `TailorError` with code `internal`, carrying the original as `cause`. Nothing else leaves the gateway.
- The gateway takes its root as a parameter defaulting to `process.cwd()`, as `bootstrap()` does — `pnpm test` fails the build if the suite touches the real `./data`.

**Ask First:**
- Adding an `ERROR_CODES` member. Resolved for this story: unreadable and malformed canon both use `internal`.
- Any write path to canon, including an "atomic write" helper prepared for Epic 4.
- Shipping an HTTP endpoint. Resolved for this story: none. `app/api/to-error-response.ts`'s comment claiming Story 1.6 ships the first endpoint is stale and gets corrected.

**Never:**
- No cache, no `USE_MOCK_DATA` branch (Story 1.10 owns mock content), no write path, no repair of a malformed canon.
- No second module that opens the file — including a test helper that reads it directly rather than through the gateway.
- No Node built-in, no `fs`, under `core/`. AD-1 bans them and `noInlineConfig` removes the escape hatch.
- No normalization of anything outside scalar `basics` — `profiles[].username`, `rendering.template` and bullet `text` all carry `TODO` today and must come back untouched.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean read | seeded canon | parsed document; `basics.phone` (literally `TODO`) comes back absent | N/A |
| Placeholder in a bullet | a bullet whose `text` holds a placeholder token | `text` returned byte-identical, token included | N/A |
| Sentinel outside scalar basics | `profiles[1].username === "TODO"`, `rendering.template === "TODO — typst \| latex \| html"` | both returned verbatim — normalization is scalar `basics` only | N/A |
| Bullet status | a bullet with `status: "needs-number"` or `"needs-content"` | parsed and returned; the seed has neither, so both come from fixtures | N/A |
| Authoring comments | `$comment`, `$comment_maxPages` present | accepted and ignored; canon is hand-authored and keeps its comments | N/A |
| Two reads in sequence | canon edited on disk between them | the second read reflects the edit | N/A |
| Missing file | no `data/resume.canon.json` | throws | `ENOENT` → `TailorError('internal', …, { cause })` naming the path |
| Malformed JSON | canon is not JSON | throws | `SyntaxError` → `TailorError('internal')` |
| Schema mismatch | `basics.name` absent, or a bullet with no `text` | throws, naming the failing field path | `ZodError` → `TailorError('internal')` |

</frozen-after-approval>

## Code Map

- `core/canon/canon-document.ts` -- **new.** The whole shape: `canonDocumentSchema` plus `basicsSchema`, `workEntrySchema`, `bulletSchema`, `educationEntrySchema`, `skillGroupSchema`, `excludedSchema`, `renderingSchema`, each with its `z.infer` type. Also `CANON_SENTINEL = "TODO"`, `BULLET_STATUSES` (`as const` tuple → `z.enum`, per `core/errors/error-envelope.ts:26-36`), and `CANON_FILE = "data/resume.canon.json"`. **Every object schema is strict** (`z.strictObject`, or `.strict()`): an unknown key is a parse failure naming it, never silently stripped. Zod's default `z.object` *drops* what it does not declare, so a hand-authored `staus:` typo parses clean and returns a bullet with no `status` — disarming Story 1.8's readiness gate with no error anywhere, on the one file this epic exists to protect. Declaring `$comment` and `$comment_maxPages` as fields is what makes strictness affordable. **Pattern to copy verbatim:** `core/boards/boards-file.ts` — schema naming, inferred type immediately below with no blank line, `Object.freeze` at every level (it is shallow — see `:82-94`), `z.string().trim().min(1)`, and the header sentence "`core/` may import `zod` and nothing else outward (AD-1)". Only import is `zod`; a sibling core import is relative with a `.ts` extension.
- `core/canon/canon-document.ts` scalar normalization -- the sentinel is mapped to `undefined` by a shared helper applied **only** to the scalar string fields of `basicsSchema` (`name`, `label`, `email`, `phone` and the four `location` strings). Inside the schema, not beside it, so parsing *is* normalizing. `work[].bullets[].text`, `profiles[]` and `rendering` use plain string schemas.
- `adapters/canon/canon-gateway.ts` -- **new.** `readCanon(root: string = process.cwd()): CanonDocument`. Opens `join(root, CANON_FILE)`, `JSON.parse`, then `canonDocumentSchema.parse`. Every failure through one private `failed(what, cause)` helper returning `TailorError(ERROR_CODES.internal, …, { cause })` — copy `adapters/db/bootstrap.ts:107-114` and its "nothing leaves except a TailorError" contract. **The thrown message is user-facing:** `app/api/to-error-response.ts` puts `error.message` straight into the response body, so do not embed the resolved absolute path or an unbounded Zod issue list — name `resume.canon.json` as the epic's copy rule requires, and cap the issue detail. Imports `core/` **relatively with `.ts` extensions**, never `@/` (`bootstrap.ts:14-16` states why: the Node test runner resolves neither tsconfig paths nor extensionless specifiers).
- `adapters/db/bootstrap.ts` -- **edited, two lines.** Replace the private `CANON_FILE` const (`:54`) with the import from `core/canon/canon-document.ts`. One declaration of the path, not two — the repo has already been bitten by three unlinked literals naming the migrations directory (`bootstrap.ts:70-77`). **Keep `DATA_DIRECTORY` and `CANON_FILE` linked:** `mkdirSync` still uses `DATA_DIRECTORY` while canon lands wherever the core constant says, so renaming one would create a directory and write canon into another. Derive the `mkdir` from `CANON_FILE`, or assert at module load that `CANON_FILE` sits under `DATA_DIRECTORY`. The frozen "declared exactly once" constraint scopes to *app source*: `scripts/startup-gate.mjs`, `run-tests.mjs` and `verify.mjs` each spell the path independently, which is pre-existing and now recorded in `deferred-work.md`.
- `scripts/project-invariants.mjs` -- **edited.** Add `CANON_READ_EXEMPT` (frozen, short) and `findCanonReaders(sources, exempt)`, then a block in `projectInvariantProblems`. The reference pattern **must not fire on prose or user-facing copy**: `epic-1-context.md` requires that every user-facing reference to the resume source names `resume.canon.json`, so a pattern matching any occurrence turns the first component obeying the copy rule into a build failure telling it to call `readCanon()`, with no escape but widening an exemption list the tests pin short. Match only where the name is used to *reach* the file — an `fs` call, an import, or `CANON_FILE` in a value position — or strip comments and string-literal copy before testing; record whichever you choose. **Placement is load-bearing: the block must sit before the `journalText === null` early return at `:301`**, or the canon invariant silently stops running whenever the journal is unreadable. New destructured input needs a benign default (`canonSources = []`) — `tests/project-invariants.test.mts`'s `CLEAN_INPUTS` will not carry it.
- `scripts/verify-boundaries.mjs` -- **edited.** Gather app-source bodies from `core/`, `adapters/`, `app/`, `components/`, `e2e/`, `tools/` **and the repo root**, beside the existing `pushSources` gather at `:689-698`, pass as a new input at the `projectInvariantProblems` call (`:715`), and extend the "Project invariants intact" sentence at `:850`. **The repo root is not optional, and omitting it is what sent round 1 back:** `instrumentation.ts` runs at server start, already imports the bootstrap adapter, and is the likeliest home in the repo for a "load canon once at boot" second reader — and it sits in no subtree. `next.config.ts` and `drizzle.config.ts` are in the same position. Use the non-recursive `rootEntries()` shape `scripts/run-tests.mjs:100-108` already has. The push ban made exactly this mistake in the other direction and `verify-boundaries.mjs:670-674` records it. Also `fail()` when the gathered set comes back empty — a renamed directory or a narrowed extension pattern must not disarm the scan while the success sentence still reads green. This is a project invariant, **not** a lint rule: it needs no `BOUNDARY_RULES` / `REQUIRED_ROWS` / `PROBES` entry, and an ESLint block scoped to `adapters/**` would trip the counter assertion at `:545` that pins the core rules to core files.
- `app/api/to-error-response.ts` -- **edited, comment only.** `:25-27` claims Story 1.6 ships the first endpoint. It does not; correct the sentence.
- `tests/canon-document.test.mts` -- **new.** Schema and normalization against fixtures built in memory. The seed carries no placeholder token and no `status` bullet, so both come from purpose-built fixtures — the same constraint Story 1.8 inherits.
- `tests/canon-gateway.test.mts` -- **new.** Temp-root convention from `tests/bootstrap.test.mts:29-62` (`mkdtempSync`, `roots[]`, `after()` cleanup). Fixtures are the real seed read from `REPO_ROOT` and mutated, then written into the temp root. Covers every error row and the re-parse-per-read row.
- `tests/project-invariants.test.mts` -- **edited.** Positive and negative tables for `findCanonReaders`; a `deepEqual` pinning `CANON_READ_EXEMPT` (the `PUSH_SCAN_EXEMPT` test at `:99-106` is the precedent); **a new line in the tripwire at `:336`** naming the new input, or the wiring can be swapped for an empty value with everything green; and the hard-coded `problems.length === 3` at `:325-334` needs re-checking.
- `README.md` -- document the gateway and the single-reader invariant beside the existing Bootstrap section.

## Tasks & Acceptance

**Execution:**
- [x] `core/canon/canon-document.ts` -- declare the full canon shape, `CANON_SENTINEL`, `BULLET_STATUSES`, `CANON_FILE`, and the scalar-`basics` normalization inside the schema. -- AD-16 makes `core/` the only legal home for a cross-unit type, and normalizing inside the parse is what makes the rule unbypassable.
- [x] `adapters/canon/canon-gateway.ts` -- `readCanon(root)`, re-parsing per call, every failure wrapped as `TailorError('internal')`. -- AD-1 keeps `fs` out of `core/`; this is the one module that opens the file.
- [x] `adapters/db/bootstrap.ts` -- import `CANON_FILE` from core instead of declaring it. -- Two literals naming one path is the drift this repo already paid for once.
- [x] `scripts/project-invariants.mjs` -- `CANON_READ_EXEMPT` + `findCanonReaders`, composed **before** the journal early return. -- AC 1 says the *project* has one reader; a prohibition nothing checks is a comment.
- [x] `scripts/verify-boundaries.mjs` -- gather app sources, pass them in, extend the success sentence. -- A check with no positive signal gives none when it stops running.
- [x] `app/api/to-error-response.ts` -- correct the stale comment about this story shipping an endpoint. -- A comment that predicts the wrong future misleads the next reader.
- [x] `tests/canon-document.test.mts` + `tests/canon-gateway.test.mts` -- cover every I/O matrix row, including both bullet statuses and the placeholder token, against purpose-built fixtures in a temp root. -- The seed exercises none of them; a test that read only the seed would pass without executing the behaviour.
- [x] `tests/project-invariants.test.mts` -- violating inputs for `findCanonReaders`, the exemption pin, and the tripwire line. -- Round 2 of Story 1.5 established that an unexercised composition rots silently.
- [x] `tests/project-invariants.test.mts` -- assert the scan's **scope**, not only its predicate: a canon read placed at the repo root must be reported. -- The predicate was always correct; nothing ever handed it that file, which is exactly how the gap shipped green.
- [x] `tests/canon-document.test.mts` -- assert an unknown or typo'd key is a parse failure naming it. -- A silently stripped `staus:` is the finding that sent round 1 back.
- [x] `tests/canon-gateway.test.mts` -- add an empty file, a UTF-8 BOM, and an unreadable-but-present file; and exercise `readCanon()`'s default root without touching the real `./data`. -- The frozen matrix lists none of these, but canon is hand-authored and these are its real failure modes; the default root is the one branch no test currently runs.
- [x] `scripts/` + `tests/` -- sort `findCanonReaders` output, skip `__boundary-probe.` files in any real-tree scan, and name each test for what it actually proves. -- Build output must not be machine-dependent, a concurrent `verify:boundaries` must not fail an unrelated suite, and a test named for coverage it lacks is worse than none.
- [x] `README.md` -- document the gateway and the single-reader rule, scoping the claim to app source and stating that scalar `basics` values are trimmed. -- The layout section already promises `core/canon/`, and an overclaiming README is how the next reader learns the wrong rule.

**Acceptance Criteria:**
- Given the repository, when I search for code that opens `data/resume.canon.json`, then only `adapters/canon/canon-gateway.ts` reads it, and `pnpm build` fails naming any second reader that appears.
- Given `adapters/canon/canon-gateway.ts`, when I inspect its exported surface, then it exposes reads only and no write path exists anywhere for canon.
- Given the gateway module, when I search it for a cache, memo, or invalidation, then no such mechanism exists.
- Given `pnpm test` followed by `git status`, then the working tree is clean and `./data` is untouched — the suite wrote only into temp roots.
- Given `pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm verify`, then each exits 0.

## Spec Change Log

- **2026-09-02 — Round 1: the single-reader guardrail did not reach the repo root, and the schema silently swallowed typos.** Two findings, both demonstrated against the built code. (1) The Code Map enumerated the scan as `core/`, `adapters/`, `app/`, `components/`, which leaves `instrumentation.ts` — the server-start hook that already imports the bootstrap adapter — outside it; a canon read added there passes `pnpm test`, `pnpm verify:boundaries` and `pnpm build`, so AC 1 was not what shipped. The push ban made the mirror-image mistake and `verify-boundaries.mjs:670-674` already records it. (2) The schemas used Zod's default `z.object`, which strips unknown keys: `bulletSchema.parse({… staus: "needs-number"})` succeeds and returns a bullet with **no** `status`, silently disarming Story 1.8's readiness gate on the irreplaceable hand-authored file. The Design Notes had anticipated the class of failure ("a loose object would silently accept real drift") without ever saying `.strict()`. Amended: the scan covers the repo root and fails on an empty gather; every object schema is strict; the reference pattern must not fire on user-facing copy, which collides with the epic's own copy rule. Known-bad state avoided: a guardrail that reports "intact" while the two things it guards are both reachable.

  **KEEP** — these survived review and must survive re-derivation: the `core/canon/` + `adapters/canon/` split with no `CanonPort`; normalization living *inside* the parse so no caller can skip it; `readCanon(root = process.cwd())` with the root as a parameter; the single private `failed()` wrapper and the TailorError-only contract; `CANON_FILE` declared in core and imported by bootstrap; the canon check composed **before** the journal early return; the tripwire line pinning the verifier's call arguments; `.refine()` rather than `.trim()` on bullet and summary text, so bullet text is never mutated; the wider `CANON_SCANNABLE` pattern that includes `.tsx`; and adding `core/canon/canon-document.ts` to `e2e-gate.mjs`'s `OBSERVED`, which was not in the Code Map and was the right call.

## Design Notes

**Why the gateway is split across two directories.** AD-1 bans every Node built-in under `core/`, enforced by `eslint.config.mjs` with `noInlineConfig: true`, so the module that opens the file cannot be a core module. The spine lists `core/canon/` as "the sole canon gateway (AD-8)" and separately lists five port families (`Board`, `Ats`, `Model`, `Render`, `Repository`) that do not include canon — so this ships no `CanonPort`. `core/canon/` holds the contract; `adapters/canon/` holds the one module that touches the disk. That is exactly the shape `adapters/db/bootstrap.ts` already has against `core/bootstrap/`.

**Why normalization lives inside the schema.** A separate `normalizeBasics()` beside the schema is a function a caller can forget. Mapping the sentinel to `undefined` within `basicsSchema` means every parse normalizes and there is no unnormalized path to reach. It also keeps the asymmetry legible in one place: the scalar `basics` fields use the sentinel-aware string, everything else uses a plain one.

**`$comment` keys are part of the document, not noise.** Canon is hand-authored and carries `$comment` at four sites, including the suffixed `$comment_maxPages`. Declare them as optional fields rather than making the objects permissive — a loose object would silently accept real drift, which is the failure this schema exists to prevent.

**What this story cannot prove.** The seed has no placeholder token, no `needs-number` bullet and no `needs-content` bullet, so every one of those paths is exercised only against fixtures. Story 1.8's gate inherits the same constraint, and a test that verified behaviour "by reading the real canon" would pass without ever running the code.

## Verification

**Commands:**
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm verify:boundaries` / `pnpm build` -- each expected exit 0.
- `pnpm verify` -- expected exit 0; also re-arms the e2e freshness marker.
- Mutation check: add a second reader and confirm `pnpm build` fails naming it — **once at the repo root (`instrumentation.ts`) and once inside a subtree**; then remove both.
- Mutation check: add an unknown key to a bullet fixture and confirm the parse fails naming it.
- Mutation check: delete the canon-scan input from the `projectInvariantProblems` call in `verify-boundaries.mjs` and confirm the tripwire test fails.
- `git status --porcelain` after `pnpm test` -- expected empty, and `data/resume.canon.json` unchanged by its mtime.

## Suggested Review Order

**The one reader**

- Start here: the whole contract in one signature — a root, a document, no side channel.
  [`canon-gateway.ts:144`](../../adapters/canon/canon-gateway.ts#L144)

- Every failure leaves as one `TailorError`; the message is user-facing, so it names the file and never the machine.
  [`canon-gateway.ts:62`](../../adapters/canon/canon-gateway.ts#L62)

- A Node errno message carries the absolute path — reduced to its code so a 500 body cannot leak the layout.
  [`canon-gateway.ts:82`](../../adapters/canon/canon-gateway.ts#L82)

- Bounded by count *and* length, with the count appended after the cap so it survives truncation.
  [`canon-gateway.ts:102`](../../adapters/canon/canon-gateway.ts#L102)

**The contract, declared once**

- Normalisation lives inside the schema, so parsing *is* normalising and no caller can skip it.
  [`canon-document.ts:129`](../../core/canon/canon-document.ts#L129)

- Authored prose is checked but never trimmed — a placeholder token must survive byte-for-byte.
  [`canon-document.ts:144`](../../core/canon/canon-document.ts#L144)

- Strict: a `staus:` typo is a parse failure naming the key, not a silently dropped field.
  [`canon-document.ts:235`](../../core/canon/canon-document.ts#L235)

- The path declared once, and imported by the routine that creates the file.
  [`canon-document.ts:33`](../../core/canon/canon-document.ts#L33)

- `DATA_DIRECTORY` is derived from it, so the two can never name different directories.
  [`bootstrap.ts:56`](../../adapters/db/bootstrap.ts#L56)

**Proof the rule holds — the round-1 gap**

- Scope is a pure function precisely because the predicate was never what was broken.
  [`project-invariants.mjs:329`](../../scripts/project-invariants.mjs#L329)

- Matches a quoted *path*, not a mention: the epic's copy rule requires prose to name the file.
  [`project-invariants.mjs:393`](../../scripts/project-invariants.mjs#L393)

- Comment lines come out first, so a doc comment is not a violation.
  [`project-invariants.mjs:370`](../../scripts/project-invariants.mjs#L370)

- Three exemptions, each justified, each asserted to exist.
  [`project-invariants.mjs:347`](../../scripts/project-invariants.mjs#L347)

- The verifier supplies two directory reads and nothing else — no second copy of the scope.
  [`verify-boundaries.mjs:716`](../../scripts/verify-boundaries.mjs#L716)

- Catches the next top-level directory to hold source, which is how the repo root was missed.
  [`verify-boundaries.mjs:788`](../../scripts/verify-boundaries.mjs#L788)

- Pins the guardrail's copy of the name to the core declaration it mirrors.
  [`verify-boundaries.mjs:808`](../../scripts/verify-boundaries.mjs#L808)

**Supporting**

- Drives the collection itself: a root file must come back, which string-matching the source could not show.
  [`project-invariants.test.mts:503`](../../tests/project-invariants.test.mts#L503)

- The exact input that shipped green in round 1.
  [`canon-document.test.mts:76`](../../tests/canon-document.test.mts#L76)

- The one branch every production caller takes, exercised without touching the real `./data`.
  [`canon-gateway.test.mts:294`](../../tests/canon-gateway.test.mts#L294)
