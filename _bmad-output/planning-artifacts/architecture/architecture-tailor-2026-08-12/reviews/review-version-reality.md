# Reviewer Gate — Version & Reality Lens

**Target:** `ARCHITECTURE-SPINE.md` (tailor, architecture-tailor-2026-08-12)
**Lens:** Verify every committed decision was web-researched or reality-checked rather than asserted from training data — current library/framework versions, that each named technology still exists and fits, and (greenfield) the live defaults of anything it leans on.
**Review date:** 2026-08-13
**Verdict:** **FAIL** — one confirmed build-breaking pin, three high-severity unchecked assertions. Remediable in a handful of lines; the spine is otherwise unusually well-sourced.

---

## Method

Every Stack row was checked against the live npm registry (`registry.npmjs.org`), including `dist-tags`, publish dates, `engines`, `peerDependencies`, and export maps. All four job-board APIs were hit live with `curl`. The Claude Code CLI was invoked locally (`claude --version`, `claude --help`) and cross-checked against `code.claude.com/docs/en/headless`. Next.js and Playwright behaviors were checked against current vendor docs and 2026 issue trackers.

---

## The headline

**All ten Stack rows are exactly `latest` on npm as of today.** Not one is wrong, stale, yanked, deprecated, or nonexistent. That is strong evidence the versions genuinely *were* looked up rather than recalled.

But "take `latest` for everything" is precisely the process that produced the critical finding below. **Currency was verified; compatibility was not.** The spine checked that each technology exists at a current version and stopped there — it never asked whether the current versions work together. That gap is the through-line of this review.

### Stack table — verified against the live registry

| Row | Spine says | npm `latest` today | Published | Status |
| --- | --- | --- | --- | --- |
| Next.js (App Router) | 16.3.0 | 16.3.0 | 2026-08-03 | Correct |
| React | 19.2.8 | 19.2.8 | 2026-07-21 | Correct |
| TypeScript | 7.0.2 | 7.0.2 | 2026-07-08 | Correct version, **incompatible** — see V-1 |
| Drizzle ORM | 0.45.2 | 0.45.2 | 2026-03-27 | Correct, but terminal 0.x — see V-8 |
| drizzle-kit | 0.31.10 | 0.31.10 | 2026-03-17 | Correct, correct pairing with orm 0.45 |
| better-sqlite3 | 13.0.3 | 13.0.3 | 2026-08-05 | Correct, but 3 weeks old — see V-7 |
| Playwright | 1.62.1 | 1.62.1 | 2026-07-30 | Correct — see V-10 for naming |
| Zustand | 5.0.14 | 5.0.14 | 2026-05-28 | Correct |
| Zod | 4.4.3 | 4.4.3 | 2026-05-04 | Correct — see V-12 |
| pnpm | 11.21.0 | 11.21.0 | 2026-08-09 | Correct |

No package is deprecated (`deprecated: null` on every manifest checked). No package is yanked. Peer-dependency check: Next 16.3.0 declares `react: "^18.2.0 || ^19.0.0"` — React 19.2.8 satisfies it cleanly.

---

## Findings

### V-1 — CRITICAL — TypeScript 7.0.2 cannot type-check a Next.js 16.3 app

The Stack table commits to `TypeScript 7.0.2` as a bare row with no qualifier. This is the correct latest version and it does not work with Next.js.

Verified directly from the npm manifest for `typescript@7.0.2`:

```
main    : null
types   : null
exports : { ".": "./lib/version.cjs",
            "./unstable/ast": ...,  "./unstable/sync": ...,  "./unstable/async": ... }
bin     : { "tsc": "bin/tsc" }
```

The `"."` entry resolves to `lib/version.cjs` — a version string. **There is no `lib/typescript.js` and no programmatic Compiler API in TypeScript 7.0 at all.** Next.js loads TypeScript through that JS Compiler API to run its type checking, so `next dev` and `next build` type-checking break on a TS 7 install.

