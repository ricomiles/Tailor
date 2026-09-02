import { z } from "zod";
// Relative with the extension, not the `@/` alias: this module is loaded
// directly by the Node test runner, which resolves neither tsconfig paths nor
// extensionless specifiers. `app/api/` is the composition root, so importing
// inward from `core/` is the permitted direction (AD-1).
import {
  DEFAULT_MESSAGE_BY_CODE,
  ERROR_CODES,
  errorCodeSchema,
  errorEnvelopeSchema,
  type ErrorEnvelope,
} from "../../core/errors/error-envelope.ts";
import { isTailorError } from "../../core/errors/tailor-error.ts";
import { pipelineStageSchema } from "../../core/pipeline/pipeline-stages.ts";

/**
 * The only place in the repo where an error acquires an HTTP shape.
 *
 * Errors flow one direction: adapters and core services throw a `TailorError`
 * carrying a stable code, and this — the composition root — is the single
 * translator that turns one into a response. Nothing under `core/` constructs a
 * `Response` or sets a status; `tailor/no-http-response-in-core` and
 * `tailor/no-http-status-in-core` make that mechanical rather than aspirational.
 *
 * Not a `route.ts`: this file is a plain module, and Next treats only
 * `route.*` as a route. No endpoint calls it yet — Story 1.6 deliberately
 * ships none, its canon gateway being a function the later stories call
 * directly — so the first caller is whichever story first serves a request.
 */

/** The only numbers that are HTTP statuses. */
const httpStatusSchema = z.number().int().min(100).max(599);

/**
 * The code-to-status map, and the entire HTTP status taxonomy this story owns.
 *
 * Parsed rather than asserted, following `core/pipeline/pipeline-counts.ts`:
 * `z.record` over the code enum is exhaustive, so adding a code without
 * deciding its status fails here, and the value schema rejects a typo like
 * `4004`, which `Record<ErrorCode, number>` would have accepted. Frozen because
 * it is one shared object every call reads.
 */
const HTTP_STATUS_BY_CODE = Object.freeze(
  z.record(errorCodeSchema, httpStatusSchema).parse({
    // Keyed off the constant, never off the literals: restating the code
    // strings here would be the second declaration the epic forbids, and this
    // file is the one most likely to drift from it.
    [ERROR_CODES.invalidRequest]: 400,
    [ERROR_CODES.notFound]: 404,
    [ERROR_CODES.internal]: 500,
  }),
);

/** The single exit. Every return below goes through it, so the status can
 * never disagree with the code it was derived from. */
const respond = (envelope: ErrorEnvelope): Response =>
  Response.json(envelope, { status: HTTP_STATUS_BY_CODE[envelope.code] });

/**
 * Deliberately not a catch-all. `notFound()`, `redirect()`, `unauthorized()`
 * and `forbidden()` all signal *by throwing*, so a translator that enveloped
 * everything it caught would turn an intended 404 into a 500 body. Next's
 * documented remedy is `unstable_rethrow()`, still `unstable_`-prefixed in
 * 16.3.0; recognising only our own typed error and rethrowing the rest gets the
 * same protection with no unstable API, and is the stricter contract anyway.
 *
 * The other half of the contract is totality: a recognised error *always*
 * produces a well-formed envelope. Throwing out of this function would hand
 * Next its own 500 HTML and the client would get no envelope at all — the one
 * outcome "one error envelope everywhere" exists to rule out. That is enforced
 * structurally rather than argued: every field recognition does not validate is
 * filtered here, the parse is a `safeParse`, and the failure arm still answers
 * with an envelope. A malformed `stage` costs the caller its stage, never its
 * envelope — the frozen matrix's "throw at the boundary" governs *parsing* an
 * inbound envelope, not this translator emitting one.
 *
 * The return type is the web `Response`, which a future caller may satisfy with
 * a `NextResponse` — that is a subclass, so widening never has to happen here.
 *
 * @throws whatever it was handed, unchanged, when that is not a `TailorError`.
 */
export function toErrorResponse(error: unknown): Response {
  if (!isTailorError(error)) throw error;

  // `new Error()` defaults its message to `""` and the envelope requires a
  // non-empty one, so an adapter throwing `new TailorError(code, "")` would
  // otherwise fail the parse below and escape as a ZodError. The substitute is
  // a real sentence per code rather than a shrug: an error that says nothing is
  // the vagueness the epic's copy rule exists to forbid.
  const given = error.message.trim();
  const message = given === "" ? DEFAULT_MESSAGE_BY_CODE[error.code] : given;

  // `stage` is the one field `isTailorError` does not validate — recognition
  // turns on the brand, the code and the message — so a value that crossed a
  // realm, or a `row.stage as PipelineStage` off a database, can carry a stage
  // the runner has never heard of. Filtering it here rather than trusting it
  // keeps a wrong *stage* from costing the client the whole *envelope*; an
  // unparseable one is dropped, and the key is absent rather than null.
  const stage = pipelineStageSchema.safeParse(error.stage);

  const parsed = errorEnvelopeSchema.safeParse({
    code: error.code,
    message,
    ...(stage.success ? { stage: stage.data } : {}),
  });
  if (parsed.success) return respond(parsed.data);

  // Unreachable given what `isTailorError` currently guarantees, and kept
  // anyway: totality is the contract this module advertises, and it must not
  // rest on a predicate in another file staying exactly as strict as it is
  // today. Widening recognition should cost a caller its `stage`, never its
  // envelope.
  return respond({
    code: ERROR_CODES.internal,
    message: DEFAULT_MESSAGE_BY_CODE[ERROR_CODES.internal],
  });
}
