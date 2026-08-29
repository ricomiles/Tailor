import assert from "node:assert/strict";
import test from "node:test";
import { toErrorResponse } from "../app/api/to-error-response.ts";
import {
  DEFAULT_MESSAGE_BY_CODE,
  ERROR_CODES,
  errorEnvelopeSchema,
} from "../core/errors/error-envelope.ts";
import { TailorError, isTailorError } from "../core/errors/tailor-error.ts";
import {
  PIPELINE_STAGES,
  type PipelineStage,
} from "../core/pipeline/pipeline-stages.ts";

/**
 * Lives here rather than beside the modules: AD-1 forbids every Node built-in
 * under `core/`, and a test needs `node:test`. Core's tests will always sit
 * outside core.
 *
 * Story 1.4 ships no route handler, so these are the envelope's only
 * behavioural proof — the lint half of the story is proven by
 * `pnpm verify:boundaries` instead.
 */

// ---------------------------------------------------------------------------
// The envelope, parsed.
// ---------------------------------------------------------------------------

test("an envelope carrying a stage keeps the code, the message and the stage", () => {
  const envelope = errorEnvelopeSchema.parse({
    code: ERROR_CODES.internal,
    message: "chromium exited before the pdf was written",
    stage: "render-pdf",
  });
  assert.deepEqual(envelope, {
    code: "internal",
    message: "chromium exited before the pdf was written",
    stage: "render-pdf",
  });
});

test("an envelope with no stage omits the key rather than nulling it", () => {
  const envelope = errorEnvelopeSchema.parse({
    code: ERROR_CODES.notFound,
    message: "no posting with that id",
  });
  assert.equal("stage" in envelope, false);
  assert.deepEqual(Object.keys(envelope).sort(), ["code", "message"]);
});

test("a missing code fails the parse naming code", () => {
  const result = errorEnvelopeSchema.safeParse({ message: "something broke" });
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["code"]);
});

