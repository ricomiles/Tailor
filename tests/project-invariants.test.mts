import assert from "node:assert/strict";
import test from "node:test";
import {
  DRIZZLE_PUSH,
  JOURNAL_DIALECT,
  JOURNAL_FILE,
  JOURNAL_VERSION,
  MIGRATIONS_DIR,
  PUSH_SCAN_EXEMPT,
  findPushInvocations,
  findPushScripts,
  journalProblems,
  missingMigrationFiles,
} from "../scripts/project-invariants.mjs";

/**
 * `scripts/verify-boundaries.mjs` is built on the argument that a guardrail
 * nobody exercises stops working silently. Its own newest checks were proven
 * only by hand-run mutation steps recorded in a spec, which is the same thing
 * one level down. These are the inputs those steps used, plus the forms they
 * did not think to try.
 *
 * The predicates live in a module of their own precisely so this file can
 * import them: `verify-boundaries.mjs` runs its whole guardrail on import.
 */

// ---------------------------------------------------------------------------
// The push ban.
// ---------------------------------------------------------------------------

const PUSH_INVOCATIONS = [
  "drizzle-kit push",
  "drizzle-kit push --force",
  "dotenv -- drizzle-kit push",
  "drizzle-kit@latest push",
  "drizzle-kit --config=x push",
  "pnpm exec drizzle-kit --config=drizzle.config.ts push",
  "node_modules/.bin/drizzle-kit push",
  "pnpm db:generate && drizzle-kit push",
];

test("every way of writing a push invocation is caught", () => {
  for (const body of PUSH_INVOCATIONS) {
    assert.equal(DRIZZLE_PUSH.test(body), true, body);
  }
});

test("a push invocation in any script is reported by name", () => {
  assert.deepEqual(
    findPushScripts({
      "db:generate": "drizzle-kit generate",
      "db:push": "drizzle-kit push",
      build: "next build",
      sync: "drizzle-kit@latest push --force",
    }),
    ["db:push", "sync"],
  );
});

test("the legal commands are not mistaken for push", () => {
  // `git push` is the one that matters: a repo that could not run it would
  // have the guardrail switched off within a day.
  for (const body of [
    "drizzle-kit generate",
    "drizzle-kit generate && git push",
    "pnpm build && git push origin main",
    "next build",
    "pushd . && pnpm test",
    "drizzle-kit pushup",
  ]) {
    assert.equal(DRIZZLE_PUSH.test(body), false, body);
  }
});

test("no scripts, or scripts with no push, report nothing", () => {
  assert.deepEqual(findPushScripts(undefined), []);
  assert.deepEqual(findPushScripts({}), []);
  assert.deepEqual(findPushScripts({ build: "next build" }), []);
});

test("a config file body is scanned the same way a script body is", () => {
  assert.deepEqual(
    findPushInvocations([
      { name: "drizzle.config.ts", body: "export default { out: './x' }" },
      { name: "scripts/sync.mjs", body: "spawnSync('drizzle-kit push')" },
    ]),
    ["scripts/sync.mjs"],
  );
});

test("the scan exemption stays short enough to read", () => {
  // An exemption list is the obvious place to hide a real invocation. These two
  // are exempt because naming the forbidden sequence is their job; anything
  // else appearing here should be argued for in review, not merged quietly.
  assert.deepEqual(
    [...PUSH_SCAN_EXEMPT],
    ["scripts/project-invariants.mjs", "scripts/verify-boundaries.mjs"],
  );
});

// ---------------------------------------------------------------------------
// The journal.
// ---------------------------------------------------------------------------

const VALID_JOURNAL = {
  version: JOURNAL_VERSION,
  dialect: JOURNAL_DIALECT,
  entries: [],
};

test("the journal this repo ships has no problems", () => {
  assert.deepEqual(journalProblems(VALID_JOURNAL), []);
});

test("a journal with no entries array is reported — it stops every server start", () => {
  assert.deepEqual(journalProblems({ ...VALID_JOURNAL, entries: undefined }), [
    "has no `entries` array",
  ]);
  // An object is not an array, and `for (const x of {})` throws.
  assert.deepEqual(journalProblems({ ...VALID_JOURNAL, entries: {} }), [
    "has no `entries` array",
  ]);
});

test("a journal from another dialect or another drizzle-kit is reported", () => {
  assert.deepEqual(journalProblems({ ...VALID_JOURNAL, dialect: "postgresql" }), [
    `declares dialect "postgresql", not "${JOURNAL_DIALECT}"`,
  ]);
  assert.deepEqual(journalProblems({ ...VALID_JOURNAL, version: "6" }), [
    `declares version "6", not "${JOURNAL_VERSION}"`,
  ]);
});

test("every problem is reported, not just the first", () => {
  assert.equal(journalProblems({ version: 7, dialect: "mysql" }).length, 3);
});

test("a journal that is not an object at all is reported rather than crashing", () => {
  for (const value of [null, undefined, [], "{}", 7]) {
    assert.deepEqual(journalProblems(value), ["is not a JSON object"]);
  }
});

test("an entry whose .sql file is missing is named", () => {
  const journal = {
    ...VALID_JOURNAL,
    entries: [{ tag: "0000_first" }, { tag: "0001_second" }],
  };
  const onDisk = new Set([`${MIGRATIONS_DIR}/0000_first.sql`]);

  assert.deepEqual(
    missingMigrationFiles(journal, (path) => onDisk.has(path)),
    [`${MIGRATIONS_DIR}/0001_second.sql`],
  );
});

test("an entry with no tag is reported rather than silently skipped", () => {
  assert.deepEqual(
    missingMigrationFiles({ ...VALID_JOURNAL, entries: [{}] }, () => true),
    [`${MIGRATIONS_DIR}/<entry with no tag>.sql`],
  );
});

test("an empty journal asks the filesystem nothing", () => {
  let asked = 0;
  assert.deepEqual(
    missingMigrationFiles(VALID_JOURNAL, () => {
      asked += 1;
      return true;
    }),
    [],
  );
  assert.equal(asked, 0);
});

test("the journal path is inside the one declared migrations directory", () => {
  assert.equal(JOURNAL_FILE.startsWith(`${MIGRATIONS_DIR}/`), true);
});
