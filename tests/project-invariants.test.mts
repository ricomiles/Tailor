import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  CANON_FILE_NAME,
  CANON_READ_EXEMPT,
  CANON_SCAN_DIRS,
  PROBE_PREFIX,
  canonScanPaths,
  codeOnly,
  unscannedSourceTrees,
  findCanonReaders,
  missingMigrationFiles,
  orphanMigrationFiles,
  projectInvariantProblems,
  strayTestFiles,
} from "../scripts/project-invariants.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

// ---------------------------------------------------------------------------
// The forms that walked through the ban.
// ---------------------------------------------------------------------------

test("a flag separated from its value by a space does not hide push", () => {
  // The regression this file exists for. The first version matched a run of
  // flags as `(?:\s+-{1,2}\S+)*`, which consumed `--config` but not
  // `drizzle.config.ts`, so `push` no longer immediately followed and the most
  // ordinary spelling of the command in existence was not a match. Every entry
  // here is a working invocation.
  for (const body of [
    "drizzle-kit --config drizzle.config.ts push",
    "drizzle-kit -c drizzle.config.ts push",
    "drizzle-kit --config ./d.ts push --force",
    "cross-env NODE_ENV=test drizzle-kit --config ./d.ts push",
    "pnpm dlx drizzle-kit@0.31.10 --verbose --config d.ts push",
    "drizzle-kit --config d.ts --verbose push",
  ]) {
    assert.equal(DRIZZLE_PUSH.test(body), true, body);
  }
});

test("a separated flag value does not turn git push into a match either", () => {
  // The other half of the same widening: the pair group may swallow one token
  // after a flag, so it must not swallow an arbitrary word standing alone.
  for (const body of [
    "drizzle-kit --config d.ts generate && git push",
    "drizzle-kit --config d.ts generate; git push origin main",
    "eslint --config eslint.config.mjs . && git push",
  ]) {
    assert.equal(DRIZZLE_PUSH.test(body), false, body);
  }
});

// ---------------------------------------------------------------------------
// Journal entry shape, and the half-commit seen from both sides.
// ---------------------------------------------------------------------------

test("an entry with no numeric idx or when is reported", () => {
  const problems = journalProblems({ ...VALID_JOURNAL, entries: [{ tag: "0000_a" }] });
  assert.equal(problems.length, 2);
  assert.ok(problems.some((problem: string) => problem.includes("`idx`")));
  assert.ok(problems.some((problem: string) => problem.includes("`when`")));
});

test("a duplicated tag is reported — the second migration would never apply", () => {
  const entry = { tag: "0000_a", idx: 0, when: 1 };
  assert.deepEqual(
    journalProblems({ ...VALID_JOURNAL, entries: [entry, { ...entry, idx: 1 }] }),
    ["lists the tag `0000_a` more than once"],
  );
});

test("an entry that is not an object is reported rather than read as undefined", () => {
  assert.deepEqual(journalProblems({ ...VALID_JOURNAL, entries: [null] }), [
    "has an entry at index 0 that is not an object",
  ]);
});

test("a .sql file no entry lists is reported — drizzle applies the journal, not the directory", () => {
  assert.deepEqual(
    orphanMigrationFiles({ ...VALID_JOURNAL, entries: [{ tag: "0000_a", idx: 0, when: 1 }] }, () => [
      "0000_a",
      "0001_forgotten",
    ]),
    [`${MIGRATIONS_DIR}/0001_forgotten.sql`],
  );
});

test("a directory whose every file is listed reports nothing", () => {
  assert.deepEqual(
    orphanMigrationFiles({ ...VALID_JOURNAL, entries: [{ tag: "0000_a", idx: 0, when: 1 }] }, () => ["0000_a"]),
    [],
  );
});

// ---------------------------------------------------------------------------
// The journal this repo actually ships — read from disk, not rebuilt.
// ---------------------------------------------------------------------------

test("the shipped journal parses and satisfies the checks", () => {
  // Deliberately reads the file. Building the expected journal out of
  // `JOURNAL_VERSION` and `JOURNAL_DIALECT` — the same constants the predicate
  // compares against — asserts nothing about what is committed: the test would
  // hold for any pair of values, including a pair that no longer matched the
  // journal on disk.
  const journal = JSON.parse(readFileSync(join(REPO_ROOT, JOURNAL_FILE), "utf8"));
  assert.deepEqual(journalProblems(journal), []);
  assert.deepEqual(journal.entries, [], "this epic ships the mechanism, not the tables");
});

// ---------------------------------------------------------------------------
// The composition, not just the predicates.
// ---------------------------------------------------------------------------

