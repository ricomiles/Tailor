/**
 * Next's server-start hook — the app setting itself up on a clean machine.
 *
 * `register()` is called once when a server instance is initiated and must
 * complete before the first request is served, which is exactly the guarantee
 * bootstrap needs: no route handler can reach a `./data` that does not exist
 * yet. Next 16 needs no config flag for this file (`experimental.
 * instrumentationHook` is gone) but it must sit at the repo root, beside
 * `app/`, never inside it.
 *
 * A `predev` script was the alternative and would have missed `next start` —
 * which is what `playwright.config.ts` serves the e2e suite from. Instrumentation
 * covers `dev` and `start` alike and is skipped during `next build`
 * (`next/dist/server/lib/router-utils/instrumentation-globals.external.js`
 * returns early on `NEXT_PHASE === 'phase-production-build'`), so the build
 * stays a pure check chain and creates no `./data` of its own.
 */

export async function register() {
  // Next compiles this file for both runtimes and calls `register` in each.
  // The edge runtime cannot load a native addon, so `better-sqlite3` must not
  // even be *reachable* there — hence a dynamic import inside the guard rather
  // than a static import at the top of the file, which the edge bundle would
  // evaluate before this check ever ran.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { bootstrap } = await import("@/adapters/db/bootstrap");
  const { BOOTSTRAP_ARTIFACTS } = await import(
    "@/core/bootstrap/bootstrap-report"
  );

  // No try/catch, and no attempt to carry on. What actually happens when this
  // throws was measured against 16.3.0 rather than assumed, because the
  // difference matters: the process does **not** exit. Next logs
  // `Failed to prepare server` and an `unhandledRejection`, keeps listening,
  // and answers every request `500` — and it stays 500 for the life of the
  // process, because `ensureInstrumentationRegistered` memoises the rejected
  // promise (`next/dist/server/lib/router-utils/instrumentation-globals.external.js`)
  // and never retries.
  //
  // That is still the right outcome, but for a narrower reason than "the app
  // refuses to start": an app whose canon was never seeded and whose database
  // has no migration ledger cannot serve a useful request, so one legible
  // startup error plus a uniform 500 beats a server that looks healthy and
  // fails later somewhere unrelated. `scripts/startup-gate.mjs` exists because
  // this state is otherwise indistinguishable from a healthy boot to every
  // other check in the repo.
  const report = bootstrap();

  // The report is the story's proof of idempotence, so it is worth printing:
  // the second `pnpm dev` on the same machine should read `left-untouched`
  // across the board, and a `created` there is a file that went missing.
  console.log(
    `bootstrap: ${BOOTSTRAP_ARTIFACTS.map(
      (artifact) => `${artifact} ${report[artifact]}`,
    ).join(", ")}`,
  );
}
