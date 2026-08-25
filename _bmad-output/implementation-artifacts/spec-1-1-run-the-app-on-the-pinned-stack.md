---
title: 'Story 1.1 — Run the app on the pinned stack'
type: 'chore'
created: '2026-08-19'
status: 'done'
baseline_commit: 'NO_VCS' # repository is initialized by this story's first task
review_loop_iteration: 0
context: ['_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `tailor` is greenfield. Every later story assumes a specific pinned stack and a domain core that structurally cannot acquire outward dependencies; if the core can quietly import Drizzle or `node:fs`, the product's trust premise — nothing reaches the resume without passing validation — becomes discipline rather than fact.

**Approach:** Scaffold a Next.js 16.3 App Router project on the exact pins, lay out the architecture's directory seed, and enforce the core dependency rule with a lint rule wired into `build`, so a violation fails the build naming the offending import.

## Boundaries & Constraints

**Always:**
- Resolved versions match the pins exactly, no ranges: Next 16.3.0, React + react-dom 19.2.8, TypeScript 5.9.3, Drizzle ORM 0.45.2, drizzle-kit 0.31.10, better-sqlite3 13.0.3, Playwright 1.62.1, Zustand 5.0.14, Zod 4.4.3.
- `package.json` declares `engines.node: ">=22"` (better-sqlite3's hard floor) and `packageManager: "pnpm@11.21.0"`; `.nvmrc` pins `24.19.0`.
- The dependency rule is enforced by lint and runs inside `pnpm build`. Violations are **errors**, never warnings.
- Enforcement catches the relative-path escape, not only alias and bare-package specifiers.
- Directories live at the repo root, not under `src/`. Filenames are `kebab-case.ts`.
- No experimental TypeScript compiler flag anywhere.

**Ask First:**
- Any pin that will not install or type-check against the others — report the conflict, do not float the version.
- Adding a runtime dependency beyond the pinned list (dev-only lint tooling is pre-approved).
- If the scaffold's ESLint major conflicts with the boundary-enforcement plugin.

**Never:**
- No Docker, CI, deployment target, or second process.
- No business logic, tables, migrations, design tokens, canon gateway, or routes beyond the scaffold's — those are Stories 1.2–1.10.
- Do not rely on `next lint`; it does not exist in Next 16.
- Do not commit. Initialize the repository only.

## I/O & Edge-Case Matrix

Each row is a fixture the guardrail test must exercise.

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Clean core file | `core/canon/x.ts` imports only within `core/` | Lint passes |
| Legal inward import | `adapters/db/x.ts` imports `core/ports/...` | Lint passes |
| Alias escape | file under `core/` imports `@/adapters/db/...` | Error naming the import; non-zero exit |
| Relative escape | file under `core/` imports `../../adapters/db/...` | Error naming the import; non-zero exit |
| Framework escape | file under `core/` imports `next/server` | Error naming the import; non-zero exit |
| Node built-in | file under `core/` imports `node:fs` or `path` | Error naming the import; non-zero exit |
| Forbidden package | file under `core/` imports `drizzle-orm` or `playwright` | Error naming the import; non-zero exit |

</frozen-after-approval>

## Code Map

Greenfield — everything is created here except the read-only sources.

- `package.json` -- exact pins, `engines.node`, `packageManager`, and the `build` script chaining lint + type-check + `next build`.
- `.nvmrc` (`24.19.0`), `.gitignore` (must ignore `/data` and `/out` — both hold irreplaceable state).
- `eslint.config.mjs` -- `eslint-config-next` plus the core dependency rule.
- `tsconfig.json` -- `@/*` alias; excludes the boundary fixtures.
- `core/{ports,canon,pipeline,validation,diff,scoring,gates}/`, `adapters/{boards,ats,model,render,db}/`, `app/api/`, `components/resume-document/` -- the architecture's directory seed; `.gitkeep` in each, since empty dirs do not survive git.
- `tools/boundary-fixtures/` -- deliberately-violating files, excluded from the app lint glob and from `tsconfig`.
- `scripts/verify-boundaries.mjs` -- runs ESLint over the fixtures and asserts every violation class fires.
- **Read-only:** `ARCHITECTURE-SPINE.md` — AD-1 (line 58), Stack table (line 196), Source tree (line 290). `epic-1-context.md` — distilled constraints.
- **Verified during planning, do not re-derive:** all ten pins resolve on npm; Node 24.19.0 is current Krypton LTS; pnpm 11.21.0 exists; `eslint-config-next@16.3.0` peers `eslint >=9.0.0`; Next 16.3.0 ships **no** `next lint`, so ESLint never runs during `next build` — but type-checking still does.

## Tasks & Acceptance

**Execution:**
- [x] Install Node 24.19.0 via nvm; activate pnpm 11.21.0 via corepack -- machine has 24.13.0 / pnpm 10.28.2; pins must be real before install resolves against them.
- [x] `git init` -- baseline for later story diffs. No commit.
- [x] Scaffold via `create-next-app@16.3.0`: TypeScript, ESLint, App Router, `@/*` alias, no Tailwind, no `src/`.
- [x] `package.json` -- exact pins, `engines`, `packageManager`, scripts (see Design Notes).
- [x] `.nvmrc`, `.gitignore` -- pin runtime; ignore `/data` and `/out`.
- [x] Directory seed with `.gitkeep` files.
- [x] `eslint.config.mjs` -- the dependency rule, covering every matrix row.
- [x] `tools/boundary-fixtures/` + `scripts/verify-boundaries.mjs` -- test each matrix row; an untested guardrail silently stops working.
- [x] Strip the scaffold's demo page and styles to a minimal placeholder -- tokens and chrome are Stories 1.2–1.3.

**Acceptance Criteria:**
- Given a clean checkout, when I run `pnpm install && pnpm dev`, then the app serves on localhost as a single process, with no container or second process.
- Given the installed tree, when I run `pnpm ls --depth 0`, then every pinned package sits at its exact version.
- Given the repository, when I list the tree, then `core/`, `adapters/`, `app/`, `components/` exist and `core/` holds `ports`, `canon`, `pipeline`, `validation`, `diff`, `scoring`, `gates`.
- Given any matrix violation, when I run `pnpm build`, then it fails and the output names the offending import.
- Given the project, when I run `pnpm typecheck`, then it completes on TypeScript 5.9.3 with no experimental compiler flag.

## Spec Change Log

**Enforcement — three mechanisms, not two.** No single rule covers every shape a module reference can take under `core/`:

- `boundaries/element-types` resolves the specifier to a file and classifies it. This is the only thing that catches the relative escape.
- `no-restricted-imports` covers bare specifiers — packages, `next/*`, Node built-ins in both `fs` and `node:fs` form — and the `@/` alias escape. None of those resolve to a project file the path rule could classify.
- `tailor/no-deferred-module-loading` (a local rule defined in `eslint.config.mjs`) bans `import()`, `require()` and `require.resolve()` outright under `core/`. **Both rules above inspect static import and export declarations only**, so `await import("node:fs")`, `require("drizzle-orm")` and `await import("../../adapters/db/x")` all linted clean until this was added. The class is banned wholesale rather than pattern-matched, because a specifier pattern still leaves `await import(someVariable)` open. The message names the specifier when it is a literal.

**Element patterns must be `mode: "full"`.** The first attempt used `{ pattern: "**/core/*", mode: "folder" }`, which classifies only files inside a *subfolder* of `core/`. A file at `core/x.ts` was unclassified, and `boundaries/element-types` silently allows a dependency it cannot classify — so the relative escape was unblocked at the core root. The same gap existed on the target side: an escape pointing at `adapters/x.ts` or `components/x.ts` was missed. `**/<name>/**` with `mode: "full"` classifies root-level and nested files alike, and removes the unexplained `app` asymmetry.

**The `import/resolver` extension list is load-bearing, but narrowly.** `eslint-config-next` already sets `import/resolver.node.extensions` to `.js/.jsx/.ts/.tsx`, so the common cases resolve without help. Widening it to `.mts/.cts/.mjs/.cjs/.json` matters because an *unresolved* specifier is skipped by the boundaries rule — an escape whose target is authored as `.mts` would otherwise be invisible, with every check still green. Pinned by `mts-target-escape.ts`. (An earlier revision of this log claimed the setting was load-bearing in general; that was measured against a standalone fixtures config that did not include `eslint-config-next`, and was wrong for the shipping config.)

**`verify:boundaries` runs inside `build`.** `build` is `pnpm lint && pnpm typecheck && pnpm verify:boundaries && next build`. There is no CI (the story forbids it) and no hook, so without this the fixtures ran only when a human typed the command — and any of the decay modes above would stay green. The script does not spawn `pnpm build` (that would recurse); it spawns `pnpm lint` with a probe file in the real `core/` tree, and separately asserts that `package.json`'s `build` string still chains both `pnpm lint` and `pnpm verify:boundaries`.

**Guardrail coverage.** 22 fixtures, 14 violation classes. Each fixture declares its own expectation on line 1 (`// EXPECT: clean` / `// EXPECT: violation "spec"`). Beyond the per-fixture expectations the script asserts: every class is present; every relative escape was caught by a *path-resolving* rule specifically; every violation was reported by a boundary-enforcing rule (so an unrelated rule whose message happens to contain the specifier cannot stand in for a dead one); a fixture expected to lint clean actually resolves its relative imports on disk (an unresolved import is skipped, so a renamed target would turn it into a silent pass); and nothing is reported as a warning. Each of these was checked by deliberately breaking the config and confirming the script goes red.

**Pins and dependencies.**

- `@types/node` moved from the scaffold's `^20` to `^24` to match the pinned Node 24.19.0 runtime. Not one of the ten pins; range kept as the scaffold had it. Type-checks clean.
- `@types/better-sqlite3` left out, per Design Notes — nothing imports better-sqlite3 yet. The DB adapter story owns that call.
- `playwright` sits in `dependencies`, not `devDependencies` — the render adapter drives Chromium at runtime. `drizzle-kit` is dev-only.
- Chromium browser binaries were **not** downloaded. `pnpm install` installs the `playwright` package only; `playwright install chromium` belongs to the render story.
- `pnpm-workspace.yaml`'s `allowBuilds` entry for better-sqlite3 is **inert at 13.0.3**: that version ships prebuilt bindings in the tarball (`prebuilds/darwin-arm64.node` and friends) and declares no install or postinstall script. Verified by loading it. The entry is kept as a standing allowance and the comment now says so rather than claiming the package cannot load without it. `esbuild: true` is real and required — its postinstall fetches the platform binary that drizzle-kit bundles through.

## Design Notes

`next build` type-checks but does **not** lint — Next 16 removed the `lint` command. The build script must chain the checks explicitly, or the rule "blocks the build" only in theory:

```json
"scripts": {
  "dev": "next dev",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "verify:boundaries": "node scripts/verify-boundaries.mjs",
  "build": "pnpm lint && pnpm typecheck && next build"
}
```

Prefer a path-resolving mechanism (`eslint-plugin-boundaries`, or `import/no-restricted-paths`) over bare `no-restricted-imports` patterns: string matching on specifiers misses the relative escape, which is exactly the case a developer hits by reflex. Verify the chosen mechanism by running it against the fixtures, not by reading its docs.

`@types/better-sqlite3` is at 9.6.0, four majors behind the runtime. Nothing here imports it; if adding it produces type errors, leave it out and note it — the DB adapter story owns that call.

## Verification

**Commands:**
- `node -v && pnpm -v` -- expected `v24.19.0` and `11.21.0`.
- `pnpm install` -- expected: no `ERESOLVE`; report any peer warnings.
- `pnpm build` -- expected exit 0 (covers lint + typecheck).
- `pnpm verify:boundaries` -- expected exit 0, confirming every violation class fired.
- `pnpm dev` then `curl -sSf localhost:3000` -- expected HTTP 200; kill the server afterward.

## Suggested Review Order

**The AD-1 invariant — start here**

- The whole design in one comment: three mechanisms, and why one cannot cover every shape.
  [`eslint.config.mjs:7`](../../eslint.config.mjs#L7)

- Element classification. `mode: "full"` is what makes a file at `core/` root count as core at all.
  [`eslint.config.mjs:159`](../../eslint.config.mjs#L159)

- Path-resolved escapes: the relative form that string matching cannot see.
  [`eslint.config.mjs:172`](../../eslint.config.mjs#L172)

- Bare specifiers, Node built-ins in both forms, and the `@/` alias escape.
  [`eslint.config.mjs:185`](../../eslint.config.mjs#L185)

- The local rule closing `import()`, `require()`, and `require.resolve()` — including the non-literal form.
  [`eslint.config.mjs:144`](../../eslint.config.mjs#L144)

- Resolver extensions. Load-bearing only for `.mts`/`.cts` targets; an unresolved specifier is silently skipped.
  [`eslint.config.mjs:169`](../../eslint.config.mjs#L169)

**Proving the guardrail still fires**

- Why an unexercised guardrail is the failure mode this script exists to prevent.
  [`verify-boundaries.mjs:1`](../../scripts/verify-boundaries.mjs#L1)

- The coverage contract: every escape class that must stay proven.
  [`verify-boundaries.mjs:105`](../../scripts/verify-boundaries.mjs#L105)

- Per-fixture assertions, gated on ruleId so a coincidental message cannot vouch for a dead rule.
  [`verify-boundaries.mjs:228`](../../scripts/verify-boundaries.mjs#L228)

- Clean fixtures must resolve on disk, or they pass vacuously when a target is renamed.
  [`verify-boundaries.mjs:181`](../../scripts/verify-boundaries.mjs#L181)

- A real violation in real `core/` must block lint — pid-unique probe, signal-safe.
  [`verify-boundaries.mjs:323`](../../scripts/verify-boundaries.mjs#L323)

- Static assertion that `build` actually chains the checks; spawning `build` here would recurse.
  [`verify-boundaries.mjs:372`](../../scripts/verify-boundaries.mjs#L372)

**Where enforcement meets the build**

- Next 16 removed `next lint`, so the chain is the only thing making a violation fail the build.
  [`package.json:15`](../../package.json#L15)

**Peripherals**

- Props typed explicitly: generated route types do not exist when `typecheck` runs first.
  [`app/layout.tsx:10`](../../app/layout.tsx#L10)

- Typecheck scope excludes what lint ignores, so the two cannot drift.
  [`tsconfig.json:33`](../../tsconfig.json#L33)

- Fixture inventory — 22 files, each declaring its own expectation on line 1.
  [`boundary-fixtures/README.md:1`](../../tools/boundary-fixtures/README.md#L1)