const CLEAN_INPUTS = {
  scripts: { build: "next build", "db:generate": "drizzle-kit generate" },
  sources: [{ name: "drizzle.config.ts", body: "export default {}" }],
  journalText: JSON.stringify(VALID_JOURNAL),
  exists: () => true,
  listSqlTags: () => [],
};

test("a clean project reports nothing at all", () => {
  assert.deepEqual(projectInvariantProblems(CLEAN_INPUTS), []);
});

test("a push script reaches the composed check and is named", () => {
  const problems = projectInvariantProblems({
    ...CLEAN_INPUTS,
    scripts: { ...CLEAN_INPUTS.scripts, "db:push": "drizzle-kit --config d.ts push" },
  });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('package.json\'s "db:push" script'));
});

test("a push invocation in a config reaches the composed check", () => {
  const problems = projectInvariantProblems({
    ...CLEAN_INPUTS,
    sources: [{ name: "next.config.ts", body: "// drizzle-kit --config d.ts push" }],
  });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes("next.config.ts"));
});

test("an unreadable journal is one legible sentence, not a stack", () => {
  const problems = projectInvariantProblems({ ...CLEAN_INPUTS, journalText: null });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes(JOURNAL_FILE));
});

test("an unparseable journal stops before the entry checks run on garbage", () => {
  const problems = projectInvariantProblems({ ...CLEAN_INPUTS, journalText: "{ nope" });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes("not valid JSON"));
});

test("every violation is reported at once, not just the first", () => {
  const problems = projectInvariantProblems({
    ...CLEAN_INPUTS,
    scripts: { "db:push": "drizzle-kit push" },
    journalText: JSON.stringify({ ...VALID_JOURNAL, entries: [{ tag: "0000_a", idx: 0, when: 1 }] }),
    exists: () => false,
    listSqlTags: () => ["0001_orphan"],
  });
  assert.equal(problems.length, 3, problems.join("\n"));
});

test("the verifier still hands the composed check the real inputs", () => {
  // A tripwire, and named as one. The composition above is covered by firing
  // violating inputs at it; what no unit test can see is whether
  // `verify-boundaries.mjs` passes the real `package.json` and the real scanned
  // sources in — swapping either for an empty value would leave every assertion
  // in this file passing while the build checked nothing.
  const source = readFileSync(join(REPO_ROOT, "scripts/verify-boundaries.mjs"), "utf8");
  assert.ok(source.includes("projectInvariantProblems({"));
  assert.ok(source.includes("scripts: pkg.scripts"));
  assert.ok(source.includes("sources: pushSources"));
  assert.ok(source.includes("canonSources,"));
  assert.ok(source.includes("journalText,"));
});

// ---------------------------------------------------------------------------
// The stray-test scan.
// ---------------------------------------------------------------------------

const ANY_TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

test("a test beside the source it covers is reported, not silently skipped", () => {
  // `adapters/` was outside the scan for as long as it held only `.gitkeep`
  // files. It holds the bootstrap routine now, so this is the natural place for
  // someone to put a test — and the one place it would never have run.
  assert.deepEqual(
    strayTestFiles(
      ["adapters/db/bootstrap.ts", "adapters/db/bootstrap.test.mts", "tests/bootstrap.test.mts"],
      ["tests/bootstrap.test.mts"],
      ANY_TEST_FILE,
    ),
    ["adapters/db/bootstrap.test.mts"],
  );
});

test("a test at the repo root is reported", () => {
  assert.deepEqual(
    strayTestFiles(["instrumentation.ts", "instrumentation.test.mts"], [], ANY_TEST_FILE),
    ["instrumentation.test.mts"],
  );
});

test("every spelling a test could be written in is caught", () => {
  assert.deepEqual(
    strayTestFiles(
      ["core/a.test.ts", "core/b.test.js", "core/c.test.cjs", "core/d.test.tsx", "core/e.ts"],
      [],
      ANY_TEST_FILE,
    ),
    ["core/a.test.ts", "core/b.test.js", "core/c.test.cjs", "core/d.test.tsx"],
  );
});

test("the files the runner will run are not reported against it", () => {
  assert.deepEqual(
    strayTestFiles(["tests/a.test.mts", "tests/b.test.mts"], ["tests/a.test.mts", "tests/b.test.mts"], ANY_TEST_FILE),
    [],
  );
});

// ---------------------------------------------------------------------------
// Exactly one module opens the canonical resume.
// ---------------------------------------------------------------------------

const READER = `readFileSync(join(root, "data/${CANON_FILE_NAME}"), "utf8")`;

test("a module reaching for the canon path is reported", () => {
  assert.deepEqual(
    findCanonReaders([
      { name: "app/page.tsx", body: READER },
      { name: "core/pipeline/pipeline-counts.ts", body: "export const x = 1;" },
    ]),
    ["app/page.tsx"],
  );
});

