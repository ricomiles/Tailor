/**
 * The project invariants that must block the build, as pure predicates.
 *
 * A separate module from `scripts/verify-boundaries.mjs` for one reason: that
 * file runs its whole guardrail on import — it spawns `pnpm lint`, writes
 * probes into `core/`, and exits non-zero — so a unit test could not import a
 * predicate out of it without running all of that. These functions touch no
 * filesystem and no process state, so `tests/project-invariants.test.mts` can
 * feed them violating inputs directly.
 *
 * That test is the point. This repo's own doctrine is that a guardrail nobody
 * exercises stops working silently, and the first version of these checks was
 * proven only by hand-run mutation steps written down in a spec.
 */

/**
 * The one place the migrations directory is named as a repo-relative path.
 *
 * Three literals named it independently — `drizzle.config.ts`'s `out`,
 * `adapters/db/bootstrap.ts`'s `MIGRATIONS_FOLDER`, and this module's journal
 * path. Changing `out` alone would land every generated migration in a
 * directory the running app never reads, with every check still green, so
 * `verify-boundaries.mjs` asserts all three resolve to this.
 */
export const MIGRATIONS_DIR = "adapters/db/migrations";

/** The journal, relative to the repo root. Always inside `MIGRATIONS_DIR`. */
export const JOURNAL_FILE = `${MIGRATIONS_DIR}/meta/_journal.json`;

/**
 * What drizzle-kit 0.31.10 writes for this dialect. `snapshotVersion` is
 * `"7"` (`node_modules/drizzle-kit/bin.cjs:5601`) and the dialect is the one
 * `drizzle.config.ts` declares. Pinned because a journal carrying another
 * dialect is a journal from another project: `drizzle-orm` would read it
 * without complaint and apply SQL written for a different database.
 */
export const JOURNAL_VERSION = "7";
export const JOURNAL_DIALECT = "sqlite";

/**
 * A `drizzle-kit` invocation whose subcommand is `push`.
 *
 * Deliberately tolerant of everything a real script does between the two
 * words — a pinned version (`drizzle-kit@latest push`) and any run of flags
 * (`drizzle-kit --config=x push`) — because a check that only recognised the
 * bare two-word form would be satisfied by every way anyone would actually
 * write it. It is *not* tolerant of an arbitrary word between them, so
 * `drizzle-kit generate && git push` is not a match: `push` there is git's.
 *
 * Push is banned because it converges a live database on the current schema by
 * whatever DDL that takes, dropping a column or a table if that is what it
 * takes. Here that is real posting and run history in a gitignored SQLite file
 * with no replica and no backup.
 */
export const DRIZZLE_PUSH = /drizzle-kit(?:@\S+)?(?:\s+-{1,2}\S+)*\s+push(?![\w-])/;

/**
 * Files that are allowed to contain the forbidden sequence, because naming it
 * is their job: this module declares the pattern and the verifier prints it in
 * the failure message. Kept as an export so a test can assert it stays this
 * short — an exemption list is the obvious place to hide a real invocation.
 */
export const PUSH_SCAN_EXEMPT = Object.freeze([
  "scripts/project-invariants.mjs",
  "scripts/verify-boundaries.mjs",
]);

/**
 * @param {Iterable<{ name: string, body: string }>} entries
 * @returns {string[]} the `name` of every entry invoking push, in order.
 */
export function findPushInvocations(entries) {
  const found = [];
  for (const { name, body } of entries) {
    if (DRIZZLE_PUSH.test(String(body ?? ""))) found.push(name);
  }
  return found;
}

/**
 * The `package.json` half, which is the form the acceptance criterion names.
 *
 * @param {Record<string, string> | undefined | null} scripts
 * @returns {string[]} the names of the offending scripts.
 */
export function findPushScripts(scripts) {
  return findPushInvocations(
    Object.entries(scripts ?? {}).map(([name, body]) => ({
      name,
      body: String(body ?? ""),
    })),
  );
}

/**
 * Everything structurally wrong with a parsed journal, as sentences.
 *
 * A list rather than a boolean, and rather than a throw on the first problem:
 * the repo's convention is that a check names the offending token, and a
 * journal with two problems should report two.
 *
 * @param {unknown} journal
 * @returns {string[]}
 */
export function journalProblems(journal) {
  if (typeof journal !== "object" || journal === null || Array.isArray(journal)) {
    return ["is not a JSON object"];
  }
  const problems = [];
  const { version, dialect, entries } = /** @type {Record<string, unknown>} */ (journal);

  if (!Array.isArray(entries)) {
    // The one that stops the app dead: `drizzle-orm`'s migrator does a bare
    // `for (const entry of journal.entries)`, so anything else throws at every
    // server start rather than at the moment the journal was damaged.
    problems.push("has no `entries` array");
  }
  if (dialect !== JOURNAL_DIALECT) {
    problems.push(
      `declares dialect ${JSON.stringify(dialect)}, not "${JOURNAL_DIALECT}"`,
    );
  }
  if (version !== JOURNAL_VERSION) {
    problems.push(
      `declares version ${JSON.stringify(version)}, not "${JOURNAL_VERSION}"`,
    );
  }
  return problems;
}

/**
 * Journal entries whose `.sql` file is not on disk.
 *
 * `drizzle-orm` reads `<migrationsFolder>/<tag>.sql` for every entry and throws
 * `No file <tag>.sql found` when one is missing — at server start, on the
 * developer's machine, long after the half-commit that caused it. An entry with
 * no file is the exact shape of committing the journal without the migration.
 *
 * `exists` is injected rather than imported so this stays pure and testable.
 *
 * @param {unknown} journal
 * @param {(relativePath: string) => boolean} exists
 * @returns {string[]} the missing paths, relative to the repo root.
 */
export function missingMigrationFiles(journal, exists) {
  const entries =
    typeof journal === "object" && journal !== null && Array.isArray(/** @type {any} */ (journal).entries)
      ? /** @type {any} */ (journal).entries
      : [];
  const missing = [];
  for (const entry of entries) {
    const tag = entry?.tag;
    if (typeof tag !== "string" || tag.length === 0) {
      missing.push(`${MIGRATIONS_DIR}/<entry with no tag>.sql`);
      continue;
    }
    const path = `${MIGRATIONS_DIR}/${tag}.sql`;
    if (!exists(path)) missing.push(path);
  }
  return missing;
}
