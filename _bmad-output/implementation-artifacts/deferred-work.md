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
