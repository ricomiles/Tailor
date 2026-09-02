import assert from "node:assert/strict";
import test from "node:test";
import { STARTUP_ARTIFACTS, artifactProblems } from "../scripts/startup-gate.mjs";

/**
 * The booting half of `scripts/startup-gate.mjs` cannot run here: it needs a
 * production build, and `pnpm test` runs *inside* `pnpm build`. That left the
 * gate's judgement — the part that decides whether what a boot left behind is
 * acceptable — as the one guardrail in the repo proven by nothing, in a file
 * whose whole argument is that such a guardrail stops working silently.
 *
 * So the judgement is a pure function and this fires violating inputs at it.
 * The cases are the ones that used to pass: a gate asking only `existsSync`
 * accepted every one of them.
 */

const SEED = Buffer.from('{"basics":{"name":"Real Person"}}');
const LEDGER = Buffer.from("SQLite format 3\0...__drizzle_migrations...");

const HEALTHY = {
  status: 200,
  canon: SEED,
  seed: SEED,
  boards: '{\n  "boards": []\n}\n',
  database: LEDGER,
};

test("a real boot reports nothing", () => {
  assert.deepEqual(artifactProblems(HEALTHY), []);
});

test("three empty files do not pass for a bootstrap", () => {
  // The mutation the gate exists to catch, reduced to its cheapest form:
  // `writeFileSync(path, "")` three times. Every path exists, so the previous
  // existence-only check reported the wiring intact.
  const problems = artifactProblems({
    status: 200,
    canon: Buffer.alloc(0),
    seed: SEED,
    boards: "",
    database: Buffer.alloc(0),
  });
  assert.equal(problems.length, 3);
});

test("a canon that is not the seed is reported even though the path exists", () => {
  const problems = artifactProblems({ ...HEALTHY, canon: Buffer.from("something else") });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes("byte-for-byte"));
});

test("a 500 is reported even when every artifact is present", () => {
  // Reachable, and the reason this check is not `if (missing) …`: bootstrap
  // places canon and boards.json before it opens the database, so a throw
  // inside `migrate()` leaves all three paths on disk. `drizzle()` creates
  // `tailor.db` merely by opening it. The old gate passed that state — a server
  // that answers 500 to every request for the life of the process.
  const problems = artifactProblems({ ...HEALTHY, status: 500 });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes("500"));
});

test("a database with no ledger is reported — an empty file is not a migrated one", () => {
  const problems = artifactProblems({ ...HEALTHY, database: Buffer.from("SQLite format 3\0") });
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes("__drizzle_migrations"));
});

test("a boards.json that is not JSON, and one with no boards array, are both reported", () => {
  assert.equal(artifactProblems({ ...HEALTHY, boards: "{ nope" }).length, 1);
  assert.equal(artifactProblems({ ...HEALTHY, boards: '{"watching":[]}' }).length, 1);
});

test("an absent artifact is named rather than crashing the check", () => {
  const problems = artifactProblems({
    status: 200,
    canon: null,
    seed: SEED,
    boards: null,
    database: null,
  });
  assert.equal(problems.length, 3);
  for (const relative of STARTUP_ARTIFACTS) {
    assert.ok(problems.some((problem: string) => problem.includes(relative)), relative);
  }
});

test("every problem is reported at once, not just the first", () => {
  const problems = artifactProblems({
    status: 503,
    canon: null,
    seed: SEED,
    boards: null,
    database: null,
  });
  assert.equal(problems.length, 4);
});

test("the artifact list is the on-disk layout the architecture documents", () => {
  assert.deepEqual(
    [...STARTUP_ARTIFACTS],
    ["data/resume.canon.json", "data/tailor.db", "boards.json"],
  );
});