Confirmed against vercel/next.js discussion #81472: TypeScript 7 support in Next.js is experimental and in development (PR #95639 adds an `experimental.useTypeScriptCli` flag). A maintainer-quoted blocker: *"TS 7.0 ships the native Go compiler and no `lib/typescript.js`. Next.js loads TypeScript through that JS Compiler API. This can't be fixed yet — TS 7.0 ships no programmatic API at all."* The stable programmatic API is targeted for **TypeScript 7.1**, which Microsoft says is several months out. The `next` dist-tag on npm today is `7.1.0-dev.20260812.1` — still a nightly.

This is not a Next.js-only problem. Microsoft shipped `@typescript/typescript6` (latest `6.0.2`) specifically as a side-by-side compatibility package for exactly this class of tool. `typescript-eslint`'s peer range excludes TS ≥ 6.1.0 outright, so an install would `ERESOLVE` under pnpm 11's strict resolution if linting is ever added.

**Fix:** either pin `typescript` to the 6.x line for the Next.js toolchain, or run the documented dual-install (TS 6 under the `typescript` name for Next.js, TS 7 aliased for a separate `tsc` pass). Whichever is chosen, the Stack table must say so — a bare "TypeScript 7.0.2" is a decision that does not survive first contact with `pnpm dev`.

**Evidence of assertion-not-check:** the spine picked the newest TypeScript on the day it was written and recorded it as a settled decision. Nothing about the choice reflects that TS 7 is a compiler-only release whose entire ecosystem story is still in flight.

---

### V-2 — HIGH — The Claude Code CLI is absent from the Stack table and unversioned

The CLI is the **entire model surface** of this product (CAP-3, `adapters/model`, `ModelPort`), the one dependency the app spawns as a subprocess, and by a wide margin the fastest-moving thing in the system. It appears in the deployment diagram as `CLI["Claude Code CLI — subprocess"]` and nowhere in the Stack table. No version. No floor.

Reality-checked locally: the installed CLI is **2.1.228**. Per the current headless docs, `-p` behavior changed materially and repeatedly across recent patches — v2.1.163 (background tasks no longer hold `-p` open indefinitely), v2.1.182 (10-minute cap on background subagent waits), v2.1.205 (invalid `--json-schema` now errors instead of being silently ignored), v2.1.211 (unreadable stdin on Windows no longer crashes), v2.1.214 (stream drain cap raised from ~2s to 30s), v2.1.219, v2.1.221, v2.1.223.

Every one of those is a behavior the run pipeline would observe. A spine that pins pnpm to the patch does not get to leave its model provider unversioned.

**Fix:** add a row with a verified minimum (`>= 2.1.223` covers all of the above), and have the bootstrap routine (AD-14) assert it via `claude --version` rather than discovering the mismatch as an Outcome D.

---

### V-3 — HIGH — `claude -p` without `--bare` inherits tailor's own agent context

The spine's non-interactive invocation is correct as far as it goes: `-p` and `--output-format json` both exist and are current on CLI 2.1.228 (verified in `claude --help`, and against the live docs). That much *was* reality-checked, or is at least right.

What was not checked is what `-p` loads. From the current docs: *"Without it, `claude -p` loads the same context an interactive session would, including anything configured in the working directory or `~/.claude`."* That means CLAUDE.md, hooks, plugins, MCP servers, skills, and auto-memory.

**tailor is itself a Claude Code project.** It will have a CLAUDE.md. It may grow hooks. Spawning `claude -p` from the project's cwd means every tailoring run's model call is silently conditioned on tailor's own agent instructions — and on whatever is in `~/.claude` on that machine. That directly undermines AD-6, which treats the model payload as a stable shape whose failure modes are enumerable, and it makes the run pipeline non-reproducible across machines and across edits to a file that has nothing to do with resumes.

The docs are explicit about the remedy: *"`--bare` is the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release."* Note the second half — the default is changing, so an invocation that omits the flag will silently change behavior under the reader's feet.

Caveat worth pricing in: `--bare` never reads OAuth credentials or the keychain and requires `ANTHROPIC_API_KEY` or an `apiKeyHelper`. That collides with the spine's claim that *"the single external credential surface is the Claude Code CLI's own authentication, which the app never handles."* The two cannot both hold. This is a real, decidable trade-off the spine never surfaces because it never looked.