test("a module importing the core constant is reported too", () => {
  // The other way to reach the file, and the way someone following this repo's
  // own declare-once rule would spell a second reader.
  assert.deepEqual(
    findCanonReaders([
      { name: "app/api/canon/route.ts", body: 'import { CANON_FILE } from "@/core/canon/canon-document";' },
    ]),
    ["app/api/canon/route.ts"],
  );
});

test("the three exempt files are not reported against themselves", () => {
  assert.deepEqual(
    findCanonReaders(CANON_READ_EXEMPT.map((name) => ({ name, body: READER }))),
    [],
  );
});

test("the exemption list stays short enough to read", () => {
  // An exemption list is the obvious place to hide a second reader. These three
  // are the gateway, the module that creates the file without parsing it, and
  // the module that declares the path.
  assert.deepEqual(
    [...CANON_READ_EXEMPT],
    ["adapters/canon/canon-gateway.ts", "adapters/db/bootstrap.ts", "core/canon/canon-document.ts"],
  );
});

test("offenders come back sorted, so build output does not depend on directory order", () => {
  assert.deepEqual(
    findCanonReaders([
      { name: "components/z.tsx", body: READER },
      { name: "app/a.ts", body: READER },
    ]),
    ["app/a.ts", "components/z.tsx"],
  );
});

test("user-facing copy naming the file is not a violation — the epic's copy rule requires it", () => {
  // `epic-1-context.md` fixes that every user-facing reference to the resume
  // source names `resume.canon.json`. The minimal form of obeying that is the
  // bare name in quotes — a label, a `title`, an item in a list — and an
  // earlier pattern matched all three, so the first component following the
  // copy rule would have failed the build telling it to call `readCanon()`,
  // with no escape but widening an exemption list two tests pin to three.
  assert.deepEqual(
    findCanonReaders([
      { name: "components/badge.tsx", body: `export const SOURCE_LABEL = "${CANON_FILE_NAME}";` },
      { name: "components/empty.tsx", body: `export const E = () => <p title="${CANON_FILE_NAME}">source</p>;` },
      { name: "app/blocked/page.tsx", body: `const files = ["${CANON_FILE_NAME}"];` },
    ]),
    [],
  );
});

test("a bare name beside a reaching call is a reader, not a label", () => {
  // `join(root, "data", "resume.canon.json")` carries no separator of its own,
  // and is the spelling a second reader following this repo's conventions
  // would actually use.
  assert.deepEqual(
    findCanonReaders([
      { name: "app/a.ts", body: `readFileSync(join(root, "data", "${CANON_FILE_NAME}"))` },
    ]),
    ["app/a.ts"],
  );
});

test("a template literal and an import specifier are both reported", () => {
  // Both forms the pattern's doc advertises, neither of which had a test.
  assert.deepEqual(
    findCanonReaders([
      { name: "app/t.ts", body: "const p = `${root}/data/" + CANON_FILE_NAME + "`;" },
      { name: "app/i.ts", body: `import canon from "../../data/${CANON_FILE_NAME}";` },
    ]),
    ["app/i.ts", "app/t.ts"],
  );
});

test("a line that opens with a block comment still has its code scanned", () => {
  // The under-reporting hole: stripping whole comment *lines* dropped the real
  // code that followed one, so a second reader spelled this way shipped green.
  // The module's own doc had claimed the imprecision could only over-report.
  assert.deepEqual(
    findCanonReaders([
      { name: "app/legacy.ts", body: `/* legacy */ const p = "data/${CANON_FILE_NAME}";` },
    ]),
    ["app/legacy.ts"],
  );
});

test("the body of a block comment is not code", () => {
  assert.deepEqual(
    findCanonReaders([
      { name: "core/notes.ts", body: `/*\n  see "data/${CANON_FILE_NAME}"\n*/\nexport const x = 1;` },
    ]),
    [],
  );
});

test("prose naming the file is not a violation — the epic's copy rule requires it", () => {
  // `epic-1-context.md` fixes that every user-facing reference to the resume
  // source names `resume.canon.json`. A scan matching any occurrence would turn
  // the first component obeying that rule into a build failure telling it to
  // call `readCanon()`, with no escape but widening the exemption list above.
  assert.deepEqual(
    findCanonReaders([
      { name: "components/empty-state.tsx", body: `export const copy = "No resume yet. Add ${CANON_FILE_NAME} and restart.";` },
      { name: "core/canon/notes.ts", body: `// the gateway opens data/${CANON_FILE_NAME}` },
    ]),
    [],
  );
});

test("comment-only lines are stripped before the scan looks at the source", () => {
  assert.equal(codeOnly(`// data/${CANON_FILE_NAME}\nconst x = 1;`).includes(CANON_FILE_NAME), false);
  assert.equal(codeOnly("const x = 1;"), "const x = 1;");
});

