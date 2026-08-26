# Deferred Work

Findings surfaced incidentally by review, not caused by the story that found them.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: `next.config.ts` does not declare `serverExternalPackages` for `better-sqlite3` and `playwright`.
  evidence: Both are native/runtime-heavy packages that Next will otherwise attempt to bundle into the server build. `better-sqlite3` loads a `.node` binding. Belongs to the DB and render adapter stories that first import them.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: Nothing creates the `data/` and `out/` directories that the architecture and README both document.
  evidence: Both are gitignored and neither exists on disk nor in the `.gitkeep` seed, so the first write to either fails at runtime. Needs a setup script or `mkdirSync(..., { recursive: true })` at the adapter boundary; owned by the DB/render stories.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: Layering is enforced outward-from-core only; no rule constrains `adapters/`, `components/`, or `app/` importing each other.
  evidence: The `boundaries/elements` settings declare all four element types but the only rule is `from: ["core"]`. The architecture names `app/api/` the composition root, which nothing enforces. AD-1 covers only the core half, so this is outside Story 1.1's scope but is a real gap in the stated architecture.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: No `.env.example` or documented environment contract.
  evidence: `.env*` is gitignored, and the model adapter, board adapters, and DB path will all need configuration. A fresh clone has no way to discover which variables exist. Owned by the first story that introduces an env var.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: `_bmad/` and `_bmad-output/` are untracked and un-ignored — no decision has been encoded about committing them.
  evidence: `git status` lists both as untracked, so `git add .` would commit roughly 800 KB of planning material. ESLint ignores them and tsconfig excludes them, but nothing stops the commit. Needs an explicit keep-or-ignore decision.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: No test runner and no `pnpm test` script.
  evidence: `scripts/verify-boundaries.mjs` is the repo's only executable assertion and it covers lint configuration only. Story 1.1 forbids business logic so there is nothing to unit-test yet, but the first story with real logic will need a runner chosen and wired.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-app-on-the-pinned-stack.md`
  summary: `engines.node` and `packageManager` are advisory; nothing enforces them at install time.
  evidence: Installing on Node 20, or with npm/yarn instead of pnpm, succeeds and fails later cryptically when `better-sqlite3` cannot load. An `.npmrc` with `engine-strict=true` would make the declared floor real, but adding install-time configuration is beyond this story's stated scope.

## Deferred from: code review of spec-1-1-run-the-app-on-the-pinned-stack (2026-08-26)

- summary: `resolvesOnDisk()` scans fixture source with a regex rather than the AST.
  evidence: A relative specifier appearing inside a comment or a string literal is treated as a real import, so a clean fixture can fail the "does not resolve on disk" assertion and block the build spuriously. `scripts/verify-boundaries.mjs:170`.

- summary: Signal exit codes are inconsistent and SIGQUIT is unhandled.
  evidence: The handler exits 143 for every trapped signal, but SIGHUP should be 129 and SIGQUIT 131; SIGQUIT is not in the trapped set and cleans up only via the `exit` hook. No consumer reads these codes today (there is no CI), so the impact is latent. `scripts/verify-boundaries.mjs:146`.

- summary: `FIXTURE_EXTENSIONS` declares eight extensions; the fixture set exercises two.
  evidence: 21 `.ts` files and one `.mts`. No `.cts`, `.cjs`, `.js`, `.jsx` or `.tsx` fixture exists, so the collection machinery built to keep the walk and the lint glob in sync is itself unproven for six of its eight cases. `scripts/verify-boundaries.mjs:62`.

- summary: `next-env.d.ts` creates a build-ordering hazard.
  evidence: It now carries hard imports of `./.next/dev/types/routes.d.ts` and `root-params.d.ts`, and `build` runs `tsc --noEmit` before `next build`. Deleting `.next/` while leaving the gitignored `next-env.d.ts` in place fails typecheck before the step that would regenerate the missing files can run. A clean clone has neither file and is unaffected.

- summary: README documents `out/` for rendered PDFs, colliding with Next's static-export directory.
  evidence: `eslint.config.mjs` lists `out/**` among "Default ignores of eslint-config-next" for exactly that reason. Setting `output: "export"` would have `next build` write into the rendered-PDF folder. The spec forbids a deployment target, so this cannot bite yet.

- summary: The local `tailor` ESLint plugin object carries no `meta: { name, version }`.
  evidence: ESLint 9 uses plugin meta for `--print-config` and config inspection; without it the plugin shows up unidentified. The rule also uses a raw `message` string instead of `meta.messages` + `messageId`. `eslint.config.mjs:144`.

- summary: README's layout tree omits `scripts/` and `tools/`.
  evidence: The prose immediately below the tree discusses `tools/boundary-fixtures/`, so the tree is incomplete against its own surrounding text.

- summary: ESLint v9 is on the `maintenance` dist-tag; the v10 migration is unscheduled.
  evidence: `9.39.5` is the newest 9.x and npm marks it "no longer supported"; `latest` is 10.9.1. `eslint-config-next@16.3.0` peers `eslint >=9.0.0` so v10 may well work, but it is a real upgrade with its own flat-config and rule churn — out of scope for a code review of Story 1.1. Raised when pinning the lint toolchain on 2026-08-26.
