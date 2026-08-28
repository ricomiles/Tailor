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

Two further classes need no import at all, so no import rule could ever have
caught them. `Response` is a global — `throw new Response("x", { status: 400 })`
inside `core/` satisfied every other rule in this file.

- **An HTTP response built under `core/`** — construction with and without
  `new`, a static call (`Response.json`), a `Response` type annotation, the
  ambient `NextResponse` form, an alias (`const Aliased = Response`), the
  binding spelled around entirely (`globalThis.Response`, both dotted and
  bracketed, and destructured), a subclass, and an `instanceof` test. One fixture per shape:
  every one of them is an AST node the rule can stop visiting on its own.
- **An HTTP status carried under `core/`** — `statusCode` / `httpStatus` /
  `statusText` unconditionally, as an object property, a computed string key, a
  class field, a type member and a member access; plus a `status` whose value is
  a number in 100–599, as a property and as an assignment.

The clean counterparts are what stop an over-broad rule from silently narrowing
what the core may do:

- `clean.ts` — the load-bearing one. `scripts/verify-boundaries.mjs` hard-codes
  it as the file it asks ESLint for a resolved config for, so it is what proves
  the core rules are loaded as errors at all, and that `noInlineConfig` is still
  set. A clean fixture that passes because no rule ran proves nothing.
- `clean-zod.ts` — `zod` must stay importable from `core/`.
- `clean-domain-status.ts` — `run_steps.status` is a domain status
  (`pending | running | done | failed`) declared as a zod schema under `core/`.
  A domain status is not an HTTP status, and the numeric-literal clause of
  `tailor/no-http-status-in-core` exists so this file lints clean.
- `clean-numeric-domain-status.ts` — the same argument for numbers, which is
  where that clause could actually regress: a domain number outside the HTTP
  range (`{ status: 7 }`), an unconstrained `z.number()`, and a `status: number`
  type member.

Each file declares its own expectation on line 1:

```ts
// EXPECT: clean
// EXPECT: violation "next/server"
```

They are excluded from the app's lint glob (`eslint.config.mjs`) and from
`tsconfig.json`, and exist only so that `pnpm verify:boundaries` — which runs
inside `pnpm build` — can prove the AD-1 guardrail still fires.

Do not "fix" the violations. Each file's failure is the assertion.
