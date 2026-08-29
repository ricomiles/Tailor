import { z } from "zod";
// Relative with the extension, not the `@/` alias: this module is loaded
// directly by the Node test runner, which resolves neither tsconfig paths nor
// extensionless specifiers.
import { pipelineStageSchema } from "../pipeline/pipeline-stages.ts";

/**
 * The one error envelope every endpoint returns.
 *
 * Declared here and only here (AD-1, and the epic's declare-once rule). The
 * failure mode this exists to prevent is each route growing its own error
 * shape, so nothing else in the repo may restate these fields — `app/api/`
 * formats the HTTP response *around* this schema and adds no keys of its own.
 *
 * `core/` may import `zod` and nothing else outward.
 */

/**
 * The stable, machine-readable codes a client may branch on.
 *
 * Deliberately minimal: three codes, because three failures exist today. The
 * story that first raises a new one adds it here — a taxonomy invented ahead of
 * its callers is guessed rather than derived, and every guessed code is a
 * branch no client will ever take.
 *
 * A frozen `const` object rather than an `enum`: `erasableSyntaxOnly` forbids
 * `enum`, and freezing stops an in-place edit to the single shared object.
 */
export const ERROR_CODES = Object.freeze({
  invalidRequest: "invalid-request",
  notFound: "not-found",
  internal: "internal",
} as const);

/** Derived from the object, so the union cannot drift from the constant. */
export const errorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * `stage` is optional and absent — never `null`, never `""` — when a failure
 * happens outside a pipeline run. It references `pipelineStageSchema` rather
 * than restating the six slugs, so an envelope can never name a stage the
 * runner does not have.
 */
export const errorEnvelopeSchema = z.object({
  code: errorCodeSchema,
  // `.trim()` before `.min(1)`: `"   "` satisfies a bare `min(1)` and would
  // reach a client as a blank message. The translator trims on its own, but
  // this schema is the contract every *other* consumer parses through, and it
  // has to hold on its own terms.
  message: z.string().trim().min(1),
  stage: pipelineStageSchema.optional(),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/**
 * What the envelope says when the thrower supplied no message.
 *
 * Epic 1 requires an error to state what happened and what to do; a generic
 * `"(no message given)"` states neither, and silently blames the reader for a
 * thrower that passed an empty string. One sentence per code, and no more than
 * the three codes above — this is not a taxonomy, it is the floor beneath one.
 *
 * Parsed rather than asserted, the way `pipeline-counts.ts` does it: `z.record`
 * over the code enum is exhaustive, so adding a code without writing its
 * sentence fails here at module load rather than shipping a blank message.
 */
export const DEFAULT_MESSAGE_BY_CODE = Object.freeze(
  z.record(errorCodeSchema, z.string().trim().min(1)).parse({
    // Keyed off the constant, never the literals — the same single-declaration
    // rule that governs the codes themselves.
    [ERROR_CODES.invalidRequest]:
      "The request was not valid. Check the fields you sent and try again.",
    [ERROR_CODES.notFound]:
      "That resource does not exist. Check the identifier and try again.",
    [ERROR_CODES.internal]:
      "The server could not complete the request. Retry, and if it keeps failing check the server log for the failing stage.",
  }),
);
