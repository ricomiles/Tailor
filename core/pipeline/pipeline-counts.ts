import { z } from "zod";

/**
 * The four states a posting passes through, counted.
 *
 * Declared here and only here: Epic 2 derives this same shape from posting
 * rows, and a second declaration is exactly how the top bar and the queue
 * drift apart. `core/` may import `zod` and nothing else outward (AD-1).
 */
export const pipelineCountsSchema = z.object({
  discovered: z.number().int().nonnegative(),
  tailored: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
});

export type PipelineCounts = z.infer<typeof pipelineCountsSchema>;

/**
 * The states in the order they read, derived from the schema rather than
 * re-listed. A second hand-written list is how a fifth state — the prototype
 * already shows `skipped` — gets added in one place and missed in the other.
 *
 * Frozen: the `as` cast makes it readonly to the type checker only, and this
 * is the single list every consumer of the shape iterates.
 */
export const PIPELINE_STATES = Object.freeze(
  Object.keys(pipelineCountsSchema.shape),
) as ReadonlyArray<keyof PipelineCounts>;

/**
 * Parsed rather than asserted, so the zero value is proof the schema accepts
 * it rather than a claim that it would. Frozen because it is one shared object
 * handed to every consumer — an in-place edit anywhere would corrupt it
 * everywhere, and no test could localise that.
 */
export const ZERO_PIPELINE_COUNTS: Readonly<PipelineCounts> = Object.freeze(
  pipelineCountsSchema.parse({
    discovered: 0,
    tailored: 0,
    approved: 0,
    submitted: 0,
  }),
);