---

### V-4 — HIGH — No Node.js version is named anywhere

"One environment: the developer's machine." "One Node process — `pnpm dev`." The runtime is never pinned.

Engine floors pulled from the live manifests:

| Package | `engines.node` |
| --- | --- |
| `better-sqlite3@13.0.3` | `>=22` |
| `playwright@1.62.1` | `>=20` |
| `next@16.3.0` | `>=20.9.0` |
| `zustand@5.0.14` | `>=12.20.0` |
| `typescript@7.0.2` | `>=16.20.0` |

Effective floor is **Node 22**, driven by better-sqlite3 13. Against the live Node release index: Node 20 (Iron) is EOL as of April 2026, Node 24 (Krypton) is Active LTS, Node 26 is Current (v26.7.0, 2026-08-05, ABI 147). The machine this runs on is currently v24.13.0.

For an architecture whose *entire* operational story is a single machine, leaving the single runtime unnamed is the one omission the deployment section cannot afford. It also interacts with V-7: ABI churn is the classic native-module failure, and nothing here records which ABI the build targets.

**Fix:** name Node 24 LTS in the Stack table and add an `engines` field / `.nvmrc` to the bootstrap routine.

---

### V-5 — MEDIUM — AD-6 reinvents `--json-schema`, which the CLI already provides

AD-6 builds an architectural rule around parsing a raw model payload and shape-validating it, with non-JSON and shape mismatch classified as Outcome D. That design is sound, but it was specified without checking what the CLI can do today.

The current CLI supports `--output-format json --json-schema '<JSON Schema>'` and returns the conforming object in a **`structured_output`** field alongside session metadata. Using it would move a whole class of Outcome D from "recover from garbage" to "never produced." Notably, since v2.1.205 an invalid schema errors loudly rather than silently degrading to unstructured text — so the failure mode is clean.

Two related capabilities also went unnoticed:

- `--output-format json` returns `total_cost_usd` plus a per-model breakdown. AD-12 and AD-15 both reason explicitly about *"a paid model call"* and *"parallel paid model calls"*, yet neither `runs` nor `run_steps` has anywhere to put a cost the CLI hands over for free.
- AD-5 lists *"timeout"* as an Outcome D trigger, but no timeout mechanism is named. The relevant live controls are `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` and SIGTERM (which aborts the turn, runs `SessionEnd` hooks, and exits 143).

This is the clearest case in the document of a design derived from how the tool worked at some remembered point rather than from what it does now.

---

### V-6 — MEDIUM — The Agent SDK was never considered; "Deferred" mis-frames the alternative

The Deferred section says: *"An API-key model implementation. AD-2's `ModelPort` is the seam. Not built until the CLI auth story actually breaks."* This frames the only alternative to shelling out as an API-key rewrite.

That is not the current landscape. `@anthropic-ai/claude-agent-sdk` (latest **0.3.229**) is the documented programmatic path, and the vendor's own page for running Claude Code programmatically leads with the SDK, positioning `claude -p` as the CLI surface *of* that SDK — *"For the Python and TypeScript SDK packages with structured outputs, tool approval callbacks, and native message objects, see the full Agent SDK documentation."*

For a TypeScript app already running a Node process, the SDK is the same agent loop as an in-process library: structured output, no subprocess spawn, no stdout parsing, no 10MB stdin cap, and it does **not** force the API-key trade-off that `--bare` does (V-3). The spine's binary framing — CLI subprocess now, API key later — appears to predate the SDK's existence in the author's model of the world.

This does not mean the CLI is the wrong call. It means the call was made without the comparison, and `ModelPort` being "the seam" is doing rhetorical work that a two-line evaluation would have done properly.

---

### V-7 — MEDIUM — better-sqlite3 13 is a three-week-old N-API rewrite; its types are four majors behind

`better-sqlite3@13.0.3` is genuinely `latest`, and v13 is genuinely good news — but the spine pinned it without noticing what it is.

