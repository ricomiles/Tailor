// Relative, not the `@/` alias: this module is loaded directly by the Node
// test runner, which resolves neither tsconfig paths nor extensionless imports.
import { boardCountSchema } from "../../core/boards/board-count.ts";
import {
  PIPELINE_STATES,
  pipelineCountsSchema,
  type PipelineCounts,
} from "../../core/pipeline/pipeline-counts.ts";

/**
 * Split out of `top-bar.tsx` so the label rules can be tested: that module
 * imports a CSS Module, which Node's test runner cannot parse.
 *
 * These two functions are also the validation boundary. Values become text
 * here and nowhere else, so this is the last point at which a bad count can
 * still be refused rather than rendered — the spec requires the throw, and
 * `top-bar.tsx` cannot host it without becoming untestable.
 */

/**
 * The design prints the state name verbatim after its number, and the order
 * comes from the schema — this file names no state of its own.
 */
export function countLabels(counts: PipelineCounts): string[] {
  const parsed = pipelineCountsSchema.parse(counts);
  return PIPELINE_STATES.map((name) => `${parsed[name]} ${name}`);
}

/**
 * The design source reads `no boards yet` when nothing is watched and
 * `watching N boards` otherwise (`Tailor.dc.html` L951), so this is the label
 * the app ships today. The singular at one board has no source counterpart
 * and is decided in the story spec.
 */
export function boardsLabel(boardCount: number): string {
  const parsed = boardCountSchema.parse(boardCount);
  if (parsed === 0) return "no boards yet";
  return `watching ${parsed} ${parsed === 1 ? "board" : "boards"}`;
}
