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
  message: z.string().min(1),
  stage: pipelineStageSchema.optional(),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
