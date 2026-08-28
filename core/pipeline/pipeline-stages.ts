import { z } from "zod";

/**
 * AD-4's six pipeline stages, in the order a run walks them.
 *
 * Declared here and only here. Epic 3's runner writes `run_steps` rows and this
 * story's error envelope names the stage a failure happened in; a second list
 * anywhere is how those two come to disagree about what a stage is. The slug is
 * the identity — `run_steps.ordinal` is this array's 1-based index, so the
 * *order* is part of the contract, not presentation.
 *
 * Frozen because it is one shared array handed to every consumer: `as const`
 * makes it readonly to the type checker only, and an in-place splice would
 * corrupt it everywhere with no test able to localise the damage.
 *
 * `core/` may import `zod` and nothing else outward (AD-1).
 */
export const PIPELINE_STAGES = Object.freeze([
  "fetch-posting",
  "extract-requirements",
  "match-canon",
  "rewrite-bullets",
  "validate",
  "render-pdf",
] as const);

/**
 * Derived from the tuple rather than re-listing the slugs, so the schema and
 * the ordered list cannot drift.
 */
export const pipelineStageSchema = z.enum(PIPELINE_STAGES);

export type PipelineStage = z.infer<typeof pipelineStageSchema>;
