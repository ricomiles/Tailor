import { z } from "zod";

/**
 * What the startup routine did to each artifact it owns.
 *
 * "Idempotent" is otherwise only testable as "did not crash the second time",
 * which is an inference from silence rather than a proof. Returning an outcome
 * per artifact turns the claim into a value: the re-run test asserts the
 * *absence of a write* directly, and that is the criterion protecting a canon
 * file the user hand-edits and git does not track.
 *
 * Declared here because the shape crosses `adapters/db/bootstrap.ts` →
 * `instrumentation.ts` at the repo root — two units, so AD-16 puts it in
 * `core/`. `core/` may import `zod` and nothing else outward (AD-1).
 */

/**
 * The two things bootstrap may do to an artifact, and there is deliberately no
 * third. No `updated`, no `repaired`: the routine has no write path to an
 * existing file, so an outcome naming one would describe behaviour the code is
 * built to make impossible. A malformed `boards.json` reports `left-untouched`
 * like any other existing file — idempotence outranks repair, and Epic 2's
 * reader is what parses and reports the damage.
 *
 * A frozen `const` object rather than an `enum`: `erasableSyntaxOnly` forbids
 * `enum` (`core/errors/error-envelope.ts:26-36`), and freezing stops an
 * in-place edit to the one shared object.
 */
export const ARTIFACT_OUTCOMES = Object.freeze({
  created: "created",
  leftUntouched: "left-untouched",
} as const);

/** Derived from the object, so the union cannot drift from the constant. */
export const artifactOutcomeSchema = z.enum(ARTIFACT_OUTCOMES);

export type ArtifactOutcome = z.infer<typeof artifactOutcomeSchema>;

/**
 * The three artifacts bootstrap owns.
 *
 * `./data` itself is not among them: it is the directory the other two files
 * live in, not something whose contents can be clobbered, and reporting on a
 * `mkdir … { recursive: true }` would add a row no assertion could fail on.
 *
 * `database` means the SQLite file plus its `__drizzle_migrations` ledger,
 * reported together because they are created by one call and cannot exist
 * apart. With an empty journal this story applies zero migrations, so the
 * outcome says whether the file was there — the migration path becomes
 * interesting when Epic 2 adds the first table.
 */
export const bootstrapReportSchema = z.object({
  canon: artifactOutcomeSchema,
  boardsFile: artifactOutcomeSchema,
  database: artifactOutcomeSchema,
});

export type BootstrapReport = z.infer<typeof bootstrapReportSchema>;

/**
 * The artifact names in the order the routine visits them, derived from the
 * schema rather than re-listed — a second hand-written list is how a fourth
 * artifact gets added in one place and missed in the other.
 *
 * Frozen: the `as` cast makes it readonly to the type checker only, and this
 * is the single list every consumer iterates.
 */
export const BOOTSTRAP_ARTIFACTS = Object.freeze(
  Object.keys(bootstrapReportSchema.shape),
) as ReadonlyArray<keyof BootstrapReport>;
