# tailor

Tailors a hand-authored canonical resume to a job posting, and refuses to ship
anything the canon does not support.

## Requirements

- Node `24.19.0` (`.nvmrc`; `engines.node` floor is `>=22`, set by better-sqlite3)
- pnpm `11.21.0` (`packageManager`; `corepack enable` activates it)

```bash
nvm use
corepack enable
pnpm install
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
| `pnpm build` | `clean:probes` → `lint` → `typecheck` → `verify:boundaries` → `next build`. Next 16 has no `next lint`, so the build chains every check explicitly. |
| `pnpm verify:boundaries` | Proves the core dependency rule still fires on every violation class. |
| `pnpm clean:probes` | Clears a boundary probe left behind by a killed `verify:boundaries` run. |

## Layout

```text
core/         # ports · canon · pipeline · validation · diff · scoring · gates
adapters/     # boards · ats · model · render · db
app/          # App Router; api/ is the composition root
components/   # resume-document
data/         # gitignored — canon, SQLite, logs
out/          # gitignored — rendered PDFs
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
