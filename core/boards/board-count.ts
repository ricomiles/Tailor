import { z } from "zod";

/**
 * How many job boards are being watched.
 *
 * Declared in `core/` for the same reason the pipeline counts are: the top bar
 * renders it today and Epic 2's `boards.json` reader will produce it, and one
 * declaration is what keeps the two from disagreeing about what a board count
 * is. `core/` may import `zod` and nothing else outward (AD-1).
 */
export const boardCountSchema = z.number().int().nonnegative();

export type BoardCount = z.infer<typeof boardCountSchema>;
