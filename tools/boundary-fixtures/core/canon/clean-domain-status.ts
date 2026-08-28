// EXPECT: clean
// The regression test for the false positive `tailor/no-http-status-in-core`
// would otherwise fire: `run_steps.status` is specified as
// `pending | running | done | failed` and must be declared as a zod schema
// under core/. A domain status is not an HTTP status.
import { z } from "zod";

export const runStepSchema = z.object({
  ordinal: z.number().int().positive(),
  status: z.enum(["pending", "running", "done", "failed"]),
});

export type RunStep = z.infer<typeof runStepSchema>;

export const seededStep: RunStep = { ordinal: 1, status: "pending" };