test("an unknown code fails the parse naming code", () => {
  const result = errorEnvelopeSchema.safeParse({
    code: "teapot",
    message: "something broke",
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["code"]);
});

test("a stage outside the six fails the parse naming stage", () => {
  const result = errorEnvelopeSchema.safeParse({
    code: ERROR_CODES.internal,
    message: "something broke",
    stage: "upload-to-ats",
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["stage"]);
});

test("an empty message fails the parse naming message", () => {
  const result = errorEnvelopeSchema.safeParse({
    code: ERROR_CODES.internal,
    message: "",
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["message"]);
});

// ---------------------------------------------------------------------------
// The stages. Declared once, in order, frozen — `run_steps.ordinal` is this
// array's 1-based index, so the order is part of the contract.
// ---------------------------------------------------------------------------

test("the six stages are declared in run order and cannot be extended", () => {
  assert.deepEqual(PIPELINE_STAGES, [
    "fetch-posting",
    "extract-requirements",
    "match-canon",
    "rewrite-bullets",
    "validate",
    "render-pdf",
  ]);
  assert.equal(Object.isFrozen(PIPELINE_STAGES), true);
  assert.throws(() => {
    (PIPELINE_STAGES as unknown as string[]).push("upload-to-ats");
  });
  assert.equal(PIPELINE_STAGES.length, 6);
});

test("the error codes cannot be mutated in place", () => {
  assert.equal(Object.isFrozen(ERROR_CODES), true);
  assert.throws(() => {
    (ERROR_CODES as { internal: string }).internal = "boom";
  });
  assert.equal(ERROR_CODES.internal, "internal");
});

// ---------------------------------------------------------------------------
// The typed error.
// ---------------------------------------------------------------------------

test("a typed error is recognised and a plain Error is not", () => {
  assert.equal(isTailorError(new TailorError(ERROR_CODES.internal, "boom")), true);
  assert.equal(isTailorError(new Error("boom")), false);
  assert.equal(isTailorError({ code: "internal", message: "boom" }), false);
  assert.equal(isTailorError(null), false);
});

test("a typed error forwards its cause, so the underlying failure survives", () => {
  const underlying = new Error("SQLITE_BUSY");
  const error = new TailorError(ERROR_CODES.internal, "could not read canon", {
    cause: underlying,
    stage: "match-canon",
  });
  assert.equal(error.cause, underlying);
  assert.equal(error.stage, "match-canon");
});

test("a branded error from another realm is recognised without instanceof", () => {
  // The prototype chain of a value that crossed a worker or vm boundary is a
  // different one, so `instanceof Error` is false for the same reason
  // `instanceof TailorError` is. The brand plus a readable code is all that is
  // left, and it has to be enough.
  const crossRealm = {
    isTailorError: true,
    code: ERROR_CODES.notFound,
    message: "no posting with that id",
  };
  assert.equal(isTailorError(crossRealm), true);
  assert.equal(isTailorError({ isTailorError: true }), false);
  assert.equal(isTailorError({ isTailorError: true, code: "teapot", message: "x" }), false);
});

test("a typed error built without a stage carries no stage", () => {
  const error = new TailorError(ERROR_CODES.notFound, "no canon on disk");
  assert.equal(error.stage, undefined);
  assert.equal(error.code, "not-found");
  assert.equal(error.message, "no canon on disk");
});

// ---------------------------------------------------------------------------
// The translator — the only place HTTP shape exists.
// ---------------------------------------------------------------------------

test("a typed error with a stage becomes an envelope with that stage", async () => {
  const response = toErrorResponse(
    new TailorError(ERROR_CODES.internal, "chromium exited", { stage: "render-pdf" }),
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    code: "internal",
    message: "chromium exited",
    stage: "render-pdf",
  });
});

test("a typed error with no stage produces a body with no stage key", async () => {
  const response = toErrorResponse(
    new TailorError(ERROR_CODES.notFound, "no posting with that id"),
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.deepEqual(body, { code: "not-found", message: "no posting with that id" });
  assert.equal("stage" in (body as object), false);
});

test("each declared code maps to its own HTTP status", async () => {
  const statuses = await Promise.all(
    Object.values(ERROR_CODES).map(async (code) => {
      const response = toErrorResponse(new TailorError(code, "boom"));
      return [code, response.status] as const;
    }),
  );
  assert.deepEqual(Object.fromEntries(statuses), {
    "invalid-request": 400,
    "not-found": 404,
    internal: 500,
  });
});

test("an empty message still yields a well-formed envelope, never a throw", async () => {
  // `new Error()` defaults its message to "" and the schema requires a
  // non-empty one. Throwing here would hand Next its own 500 HTML and the
  // client would get no envelope at all — the one outcome the epic rules out.
  const response = toErrorResponse(new TailorError(ERROR_CODES.internal, ""));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    code: "internal",
    message: DEFAULT_MESSAGE_BY_CODE[ERROR_CODES.internal],
  });
});

test("a whitespace-only message is treated as empty rather than emitted", async () => {
  const response = toErrorResponse(
    new TailorError(ERROR_CODES.invalidRequest, "   \n  "),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    code: "invalid-request",
    message: DEFAULT_MESSAGE_BY_CODE[ERROR_CODES.invalidRequest],
  });
});

test("every recognised error yields an envelope, for every code and stage", async () => {
  const stages: (PipelineStage | undefined)[] = [undefined, ...PIPELINE_STAGES];
  for (const code of Object.values(ERROR_CODES)) {
    for (const stage of stages) {
      const response = toErrorResponse(new TailorError(code, "", { stage }));
      const body: unknown = await response.json();
      // Parsed, not eyeballed: the point is that the translator is total over
      // the recognised inputs, so every one of these must be a valid envelope.
      assert.equal(errorEnvelopeSchema.safeParse(body).success, true);
      assert.equal(typeof response.status, "number");
    }
  }
});

test("the response is json, not text", async () => {
  const response = toErrorResponse(
    new TailorError(ERROR_CODES.invalidRequest, "id is not a uuid"),
  );
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
});

// ---------------------------------------------------------------------------
// The rethrow. This is what keeps `notFound()` and `redirect()` working
// without reaching for Next's `unstable_rethrow`.
// ---------------------------------------------------------------------------

test("a plain Error is rethrown untouched, never enveloped", () => {
  const plain = new Error("a bug, not a domain failure");
  assert.throws(
    () => toErrorResponse(plain),
    (thrown: unknown) => thrown === plain,
  );
});

