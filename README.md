# tailor

Tailors a hand-authored canonical resume to a job posting, and refuses to ship
anything the canon does not support.

## Requirements

- Node `24.19.0` (`.nvmrc`; `engines.node` floor is `>=22.18`)
  - The floor is set by Node's type stripping, not by better-sqlite3's `>=22`:
    the unit suite is `.mts` loaded directly by `node --test`, and below 22.18
    it fails with an opaque syntax error. `.npmrc` sets `engine-strict=true`
    so `pnpm install` refuses instead.
- pnpm `11.21.0` (`packageManager`; `corepack enable` activates it)

```bash
nvm use
corepack enable
pnpm install
pnpm exec playwright install chromium   # once; `pnpm verify` needs a browser
pnpm dev            # http://localhost:3000
```

One process, one machine. No container, no second process, no deployment
target — by design.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Runs the app on localhost. |
| `pnpm start` | Serves a production build (after `pnpm build`). |
| `pnpm lint` | ESLint, including the core dependency rule. |
| `pnpm typecheck` | `tsc --noEmit` on TypeScript 5.9.3. |
| `pnpm test` | The Node unit suite (`tests/**/*.test.mts`). An empty suite is a hard failure. |
| `pnpm test:e2e` | Boots the app on an empty temp directory and asserts it set itself up (`scripts/startup-gate.mjs`), runs Playwright against a served production build, then records the freshness marker. The only thing that observes rendered output — font faces, colour tokens, layout. Needs `playwright install chromium` and a current `pnpm build`. |
| `pnpm build` | `clean:probes` → `lint` → `typecheck` → `test` → `verify:boundaries` → `next build`. Next 16 has no `next lint`, so the build chains every check explicitly. |
| `pnpm verify` | `build` → `test:e2e`. The full gate; `build` alone never renders the app. Runs the build with the e2e freshness gate off, since that gate is what the e2e run satisfies. |
| `pnpm verify:boundaries` | Proves the core dependency rule still fires on every violation class; pins the `build` chain and every script body it names; bans the drizzle-kit `push` subcommand from every script and config; checks the migration journal's shape and that each entry has its `.sql`; asserts the app, drizzle-kit and the journal check all mean the same migrations directory; and fails the build when `pnpm verify` has not run against the current sources. |
| `pnpm clean:probes` | Clears a boundary probe left behind by a killed `verify:boundaries` run. |
| `pnpm db:generate` | Writes a new SQL migration into `adapters/db/migrations/` from `adapters/db/schema.ts`. There is deliberately no `db:push`. |

## Bootstrap

`pnpm dev` and `pnpm start` set the machine up before serving a request. The
repo-root `instrumentation.ts` calls `bootstrap()` from `adapters/db/bootstrap.ts`
in Next's `register()` hook, which runs once per server process and completes
before the first request. The routine creates `./data`, seeds
`data/resume.canon.json` from `adapters/db/seed/resume.canon.seed.json`, writes
`./boards.json`, and applies the Drizzle migrations. It returns an outcome —
`created` or `left-untouched` — for each of those three, and `instrumentation.ts`
prints them:

```text
bootstrap: canon created, boardsFile created, database created
```

Nothing here ever touches a file that already exists. Every write goes through
an exclusive-create flag, so "does it exist?" and "write it" are one operation
the filesystem arbitrates — a second start reports `left-untouched` across the
board and leaves a hand-edited canon byte-for-byte intact, including a canon
holding invalid JSON. Repair is not on offer: `boards.json` is parsed and
validated by the code that reads it, not by the routine that placed it.

`next build` does **not** run it (Next skips instrumentation during the
production build), so building creates no `./data`.

**To reset a machine:** stop the server and `rm -rf data boards.json`. The next
start recreates all three from the seed. That deletes the canonical resume and
every posting and run stored so far, and neither is in git — copy `data/` first
if you mean to keep it.

`scripts/startup-gate.mjs` is what keeps this honest. It boots the real
production server with its working directory on a fresh temp directory and
asserts the three artifacts appear there; `pnpm test:e2e` runs it, and
`instrumentation.ts` and `adapters/db/bootstrap.ts` are in the freshness
marker's observed list, so changing either makes `pnpm build` refuse until
`pnpm verify` has booted the app again. Without it, deleting the `bootstrap()`
call left every other check green.

