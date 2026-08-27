import assert from "node:assert/strict";
import test from "node:test";
import { boardCountSchema } from "../core/boards/board-count.ts";

test("a whole non-negative board count parses", () => {
  assert.equal(boardCountSchema.parse(0), 0);
  assert.equal(boardCountSchema.parse(14), 14);
});

test("negative, fractional, and non-finite board counts are rejected", () => {
  for (const value of [-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(boardCountSchema.safeParse(value).success, false);
  }
});
