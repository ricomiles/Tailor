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

// ---------------------------------------------------------------------------
// Exactly one module opens the canonical resume.
// ---------------------------------------------------------------------------

/**
 * The canonical resume's file name, as the scan below recognises it.
 *
 * Spelled here rather than imported from `core/canon/canon-document.ts`,
 * because this module is deliberately dependency-free and pure — that is what
 * lets `tests/project-invariants.test.mts` import a predicate without running
 * a guardrail. The two spellings are pinned to each other in
 * `scripts/verify-boundaries.mjs`, which imports the core constant and fails
 * the build if it stops ending in this name.
 */
export const CANON_FILE_NAME = "resume.canon.json";

/**
 * The trees the single-reader rule covers: every directory holding app source,
 * **plus the repo root**.
 *
 * The root is not optional, and leaving it out is not a theoretical gap:
 * `instrumentation.ts` runs at server start, already imports the bootstrap
 * adapter, and is the likeliest home in the repo for a "load canon once at
 * boot" second reader — and it sits in no subtree. `next.config.ts` and
 * `drizzle.config.ts` are in the same position. The `drizzle-kit push` ban
 * made the mirror-image mistake in the other direction, and
 * `scripts/verify-boundaries.mjs:670-674` records it.
 *
 * `scripts/` and `tests/` are deliberately outside it. The build-chain scripts
 * name the path in order to *watch* it — `run-tests.mjs` fails a suite that
 * touched the real `./data`, `startup-gate.mjs` compares a booted canon
 * against the seed — so banning the spelling there would delete the checks
 * protecting the file. The frozen "declared exactly once" constraint scopes to
 * app source; those script-side spellings are recorded in `deferred-work.md`.
 */
export const CANON_SCAN_DIRS = Object.freeze([
  "adapters",
  "app",
  "components",
  "core",
  "e2e",
  "tools",
]);

/** Every extension a module that could open the file is written in. */
export const CANON_SCANNABLE = /\.(?:m|c)?[jt]sx?$/;

/**
 * `scripts/verify-boundaries.mjs` writes deliberately-violating probes into
 * `core/canon/` and deletes them on exit. Without this, a concurrent
 * `pnpm verify:boundaries` would put another process's probe into this scan,
 * and an unrelated suite's verdict would depend on the timing of one.
 */
export const PROBE_PREFIX = "__boundary-probe.";

const baseName = (relativePath) => String(relativePath).split("/").pop() ?? "";

/**
 * Which files the single-reader scan looks at, given the tree.
 *
 * Pure, with the two directory reads injected, for the reason every predicate
 * in this module is — and for one more. The round-1 failure was never in the
 * predicate: the predicate was correct and nothing ever handed it
 * `instrumentation.ts`. A test can now assert the scan's *scope* by handing
 * this a root file and checking it comes back, which is the half a predicate
 * test cannot see.
 *
 * @param {(dir: string) => string[]} listTree repo-relative paths under `dir`,
 * recursively.
 * @param {() => string[]} listRoot file names sitting directly at the repo root.
 * @returns {string[]} sorted, deduplicated, repo-relative.
 */
export function canonScanPaths(listTree, listRoot) {
  const paths = [];
  for (const dir of CANON_SCAN_DIRS) paths.push(...(listTree(dir) ?? []));
  paths.push(...(listRoot() ?? []));
  return [...new Set(paths)]
    .filter((relativePath) => CANON_SCANNABLE.test(relativePath))
    .filter((relativePath) => !baseName(relativePath).startsWith(PROBE_PREFIX))
    .sort();
}

/**
 * The three files allowed to reach the canon file, because reaching it is
 * their job: the module that declares the path, the one gateway that reads it,
 * and the bootstrap that seeds it onto a clean machine.
 *
 * Exported so a test can assert it stays this short. An exemption list is the
 * obvious place to hide a second reader.
 */
export const CANON_READ_EXEMPT = Object.freeze([
  "adapters/canon/canon-gateway.ts",
  "adapters/db/bootstrap.ts",
  "core/canon/canon-document.ts",
]);

