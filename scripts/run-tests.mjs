/**
 * Runs the unit suite under `node --test`.
 *
 * A wrapper rather than a bare `node --test "tests/*.test.mts"`, for three
 * reasons the shell form cannot cover:
 *
 *  - A glob that matches nothing makes `node --test` exit 0 having run zero
 *    tests. Renaming or moving `tests/` would leave the build permanently
 *    green while verifying nothing, so an empty collection is an error here.
 *  - The shell form was one level deep. This walks the tree, so a test in a
 *    subdirectory runs instead of being silently skipped.
 *  - A file named `foo.test.ts`, or a test written outside `tests/`, matched no
 *    glob and was never run — while typechecking and linting cleanly, so
 *    nothing else in the repo gave a signal. Those are now a hard failure
 *    rather than a silent omission, which is the same argument as the empty
 *    collection one level down.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { posix, sep } from "node:path";

const TEST_DIR = "tests";
const SUFFIX = ".test.mts";

// `.mts` is not decoration: the suite is loaded by Node's type stripper, which
// needs the module-flavoured extension. Anything else here is a test that will
// never run.
const ANY_TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

// Walked for stray tests. `e2e/` is excluded because Playwright owns it and
// runs `.spec.ts`; the rest is everything a test could plausibly be written in.
//
// `adapters` was missing while that tree held only `.gitkeep` files. It holds
// real source now — the bootstrap routine, the schema module — so a test
// written beside it would neither run nor be reported, which is the precise
// silent omission this guard exists to prevent.
const SEARCH_DIRS = [
  "adapters",
  "app",
  "components",
  "core",
  "scripts",
  "tests",
  "tools",
];

// Repo-root modules are outside every one of those directories:
// `instrumentation.ts` and `drizzle.config.ts` live there, so a
// `instrumentation.test.mts` beside them would have been invisible too. Read
// non-recursively — the recursive walks above already cover the subtrees, and
// descending from the root would drag in `node_modules` and `.next`.
const ROOT_DIR = ".";

const toPosix = (value) => String(value).split(sep).join(posix.sep);

function walk(dir) {
  try {
    return readdirSync(dir, { recursive: true, withFileTypes: false }).map(
      (entry) => posix.join(dir, toPosix(entry)),
    );
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

const collected = walk(TEST_DIR);

if (collected === null) {
  // The scenario this wrapper's empty-collection guard exists for. Reading it
  // off an unguarded readdirSync produced a raw stack trace instead.
  console.error(
    `No ${TEST_DIR}/ directory. An empty suite is a failure, not a pass.`,
  );
  process.exit(1);
}

const files = collected.filter((relative) => relative.endsWith(SUFFIX)).sort();

if (files.length === 0) {
  console.error(
    `No ${SUFFIX} files under ${TEST_DIR}/. An empty suite is a failure, not a pass.`,
  );
  process.exit(1);
}

function rootEntries() {
  try {
    return readdirSync(ROOT_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

const stray = [...SEARCH_DIRS.flatMap((dir) => walk(dir) ?? []), ...rootEntries()]
  .filter((relative) => ANY_TEST_FILE.test(relative))
  .filter((relative) => !files.includes(relative))
  .sort();

if (stray.length > 0) {
  console.error(
    `Test files that this runner would never execute:\n` +
      stray.map((relative) => `  - ${relative}`).join("\n") +
      `\n\nEvery unit test must live under ${TEST_DIR}/ and end in ${SUFFIX}. ` +
      `A test outside that set typechecks and lints cleanly, so nothing else ` +
      `in the repo would tell you it is not running.`,
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});

// Distinguished so a failed spawn or a killed run does not read as a test
// failure. `result.status` is null in both cases, which the old `?? 1` reported
// identically to a genuine assertion failure.
if (result.error) {
  console.error(`Could not run the test suite: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`The test suite was terminated by ${result.signal}.`);
  process.exit(1);
}
process.exit(result.status ?? 1);
