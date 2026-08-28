import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

/**
 * Read against the design source rather than against `PIPELINE_STATES`.
 *
 * The previous form of this test asserted that
 * `countLabels(...).map((l) => l.split(" ")[1])` equalled `PIPELINE_STATES` —
 * but `countLabels` is implemented as `PIPELINE_STATES.map(...)`, so both sides
 * were the same list and the test could not fail. What it was reaching for is
 * the thing that can actually drift: the copy and order the design prints.
 */
const DESIGN_SOURCE =
  "_bmad-output/inputs/design_handoff_resume_tailoring/Tailor.dc.html";

test("the labels read as the design source prints them, in its order", () => {
  const markup = readFileSync(DESIGN_SOURCE, "utf8");
  const printed = [...markup.matchAll(/\{\{\s*counts\.(\w+)\s*\}\}\s+(\w+)/g)].map(
    (match) => ({ field: match[1], word: match[2] }),
  );

  // The source is the authority on copy; if it stops being readable in this
  // shape, that is a failure to investigate, not a test to skip.
  assert.equal(
    printed.length,
    4,
    `expected four count labels in ${DESIGN_SOURCE}, found ${printed.length}`,
  );

  assert.deepEqual(
    printed.map((label) => label.field),
    [...PIPELINE_STATES],
    "the schema's field order no longer matches the order the design prints",
  );
  assert.deepEqual(
    countLabels(ZERO_PIPELINE_COUNTS),
    printed.map((label) => `0 ${label.word}`),
    "the rendered copy no longer matches the design source",
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
