---
title: 'Story 1.5 — Start the app on a clean machine and have it set itself up'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: 'f6d077641cee7f175d206850ef4a67fdab11bebe'
review_loop_iteration: 2
context: ['_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing creates `./data`, so the first write of any kind fails on a clean machine; canon has no home; and no schema mechanism exists. Worse, nothing stops a later story from reaching for `drizzle-kit push`, whose converging sync can drop a column holding real posting and run history.

**Approach:** One idempotent routine, invoked from Next's `instrumentation.ts` at server start, that creates `./data`, copies an app-owned canon seed **only if absent**, writes `boards.json` **only if absent**, and applies versioned Drizzle migrations from a journal that ships empty. The `boards.json` shape and the routine's report are declared once in `core/` (AD-16). The no-push prohibition becomes a build-blocking check, not a sentence in a doc.

## Boundaries & Constraints

**Always:**
- Idempotent by construction: every file is created under an existence check or an exclusive-create flag. An existing file is never opened for write, never re-serialized, never "repaired".
- Canon is copied byte-for-byte from the seed. Bootstrap does not parse, validate, or normalize canon — Story 1.6's gateway is the only module that opens it (AD-8). Bootstrap places the file and never touches it again.
- `boards.json` is `{ "boards": [{ type, token, label? }] }` where `type` is the lowercase `Vendor` union. Declared exactly once under `core/`, with its inferred type (AD-16); Epic 2 reuses it as `postings.source` and as both adapter registry keys.
- Filesystem, `better-sqlite3`, and `drizzle-orm` code lives in `adapters/` — AD-1 bans Node built-ins and drizzle under `core/`, and the guardrail already enforces it.
- The routine returns a structured report naming what it did to each artifact, so idempotence is asserted directly rather than inferred from an absence of errors.
- Failures throw `TailorError` with a stable code (`core/errors/`). No HTTP shape, no bare `Error`.

**Ask First:**
- Adding any content table. `postings`, `runs`, `run_steps`, `diff_items`, `answers` each belong to the later story that first needs them.
- Anything that gives bootstrap a write path to an *existing* `resume.canon.json`.
- Adding a new `ERROR_CODES` entry — each one forces a sentence in `DEFAULT_MESSAGE_BY_CODE` and a status in `HTTP_STATUS_BY_CODE`.

**Never:**
- No `drizzle-kit push`, no `db:push` script, no schema sync of any kind.
- No content tables in this story's migrations directory.
- No creation of `./out`, `./data/rejections.log`, or `./data/tag-aliases.json` — Stories 1.9, and Epics 2–3, own those. Bootstrap creates what it needs, not what is merely documented.
- No mock content on the seed path (FR94).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean machine | no `./data`, no `boards.json` | `./data` created, canon seeded, `boards.json` written as `{"boards":[]}`, `__drizzle_migrations` created; report says `created` for all three | fs failure → `TailorError('internal', …, { cause })` |
| Re-run | every artifact present, canon hand-edited | nothing written; canon byte-identical; report says `left-untouched` for all three | N/A |
| Partial state | canon present, `boards.json` deleted | only `boards.json` created; canon untouched | N/A |
| Malformed existing file | `boards.json` holds invalid JSON | left untouched, bootstrap succeeds — idempotence outranks repair; Epic 2's reader parses through `boardsFileSchema` and reports | N/A |
| Journal deleted | `adapters/db/migrations/meta/_journal.json` missing | drizzle throws `Can't find meta/_journal.json file`; bootstrap fails loudly | wrapped in `TailorError('internal')` |
| Concurrent start | two processes race to create | exclusive-create loses harmlessly; the loser reports `left-untouched` | `EEXIST` swallowed, all else rethrown |

</frozen-after-approval>

## Code Map

- `instrumentation.ts` -- **new, repo root** (sibling of `app/`, not inside it). Next 16.3.0 needs **no config flag** — `experimental.instrumentationHook` is gone. Guard the body on `process.env.NEXT_RUNTIME === "nodejs"`; the edge runtime cannot load a native addon. **Verified in installed source:** `node_modules/next/dist/server/lib/router-utils/instrumentation-globals.external.js` returns early when `NEXT_PHASE === 'phase-production-build'`, so `register()` does **not** run during `next build`; and `ensureInstrumentationRegistered` memoizes on `registerInstrumentationPromise`, so it runs once per server process. It does fire under `next dev` and `next start` — including the `next start` in `playwright.config.ts:29`, so every e2e run exercises the re-run path against the real `./data`.
- `adapters/db/bootstrap.ts` -- new. The routine. Signature takes a root directory defaulting to `process.cwd()` — that parameter is what makes it testable without polluting the repo (`pnpm test` runs *inside* `pnpm build`). Imports `core/` relatively with explicit `.ts` extensions, never `@/` — the Node test runner resolves neither tsconfig `paths` nor extensionless specifiers (the convention comment is copy-pasted at `core/errors/error-envelope.ts:2`).
- `adapters/db/migrations/meta/_journal.json` -- new. `{"version":"7","dialect":"sqlite","entries":[]}`. **This is the whole mechanism.** Proven by execution: `drizzle-orm/migrator.js` throws if this file is absent but merely iterates `journal.entries`, so an empty array applies zero migrations; `drizzle-orm/sqlite-core/dialect.js:643` still runs `CREATE TABLE IF NOT EXISTS __drizzle_migrations` and a second call is a no-op. A migrations directory with no `.sql` files is therefore valid and idempotent.
- `adapters/db/schema.ts` -- new. Empty schema module (`export {}` — `isolatedModules` requires it) so `drizzle-kit generate` has a target. No tables: that is the point.
- `adapters/db/seed/resume.canon.seed.json` -- **`git mv` from `_bmad-output/inputs/resume.canon.json`.** Single copy; the app stops depending on the planning-output tree. Update the pointer at `_bmad-output/specs/spec-tailor/canon-contract.md:5` in the same change. Do not edit the seed's contents — it carries `$comment` keys and an unresolved `rendering.template`, and a byte-for-byte copy is the contract.
- `core/boards/boards-file.ts` -- new. `VENDORS` / `vendorSchema` / `boardEntrySchema` / `boardsFileSchema` / frozen `EMPTY_BOARDS_FILE`. **Pattern to follow:** `core/boards/board-count.ts` (the sibling, and its JSDoc convention) and `core/pipeline/pipeline-counts.ts:27` for `Object.freeze` + parse-don't-assert. `erasableSyntaxOnly` forbids `enum`: use `as const` + `z.enum`, exactly as `core/errors/error-envelope.ts:26-36` spells out.
- `core/bootstrap/bootstrap-report.ts` -- new. The report shape crosses `adapters/db` → root `instrumentation.ts`, so AD-16 requires it declared here.
- `drizzle.config.ts` -- new, repo root. `defineConfig` from `drizzle-kit`; `dialect: "sqlite"`, `out: "./adapters/db/migrations"`, `schema: "./adapters/db/schema.ts"`, `dbCredentials: { url: "./data/tailor.db" }`. Type at `node_modules/drizzle-kit/index.d.mts:112-147`. The runtime migrator never reads this file — only the CLI does.
- `package.json` -- add `db:generate` only. **Do not touch `build`**: `scripts/verify-boundaries.mjs:615` pins its body with an exact regex. `EXPECTED_SCRIPT_BODIES` (:632) pins only `test`, `test:e2e`, `verify`, so a new script is safe.
- `scripts/verify-boundaries.mjs` -- **edited.** Add a no-push mechanism: assert no `package.json` script body matches `/drizzle-kit\s+push/`, and that the journal exists and parses with `entries` an array. Follow the existing assertion style near the build-chain checks (:615-658) — this is a project-invariant check, not a lint rule, so it needs **no** `BOUNDARY_RULES` / `REQUIRED_ROWS` / `PROBES` entry and must not disturb the `32 classes / 10 mechanisms` counters at :705.
- `next.config.ts` -- **no change needed, verified.** `better-sqlite3` is already in Next 16.3.0's default external list at `node_modules/next/dist/lib/server-external-packages.jsonc:33`. This retires the open `serverExternalPackages` item in `deferred-work.md:5`.
- `.gitignore` -- add `/boards.json` beside `/data` and `/out` (:43). It is runtime state written on every start; untracked, it would dirty the tree for every future story.
- `tests/bootstrap.test.mts` -- new. Must live in `tests/` with a `.test.mts` suffix (`scripts/run-tests.mjs:22-23`); `adapters/` is **not** in `SEARCH_DIRS` (:32), so a test placed beside the adapter would silently never run. Use `fs.mkdtempSync` under `os.tmpdir()` and pass that root in — no loader is available and files run concurrently.
- `README.md` -- document bootstrap and `db:generate`. Not in the e2e `OBSERVED` list itself. **Amended after round 1:** the rest of that sentence — "and neither is anything else this story touches, so `.e2e-verified` stays valid" — is the reasoning that changed, not an oversight. The startup gate has to be run by `pnpm verify` to mean anything, so `instrumentation.ts`, `adapters/db/bootstrap.ts` and the gate itself were added to `OBSERVED`; round 2 added the seed, the journal and both new `core/` declarations, since the gate now asserts their content. Editing any of them makes `pnpm build` refuse until the app has been booted again.

## Tasks & Acceptance

**Execution:**
- [x] `adapters/db/seed/resume.canon.seed.json` -- `git mv` the seed out of `_bmad-output/inputs/`, and repoint `canon-contract.md:5`. -- A clean machine must boot without the planning tree; one copy means the canon seed cannot drift against itself.
- [x] `core/boards/boards-file.ts` -- declare `VENDORS`, `vendorSchema`, `boardEntrySchema`, `boardsFileSchema`, and a frozen `EMPTY_BOARDS_FILE` parsed through the schema at module load. -- AD-14 demands a "documented shape" that no adopted doc documents; this is the declaration, and AD-16 makes `core/` the only legal home.
- [x] `core/bootstrap/bootstrap-report.ts` -- declare the per-artifact `created | left-untouched` report. -- Idempotence becomes an assertable value instead of an inference from silence.
- [x] `adapters/db/migrations/meta/_journal.json` + `adapters/db/schema.ts` -- ship the empty journal and an empty schema module. -- The mechanism with no content tables, exactly as the story scopes it.
- [x] `drizzle.config.ts` + `package.json` -- add the config and a `db:generate` script; no push script. -- Later stories need `generate` to add their own table; nothing may offer them `push`.
- [x] `adapters/db/bootstrap.ts` -- the routine, root-parameterized, throwing `TailorError` on failure. -- The single startup routine AD-14 names.
- [x] `instrumentation.ts` -- call it from `register()` behind the `nodejs` runtime guard. -- "When the app starts" is the story's own wording; this is Next 16's only startup hook.
- [x] `.gitignore` -- add `/boards.json`. -- Runtime state must not dirty the tree.
- [x] `scripts/verify-boundaries.mjs` -- add the no-push and journal-integrity assertions. -- The AC says the *project* contains no push path; a prohibition nothing checks is a comment.
- [x] `tests/bootstrap.test.mts` -- cover every I/O matrix row in a temp dir, including the byte-for-byte re-run. -- The only behavioural proof; `next dev` is not a test.
- [x] `README.md` -- document the bootstrap and the new script. -- The layout section already promises `data/`; now something creates it.

- [x] `scripts/` + `tests/` -- add an automated startup gate proving a real server boot creates the artifacts, and unit-test the exported no-push and journal predicates against violating inputs. -- A guardrail nobody exercises stops working silently; so does startup wiring nobody boots.
- [x] `core/boards/boards-file.ts` + `tests/` -- deep-freeze `EMPTY_BOARDS_FILE.boards` and give both new `core/` modules the dedicated test files every sibling has. -- `Object.freeze` is shallow, and bootstrap serialises this exact object.

**Acceptance Criteria:**
- Given a clean checkout with no `./data`, when I run `pnpm dev` and then stop and re-run it, then the second start writes nothing and `git status` is clean.
- Given the repository, when I search for another declaration of the boards shape or the vendor union, then only `core/boards/boards-file.ts` declares them.
- Given `package.json` or any config, when I add a script invoking `drizzle-kit push`, then `pnpm build` fails naming it.
- Given `adapters/db/migrations`, when I list it, then it holds the journal and no `.sql` file, and no content table exists in the schema module.
- Given `pnpm build`, when it completes, then no `./data` directory was created by the build itself.
- Given `pnpm test` immediately followed by `git status`, then the working tree is clean — the suite wrote only into a temp dir.

### Review Findings

_Round 2 code review, 2026-09-02. Four layers: blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor. All decisions resolved and all patches applied in the same pass; deferrals are recorded in `deferred-work.md`._

- [x] [Review][Decision] **The "Concurrent start" matrix row is half-deferred and wholly untested** — The frozen I/O matrix says concurrent start is harmless and that "`EEXIST` swallowed, all else rethrown". The file half holds, but `deferred-work.md` now records that two servers starting together can fail the second with `SQLITE_BUSY` during `migrate()` — deferring half of a frozen row. No test spawns concurrent bootstraps, and `createOnce`'s non-`EEXIST` rethrow branch (`adapters/db/bootstrap.ts:115`) is never exercised: both failure tests fail earlier, at `mkdirSync` and at `drizzle()`. Options: (a) amend the frozen row to scope it to the files, (b) make the database half genuinely concurrent-safe, (c) accept the deferral as recorded. **Resolved (b):** a `busy_timeout` pragma makes the database half genuinely concurrent-safe, two real processes now race for one root in `tests/bootstrap.test.mts`, and the `EACCES` case exercises `createOnce`'s rethrow branch. The `SQLITE_BUSY` deferral is withdrawn.
- [x] [Review][Decision] **The "Journal deleted" matrix row is untestable by construction** — `tests/bootstrap.test.mts` says so in its own comment; the row is asserted only by analogy against a different failure (a directory at the db path). `MIGRATIONS_FOLDER` (`adapters/db/bootstrap.ts:70`) is a module constant with no injection point, unlike `root`. The task "cover every I/O matrix row" is marked `[x]`. Options: (a) add a migrations-folder parameter beside `root`, (b) amend the task's claim to name the row as covered by inference, (c) accept as-is. **Resolved (a):** `migrationsFolder` joins `root` as a parameter, and the row is now exercised directly against an empty folder and a folder with an empty `meta/`.
- [x] [Review][Decision] **`boardEntrySchema.token` forks against AD-2's `fetchJobs(boardUrl)`** — This story makes `core/boards/boards-file.ts` the single declaration of the board shape and chooses a `token`; `_bmad-output/specs/spec-tailor/adapters.md:10` still fixes `fetchJobs(boardUrl)`. `SPEC.md` was edited to favour the token, but nothing declares the token→URL mapping and no deferred-work item or Design Note records that the port signature is now the side that must change. Options: (a) record the decision and open a deferred item against `adapters.md`, (b) repoint the schema at a URL, (c) declare the mapping here. **Resolved (a):** the token wins; the reasoning is in Design Notes and a deferred item names `adapters.md:10` for Epic 2's first board story to amend.

- [x] [Review][Patch] **`DRIZZLE_PUSH` misses the space-separated flag form — a working push invocation passes the build** [scripts/project-invariants.mjs:55]
- [x] [Review][Patch] **The push scan does not cover "any config"; README:38 claims a reach it does not have** [scripts/verify-boundaries.mjs:678]
- [x] [Review][Patch] **The startup gate passes when bootstrap throws after creating all three artifacts** [scripts/startup-gate.mjs:151]
- [x] [Review][Patch] **The startup gate asserts existence only — three empty files would satisfy it** [scripts/startup-gate.mjs:144]
- [x] [Review][Patch] **The composed push/journal checks reaching `fail()` are untested** [scripts/verify-boundaries.mjs:674]
- [x] [Review][Patch] **The widened stray-test scan is untested — narrowing it back stays green** [scripts/run-tests.mjs:37]
- [x] [Review][Patch] **The startup gate can pass against a stale build** [scripts/startup-gate.mjs:139]
- [x] [Review][Patch] **`missingMigrationFiles` checks one direction only; entry shape is unvalidated** [scripts/project-invariants.mjs:145]
- [x] [Review][Patch] **`e2e-gate.mjs` `OBSERVED` omits the seed, the journal, and both new `core/` modules** [scripts/e2e-gate.mjs:40]
- [x] [Review][Patch] **`BOOT_TIMEOUT_MS` is not enforced — `fetch` carries no `AbortSignal`** [scripts/startup-gate.mjs:118]
- [x] [Review][Patch] **AC 6 cannot detect its own failure: `.gitignore` hides a test that bootstraps the real cwd** [.gitignore:43]
- [x] [Review][Patch] **AC 5 has no automated verification and is unobservable on a machine that has run the app** [scripts/startup-gate.mjs:1]
- [x] [Review][Patch] **`failed()` tells the operator the app cannot start; measured behaviour is a permanent 500** [adapters/db/bootstrap.ts:82]
- [x] [Review][Patch] **README overstates exclusive-create and says all three artifacts come from the seed** [README.md:58]
- [x] [Review][Patch] **README's `core/` layout line is stale — `boards`, `bootstrap`, `errors` are missing** [README.md:122]
- [x] [Review][Patch] **README does not document that `pnpm verify` seeds the developer's real checkout** [README.md:42]
- [x] [Review][Patch] **The permanent-500 failure mode is documented only in a code comment** [README.md:42]
- [x] [Review][Patch] **`bootstrapReportSchema.parse` sits outside every `try` — a `ZodError` escapes unwrapped** [adapters/db/bootstrap.ts:224]
- [x] [Review][Patch] **The canon copy is not atomic; a truncated canon would persist forever** [adapters/db/bootstrap.ts:144]
- [x] [Review][Patch] **`freePort` check-then-bind race** [scripts/startup-gate.mjs:63]
- [x] [Review][Patch] **`spawn`'s `error` event has no listener** [scripts/startup-gate.mjs:93]
- [x] [Review][Patch] **"created none of" misreports a partial miss as a total wiring failure** [scripts/startup-gate.mjs:155]
- [x] [Review][Patch] **One `try/catch` covers two independent imports, reports a generic message, and drops two assertions** [scripts/verify-boundaries.mjs:760]
- [x] [Review][Patch] **The success line still reports only the boundary guardrail — the new checks have no positive signal** [scripts/verify-boundaries.mjs:849]
- [x] [Review][Patch] **An unreadable scanned file surfaces as a raw ENOENT instead of a named guardrail failure** [scripts/verify-boundaries.mjs:691]
- [x] [Review][Patch] **"the journal this repo ships has no problems" never reads the shipped journal** [tests/project-invariants.test.mts:70]
- [x] [Review][Patch] **The mtime assertion cannot see a rewrite inside one filesystem tick** [tests/bootstrap.test.mts:197]
- [x] [Review][Patch] **`SEARCH_DIRS` is still hardcoded — a new top-level directory stays invisible** [scripts/run-tests.mjs:37]
- [x] [Review][Patch] **The Code Map's README entry is now false: `OBSERVED` gained three entries** [_bmad-output/implementation-artifacts/spec-1-5-start-the-app-on-a-clean-machine-and-have-it-set-itself-up.md:58]
- [x] [Review][Patch] **This spec's frontmatter says `status: 'done'` while `sprint-status.yaml` says `review`** [_bmad-output/implementation-artifacts/sprint-status.yaml:43]
- [x] [Review][Patch] **Two "Suggested Review Order" anchors point at the wrong lines** [_bmad-output/implementation-artifacts/spec-1-5-start-the-app-on-a-clean-machine-and-have-it-set-itself-up.md:229]
- [x] [Review][Patch] **`epics.md:23` still cites the seed's pre-`git mv` path** [_bmad-output/planning-artifacts/epics.md:23]
- [x] [Review][Patch] **Mid-word strikethrough does not render** [_bmad-output/implementation-artifacts/deferred-work.md:10]
- [x] [Review][Patch] **The gate never boots twice, so AC 1 had no server-level proof** [scripts/startup-gate.mjs:310] — folded in during the fix pass; not in the original triage list
- [x] [Review][Patch] **`startup-gate.mjs` had no test of its own, unlike its sibling** [tests/startup-gate.test.mts:1] — folded in during the fix pass; not in the original triage list

- [x] [Review][Defer] **`EEXIST` on a directory or dangling symlink is reported as success** [adapters/db/bootstrap.ts:97] — deferred, already recorded in `deferred-work.md`; note the existing item covers only the canon path, and `boards.json` has the same hole
- [x] [Review][Defer] **`PUSH_SCAN_EXEMPT` is a by-construction hole in the ban it enforces** [scripts/verify-boundaries.mjs:683] — deferred, already recorded in `deferred-work.md`
- [x] [Review][Defer] **`eslint.config.mjs` has no element type for repo-root source** [eslint.config.mjs:719] — deferred, pre-existing config shape; no live consequence while `default: "allow"` and only `from: ["core"]` is constrained
- [x] [Review][Defer] **`epic-1-context.md`'s `core/` list was not amended for `core/bootstrap/`** [_bmad-output/implementation-artifacts/epic-1-context.md:37] — deferred, extends the existing planning-doc item at `deferred-work.md:235`

## Spec Change Log

- **2026-09-02 — Automated proof that the startup wiring runs.** Round 1 review
  demonstrated that deleting the `bootstrap()` call from `instrumentation.ts`,
  or inverting its runtime guard, leaves `pnpm lint`, `typecheck`, `test`,
  `verify:boundaries` and every e2e test green: the suite calls `bootstrap()`
  directly and nothing observes a real server start. The story's central claim
  was carried entirely by a manual `rm -rf data && pnpm dev` step in this
  section. Amended to require an automated gate that boots the server against a
  fresh temp root and asserts the artifacts. Known-bad state avoided: a silent
  no-op at startup shipping green, first discovered by Story 1.6's gateway
  finding no canon. **KEEP:** the exclusive-create design in `bootstrap.ts`
  (`COPYFILE_EXCL` / `wx`), the root parameter, the `TailorError` wrapping, and
  the byte-for-byte re-run test — all of these survived review and must survive
  re-derivation.
- **2026-09-02 — The new guardrails must themselves be exercised.** The no-push
  and journal checks added to `scripts/verify-boundaries.mjs` were proven only
  by hand-run mutation steps, in a file whose own doctrine is that an
  unexercised guardrail stops working silently. Amended to require their
  predicates be exported and unit-tested against violating inputs.

- **2026-09-02 — Round 1 applied.** Both amendments are met and the design was
  not re-derived. `scripts/startup-gate.mjs` boots the built server with its cwd
  on a fresh temp root and asserts the three artifacts; it is wired into
  `test:e2e` ahead of Playwright, and `instrumentation.ts`,
  `adapters/db/bootstrap.ts` and the gate itself are now in `e2e-gate.mjs`'s
  `OBSERVED`, so changing the startup path makes `pnpm build` refuse until
  `pnpm verify` has booted the app again. Demonstrated: neutering the
  `bootstrap()` call and rebuilding makes the gate exit 1 (HTTP 200, no
  artifacts) — and its output shows the stub's own "bootstrap: … created" log
  line, which the gate correctly disbelieves in favour of the filesystem.
  `scripts/project-invariants.mjs` holds the no-push and journal predicates as
  pure functions, exercised by `tests/project-invariants.test.mts`.
- **Measured, correcting an unverified claim.** A bootstrap failure does *not*
  make Next refuse to start: against 16.3.0 the process keeps listening and
  answers every request `500`, permanently, because
  `ensureInstrumentationRegistered` memoises the rejected promise. The comment
  in `instrumentation.ts` now says that instead, and it is the reason the
  startup gate asserts artifacts rather than waiting for a process to exit.
- **The `database` outcome now tracks the ledger, not the file.** An empty
  `tailor.db` reported `left-untouched` for the very run that created
  `__drizzle_migrations` inside it, and once Epic 2 ships a real migration the
  file exists on the run that applies it. Counting ledger rows either side of
  `migrate()` fixes both and removes this module's last check-then-write.
- **The push scan caught its own documentation first.** Widening the scan to
  config and script bodies fired on `drizzle.config.ts`'s doc comment, which
  spelled the invocation out. The prose was reworded rather than the check
  weakened; `PUSH_SCAN_EXEMPT` is limited to the two files whose job is naming
  the pattern, is exported, and is asserted short in the unit test.
- Implementation note (no intent change): `adapters/db/bootstrap.ts` reaches the
  driver through `drizzle(path)` rather than importing `better-sqlite3` by name.
  The package ships no type declarations, so a direct import fails `pnpm
  typecheck` (TS7016) and the alternatives were a new `@types` dependency or a
  hand-written `declare module` — a second, unverified description of an API
  drizzle already types. Drizzle constructs the client itself, and the
  connection is closed through `db.$client.close()`.
- Verified rather than assumed: Turbopack rewrites this module's
  `import.meta.url` to its *source* path and the file tracer records both
  `seed/resume.canon.seed.json` and `migrations/meta/_journal.json` in
  `.next/server/instrumentation.js.nft.json`, so the seed and journal resolve
  under `next start` exactly as under `next dev`.
- `deferred-work.md`'s `serverExternalPackages` item is closed outright, not
  half: `playwright` is in Next 16.3.0's default external list at
  `server-external-packages.jsonc:76-77` alongside `better-sqlite3` at `:33`.

### Round 2 (2026-09-02)

- **The push ban did not cover the ordinary spelling of the command.**
  `DRIZZLE_PUSH` matched a run of flags as `(?:\s+-{1,2}\S+)*`, which consumes a
  flag but not a space-separated value, so `push` no longer immediately followed
  and `drizzle-kit --config drizzle.config.ts push` — verified to be a real,
  working invocation — passed the build. AC 3 and the story's central **Never**
  were both defeated by the form most people would write. Flags are now matched
  as optional flag/value pairs, and the escaping forms are in the unit test.
- **The composition is now the thing under test, not just the predicates.**
  Round 1 exported the predicates and fired violating inputs at them, but
  `verify-boundaries.mjs` still owned the wiring from those predicates to
  `fail()`, and replacing one call argument with an empty object left everything
  green. `projectInvariantProblems()` takes the inputs and returns the sentences;
  the verifier gathers files and forwards them.
- **The startup gate asserted existence, and existence is cheap.** Three
  `writeFileSync(path, "")` calls satisfied it. It now compares canon
  byte-for-byte against the seed, parses `boards.json`, and requires the
  `__drizzle_migrations` ledger in `tailor.db` — and reports a 5xx even when all
  three paths are present, which is reachable: bootstrap creates canon and
  `boards.json` before it opens the database, so a throw inside `migrate()`
  leaves every path on disk behind a server that 500s forever.
- **The gate boots twice.** AC 1 is written about starting, stopping and
  starting again; it had no server-level proof, only the in-process re-run test
  that round 1 rejected as insufficient for the wiring. It also refuses to run
  against a build older than the startup path, which `pnpm test:e2e` on its own
  could otherwise use to re-arm the freshness marker for code it never booted.
- **Both matrix rows that were untestable are tested.** `migrationsFolder` joins
  `root` as a parameter, which is what makes "journal deleted" reachable at all;
  "concurrent start" spawns two real processes at one root and asserts exactly
  one of them reports `created` per artifact. The database half of that row is
  no longer deferred: a `busy_timeout` pragma makes the loser wait for the lock
  rather than fail with `SQLITE_BUSY`.
- **Canon placement is atomic as well as exclusive.** `COPYFILE_EXCL` opens the
  real canon path and streams into it, so an interrupted first start left a
  truncated file that every later run reported `left-untouched` and never
  reseeded. The seed is staged under a UUID name and hard-linked into place —
  one atomic syscall that still fails `EEXIST` when canon is already there.
- **The two "cannot write" criteria can now fail.** AC 5 and AC 6 were both
  unfalsifiable: `/data` and `/boards.json` are gitignored, so a test that
  bootstrapped the real working directory left `git status` clean, and on any
  machine that had run the app a human could not tell whether `pnpm build`
  created `./data`. Both are now mtime comparisons — in `run-tests.mjs` around
  the suite, and in `verify.mjs` around the build step.
- **Measured, correcting the failure message.** `failed()` told the operator
  "The app cannot start without it", which contradicts what `instrumentation.ts`
  had already recorded as measured: the process keeps listening and 500s
  forever. The sentence now says that.

## Design Notes

**Why `instrumentation.ts` and not a `predev` script.** The story's ACs are all phrased "when the app starts", and a `predev` hook would miss `next start` — which is what `playwright.config.ts` runs. Instrumentation covers both and is skipped during `next build`, so the build stays a pure check chain. The cost is that it is new ground in this repo: no `instrumentation.ts` exists today.

**Why the report type.** "Idempotent" is otherwise only testable as "did not crash twice". Returning `created | left-untouched` per artifact lets the re-run test assert the *absence of a write* directly, which is the AC that actually protects canon.

**The board is identified by a token, and `fetchJobs` is the side that changes.**
`core/boards/boards-file.ts` declares `boardEntrySchema` with `{ type, token }`,
while AD-2 (`_bmad-output/specs/spec-tailor/adapters.md:10`) fixes
`fetchJobs(boardUrl)`. Round 2 flagged the fork; this records the call rather
than leaving two spec companions disagreeing. The token wins: it is the only
part a human can be asked to type, every one of the four vendors addresses a
board by a slug in a URL the adapter can build, and a stored URL would let the
same board be written four ways that no longer compare equal — which matters
because Epic 2 reuses this value as `postings.source` and as the adapter
registry key. The consequence is that `BoardPort` takes the entry, not a URL,
and each adapter owns its own token→URL construction. `adapters.md` still says
otherwise and is not this story's file to edit; a deferred item now names it.

**What this story cannot prove.** No content table exists to migrate, so the migration path is proven only to the extent that `migrate()` runs, creates `__drizzle_migrations`, and is re-runnable. The first real table arrives in Epic 2 and is where a migration stops being a mechanism and starts being a schema.

## Verification

**Commands:**
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm verify:boundaries` / `pnpm build` -- each expected exit 0.
- `pnpm verify` -- expected exit 0; also re-arms the e2e freshness marker.
- Deleting the `bootstrap()` call from `instrumentation.ts` -- expected: the new startup gate fails. If everything still passes, the gate is not doing its job.
- `rm -rf data boards.json && pnpm dev` then stop it -- expected: `data/`, `data/resume.canon.json`, `data/tailor.db`, `boards.json` all present.
- Re-run check: record `shasum data/resume.canon.json`, edit the file, restart, re-shasum -- expected: the edit survives byte-for-byte.
- `git status --porcelain` after a full `pnpm verify` -- expected: empty.
- Mutation check: add `"db:push": "drizzle-kit push"` to `package.json` and confirm `pnpm build` fails naming it; then remove it.
- Mutation check: delete `adapters/db/migrations/meta/_journal.json` and confirm `pnpm build` fails.
- `grep -rn "greenhouse" --include='*.ts' core/ adapters/ app/ components/` -- expected: the only *declaration* of the vendor union is `core/boards/boards-file.ts`.


## Suggested Review Order

**The routine**

- Start here: the whole contract in one signature — a root, a report, no side channel.
  [`bootstrap.ts:166`](../../adapters/db/bootstrap.ts#L166)

- Idempotence by construction: the filesystem arbitrates, so there is no check-then-write window.
  [`bootstrap.ts:140`](../../adapters/db/bootstrap.ts#L140)

- `COPYFILE_EXCL` is what keeps an irreplaceable canon alive on every re-run.
  [`bootstrap.ts:193`](../../adapters/db/bootstrap.ts#L193)

- The outcome is read off the ledger, not off the file — an empty `.db` is not an untouched one.
  [`bootstrap.ts:257`](../../adapters/db/bootstrap.ts#L257)

**Starting the app**

- Next 16's only startup hook; the guard keeps a native addon out of the edge bundle.
  [`instrumentation.ts:25`](../../instrumentation.ts#L25)

- Measured, not assumed: a failed bootstrap answers 500 forever rather than exiting.
  [`instrumentation.ts:48`](../../instrumentation.ts#L48)

**The migration mechanism**

- The entire mechanism, with no content tables: an empty journal still builds the ledger.
  [`_journal.json:1`](../../adapters/db/migrations/meta/_journal.json#L1)

- Exported so one assertion can tie it to where `db:generate` actually writes.
  [`bootstrap.ts:77`](../../adapters/db/bootstrap.ts#L77)

**Declared once in the core (AD-16)**

- The `boards.json` shape AD-14 demanded and no adopted doc ever documented.
  [`boards-file.ts:70`](../../core/boards/boards-file.ts#L70)

- Deep-frozen: shallow freezing left the array bootstrap serialises still mutable.
  [`boards-file.ts:91`](../../core/boards/boards-file.ts#L91)

- Makes idempotence an assertable value instead of an absence of errors.
  [`bootstrap-report.ts:52`](../../core/bootstrap/bootstrap-report.ts#L52)

**Proof the mechanism cannot rot**

- Boots the real server on an empty cwd, twice — deleting the `bootstrap()` call fails here.
  [`startup-gate.mjs:217`](../../scripts/startup-gate.mjs#L217)

- Existence was not enough: three empty files used to satisfy the gate.
  [`startup-gate.mjs:111`](../../scripts/startup-gate.mjs#L111)

- Predicates split out of the guardrail so tests can fire them at violating input.
  [`project-invariants.mjs:65`](../../scripts/project-invariants.mjs#L65)

- Every journal defect reported at once, not just the first one found.
  [`project-invariants.mjs:116`](../../scripts/project-invariants.mjs#L116)

- Ties `out`, `MIGRATIONS_FOLDER` and the journal path together by import, not by regex.
  [`verify-boundaries.mjs:745`](../../scripts/verify-boundaries.mjs#L745)

**Supporting**

- The behavioural proof, all in temp roots: `pnpm test` runs inside `pnpm build`.
  [`bootstrap.test.mts:56`](../../tests/bootstrap.test.mts#L56)

- Derived from the tree, not listed: the next directory to hold source is covered too.
  [`run-tests.mjs:49`](../../scripts/run-tests.mjs#L49)

- The suite must not write into the real checkout — `git status` could never see it.
  [`run-tests.mjs:131`](../../scripts/run-tests.mjs#L131)

- The composition, not just the predicates, is what a test can now fire input at.
  [`project-invariants.mjs:279`](../../scripts/project-invariants.mjs#L279)
