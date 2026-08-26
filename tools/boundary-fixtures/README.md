# Boundary fixtures

Deliberately-violating (and deliberately-clean) files covering every row of the
story's I/O & edge-case matrix, plus the escape routes found afterwards that
the matrix does not name: deferred loading in every form (`import()` literal and
non-literal, `require()`, `require.resolve()`, a `require` value reference,
`import.meta.resolve`, `process.getBuiltinModule`), an escape from the root of
`core/`, an escape *to* a file at the root of `adapters/`, escapes into
`components/` and `app/`, an escape whose target is authored as `.mts`, both
re-export forms (`export … from` and `export * from`), a relative escape whose
target does not resolve at all, escapes into unclassified directories by both
relative and alias form, and the UI/state runtime (`react`, `zustand`).

`clean-zod.ts` is the counterpart: `zod` must stay importable from `core/`, so
an over-broad rule fails here rather than silently narrowing what the core may
do.

Each file declares its own expectation on line 1:

```ts
// EXPECT: clean
// EXPECT: violation "next/server"
```

They are excluded from the app's lint glob (`eslint.config.mjs`) and from
`tsconfig.json`, and exist only so that `pnpm verify:boundaries` — which runs
inside `pnpm build` — can prove the AD-1 guardrail still fires.

Do not "fix" the violations. Each file's failure is the assertion.
