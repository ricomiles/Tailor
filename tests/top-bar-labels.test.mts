import assert from "node:assert/strict";
import test from "node:test";
import { boardsLabel, countLabels } from "../components/top-bar/labels.ts";
import {
  PIPELINE_STATES,
  ZERO_PIPELINE_COUNTS,
  type PipelineCounts,
} from "../core/pipeline/pipeline-counts.ts";

test("the zero state reads zero on each of the four states, in order", () => {
  assert.deepEqual(countLabels(ZERO_PIPELINE_COUNTS), [
    "0 discovered",
    "0 tailored",
    "0 approved",
    "0 submitted",
  ]);
});

test("populated counts read their own numbers", () => {
  assert.deepEqual(
    countLabels({ discovered: 3, tailored: 1, approved: 0, submitted: 0 }),
    ["3 discovered", "1 tailored", "0 approved", "0 submitted"],
  );
});

test("no boards watched reads the design's zero-state copy", () => {
  assert.equal(boardsLabel(0), "no boards yet");
});

test("one board is singular", () => {
  assert.equal(boardsLabel(1), "watching 1 board");
});

test("many boards are plural", () => {
  assert.equal(boardsLabel(14), "watching 14 boards");
});

test("every state the schema declares gets a label, and none other", () => {
  assert.equal(countLabels(ZERO_PIPELINE_COUNTS).length, PIPELINE_STATES.length);
  assert.deepEqual(
    countLabels(ZERO_PIPELINE_COUNTS).map((label) => label.split(" ")[1]),
    [...PIPELINE_STATES],
  );
});

/**
 * The spec's I/O matrix requires the throw at the boundary rather than a
 * rendered coerced value, and these labels are that boundary. The casts stand
 * in for the untyped shapes Epic 2 will hand the bar — a DB row or parsed
 * JSON, where the type checker offers no protection at all.
 */

test("a negative count is refused rather than rendered", () => {
  assert.throws(() =>
    countLabels({ ...ZERO_PIPELINE_COUNTS, discovered: -1 }),
  );
});

test("a fractional count is refused rather than rendered", () => {
  assert.throws(() => countLabels({ ...ZERO_PIPELINE_COUNTS, tailored: 1.5 }));
});

test("a count object missing a state is refused, not read as undefined", () => {
  const missing: Record<string, number> = { ...ZERO_PIPELINE_COUNTS };
  delete missing.submitted;
  assert.throws(() => countLabels(missing as unknown as PipelineCounts));
});

test("a non-numeric count is refused, not interpolated", () => {
  assert.throws(() =>
    countLabels({
      ...ZERO_PIPELINE_COUNTS,
      approved: "many",
    } as unknown as PipelineCounts),
  );
});

test("a negative board count is refused rather than rendered", () => {
  assert.throws(() => boardsLabel(-3));
});

test("a fractional board count is refused rather than rendered", () => {
  assert.throws(() => boardsLabel(2.5));
});

test("NaN and Infinity board counts are refused rather than rendered", () => {
  assert.throws(() => boardsLabel(Number.NaN));
  assert.throws(() => boardsLabel(Number.POSITIVE_INFINITY));
});
