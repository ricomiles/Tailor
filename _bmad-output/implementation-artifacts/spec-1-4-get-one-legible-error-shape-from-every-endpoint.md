---
title: 'Story 1.4 — Get one legible error shape from every endpoint'
type: 'feature'
created: '2026-08-28'
status: 'done'
baseline_commit: 'a5e5b74337df4ca0488568f1b175e1aa0c431d7d'
review_loop_iteration: 0
context: ['_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No endpoint exists yet, and the moment one does the client starts growing bespoke error handling per route. The epic's "errors flow one direction" rule — adapters throw typed errors, only the composition root formats HTTP — is stated nowhere in code and enforced by nothing: `Response` is a global, so `throw new Response("x", { status: 400 })` inside `core/` lints clean today.

**Approach:** Declare the envelope once in `core/` as a named zod schema, give adapters one typed error to throw, put the only HTTP formatting in `app/api/`, and make the core-side prohibition mechanical by extending the AD-1 guardrail with two new violation classes. Story 1.6 brings the first real endpoint; it should have nothing to invent.

## Boundaries & Constraints

**Always:**
- The envelope is declared once, in `core/`, as a named zod schema with its inferred type, importing nothing but `zod` (AD-1).
- Error codes are a frozen `const` object plus a union type — `erasableSyntaxOnly` forbids `enum`.
- Adapters throw a typed error carrying a stable code. Only `app/api/` turns one into a `Response`.
- The new prohibition is enforced by an ESLint rule that blocks the build, with a fixture per violation class and a probe proving it fires against the real `core/` tree — the same standard AD-1 already meets.
- `stage` is optional and drawn from AD-4's fixed six pipeline stages, declared once in `core/pipeline/` as its own named schema so Epic 3's runner inherits it rather than redeclaring it.
- Error codes start minimal. The story that first raises a new failure adds its code to the union; this story invents no taxonomy.

**Ask First:**
- Enabling type-aware linting for `core/**`. It would catch cross-file error shapes but changes lint cost and `verify:boundaries` runtime.
- Any HTTP status taxonomy beyond what the translator needs to map the codes this story declares.

**Never:** a route handler, an endpoint, or anything under `app/api/` that Next treats as a route — Story 1.6 ships the first one; `unstable_rethrow` or any other `unstable_`-prefixed API; `export const runtime` (`'nodejs'` is the default and `'edge'` is deprecated in Next 16); a catch-all translator that formats errors it does not recognize; `core/` importing `next/*`, and any second declaration of the envelope.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Typed error, with a stage | a typed error with code and stage | envelope carries that code, its message, and the stage; HTTP status mapped from the code | N/A |
| Typed error, no stage | a typed error with code only | envelope carries code and message; `stage` key absent, not `null` or `""` | N/A |
| Unrecognized throw | a plain `Error`, or a framework signal from `notFound()` / `redirect()` | rethrown untouched, never enveloped — the 404 or redirect still happens | rethrow, do not format |
| Malformed envelope | an object missing `code`, with an unknown code, or with a `stage` outside the six | schema parse fails naming the offending field | throw at the boundary; never emit a half-formed envelope |
| `Response` built in core | `new Response(…)` or `NextResponse.json(…)` under `core/` | `pnpm lint` errors, `pnpm build` fails | build-blocking |
| Status set in core | `throw { status: 404 }`, `e.statusCode = 500`, or a `statusCode` type member under `core/` | `pnpm lint` errors, `pnpm build` fails | build-blocking |
| Domain `status` in core | `z.object({ status: z.enum(["pending","running","done","failed"]) })` — `run_steps.status` under `core/` | lints clean — a domain status is not an HTTP status | N/A |

</frozen-after-approval>

## Code Map

- `core/errors/` -- new. The envelope schema, the code union, and the typed error. Only `zod` may be imported (AD-1).
- `core/pipeline/pipeline-stages.ts` -- new. AD-4's six stages in order, as a frozen tuple of slugs plus its named schema and inferred type. `run_steps.ordinal` is the 1-based index; `slug` is identity. Epic 3's runner imports this rather than restating it (AD-16).
- `core/pipeline/pipeline-counts.ts` -- **read-only, the pattern to follow.** Named schema, `z.infer` type, `Object.freeze` on the derived constant, and the comment convention explaining why the declaration is single.
- `app/api/` -- currently `.gitkeep` only. The translator lands here as a plain module, **not** a `route.ts`. Next 16: `Response.json(body, init)` needs no `next/server` import, and typing the return as `Response` still accepts a `NextResponse` from a future caller.
- `eslint.config.mjs` -- **edited.** `AD1`/`AD1_DEFERRED` message constants at L117; `noDeferredModuleLoading` at L213 is the template — purely syntactic, no path resolution, and its `report()` helper shows the sentinel-token convention for a subject with no literal, and its `Identifier` visitor is the precedent for catching a *reference* rather than a construct — which is what closes the aliasing escape. Register in the `tailor` plugin at L592, wire in the `coreBoundary` block at L602. *(Anchors re-measured 2026-08-28 after this story landed; the two new rules sit at L411 and L533.)* Parser has **no type information** (`project`/`projectService` both undefined), so every check must be syntactic.
- `eslint.config.mjs` L602 -- the `coreBoundary` block (`linterOptions` at L623). Add `linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" }`: today one `// eslint-disable-next-line` in real `core/` silences the whole AD-1 family and nothing goes red.
- `scripts/verify-boundaries.mjs` -- **edited, four lockstep sites.** `BOUNDARY_RULES` L93 (required, or the fixture is not accepted), `REQUIRED_CORE_RULES` L102 (which also asserts `linterOptions.noInlineConfig`, at L457), `REQUIRED_ROWS` L115 (one row per *clause*), `PROBES` L175 (a probe per clause, asserted on the **quoted** sentinel — `Response` is a substring of `NextResponse`). Acceptance requires the sentinel to appear single-quoted in the message.
- `tools/boundary-fixtures/core/canon/` -- new fixtures. Class is declared by line 1 only: `// EXPECT: violation "TOKEN"` or `// EXPECT: clean`; there is no manifest. Excluded from `tsconfig.json`, so a fixture need not compile. Do not name one `*.test.*` — `run-tests.mjs` walks `tools/` for stray tests.
- `tools/boundary-fixtures/README.md` -- **edited.** Its prose enumerates the violation classes.
- `tests/` -- Node `--test`, `.mts`, relative `.ts` imports. Core's tests live here because AD-1 forbids `node:test` inside `core/`.

## Tasks & Acceptance

**Execution:**
- [x] `core/pipeline/pipeline-stages.ts` -- declare `PIPELINE_STAGES` as the frozen ordered six (`fetch-posting`, `extract-requirements`, `match-canon`, `rewrite-bullets`, `validate`, `render-pdf`), with `pipelineStageSchema` and the inferred `PipelineStage`. -- AD-4 calls the set a fixed contract; declaring it once here is what stops Epic 3's runner and this envelope disagreeing about what a stage is.
- [x] `core/errors/error-envelope.ts` -- declare `ERROR_CODES` (frozen const object) with its `ErrorCode` union, `errorEnvelopeSchema` over `{ code, message, stage? }` where `stage` references `pipelineStageSchema`, and the inferred `ErrorEnvelope`. Start with `invalid-request`, `not-found`, `internal` and nothing more. -- The single declaration every later unit parses through; a taxonomy invented before a caller exists would be guessed, not derived.
- [x] `core/errors/tailor-error.ts` -- an `Error` subclass carrying a stable `ErrorCode` and optional stage, plus a narrowing predicate. -- Adapters need something to throw that the composition root can recognize without type information.
- [x] `app/api/to-error-response.ts` -- map a recognized typed error to its envelope and HTTP status via `Response.json`; rethrow anything unrecognized. -- The only place HTTP shape exists; rethrowing is what keeps `notFound()`/`redirect()` working without an `unstable_` API.
- [x] `eslint.config.mjs` -- add `tailor/no-http-response-in-core` and `tailor/no-http-status-in-core`, register and wire both, and set `noInlineConfig` on the core block. -- The prohibition has to block the build, not document an intention.
- [x] `tools/boundary-fixtures/core/canon/` -- a violating fixture per class, plus a clean fixture holding a legitimate domain `status` field. -- The clean fixture is the regression test for the false positive that would otherwise fire on the run/step schemas Epic 3 declares.
- [x] `scripts/verify-boundaries.mjs` -- add both rule ids, both `REQUIRED_ROWS` entries, and a probe per class. -- Without a probe the mechanism is proven only against fixtures, never against the real `core/` tree.
- [x] `tests/error-envelope.test.mts` -- cover every I/O matrix row that is not a lint case: both stage forms, the unrecognized rethrow, and the malformed-envelope throw. -- The translator has no live endpoint in this story, so these tests are its only behavioural proof.

**Acceptance Criteria:**
- Given the repository, when I search for another declaration of the envelope's fields, then only `core/errors/error-envelope.ts` declares them; likewise the six stage slugs appear only in `core/pipeline/pipeline-stages.ts`.
- Given an envelope carrying a `stage` outside AD-4's six, when it is parsed, then the parse fails naming `stage` rather than emitting an unknown stage.
- Given a module under `core/` that constructs a `Response`, sets a `statusCode`, or throws an object with a numeric HTTP `status`, when I run `pnpm build`, then it fails naming the offending construct.
- Given a module under `core/` that declares a domain `status` field whose value is not a numeric HTTP status, when I run `pnpm build`, then it passes.
- Given a `// eslint-disable-next-line` comment against a `tailor/*` rule inside `core/`, when I run `pnpm build`, then it fails rather than silencing the guardrail.
- Given the translator and a framework signal from `notFound()` or `redirect()`, when the signal reaches it, then it is rethrown unchanged and never becomes an envelope.

## Spec Change Log

## Design Notes

**Why the translator is not a catch-all.** Next 16's `notFound()`, `redirect()`, `unauthorized()` and `forbidden()` all signal *by throwing*. A translator that formatted every caught error would turn an intended 404 into a 500 envelope. Next's documented remedy is `unstable_rethrow()` — still `unstable_`-prefixed in 16.3.0, which this repo's pinned-stack discipline should not adopt silently. Recognizing only our own typed error and rethrowing the rest gets the same protection with no unstable API, and is the stricter contract anyway.

**Why two rules, not one.** A bare `status:` key match is a live false positive here, not a theoretical one: `run_steps.status` is specified as `pending | running | done | failed` and must be declared as a zod schema under `core/`. So `status` fires only on a numeric literal in 100–599, while `statusCode` / `httpStatus` / `statusText` fire unconditionally — those names carry no domain meaning. Splitting the two clauses gives each its own sentinel token, its own `REQUIRED_ROWS` line, and its own independent proof.

**What this story cannot prove.** With no route handler in the repo, the "every endpoint" half of the epic's requirement is carried by fixtures and unit tests, not by a live consumer. That is a known vacuity, recorded rather than hidden: Story 1.6 ships the first endpoint and is where the envelope stops being theoretical.

**Not detectable, deliberately skipped.** Two limits, both stated in the rules' own comments rather than left implied. `throw new AppError(...)` where `AppError`'s shape lives in another `core/` file needs type information the parser does not have — caught at the declaration site instead, since a `statusCode` member under `core/` is itself a violation. And the numeric `status` clause does no constant folding, so `{ status: 200 + 4 }` and `{ status: HTTP_NOT_FOUND }` pass; the unconditional `statusCode`/`httpStatus`/`statusText` names are what carry the weight there.

## Verification

**Commands:**
- `pnpm lint` -- expected exit 0.
- `pnpm typecheck` -- expected exit 0.
- `pnpm test` -- expected exit 0.
- `pnpm verify:boundaries` -- expected exit 0, and the summary line reports **four** more violation classes and four more mechanisms than the pre-story baseline of 26/3. One row and one probe per *clause* — `Response`, `NextResponse`, `statusCode`, `status` — not one per rule: a clause with no row can be deleted with every check green.
- `pnpm build` -- expected exit 0.
- `pnpm verify` -- expected exit 0; also re-arms the e2e freshness marker.
- Mutation check, per class: paste the violating fixture's body into a real file under `core/`, confirm `pnpm build` fails naming it, then delete it.
- Mutation check, inline config: add `// eslint-disable-next-line tailor/no-http-response-in-core` above that construct and confirm `pnpm build` still fails.
- `grep -rn "fetch-posting\|render-pdf" --include='*.ts' --include='*.tsx' --include='*.mts' core/ app/ adapters/ components/ tests/ tools/` -- expected: the only *declaration* is `core/pipeline/pipeline-stages.ts`; `tests/` restates the slugs as assertions, which is the point of the test.
- `grep -rn "errorEnvelopeSchema = \|ERROR_CODES = " --include='*.ts' core/ app/ adapters/` -- the envelope half of the same criterion, which was left as prose. Expected: `core/errors/error-envelope.ts` only.

## Suggested Review Order

**The contract**

- Start here: the one envelope every endpoint returns, and the only place its fields are declared.
  [`error-envelope.ts:46`](../../core/errors/error-envelope.ts#L46)

- Three codes, not a guessed taxonomy — the story that first raises a failure adds its own.
  [`error-envelope.ts:29`](../../core/errors/error-envelope.ts#L29)

- AD-4's six stages as a frozen ordered tuple; `run_steps.ordinal` is this array's 1-based index.
  [`pipeline-stages.ts:18`](../../core/pipeline/pipeline-stages.ts#L18)

- The schema is derived from the tuple, so the list and the union cannot drift.
  [`pipeline-stages.ts:31`](../../core/pipeline/pipeline-stages.ts#L31)

**Errors flowing one direction**

- What adapters throw: a stable code, an optional stage, no HTTP status anywhere.
  [`tailor-error.ts:16`](../../core/errors/tailor-error.ts#L16)

- Recognition is branded, not `instanceof` alone — a duplicated module copy would silently downgrade every typed error.
  [`tailor-error.ts:66`](../../core/errors/tailor-error.ts#L66)

- The only HTTP shape in the repo. Rethrows what it does not recognise, so `notFound()` still 404s.
  [`to-error-response.ts:68`](../../app/api/to-error-response.ts#L68)

- Status map parsed, not asserted — exhaustive over codes and range-checked, per the `pipeline-counts` convention.
  [`to-error-response.ts:39`](../../app/api/to-error-response.ts#L39)

**Making the prohibition mechanical**

- Catches every *reference* to `Response`, not every construct — which is what closes the aliasing escape.
  [`eslint.config.mjs:431`](../../eslint.config.mjs#L431)

- `globalThis.Response` and its bracketed form, reached without a receiver allowlist.
  [`eslint.config.mjs:439`](../../eslint.config.mjs#L439)

- Two clauses: unconditional names, and `status` only at a numeric HTTP literal.
  [`eslint.config.mjs:533`](../../eslint.config.mjs#L533)

- `noInlineConfig`: a disable comment can no longer opt a core file out of the guardrail.
  [`eslint.config.mjs:623`](../../eslint.config.mjs#L623)

**Proof the mechanism cannot rot**

- One row per clause, not per rule — a clause with no row can be deleted with every check green.
  [`verify-boundaries.mjs:115`](../../scripts/verify-boundaries.mjs#L115)

- A probe per clause, fired against the real `core/` tree rather than only against fixtures.
  [`verify-boundaries.mjs:175`](../../scripts/verify-boundaries.mjs#L175)

- Asserts the inline-config guard is still on; without this, deleting it went unnoticed.
  [`verify-boundaries.mjs:457`](../../scripts/verify-boundaries.mjs#L457)

**Supporting**

- The behavioural proof: the translator has no live endpoint yet, so these tests are it.
  [`error-envelope.test.mts:28`](../../tests/error-envelope.test.mts#L28)

- One shape per fixture; each verified by deleting its handler and watching that fixture go red.
  [`http-response-alias-escape.ts:1`](../../tools/boundary-fixtures/core/canon/http-response-alias-escape.ts#L1)

- The false-positive regression test: a domain `status` must stay legal under `core/`.
  [`clean-numeric-domain-status.ts:1`](../../tools/boundary-fixtures/core/canon/clean-numeric-domain-status.ts#L1)
