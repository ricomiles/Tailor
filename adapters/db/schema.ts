/**
 * The Drizzle schema — deliberately empty.
 *
 * `drizzle-kit generate` needs a schema module to diff against, and
 * `drizzle.config.ts` points here. It declares no table, and that is the point:
 * the epic ships the migration *mechanism*, not the tables. `postings`, `runs`,
 * `run_steps`, `diff_items` and `answers` are each declared by the later story
 * that first needs one, so that its shape is derived from a caller rather than
 * guessed a whole epic ahead of it.
 *
 * The migration path stays honest meanwhile: `adapters/db/migrations/` ships a
 * journal with no entries, `migrate()` applies zero of them, and the only thing
 * it creates is the `__drizzle_migrations` ledger. Adding a table here without
 * running `pnpm db:generate` would leave the schema and the migrations
 * disagreeing, which is exactly the drift `drizzle-kit push` exists to paper
 * over — and push is barred from this repo by `scripts/verify-boundaries.mjs`.
 *
 * `export {}` rather than an empty file: `isolatedModules` requires the module
 * marker, and without it this is a global script rather than a module.
 */
export {};
