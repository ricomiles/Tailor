# Boundary fixtures

Deliberately-violating (and deliberately-clean) files covering every row of the
story's I/O & edge-case matrix, plus the escape routes found afterwards that
the matrix does not name: deferred loading (`import()`, `require()`), an escape
from the root of `core/`, an escape *to* a file at the root of `adapters/`,
escapes into `components/` and `app/`, and an escape whose target is authored
as `.mts`.

Each file declares its own expectation on line 1:

```ts
// EXPECT: clean
// EXPECT: violation "next/server"
```

They are excluded from the app's lint glob (`eslint.config.mjs`) and from
`tsconfig.json`, and exist only so that `pnpm verify:boundaries` — which runs
inside `pnpm build` — can prove the AD-1 guardrail still fires.

Do not "fix" the violations. Each file's failure is the assertion.
