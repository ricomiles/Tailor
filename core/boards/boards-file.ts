import { z } from "zod";

/**
 * The shape of `./boards.json` — the watched board list.
 *
 * AD-14 requires bootstrap to create the boards file "with a documented
 * shape", and no adopted document documents one: `SPEC.md:108` records it as
 * an open assumption ("type plus token or URL"). This module is that
 * documentation, and AD-16 makes `core/` its only legal home — Epic 2's reader,
 * its board adapters, and `postings.source` all resolve to these declarations
 * rather than restating them.
 *
 * `core/` may import `zod` and nothing else outward (AD-1).
 */

/**
 * The four board vendors `adapters.md` names, lowercase.
 *
 * The slug is the identity, not the display label: Epic 2 stores it as
 * `postings.source` and keys *both* adapter registries — board discovery and
 * ATS submission — off it, so a rename here is a data migration, not a copy
 * edit. Order is presentation only; nothing indexes this array.
 *
 * A frozen `as const` tuple rather than an `enum`: `erasableSyntaxOnly`
 * forbids `enum` (see `core/errors/error-envelope.ts:26-36`), and freezing
 * stops an in-place splice from corrupting the one shared array everywhere at
 * once — damage no test could localise.
 */
export const VENDORS = Object.freeze([
  "greenhouse",
  "lever",
  "ashby",
  "workable",
] as const);

/** Derived from the tuple, so the schema and the list cannot drift. */
export const vendorSchema = z.enum(VENDORS);

export type Vendor = z.infer<typeof vendorSchema>;

/**
 * One watched board.
 *
 * `token` is the board's identifier as it appears in the vendor's URL — the
 * `{token}` in `boards-api.greenhouse.io/v1/boards/{token}/jobs` — not a
 * credential; every endpoint in `adapters.md` is public JSON with no auth.
 * It is trimmed and non-empty because `""` and `"  "` both build a URL that
 * resolves to the vendor's index rather than failing, which is how a typo
 * becomes an empty scan instead of an error.
 *
 * `label` is optional and, when present, absent-or-meaningful: an empty label
 * would render as a blank row in the board list, so the schema refuses it
 * rather than letting the UI decide what a blank name means.
 */
export const boardEntrySchema = z.object({
  type: vendorSchema,
  token: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
});

export type BoardEntry = z.infer<typeof boardEntrySchema>;

/**
 * The file itself: an object with a `boards` key, never a bare array.
 *
 * The wrapper is deliberate. A top-level array has nowhere to grow — the first
 * setting the file needs (a scan interval, a default filter) would force either
 * a second file or a breaking rewrite of every reader.
 */
export const boardsFileSchema = z.object({
  boards: z.array(boardEntrySchema),
});

export type BoardsFile = z.infer<typeof boardsFileSchema>;

/**
 * What bootstrap writes on a clean machine.
 *
 * Parsed rather than asserted, the way `pipeline-counts.ts` does it: the empty
 * value is then proof the schema accepts it rather than a claim that it would.
 *
 * Frozen at *both* levels, and typed `readonly` at both. `Object.freeze` is
 * shallow: freezing only the wrapper left `EMPTY_BOARDS_FILE.boards.push(...)`
 * typechecking and mutating the exact array `adapters/db/bootstrap.ts`
 * serialises onto a clean machine — every later start would then write a
 * `boards.json` carrying whatever some unrelated module had pushed. The
 * annotation matters as much as the call: without `readonly boards`, the freeze
 * is a runtime trap the type checker never warns you about, and in a
 * non-strict-mode caller the mutation fails silently.
 */
export const EMPTY_BOARDS_FILE: Readonly<{ readonly boards: readonly BoardEntry[] }> =
  Object.freeze({
    boards: Object.freeze(boardsFileSchema.parse({ boards: [] }).boards),
  });