### `boards.json`

Per-machine configuration, gitignored, created empty and edited by hand. The
shape is declared once in `core/boards/boards-file.ts` and nowhere else:

```json
{
  "boards": [
    { "type": "greenhouse", "token": "acme" },
    { "type": "lever", "token": "acme", "label": "Acme Corp" }
  ]
}
```

`type` is one of `greenhouse`, `lever`, `ashby`, `workable`. `token` is the
board identifier from the vendor's URL — the `{token}` in
`boards-api.greenhouse.io/v1/boards/{token}/jobs` — not a credential; every
board endpoint is public JSON. `label` is optional. Epic 2 reads the file
through `boardsFileSchema` and reports what it rejects; bootstrap never opens an
existing one.

### Schema changes

Edit `adapters/db/schema.ts`, run `pnpm db:generate`, commit the generated
`.sql` **and** the updated `meta/_journal.json` — `verify:boundaries` fails on a
journal entry whose `.sql` is missing, which is what half of that commit looks
like. The next server start applies it.

**Never the `push` subcommand.** It converges a live database on the schema by
whatever DDL that takes, including dropping a column — and here that column
holds real posting and run history in a gitignored SQLite file with no backup.
`pnpm verify:boundaries` fails the build if any script body or config invokes
it.

`adapters/db/migrations/` currently holds the journal and no `.sql` file, and
`schema.ts` declares no table. That is the intended state: Epic 1 ships the
mechanism, and `postings`, `runs`, `run_steps`, `diff_items` and `answers` each
arrive with the story that first needs one.

## Layout

```text
core/         # ports · canon · pipeline · validation · diff · scoring · gates
adapters/     # boards · ats · model · render · db (bootstrap, schema, migrations, canon seed)
app/          # App Router; api/ is the composition root
components/   # resume-document · top-bar
tests/        # Node unit suite (*.test.mts) — outside core/, which bans node:test
e2e/          # Playwright specs; the only suite that renders the app
scripts/      # build-chain gates: boundaries, invariants, unit runner, startup, e2e, verify
tools/        # boundary fixtures — deliberate violations the guardrail must catch
instrumentation.ts  # Next's server-start hook; runs the bootstrap
drizzle.config.ts   # drizzle-kit CLI config (generate only)
data/         # gitignored — canon, SQLite, logs; created at startup
out/          # gitignored — rendered PDFs
boards.json   # gitignored — watched board list; created at startup
```

**No file under `core/` may reference anything outside `core/`** — not `app/`,
`adapters/`, `components/`, `scripts/`, `tools/`, a root-level module, `next/*`,
`drizzle-orm`, `better-sqlite3`, `playwright`, the UI/state runtime (`react`,
`react-dom`, `zustand`), or any Node built-in. `zod` is deliberately allowed:
the architecture requires every cross-unit type declared once in the core as a
named schema. The core receives capability only through the port interfaces it
defines. Deferred loading is banned outright under `core/` — `import()`,
`require()`, `require.resolve()`, member forms like `module.require`, a bare
`require` passed around as a value, `import.meta.resolve`, and
`process.getBuiltinModule` — because the static import rules cannot see through
any of them.

Re-exports count: `export * from "../../adapters/db/x"` is an escape exactly as
much as the equivalent `import`, and is caught by the same rule.

All of this is enforced as an ESLint **error** in `eslint.config.mjs` and runs
inside `pnpm build`, so a violation fails the build naming the offending
reference. One caveat worth knowing: `pnpm typecheck` is a load-bearing link in
that chain, not a formality. It is what catches a type-level escape ESLint
cannot see, which is why `verify:boundaries` asserts the build script still
chains it.

`tools/boundary-fixtures/` holds deliberately-violating files. They are
excluded from the app's lint glob and from `tsconfig.json`;
`pnpm verify:boundaries` lints them with the shipping config and asserts every
violation class still fires. It runs inside `pnpm build`, so the guardrail
cannot rot untested. Do not "fix" the imports in there.
