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
 * words — a pinned version (`drizzle-kit@latest push`) and any run of flags,
 * **joined or separated**: `--config=x push` and `--config x push` are both
 * matched, because a check that only recognised the bare two-word form would be
 * satisfied by every way anyone would actually write it.
 *
 * The separated form is why this is not simply `(?:\s+-{1,2}\S+)*`. That
 * version consumed the flag but not its value, so `push` no longer immediately
 * followed and the most ordinary spelling of the command in existence —
 * `drizzle-kit --config drizzle.config.ts push` — walked straight through the
 * ban. Flags are therefore matched as optional flag/value *pairs*: a flag, then
 * at most one following token that is neither another flag nor `push` itself.
 *
 * It is still not tolerant of an arbitrary word standing alone between them, so
 * `drizzle-kit generate && git push` is not a match: `push` there is git's, and
 * `generate` is not a flag, so the pair group cannot consume it.
 *
 * Push is banned because it converges a live database on the current schema by
 * whatever DDL that takes, dropping a column or a table if that is what it
 * takes. Here that is real posting and run history in a gitignored SQLite file
 * with no replica and no backup.
 */
export const DRIZZLE_PUSH =
  /drizzle-kit(?:@\S+)?(?:\s+-{1,2}[^\s=]+(?:=\S+)?(?:\s+(?!-)(?!push(?![\w-]))\S+)?)*\s+push(?![\w-])/;

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

  // Entry *shape*, not just entry count. `drizzle-orm`'s migrator reads `tag`
  // to find the `.sql` and orders by the journal's own sequence; an entry
  // missing `tag`, `idx` or `when` is a journal drizzle-kit did not write, and
  // the failure it produces surfaces at a server start rather than here. Two
  // entries sharing a tag are worse: the second silently never applies, because
  // the ledger records the hash of a file already recorded.
  if (Array.isArray(entries)) {
    const seen = new Set();
    entries.forEach((entry, index) => {
      const tag = /** @type {Record<string, unknown>} */ (entry ?? {}).tag;
      const label = typeof tag === "string" && tag.length > 0 ? `\`${tag}\`` : `at index ${index}`;
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        problems.push(`has an entry ${label} that is not an object`);
        return;
      }
      const { idx, when } = /** @type {Record<string, unknown>} */ (entry);
      if (typeof tag !== "string" || tag.length === 0) {
        problems.push(`has an entry ${label} with no \`tag\``);
      } else if (seen.has(tag)) {
        problems.push(`lists the tag \`${tag}\` more than once`);
      } else {
        seen.add(tag);
      }
      if (typeof idx !== "number") problems.push(`has an entry ${label} with no numeric \`idx\``);
      if (typeof when !== "number") problems.push(`has an entry ${label} with no numeric \`when\``);
    });
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
/**
 * `.sql` files on disk that no journal entry lists.
 *
 * The mirror image of `missingMigrationFiles`, and the same half-commit seen
 * from the other side: `drizzle-orm` iterates the *journal*, never the
 * directory, so a migration file whose entry was left out is simply never
 * applied. There is no error, at any point, ever — the table it creates just
 * does not exist, and the first thing to notice is a query in a later story.
 * Committing the migration without the journal is exactly as easy as committing
 * the journal without the migration, and only one of the two was checked.
 *
 * `listSqlTags` is injected rather than read here so this stays pure and
 * testable, matching `missingMigrationFiles`'s `exists`.
 *
 * @param {unknown} journal
 * @param {() => string[]} listSqlTags every `.sql` basename, without extension.
 * @returns {string[]} the orphaned paths, relative to the repo root.
 */
export function orphanMigrationFiles(journal, listSqlTags) {
  const entries =
    typeof journal === "object" && journal !== null && Array.isArray(/** @type {any} */ (journal).entries)
      ? /** @type {any} */ (journal).entries
      : [];
  const tags = new Set(
    entries.map((entry) => /** @type {any} */ (entry ?? {}).tag).filter((tag) => typeof tag === "string"),
  );
  return listSqlTags()
    .filter((tag) => !tags.has(tag))
    .map((tag) => `${MIGRATIONS_DIR}/${tag}.sql`)
    .sort();
}