/**
 * A line that is nothing but a comment.
 *
 * Comments have to come out before the patterns below are applied: doc
 * comments in this repo spell paths in backticks, and a scan that read them
 * would report every file that merely *mentions* canon. Whole comment lines
 * are dropped rather than lexing the file, and the direction of the
 * imprecision is deliberate. Dropping only lines that are *entirely* comment
 * can leave a trailing `// data/resume.canon.json` behind and over-report;
 * a lexer that mistook an apostrophe in JSX prose for a string quote could
 * swallow real code and under-report. A false positive costs one reworded
 * line; a false negative is the second reader shipping green, which is
 * exactly how round 1 got here.
 */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

/** The source with its comment-only lines removed. */
export function codeOnly(source) {
  return String(source ?? "")
    .split("\n")
    .filter((line) => !COMMENT_LINE.test(line))
    .join("\n");
}

const CANON_NAME_PATTERN = CANON_FILE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A quoted *path* naming the canon file: a string, template or import
 * specifier whose entire content is a run of non-whitespace ending in the file
 * name.
 *
 * The narrowness is forced by the epic's own copy rule. Every user-facing
 * reference to the resume source must name `resume.canon.json`, so a pattern
 * matching any occurrence would turn the first component obeying that rule
 * into a build failure telling it to call `readCanon()`, with no escape but
 * widening an exemption list the tests pin short. A sentence carries spaces —
 * `"Could not read resume.canon.json"` — and does not match. A path does not —
 * `"data/resume.canon.json"`, `` `${root}/data/resume.canon.json` ``,
 * `import canon from "../../data/resume.canon.json"` — and does.
 */
export const CANON_PATH_LITERAL = new RegExp(
  "(['\"`])[^'\"`\\s]*" + CANON_NAME_PATTERN + "\\1",
);

/**
 * The identifier `CANON_FILE`, in any position.
 *
 * Importing the core constant is the other way to reach the file, and the way
 * a second reader written by someone following this repo's own declare-once
 * rule would be spelled. Comment lines are dropped first, so prose about
 * `CANON_FILE` is not a violation.
 */
export const CANON_FILE_IDENTIFIER = /(?<![\w$])CANON_FILE(?![\w$])/;

/**
 * Every app source reaching the canon file other than the ones allowed to.
 *
 * @param {Iterable<{ name: string, body: string }>} sources
 * @param {Iterable<string>} exempt
 * @returns {string[]} sorted, deduplicated — build output must not depend on
 * the order a directory happened to be read in.
 */
export function findCanonReaders(sources, exempt = CANON_READ_EXEMPT) {
  const allowed = new Set(exempt ?? []);
  const found = [];
  for (const { name, body } of sources ?? []) {
    if (allowed.has(name)) continue;
    const code = codeOnly(body);
    if (CANON_PATH_LITERAL.test(code) || CANON_FILE_IDENTIFIER.test(code)) {
      found.push(name);
    }
  }
  return [...new Set(found)].sort();
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
 *   canonSources?: Iterable<{ name: string, body: string }>,
 *   journalText?: string | null,
 *   exists?: (relativePath: string) => boolean,
 *   listSqlTags?: () => string[],
 * }} inputs
 * @returns {string[]}
 */
export function projectInvariantProblems({
  scripts,
  sources = [],
  canonSources = [],
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

  // Before the journal, deliberately. Every check below this point is skipped
  // when the journal cannot be read, and a canon invariant that stops running
  // whenever an unrelated file breaks is a canon invariant nobody can rely on.
  for (const name of findCanonReaders(canonSources)) {
    problems.push(
      `${name} reaches for ${CANON_FILE_NAME}. Exactly one module opens the ` +
        "canonical resume — `adapters/canon/canon-gateway.ts` — because a second " +
        "reader is a second idea of the shape and a second chance to normalise " +
        "the unfilled-field sentinel differently. Call `readCanon()` instead.",
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
