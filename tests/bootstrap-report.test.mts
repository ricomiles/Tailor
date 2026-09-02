import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTIFACT_OUTCOMES,
  BOOTSTRAP_ARTIFACTS,
  artifactOutcomeSchema,
  bootstrapReportSchema,
} from "../core/bootstrap/bootstrap-report.ts";

/**
 * The report is this story's only proof of idempotence, so the schema that
 * gives it meaning is worth its own assertions: `adapters/db/bootstrap.ts`
 * parses through it before returning, and `instrumentation.ts` iterates the
 * artifact list to print it.
 */

test("the two outcomes parse and nothing else does", () => {
  assert.equal(artifactOutcomeSchema.parse("created"), "created");
  assert.equal(artifactOutcomeSchema.parse("left-untouched"), "left-untouched");
});

test("an outcome outside the set is refused", () => {
  // There is deliberately no `updated` and no `repaired`: the routine has no
  // write path to an existing file, so an outcome naming one would describe
  // behaviour the code is built to make impossible.
  for (const value of ["updated", "repaired", "leftUntouched", "", null, 0]) {
    assert.equal(
      artifactOutcomeSchema.safeParse(value).success,
      false,
      JSON.stringify(value),
    );
  }
});

test("the outcome constant and the schema cannot drift apart", () => {
  for (const outcome of Object.values(ARTIFACT_OUTCOMES)) {
    assert.equal(artifactOutcomeSchema.safeParse(outcome).success, true, outcome);
  }
  assert.equal(Object.isFrozen(ARTIFACT_OUTCOMES), true);
});

test("a report names all three artifacts and refuses one that is short", () => {
  const report = bootstrapReportSchema.parse({
    canon: "created",
    boardsFile: "left-untouched",
    database: "created",
  });
  assert.deepEqual(report, {
    canon: "created",
    boardsFile: "left-untouched",
    database: "created",
  });

  assert.equal(
    bootstrapReportSchema.safeParse({ canon: "created", boardsFile: "created" })
      .success,
    false,
  );
  assert.equal(
    bootstrapReportSchema.safeParse({
      canon: "created",
      boardsFile: "created",
      database: "vanished",
    }).success,
    false,
  );
});

test("the artifact list is derived from the schema, in order, and frozen", () => {
  assert.deepEqual([...BOOTSTRAP_ARTIFACTS], ["canon", "boardsFile", "database"]);
  assert.deepEqual(
    [...BOOTSTRAP_ARTIFACTS].sort(),
    Object.keys(bootstrapReportSchema.shape).sort(),
  );
  assert.equal(Object.isFrozen(BOOTSTRAP_ARTIFACTS), true);
  assert.throws(() => {
    (BOOTSTRAP_ARTIFACTS as unknown as string[]).push("outDirectory");
  });
});