test("the canon check runs even when the journal cannot be read", () => {
  // Placement, asserted rather than assumed. Every check below the journal's
  // early return is skipped when it is unreadable; a canon invariant that
  // stopped running whenever an unrelated file broke would be one nobody could
  // rely on. Two problems here means both fired.
  const problems = projectInvariantProblems({
    ...CLEAN_INPUTS,
    journalText: null,
    canonSources: [{ name: "app/page.tsx", body: READER }],
  });
  assert.equal(problems.length, 2, problems.join("\n"));
  assert.ok(problems.some((problem: string) => problem.includes("app/page.tsx")));
});

test("a clean project with app sources still reports nothing", () => {
  assert.deepEqual(
    projectInvariantProblems({
      ...CLEAN_INPUTS,
      canonSources: [{ name: "app/page.tsx", body: "export default function Page() { return null; }" }],
    }),
    [],
  );
});

// ---------------------------------------------------------------------------
// The scan's scope, not just its predicate.
// ---------------------------------------------------------------------------

test("the scan collects the repo root, not only the app subtrees", () => {
  // Round 1 shipped a scan covering `core/`, `adapters/`, `app/` and
  // `components/` only. The predicate was correct the whole time; nothing ever
  // handed it `instrumentation.ts` — the server-start hook that already imports
  // the bootstrap adapter and is the likeliest home in the repo for a "load
  // canon once at boot" second reader. A read added there passed lint, this
  // suite, and the whole build.
  //
  // This drives the collection itself rather than reading the verifier's source
  // for a phrase, because the scope is the half a predicate test cannot see.
  const collected = canonScanPaths(
    (dir) => (dir === "components" ? ["components/resume-document/view.tsx"] : []),
    () => ["instrumentation.ts", "next.config.ts", "README.md"],
  );

  assert.deepEqual(collected, [
    "components/resume-document/view.tsx",
    "instrumentation.ts",
    "next.config.ts",
  ]);
});

test("every app tree is walked, and each contributes to the scan", () => {
  const collected = canonScanPaths((dir) => [`${dir}/probe.ts`], () => []);
  assert.deepEqual(collected, [...CANON_SCAN_DIRS].map((dir) => `${dir}/probe.ts`).sort());
  assert.ok(CANON_SCAN_DIRS.includes("components"), "half of components/ is .tsx");
  assert.ok(CANON_SCAN_DIRS.includes("e2e") && CANON_SCAN_DIRS.includes("tools"));
});

test("a .tsx file is in scope — dropping the x would hide a component reader", () => {
  assert.deepEqual(
    canonScanPaths(() => ["components/a.tsx", "components/b.mts", "components/c.css"], () => []),
    ["components/a.tsx", "components/b.mts"],
  );
});

test("a boundary probe is skipped, so a concurrent guardrail run cannot change the verdict", () => {
  assert.deepEqual(
    canonScanPaths(() => [`core/canon/${PROBE_PREFIX}123.0.ts`, "core/canon/real.ts"], () => []),
    ["core/canon/real.ts"],
  );
});

test("a missing tree contributes nothing rather than throwing", () => {
  assert.deepEqual(canonScanPaths(() => [], () => []), []);
});

test("a top-level source tree outside the scan is reported", () => {
  // The round-1 failure was a source tree the scan never reached. The guard
  // written against it lived imperatively in the verifier, where deleting it
  // failed nothing — the same shape one level up. This drives the predicate.
  assert.deepEqual(
    unscannedSourceTrees(() => [...CANON_SCAN_DIRS, "lib", "server"], ["scripts", "tests"]),
    ["lib", "server"],
  );
});

test("the scanned trees and the excused ones are both accounted for", () => {
  assert.deepEqual(
    unscannedSourceTrees(() => [...CANON_SCAN_DIRS, "scripts", "tests", "node_modules"], [
      "scripts",
      "tests",
      "node_modules",
    ]),
    [],
  );
});

test("dot- and underscore-prefixed directories are not source trees", () => {
  assert.deepEqual(
    unscannedSourceTrees(() => [".next", ".git", "_bmad", "_bmad-output"], []),
    [],
  );
});

test("the verifier's own root listing is fully accounted for today", () => {
  // The real repo, not a fixture: if someone adds a top-level directory and
  // neither scans nor excuses it, this fails here as well as in the build.
  const ignored = readFileSync(join(REPO_ROOT, "scripts/verify-boundaries.mjs"), "utf8")
    .split("const IGNORED_TREES = new Set([")[1]
    .split("]);")[0]
    .match(/"([^"]+)"/g)!
    .map((quoted) => quoted.slice(1, -1));
  const dirs = readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  assert.deepEqual(unscannedSourceTrees(() => dirs, ignored), []);
});
