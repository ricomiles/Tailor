// EXPECT: clean
// The other half of the false-positive regression test. `clean-domain-status.ts`
// covers a string enum; this covers the numeric cases, which are what the
// 100-599 clause of `tailor/no-http-status-in-core` could actually regress on:
// a domain number outside the HTTP range, an unconstrained numeric schema, and
// a `status: number` type member.
import { z } from "zod";

export const attemptSchema = z.object({
  status: z.number().int().nonnegative(),
});

export type Attempt = { status: number };

export const attempt: Attempt = { status: 7 };
export const retried = { status: 0, elapsedMs: 404 };
