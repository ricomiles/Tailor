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

Three further classes need no import at all, so no import rule could ever have
caught them. `Response` is a global — `throw new Response("x", { status: 400 })`
inside `core/` satisfied every other rule in this file.

One fixture per shape, and the shape is the AST position rather than the idea:
two spellings that reach the rule down different branches are two fixtures, so
either branch going dead turns exactly one fixture red.

- **An HTTP response built under `core/`** — construction with and without
  `new`, a static call (`Response.json`), a `Response` type annotation, the
  ambient `NextResponse` form, an alias (`const Aliased = Response`), the
  binding spelled around entirely (`globalThis.Response` dotted, bracketed and
  backticked, and destructured), a subclass, and an `instanceof` test.
- **An HTTP status carried under `core/`** — `statusCode` / `httpStatus` /
  `statusText` unconditionally, as an object property, a computed string key, a
  backticked computed key, a class field, a private class field, a type member,
  a type method, an accessor, a constructor parameter property, a bare binding
  and a member access; plus a `status` whose value is a number in 100–599, as a
  property, an assignment (dotted and bracketed), a class field, a type member
  and a union of literals.
- **A disable comment inside `core/`** — `inline-config-bypass.ts` carries a
  `// eslint-disable-next-line` above a violating construct and is still
  rejected. It is the one bypass that would silence every AD-1 rule at once, and
  the only fixture expected to emit a warning: ESLint's unruled "has no effect
  because you have 'noInlineConfig'" notice, which `verify-boundaries.mjs`
  requires to appear at least once. Asserting the flag's presence in the
  resolved config is not the same as watching a real directive be ignored.

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
- `clean-out-of-range-status.ts` — the edges of that range, `99` and `600`. An
  off-by-one in the range test is invisible without them.

Each file declares its own expectation on line 1:

```ts
// EXPECT: clean
// EXPECT: violation "next/server"
```

They are excluded from the app's lint glob (`eslint.config.mjs`) and from
`tsconfig.json`, and exist only so that `pnpm verify:boundaries` — which runs
inside `pnpm build` — can prove the AD-1 guardrail still fires.

Do not "fix" the violations. Each file's failure is the assertion.
