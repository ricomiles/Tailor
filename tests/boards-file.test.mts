import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_BOARDS_FILE,
  VENDORS,
  boardEntrySchema,
  boardsFileSchema,
  vendorSchema,
} from "../core/boards/boards-file.ts";

/**
 * The shape `adapters/db/bootstrap.ts` writes on a clean machine and Epic 2
 * reads back. It has no runtime behaviour of its own, so what is worth
 * asserting is what the schema *refuses* — every value it accepts becomes a URL
 * a board adapter will fetch.
 */

// ---------------------------------------------------------------------------
// The vendor union.
// ---------------------------------------------------------------------------

test("the four vendors adapters.md names parse", () => {
  for (const vendor of ["greenhouse", "lever", "ashby", "workable"]) {
    assert.equal(vendorSchema.parse(vendor), vendor);
  }
  assert.equal(VENDORS.length, 4);
});

test("an unknown vendor is rejected", () => {
  for (const value of ["Greenhouse", "GREENHOUSE", "smartrecruiters", "", null]) {
    assert.equal(vendorSchema.safeParse(value).success, false);
  }
});

test("the vendor list cannot be extended in place", () => {
  assert.equal(Object.isFrozen(VENDORS), true);
  assert.throws(() => {
    (VENDORS as unknown as string[]).push("smartrecruiters");
  });
});

// ---------------------------------------------------------------------------
// A board entry.
// ---------------------------------------------------------------------------

test("a minimal entry is type plus token; the label is optional", () => {
  assert.deepEqual(boardEntrySchema.parse({ type: "lever", token: "acme" }), {
    type: "lever",
    token: "acme",
  });
  assert.deepEqual(
    boardEntrySchema.parse({ type: "ashby", token: "acme", label: "Acme" }),
    { type: "ashby", token: "acme", label: "Acme" },
  );
});

test("a blank or whitespace-only token is refused", () => {
  // `""` and `"   "` both build a URL that resolves to the vendor's index
  // rather than failing, which turns a typo into an empty scan instead of an
  // error. `.trim()` before `.min(1)` is what catches the second one.
  for (const token of ["", "   ", "\t\n"]) {
    assert.equal(
      boardEntrySchema.safeParse({ type: "lever", token }).success,
      false,
      JSON.stringify(token),
    );
  }
});

test("a present but blank label is refused rather than rendered as an empty row", () => {
  for (const label of ["", "  "]) {
    assert.equal(
      boardEntrySchema.safeParse({ type: "lever", token: "acme", label }).success,
      false,
      JSON.stringify(label),
    );
  }
});

test("an entry missing its type or token is refused", () => {
  assert.equal(boardEntrySchema.safeParse({ token: "acme" }).success, false);
  assert.equal(boardEntrySchema.safeParse({ type: "lever" }).success, false);
});

// ---------------------------------------------------------------------------
// The file.
// ---------------------------------------------------------------------------

test("the file is an object with a boards key, never a bare array", () => {
  // A top-level array has nowhere to grow: the first setting the file needs
  // would force a second file or a breaking rewrite of every reader.
  assert.equal(boardsFileSchema.safeParse([]).success, false);
  assert.equal(
    boardsFileSchema.safeParse([{ type: "lever", token: "acme" }]).success,
    false,
  );
  assert.deepEqual(boardsFileSchema.parse({ boards: [] }), { boards: [] });
});

test("one bad entry refuses the whole file", () => {
  assert.equal(
    boardsFileSchema.safeParse({
      boards: [
        { type: "lever", token: "acme" },
        { type: "monster", token: "acme" },
      ],
    }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// The value bootstrap serialises.
// ---------------------------------------------------------------------------

test("the empty file parses through its own schema", () => {
  assert.deepEqual(boardsFileSchema.parse(EMPTY_BOARDS_FILE), { boards: [] });
});

test("the empty file cannot be mutated in place, at either level", () => {
  // `Object.freeze` is shallow. Freezing only the wrapper left
  // `EMPTY_BOARDS_FILE.boards.push(...)` mutating the exact array bootstrap
  // serialises onto a clean machine.
  assert.equal(Object.isFrozen(EMPTY_BOARDS_FILE), true);
  assert.equal(Object.isFrozen(EMPTY_BOARDS_FILE.boards), true);
  assert.throws(() => {
    (EMPTY_BOARDS_FILE.boards as unknown as unknown[]).push({
      type: "lever",
      token: "sneaked-in",
    });
  });
  assert.throws(() => {
    (EMPTY_BOARDS_FILE as unknown as { boards: unknown }).boards = ["x"];
  });
  assert.deepEqual(EMPTY_BOARDS_FILE.boards, []);
});

test("what bootstrap writes is what the reader will parse", () => {
  // The exact round trip `adapters/db/bootstrap.ts` performs on a clean machine.
  const written = `${JSON.stringify(EMPTY_BOARDS_FILE, null, 2)}\n`;
  assert.deepEqual(boardsFileSchema.parse(JSON.parse(written)), { boards: [] });
});