From the v13.0.0 release notes (published 2026-07-21, **22 days** before this spine): *"Version 13.0.0 marks a major milestone, as it's the first version of `better-sqlite3` to run on the N-API. […] we've removed the deprecated `prebuild-install` dependency, and now prebuilt binaries are published directly with the `better-sqlite3` code itself."*

Confirmed from the manifest: no `install` script, `gypfile: false`, only `node-addon-api` as a runtime dep, 27MB unpacked, with per-platform export entries including `darwin-arm64`. This genuinely eliminates the node-gyp/ABI fragility that plagued v11/v12 on Node 24 — a real improvement, and the spine benefits from it by luck rather than by design.

The risks it also inherited, unmentioned:

1. **Maturity.** A ground-up rewrite of a native binding, 22 days old, with three patch releases in its first 15 days (13.0.0 → 13.0.3). This is the persistence layer for data the spine elsewhere calls *"gitignored, irreplaceable."*
2. **Drizzle has not been tested against it.** `drizzle-orm@0.45.2` was published 2026-03-27, four months *before* better-sqlite3 13 existed. Its peer range is `better-sqlite3: ">=7"` — permissive by construction, not evidence of validation.
3. **The types are stale.** `@types/better-sqlite3` latest is **9.6.0** — four majors behind the runtime, missing v13's `db.explain()` and `preparedStatement.toString()`. Its highest `typesVersions` tag is `ts6.0`; there is no `ts7.0` entry. `drizzle-orm` lists `@types/better-sqlite3` as an optional peer, so this lands on the DB adapter directly, and it compounds V-1.

**Fix:** either accept 13.x with an explicit note that the driver is new and the types lag, or pin `better-sqlite3` to the 12.x line (the last pre-rewrite major) for the first build.

---

### V-8 — MEDIUM — Drizzle 0.45.2 is the terminal 0.x while 1.0 is at RC, and it forecloses `node:sqlite`

`drizzle-orm@0.45.2` is `latest`, but it was published **2026-03-27** — four and a half months ago, with no 0.x release since. Meanwhile the registry shows `beta: 1.0.0-beta.22` and `rc: 1.0.0-rc.4`, plus dozens of 1.0 pre-release branch tags. The 0.x line is frozen; 1.0 is imminent and will carry a breaking migration.

Adopting the frozen major-minus-one on a greenfield project may still be the right risk call. The problem is that the spine states `0.45.2` flatly, as though it were simply "the current version," with no acknowledgment that the ORM is mid-major-transition.

**A concrete consequence the spine never states:** I checked 0.45.2's export map (443 entries). It contains `./better-sqlite3`, `./bun-sqlite`, `./libsql/node`, `./op-sqlite`, `./expo-sqlite` — and **no `./node-sqlite`**. Drizzle's `node:sqlite` driver exists only in the 1.0 line (its dedicated dist-tag is `1.0.0-beta.16-c2458b2`).

So the answer to "better-sqlite3 native bindings vs Node's built-in `node:sqlite`" is that **the Drizzle version choice already decided it.** On 0.45, `node:sqlite` is not available; using it would mean going to a 1.0 RC. That is a genuine, defensible reason to be on better-sqlite3 — and the spine gets the right answer without showing it knows why, which is exactly the pattern this lens exists to catch. If `node:sqlite` is wanted (zero native deps, zero ABI risk, no `@types` lag), that is an argument for Drizzle 1.0 RC, and it should be made explicitly rather than left implicit.

---

### V-9 — MEDIUM — AD-3 and AD-15 rely on in-process state under a dev server that discards it

AD-3: *"the start endpoint returns a `runId` immediately and the run proceeds server-side."* AD-15: *"the server refuses to start a run while another is active."*

Neither says *how*, and the framework has opinions the spine did not consult.