/**
 * The test files a runner would never execute.
 *
 * `scripts/run-tests.mjs` computes this from the real tree and then exits, so —
 * like the push ban before it — the widening that made it look at `adapters/`
 * and at the repo root was provable only by hand. Deleting a directory from the
 * scan makes the stray list shrink, and a list that only ever shrinks cannot
 * fail. Pure and exported so `tests/project-invariants.test.mts` can hand it a
 * tree that *should* produce a finding and check that it does.
 *
 * @param {Iterable<string>} candidates every file the scan looked at.
 * @param {Iterable<string>} collected the files the runner will actually run.
 * @param {RegExp} anyTestFile what counts as a test file, in any spelling.
 * @returns {string[]} sorted, deduplicated.
 */
export function strayTestFiles(candidates, collected, anyTestFile) {
  const running = new Set(collected);
  return [...new Set(candidates)]
    .filter((relative) => anyTestFile.test(relative))
    .filter((relative) => !running.has(relative))
    .sort();
}

/**
 * Every project invariant, composed: inputs in, the sentences the build should
 * print out.
 *
 * The predicates above were each unit-tested, and the build still could not
 * tell you they were wired up. `verify-boundaries.mjs` called them, mapped the
 * results and passed each to `fail()` — and replacing one of those call
 * arguments with an empty object left all of it green, because the tests
 * exercised the predicate and never the composition. Moving the composition
 * here moves the part that can rot into the part that is covered: the verifier
 * now gathers files and forwards sentences, and has no arguments of its own to
 * get wrong beyond the ones the tripwire in `tests/` pins.
 *
 * @param {{
 *   scripts?: Record<string, string> | null,
 *   sources?: Iterable<{ name: string, body: string }>,
 *   journalText?: string | null,
 *   exists?: (relativePath: string) => boolean,
 *   listSqlTags?: () => string[],
 * }} inputs
 * @returns {string[]}
 */
export function projectInvariantProblems({
  scripts,
  sources = [],
  journalText = null,
  exists = () => true,
  listSqlTags = () => [],
}) {
  const problems = [];

  const offenders = [
    ...findPushScripts(scripts).map((name) => `package.json's "${name}" script`),
    ...findPushInvocations(sources),
  ];
  for (const offender of offenders) {
    problems.push(
      `${offender} invokes the drizzle-kit "push" subcommand. Push synchronises a ` +
        "live database by dropping whatever stands in the way — a column of real " +
        "posting and run history, in a gitignored file with no backup. Generate a " +
        "migration with `pnpm db:generate` instead; the startup bootstrap applies it.",
    );
  }

  if (journalText === null) {
    problems.push(
      `${JOURNAL_FILE} is missing or unreadable. It is the whole migration ` +
        "mechanism: drizzle-orm throws `Can't find meta/_journal.json file` " +
        "without it, so the app would not start.",
    );
    return problems;
  }

  let journal;
  try {
    journal = JSON.parse(journalText);
  } catch (error) {
    problems.push(`${JOURNAL_FILE} is not valid JSON (${error.message}).`);
    return problems;
  }

  for (const problem of journalProblems(journal)) {
    problems.push(
      `${JOURNAL_FILE} ${problem}. drizzle-orm reads this file at every server ` +
        "start and drizzle-kit rewrites it on every `pnpm db:generate`; a journal " +
        "that disagrees with either is a journal from some other project.",
    );
  }

  for (const path of missingMigrationFiles(journal, exists)) {
    problems.push(
      `${JOURNAL_FILE} lists a migration whose file is missing: ${path}. ` +
        "Commit the generated `.sql` alongside the journal, or drop the entry.",
    );
  }

  for (const path of orphanMigrationFiles(journal, listSqlTags)) {
    problems.push(
      `${path} is not listed in ${JOURNAL_FILE}. drizzle-orm applies the journal, ` +
        "never the directory, so this migration would never run and nothing " +
        "would say so. Re-run `pnpm db:generate`, or delete the file.",
    );
  }

  return problems;
}
