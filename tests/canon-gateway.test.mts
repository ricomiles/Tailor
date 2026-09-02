import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { readCanon } from "../adapters/canon/canon-gateway.ts";
import { CANON_FILE, CANON_SENTINEL } from "../core/canon/canon-document.ts";
import { TailorError, isTailorError } from "../core/errors/tailor-error.ts";

/**
 * The one reader, driven against temp roots and never against `./data`.
 *
 * `readCanon()` takes its root as a parameter for the same reason `bootstrap()`
 * does: `pnpm test` runs *inside* `pnpm build`, and `scripts/run-tests.mjs`
 * fails the build if the suite touched the real `data/resume.canon.json` —
 * which `git status` could never have told anyone, since it is gitignored.
 *
 * Fixtures are the shipped seed, mutated. Writing a canon literal here would be
 * a second declaration of the shape, which is the thing this story exists to
 * prevent.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = join(REPO_ROOT, "adapters", "db", "seed", "resume.canon.seed.json");

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tailor-canon-"));
  mkdirSync(join(root, "data"));
  roots.push(root);
  return root;
}

/** Writes `document` (or raw text) as the canon under a fresh root. */
function rootHolding(document: unknown): string {
  const root = makeRoot();
  writeFileSync(
    join(root, CANON_FILE),
    typeof document === "string" ? document : JSON.stringify(document, null, 2),
    "utf8",
  );
  return root;
}

/**
 * The shipped canon as a mutable plain object.
 *
 * Deliberately untyped: every fixture below reaches in to break something the
 * schema forbids — deleting `basics.name`, adding a `staus` key — which a
 * `CanonDocument` will not let you express. Re-read per call so no test can
 * mutate another's input.
 */
// A fixture's whole job here is to be a shape `CanonDocument` cannot express.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const seedDocument = (): Record<string, any> => JSON.parse(readFileSync(SEED, "utf8"));

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** Every failure path must produce the same recognisable shape. */
function assertTailorInternal(run: () => unknown): TailorError {
  let caught: unknown;
  assert.throws(run, (error: unknown) => {
    caught = error;
    assert.equal(isTailorError(error), true);
    assert.ok(error instanceof TailorError);
    assert.equal(error.code, "internal");
    assert.equal(error.stage, undefined);
    assert.notEqual(error.cause, undefined, "the original survives as cause");
    return true;
  });
  return caught as TailorError;
}

// ---------------------------------------------------------------------------
// The exported surface.
// ---------------------------------------------------------------------------

test("the gateway exposes reads and nothing else", async () => {
  const gateway = await import("../adapters/canon/canon-gateway.ts");
  assert.deepEqual(Object.keys(gateway).sort(), ["readCanon"]);
});

// ---------------------------------------------------------------------------
// Clean read, and the asymmetry end to end.
// ---------------------------------------------------------------------------

test("a seeded canon parses and the phone sentinel comes back absent", () => {
  const document = readCanon(rootHolding(seedDocument()));

  assert.equal(document.basics.phone, undefined);
  // `name` is typed `string | undefined` because the sentinel transform can
  // erase any scalar `basics` field — including this one, if canon ever said
  // `"name": "TODO"`. The seed does not, so it must be here.
  assert.ok(document.basics.name);
  assert.equal(document.work.length > 0, true);
});

test("a placeholder token inside a bullet's text survives the read byte-identical", () => {
  const text = "Cut p99 latency by {{PERCENT}} across {{SERVICE_COUNT}} services.";
  const document = seedDocument();
  document.work[0].bullets[0].text = text;

  assert.equal(readCanon(rootHolding(document)).work[0].bullets[0].text, text);
});

test("a sentinel outside scalar basics is returned untouched", () => {
  const document = readCanon(rootHolding(seedDocument()));
  const linkedin = document.basics.profiles.find((p) => p.username === CANON_SENTINEL);

  assert.ok(linkedin, "the seed's LinkedIn row carries the sentinel");
  assert.equal(linkedin.url, CANON_SENTINEL);
  assert.match(document.rendering.template, /^TODO/);
});

test("both bullet statuses survive the read", () => {
  const document = seedDocument();
  document.work[0].bullets[0].status = "needs-number";
  document.work[0].bullets[1].status = "needs-content";

  const bullets = readCanon(rootHolding(document)).work[0].bullets;
  assert.equal(bullets[0].status, "needs-number");
  assert.equal(bullets[1].status, "needs-content");
});

test("the authoring comments are accepted and kept", () => {
  const document = readCanon(rootHolding(seedDocument()));
  assert.equal(typeof document.$comment, "string");
});

// ---------------------------------------------------------------------------
// No cache. Not deferred — absent.
// ---------------------------------------------------------------------------

test("a second read reflects an edit made between the two", () => {
  const root = rootHolding(seedDocument());
  assert.equal(readCanon(root).basics.name?.includes(" the second"), false);

  const edited = seedDocument();
  edited.basics.name = `${edited.basics.name} the second`;
  writeFileSync(join(root, CANON_FILE), JSON.stringify(edited), "utf8");

  assert.equal(readCanon(root).basics.name?.endsWith(" the second"), true);
});

test("a canon that becomes unreadable between two reads fails the second", () => {
  const root = rootHolding(seedDocument());
  readCanon(root);
  writeFileSync(join(root, CANON_FILE), "{ truncated", "utf8");

  assertTailorInternal(() => readCanon(root));
});

