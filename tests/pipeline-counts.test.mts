import assert from "node:assert/strict";
import test from "node:test";
import {
  PIPELINE_STATES,
  ZERO_PIPELINE_COUNTS,
  pipelineCountsSchema,
} from "../core/pipeline/pipeline-counts.ts";

/**
 * Lives here rather than beside the module: AD-1 forbids every Node built-in
 * under `core/`, and a test needs `node:test`. Core's tests will always sit
 * outside core.
 */

test("the zero value parses and reads zero on every state", () => {
  assert.deepEqual(ZERO_PIPELINE_COUNTS, {
    discovered: 0,
    tailored: 0,
    approved: 0,
    submitted: 0,
  });
});

test("a negative count is rejected, naming the offending field", () => {
  const result = pipelineCountsSchema.safeParse({
    ...ZERO_PIPELINE_COUNTS,
    discovered: -1,
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["discovered"]);
});

test("a fractional count is rejected, naming the offending field", () => {
  const result = pipelineCountsSchema.safeParse({
    ...ZERO_PIPELINE_COUNTS,
    tailored: 1.5,
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["tailored"]);
});

/**
 * Both exports are single shared objects handed to every consumer. Frozen so
 * an in-place edit anywhere cannot corrupt them everywhere — a failure no
 * consumer-side test could localise.
 */

test("the zero value cannot be mutated in place", () => {
  assert.equal(Object.isFrozen(ZERO_PIPELINE_COUNTS), true);
  assert.throws(() => {
    (ZERO_PIPELINE_COUNTS as { discovered: number }).discovered = 9;
  });
  assert.equal(ZERO_PIPELINE_COUNTS.discovered, 0);
});

test("the state list cannot be extended in place", () => {
  assert.equal(Object.isFrozen(PIPELINE_STATES), true);
  assert.throws(() => {
    (PIPELINE_STATES as unknown as string[]).push("skipped");
  });
  assert.equal(PIPELINE_STATES.length, 4);
});
