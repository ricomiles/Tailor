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
| `pnpm verify:boundaries` | Proves the core dependency rule still fires on every violation class; pins the `build` chain and every script body it names; bans the drizzle-kit `push` subcommand from every `package.json` script and every root-level config and `scripts/` source; checks the migration journal's shape and that each entry has its `.sql`; asserts the app, drizzle-kit and the journal check all mean the same migrations directory; and fails the build when `pnpm verify` has not run against the current sources. |
| `pnpm clean:probes` | Clears a boundary probe left behind by a killed `verify:boundaries` run. |
| `pnpm db:generate` | Writes a new SQL migration into `adapters/db/migrations/` from `adapters/db/schema.ts`. There is deliberately no `db:push`. |

## Bootstrap

`pnpm dev` and `pnpm start` set the machine up before serving a request. Every
test drives the routine against a temp directory instead — `bootstrap()` takes
the root as a parameter for exactly that reason, and `pnpm test` fails if the
suite touched `./data` or `./boards.json`, which `git status` could not have
told you since both are gitignored. The
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

Neither file is ever touched once it exists. Canon is staged and then
hard-linked into place, `boards.json` is written with the `wx` flag: each is a
single exclusive syscall, so "does it exist?" and "write it" are one operation
the filesystem arbitrates — a second start reports `left-untouched` and leaves a
hand-edited canon byte-for-byte intact, including a canon holding invalid JSON.
Repair is not on offer: `boards.json` is parsed and validated by the code that
reads it, not by the routine that placed it.

`data/tailor.db` is the exception, and it is not a file the routine writes
content into: the driver opens it read-write on every start and `migrate()`
creates the `__drizzle_migrations` ledger if it is not already there. Its
`created` / `left-untouched` outcome is read off the ledger's row count rather
than off the file, because an empty `tailor.db` — an interrupted first start, a
stray `touch` — is not a migrated one.

`next build` does **not** run it (Next skips instrumentation during the
production build), so building creates no `./data`. `pnpm verify` does: its
`test:e2e` half serves the app with `next start` at the repo root, so a normal
verify run is what first creates `./data` and `./boards.json` in your own
checkout. Both are gitignored.

**If bootstrap throws, the server does not stop.** Measured against Next 16.3.0
rather than assumed: the process logs the failure, keeps listening, and answers
every request `500` for the rest of its life, because Next memoises the rejected
`register()` promise and never retries it. A uniform 500 with a `TailorError` in
the startup log is the symptom to look for — restarting is the only recovery.

**To reset a machine:** stop the server and `rm -rf data boards.json`. The next
start recreates all three — canon copied from the seed, `boards.json` serialised
from `EMPTY_BOARDS_FILE`, the database created by the driver. That deletes the
canonical resume and every posting and run stored so far, and none of it is in
git — copy `data/` first if you mean to keep it.

`scripts/startup-gate.mjs` is what keeps this honest. It boots the real
production server twice with its working directory on a fresh temp directory:
the first boot must leave canon byte-identical to the seed, a parseable
`boards.json` and a database carrying the migration ledger — existence alone is
not enough, since three empty files would satisfy that — and the second boot,
after canon is hand-edited, must write nothing at all. `pnpm test:e2e` runs it,
and the startup path is in the freshness marker's observed list, so changing
`instrumentation.ts`, the routine, the seed, the journal or either `core/`
declaration makes `pnpm build` refuse until `pnpm verify` has booted the app
again. Without it, deleting the `bootstrap()` call left every other check green.

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
core/         # ports · canon · pipeline · validation · diff · scoring · gates · errors · boards · bootstrap
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