// ---------------------------------------------------------------------------
// Failure. One shape, and a message safe to show a user.
// ---------------------------------------------------------------------------

test("a missing canon is one TailorError naming the file", () => {
  const error = assertTailorInternal(() => readCanon(makeRoot()));
  assert.match(error.message, /resume\.canon\.json/);
});

test("the message names the file, never the machine's directory layout", () => {
  // `app/api/to-error-response.ts` puts `error.message` straight into the
  // response body. A resolved absolute path there would ship the server's
  // layout to every client the moment Story 1.7 wires a route.
  const root = makeRoot();
  const error = assertTailorInternal(() => readCanon(root));

  assert.equal(error.message.includes(root), false, error.message);
  assert.equal(error.message.includes(tmpdir()), false, error.message);
});

test("a canon that is not JSON is one TailorError carrying the SyntaxError", () => {
  const error = assertTailorInternal(() => readCanon(rootHolding("not json at all")));
  assert.ok(error.cause instanceof SyntaxError);
});

test("an empty canon is a legible failure, not a crash", () => {
  // A hand-edited file saved empty, or a truncated write. `JSON.parse("")`
  // throws, and the reader deserves to be told which file.
  const error = assertTailorInternal(() => readCanon(rootHolding("")));
  assert.match(error.message, /resume\.canon\.json/);
});

test("a canon saved with a UTF-8 BOM is reported as a parse failure, not a shape failure", () => {
  // Real hazard for a hand-authored file: several editors write a BOM, and
  // `JSON.parse` rejects it. The point of the assertion is that the message
  // sends the author to the file rather than to a phantom missing field.
  const error = assertTailorInternal(() =>
    readCanon(rootHolding(`﻿${JSON.stringify(seedDocument())}`)),
  );
  assert.ok(error.cause instanceof SyntaxError);
});

test("a canon that is valid JSON but not a document names the failing field path", () => {
  const document = seedDocument();
  delete document.basics.name;

  const error = assertTailorInternal(() => readCanon(rootHolding(document)));
  assert.match(error.message, /basics\.name/);
});

test("a bullet with no text names its own path, not just the document's", () => {
  const document = seedDocument();
  delete document.work[0].bullets[0].text;

  const error = assertTailorInternal(() => readCanon(rootHolding(document)));
  assert.match(error.message, /work\.0\.bullets\.0\.text/);
});

test("a typo'd key is a read failure — it does not silently vanish", () => {
  const document = seedDocument();
  document.work[0].bullets[0].staus = "needs-number";

  const error = assertTailorInternal(() => readCanon(rootHolding(document)));
  assert.match(error.message, /staus/);
});

test("a canon that is JSON but not an object is refused rather than crashing", () => {
  assertTailorInternal(() => readCanon(rootHolding("[]")));
  assertTailorInternal(() => readCanon(rootHolding("null")));
});

test("a directory where canon should be is a TailorError, not a raw EISDIR", () => {
  const root = makeRoot();
  mkdirSync(join(root, CANON_FILE));

  assertTailorInternal(() => readCanon(root));
});

test("a canon that exists but cannot be read is a TailorError, not a raw EACCES", () => {
  const root = rootHolding(seedDocument());
  const path = join(root, CANON_FILE);
  chmodSync(path, 0o000);
  try {
    // Skipped rather than failed when the suite runs as root, where mode bits
    // do not deny anything — a false failure there would teach nobody anything.
    let denied = true;
    try {
      readFileSync(path, "utf8");
      denied = false;
    } catch {
      // expected
    }
    if (denied) assertTailorInternal(() => readCanon(root));
  } finally {
    chmodSync(path, 0o600);
  }
});

test("a canon wrong in many ways reports a few paths and a count, not all of them", () => {
  // The message reaches a response body through `app/api/to-error-response.ts`.
  // Both caps exist for that: one bounds how many issues are shown, the other
  // bounds the string — a single `unrecognized_keys` issue enumerates every
  // stray key on its own, so capping the count alone is not enough.
  const document = seedDocument();
  delete document.basics.name;
  delete document.work[0].bullets[0].text;
  delete document.education[0].institution;
  delete document.skills[0].category;
  document.rendering.maxPages = "one";

  const error = assertTailorInternal(() => readCanon(rootHolding(document)));

  assert.match(error.message, /and \d+ more/);
  assert.ok(error.message.length < 600, `message was ${error.message.length} chars`);
});

test("one issue naming a great many stray keys is still a bounded message", () => {
  const document = seedDocument();
  for (let index = 0; index < 60; index += 1) {
    document.basics[`stray_key_with_a_long_name_${index}`] = index;
  }

  const error = assertTailorInternal(() => readCanon(rootHolding(document)));
  assert.ok(error.message.length < 600, `message was ${error.message.length} chars`);
});

// ---------------------------------------------------------------------------
// The default root — the one branch that would ever touch the real ./data.
// ---------------------------------------------------------------------------

test("the default root is the process's working directory", () => {
  // Never asserted before, and it is the branch every production caller takes:
  // `instrumentation.ts` and every future route handler call `readCanon()` with
  // no argument. Exercised by moving the working directory to a temp root, so
  // the real `./data` is never opened — `scripts/run-tests.mjs` fails the build
  // if it were.
  const root = rootHolding(seedDocument());
  const original = process.cwd();
  try {
    process.chdir(root);
    assert.deepEqual(readCanon(), readCanon(root));
  } finally {
    process.chdir(original);
  }
});