test("a framework signal is rethrown by identity so the 404 still happens", () => {
  // The shape Next's `notFound()` throws: an Error carrying a `digest`. It is
  // built here rather than imported, because calling `notFound()` outside a
  // request scope is not something the unit suite can do — what matters is
  // that the translator recognises nothing but its own error.
  const signal = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
    digest: "NEXT_HTTP_ERROR_FALLBACK;404",
  });
  assert.throws(
    () => toErrorResponse(signal),
    (thrown: unknown) => thrown === signal,
  );
});

test("a redirect signal is rethrown by identity", () => {
  const signal = Object.assign(new Error("NEXT_REDIRECT"), {
    digest: "NEXT_REDIRECT;replace;/postings;307;",
  });
  assert.throws(
    () => toErrorResponse(signal),
    (thrown: unknown) => thrown === signal,
  );
});

test("a non-Error throw is rethrown untouched too", () => {
  const thrownValue = { code: "not-found", message: "looks like an envelope" };
  assert.throws(
    () => toErrorResponse(thrownValue),
    (thrown: unknown) => thrown === thrownValue,
  );
});

// ---------------------------------------------------------------------------
// Totality. Added by the 2026-08-29 code review: `isTailorError` validates the
// brand, the code and the message but never the stage, so a recognised error
// could still fail the envelope parse and escape as a ZodError — the one
// outcome the translator's own doc comment says it exists to rule out.
// ---------------------------------------------------------------------------

test("a whitespace-only message does not satisfy the envelope contract", () => {
  const result = errorEnvelopeSchema.safeParse({
    code: ERROR_CODES.internal,
    message: "   ",
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["message"]);
});

test("a message is trimmed by the schema, not just by the translator", () => {
  const envelope = errorEnvelopeSchema.parse({
    code: ERROR_CODES.internal,
    message: "  chromium exited  ",
  });
  assert.equal(envelope.message, "chromium exited");
});

test("an empty message becomes that code's sentence, not a shrug", async () => {
  for (const code of Object.values(ERROR_CODES)) {
    const body = await toErrorResponse(new TailorError(code, "")).json();
    assert.equal(body.message, DEFAULT_MESSAGE_BY_CODE[code]);
    assert.doesNotMatch(
      body.message,
      /no message given/,
      "the fallback must state what happened and what to do",
    );
  }
});

test("a recognised error with an unparseable stage still yields an envelope", async () => {
  const cases: readonly unknown[] = [
    // A real instance whose stage was cast in — `row.stage as PipelineStage`
    // off a database is the realistic route.
    new TailorError(ERROR_CODES.internal, "chromium died", {
      stage: "upload-to-ats" as PipelineStage,
    }),
    // The branded cross-realm path, which validates neither.
    { isTailorError: true, code: "internal", message: "chromium died", stage: "nope" },
    { isTailorError: true, code: "internal", message: "chromium died", stage: null },
  ];
  for (const value of cases) {
    const response = toErrorResponse(value);
    const body = await response.json();
    assert.equal(errorEnvelopeSchema.safeParse(body).success, true);
    assert.equal("stage" in body, false, "an unparseable stage is dropped, not nulled");
    assert.equal(body.code, "internal");
  }
});

test("every code maps to a real HTTP status, never a defaulted 200", async () => {
  for (const code of Object.values(ERROR_CODES)) {
    const response = toErrorResponse(new TailorError(code, "boom"));
    assert.notEqual(
      response.status,
      200,
      `'${code}' has no status mapping — Response.json defaults to 200 and would ship an error body as success`,
    );
    assert.ok(Number.isInteger(response.status));
    assert.ok(response.status >= 100 && response.status <= 599);
  }
});

test("a TailorError subclass is recognised and enveloped like its parent", async () => {
  class CanonMissing extends TailorError {
    constructor() {
      super(ERROR_CODES.notFound, "no canon on disk", { stage: "match-canon" });
    }
  }
  const response = toErrorResponse(new CanonMissing());
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    code: "not-found",
    message: "no canon on disk",
    stage: "match-canon",
  });
});

test("the envelope strips keys it does not declare", () => {
  const envelope = errorEnvelopeSchema.parse({
    code: ERROR_CODES.internal,
    message: "boom",
    statusCode: 500,
  });
  assert.deepEqual(Object.keys(envelope).sort(), ["code", "message"]);
});
