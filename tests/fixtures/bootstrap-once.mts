/**
 * One `bootstrap()` in a process of its own, printing its report as JSON.
 *
 * The concurrent-start row of the I/O matrix is about two *servers*, and two
 * calls inside one process cannot race: they share a thread and would run one
 * after the other no matter how they were written. `tests/bootstrap.test.mts`
 * spawns two of these at the same root and asserts exactly one of them reports
 * `created` for each artifact.
 *
 * Under `tests/fixtures/` rather than `tests/`: the runner collects
 * `*.test.mts`, so this is not picked up as a suite, and the stray scan only
 * reports files that look like tests.
 */
import { bootstrap } from "../../adapters/db/bootstrap.ts";

const root = process.argv[2];
if (root === undefined) {
  console.error("usage: bootstrap-once.mts <root>");
  process.exit(2);
}

process.stdout.write(`${JSON.stringify(bootstrap(root))}\n`);
