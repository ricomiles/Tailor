import { defineConfig } from "drizzle-kit";

/**
 * The drizzle-kit CLI's config. Read by `pnpm db:generate` and by nothing else
 * — the runtime migrator in `adapters/db/bootstrap.ts` is handed its folder and
 * its database directly, so this file cannot change what a running app does.
 *
 * `out` and `schema` are not free choices: `scripts/verify-boundaries.mjs`
 * imports this config and asserts both resolve to the same paths the app reads
 * at startup. Pointing `out` somewhere else would send every generated
 * migration to a directory the app never opens, and no other check would
 * notice.
 *
 * There is no push script and there will not be one. The `push` subcommand
 * converges a live database on the current schema by whatever DDL that takes,
 * including dropping a column — and here that column holds real posting and run
 * history in a gitignored SQLite file with no replica and no backup.
 * `verify-boundaries.mjs` fails the build if any script body or config invokes
 * it, because a prohibition nothing checks is a comment.
 *
 * `dbCredentials.url` is only where the CLI would look for an existing database
 * to introspect. `generate` diffs the schema against the snapshots it keeps in
 * `adapters/db/migrations/meta/` and never opens it. (That `out` below is the
 * config key, not the repo's `./out` directory, which holds rendered PDFs.)
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./adapters/db/schema.ts",
  out: "./adapters/db/migrations",
  dbCredentials: { url: "./data/tailor.db" },
});
