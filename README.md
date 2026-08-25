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
| `pnpm build` | `lint` → `typecheck` → `verify:boundaries` → `next build`. Next 16 has no `next lint`, so the build chains every check explicitly. |
| `pnpm verify:boundaries` | Proves the core dependency rule still fires on every violation class. |

## Layout

```text
core/         # ports · canon · pipeline · validation · diff · scoring · gates
adapters/     # boards · ats · model · render · db
app/          # App Router; api/ is the composition root
components/   # resume-document
data/         # gitignored — canon, SQLite, logs
out/          # gitignored — rendered PDFs
```

**No file under `core/` may import outward** — not from `app/`, `adapters/`,
`components/`, `next/*`, `drizzle-orm`, `playwright`, or any Node built-in. The
core receives capability only through the port interfaces it defines. Deferred
loading — `import()`, `require()` — is banned outright under `core/`, because
the static import rules cannot see through it. All of this is enforced as an
ESLint **error** in `eslint.config.mjs` and runs inside `pnpm build`, so a
violation fails the build naming the offending import.

`tools/boundary-fixtures/` holds deliberately-violating files. They are
excluded from the app's lint glob and from `tsconfig.json`;
`pnpm verify:boundaries` lints them with the shipping config and asserts every
violation class still fires. It runs inside `pnpm build`, so the guardrail
cannot rot untested. Do not "fix" the imports in there.
