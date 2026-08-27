/**
 * Runs the unit suite under `node --test`.
 *
 * A wrapper rather than a bare `node --test "tests/*.test.mts"`, for two
 * reasons the shell form cannot cover:
 *
 *  - A glob that matches nothing makes `node --test` exit 0 having run zero
 *    tests. Renaming or moving `tests/` would leave the build permanently
 *    green while verifying nothing, so an empty collection is an error here.
 *  - The shell form was one level deep. This walks the tree, so a test in a
 *    subdirectory runs instead of being silently skipped.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { posix, sep } from "node:path";

const TEST_DIR = "tests";
const SUFFIX = ".test.mts";

const files = readdirSync(TEST_DIR, { recursive: true, withFileTypes: false })
  .map((entry) => String(entry).split(sep).join(posix.sep))
  .filter((relative) => relative.endsWith(SUFFIX))
  .map((relative) => posix.join(TEST_DIR, relative))
  .sort();

if (files.length === 0) {
  console.error(
    `No ${SUFFIX} files under ${TEST_DIR}/. An empty suite is a failure, not a pass.`,
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