- **`pnpm dev` is the only environment.** Next 16 runs Turbopack by default in dev. Editing any file in the server graph re-evaluates server modules. A module-scoped "one run in flight" lock, or in-memory run state, is lost mid-run on any save — during a multi-minute run in the one and only environment this system has. **AD-15's lock must be database-backed, not module-scoped**, and AD-3's step state is already in `run_steps`, so the fix is small — but it has to be stated, or it will be built the obvious wrong way.
- **`after()` is not the primitive here.** It is stable since Next 15.1 and supported on a Node.js server, but the docs are explicit that it *"will run for the platform's default or configured max duration of your route."* A tailoring run with model, board, and Chromium stages does not belong inside a route's duration budget. A plain out-of-request runner is right for a self-hosted single process — but "proceeds server-side" is currently a floating promise by omission, and a reader who reaches for `after()` because it is the Next-shaped answer will hit the ceiling.

---

### V-10 — LOW/MEDIUM — "headed Playwright Chromium" no longer describes what launches

The spine says "headed Playwright Chromium" and diagrams `CHROME["Chromium — headed, Playwright"]`. As of **Playwright 1.57**, the `chromium` channel resolves to **Chrome for Testing** builds in headed mode, and `chrome-headless-shell` in headless — Playwright no longer ships custom-compiled open-source Chromium on that channel.

Two consequences:

- There is a documented memory regression from the switch (microsoft/playwright#38489 reports 20GB+ per instance under parallel execution). AD-15's one-run-at-a-time rule incidentally contains the worst of this, which is fortunate rather than intentional.
- For the ATS use case this is arguably an *upgrade* — Chrome for Testing is real Chrome and presents a far more ordinary fingerprint than old Chromium. But the spine should name what it is launching, because "Chromium" now means something different from what it meant when that sentence was likely learned.

---

### V-11 — MEDIUM — ATS form automation is treated as a solved adapter problem

CAP-11 and AD-2 model ATS submission as `fill(page, job, pdfPath, answers)` behind a port, and the Deferred section states *"Adding a fifth is an adapter, not an architecture change — which is the point of AD-2."*

Current reality (2026): Greenhouse, Lever, Ashby, and Workday all deploy Cloudflare/Kasada-class bot detection on their application surfaces, and vanilla Playwright is a known-detected fingerprint — TLS JA3/JA4 handshake mismatch, automation flags, and navigation heuristics. Patched forks exist specifically because unpatched Playwright fails these checks.

The spine's configuration is close to the best case: **headed**, on a residential IP, single-user, low volume, with a human completing the submission. That materially lowers the risk relative to headless scraping, and this finding should not be read as "the approach is wrong." But the ATS surface is actively adversarial to exactly this technique, and the spine's confidence that a new vendor is a pure adapter swap is an architectural claim about a moving target. Worth one sentence acknowledging that ATS adapters carry detection risk that board adapters do not — the two are grouped as symmetric "adapters" throughout, and they are not.

---

### V-12 — LOW — Zod 4 is correct and low-risk; two changes touch stated conventions

`zod@4.4.3` is current and, being greenfield, carries no migration burden. Two v4 behaviors intersect with the spine's own conventions and are worth knowing before code is written rather than after:

- **Error customization is unified.** `required_error`, `invalid_type_error`, and `errorMap` are gone entirely, replaced by a single `error` param. The Consistency Conventions require that *"every check returns a structured result naming the offending token — never a boolean and never a generic message,"* and AD-13 mandates one error envelope. Both are built on Zod's issue shape, so build against v4's `issues` model from the start.
- **`z.uuid()` is now strict RFC 9562/4122** (variant bits enforced). `z.guid()` is the permissive equivalent of v3's `z.string().uuid()`. Relevant only if canon bullet ids or external posting ids are ever validated as UUIDs. String formats are now top-level (`z.email()`, `z.uuid()`, `z.iso.*`); the chained forms still work but are deprecated.

No blockers.

---

## Checks that came back clean

Recording these so they are not "fixed" unnecessarily, and so the spine gets credit where it earned it.

- **`serverExternalPackages` needs no configuration.** I checked Next.js 16.3's default opt-out list: `better-sqlite3`, `playwright`, and `playwright-core` are all already on it. Route handlers are covered. The older `experimental.serverComponentsExternalPackages` name was renamed in v15.0.0 — the spine correctly avoids mentioning either. Nothing to do.
- **All four board APIs are live and unauthenticated**, contrary to any assumption that they might have closed. Verified by live request: Greenhouse `boards-api.greenhouse.io/v1/boards/{slug}/jobs` → 200 (and `api.greenhouse.io/v1/boards/...` → 200), Lever `api.lever.co/v0/postings/{slug}?mode=json` → 200, Ashby `api.ashbyhq.com/posting-api/job-board/{slug}` → 200, Workable `apply.workable.com/api/v1/widget/accounts/{slug}` → 200. The claim *"Board APIs are public and unauthenticated"* holds. Two caveats: no endpoint or API version is pinned anywhere in the spine, so nobody downstream can re-verify this; and Greenhouse's **Harvest API v1/v2 sunset lands 2026-08-31** — a *different* API that tailor does not use, but a reminder that this vendor surface moves inside the build window.
- **`claude -p --output-format json` is current and correct.** Verified in `claude --help` on CLI 2.1.228 and in the live docs. `--output-format` accepts `text | json | stream-json`, `-p`/`--print` is the non-interactive flag. This is the one externally-volatile invocation in the spine and it is right. (The gaps around it are V-2, V-3, V-5.)
- **Next.js 16.3 + React 19.2.8 is a clean pairing.** Next's declared peer is `^18.2.0 || ^19.0.0`; `react-dom@19.2.8` matches `react@19.2.8` exactly.
- **drizzle-orm 0.45 + drizzle-kit 0.31 is the correct pairing**, despite the version numbers looking mismatched. Both are `latest` on their respective lines.
- **No package in the Stack is deprecated or yanked.** Checked `deprecated` on every manifest.

Minor omission, no severity: **`react-dom` is missing from the Stack table** despite being a required Next.js peer dependency. Every other transitive-but-pinned choice is listed.

---

## Assessment against the lens

**What was clearly researched:** the version numbers. Ten out of ten match `latest` exactly on the day of writing, with correct patch-level precision on packages that released within the last two weeks. Nobody produces `pnpm 11.21.0` (published four days ago) or `next 16.3.0` (ten days) from training data. The board-API claim also holds up under live testing.

**What was asserted rather than checked:**

1. That the newest version of each thing is the usable one — falsified by TypeScript 7.0 (V-1), and unexamined for better-sqlite3 13 (V-7).
2. That the versions are compatible *with each other*. No pairwise fit appears to have been tested. TS 7 × Next 16 is the failure; Drizzle 0.45 × better-sqlite3 13 is untested-but-probably-fine; Drizzle 0.45 × `node:sqlite` is impossible and the spine does not know it (V-8).
3. That the Claude Code CLI works the way it is remembered working. `-p --output-format json` is right; `--json-schema`, `structured_output`, `total_cost_usd`, `--bare`, and the Agent SDK are all absent from a spine that reasons in detail about payload shape, model cost, and the model seam (V-3, V-5, V-6).
4. That the framework will run background work the way a plain Node server would. Next 16 in dev has specific module-lifecycle behavior that AD-3 and AD-15 are silently betting against (V-9).
5. That "Chromium" and "an ATS adapter" mean today what they meant a couple of years ago (V-10, V-11).

The pattern is consistent and narrow: **the spine verified existence and currency, and inferred fit.** Fit is where all the damage is.

---

## Minimum changes to clear this gate

1. **V-1 (blocking):** resolve the TypeScript row. Pin 6.x for the Next.js toolchain, or document the dual-install, in the Stack table itself.
2. **V-2 (blocking):** add a Claude Code CLI row with a verified minimum version; have AD-14's bootstrap assert it.
3. **V-4 (blocking):** name the Node version (24 LTS satisfies every engine floor in the table).
4. **V-3:** decide `--bare` vs. inherited context, and reconcile the answer with the "app never handles credentials" claim.
5. **V-9:** state that AD-15's single-run lock is database-backed, not in-process.

V-5 through V-12 are judgment calls the spine is entitled to make — but each should be made visibly, because right now none of them appear to have been made at all.
