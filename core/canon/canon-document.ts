import { z } from "zod";

/**
 * The shape of `data/resume.canon.json` — the canonical resume.
 *
 * Everything true about Rico lives in that one hand-authored, gitignored,
 * irreplaceable file. Three stories need it next (1.7 renders it, 1.8 gates on
 * it, 1.10 mocks around it), and three readers would mean three ideas of the
 * shape and three chances to normalise the unfilled-field sentinel
 * differently. So the shape, the sentinel and the normalisation rule are
 * declared here and only here, and `adapters/canon/canon-gateway.ts` is the
 * one module that opens the file — a rule `scripts/project-invariants.mjs`
 * enforces against the whole app source tree rather than asserting in prose.
 *
 * AD-16 makes `core/` the only legal home for a cross-unit type, and AD-1 bans
 * every Node built-in here, which is why the module that reads the disk cannot
 * be this one. `core/` may import `zod` and nothing else outward (AD-1).
 */

/**
 * The path, relative to the app root, declared once.
 *
 * Imported by `adapters/canon/canon-gateway.ts`, which reads the file, and by
 * `adapters/db/bootstrap.ts`, which seeds it. Two literals naming one path is
 * drift this repo has already paid for once — three unlinked spellings of the
 * migrations directory (`adapters/db/bootstrap.ts:70-77`) — and the same
 * mistake here would have bootstrap seed one file while the gateway read
 * another, with every check green.
 *
 * Forward slashes rather than a `join()`: `core/` cannot import `node:path`,
 * and the adapters that consume this join it against their own root.
 */
export const CANON_FILE = "data/resume.canon.json";

/**
 * The unfilled-field sentinel: the literal string `TODO`.
 *
 * Canon is authored by hand and a field that has no true value yet carries
 * this rather than being deleted, so the gap stays visible to the author. It
 * is normalised to *absent* for scalar `basics` fields only — see
 * `basicsScalarString` — and returned verbatim everywhere else.
 */
export const CANON_SENTINEL = "TODO";

/**
 * The two states a bullet can be in short of "ready".
 *
 * `needs-number` means the text carries an unfilled placeholder; `needs-content`
 * means the bullet is not written yet. Story 1.8's readiness gate refuses a
 * render for a selected bullet in either state, which is why an unknown value
 * here has to be a parse failure rather than a silently dropped field.
 *
 * A frozen `as const` tuple rather than an `enum`: `erasableSyntaxOnly`
 * forbids `enum` (see `core/errors/error-envelope.ts:26-36`), and freezing
 * stops an in-place splice from corrupting the one shared array everywhere at
 * once.
 */
export const BULLET_STATUSES = Object.freeze([
  "needs-number",
  "needs-content",
] as const);

/** Derived from the tuple, so the schema and the list cannot drift. */
export const bulletStatusSchema = z.enum(BULLET_STATUSES);

export type BulletStatus = z.infer<typeof bulletStatusSchema>;

/**
 * Whether a profile is rendered. `never` is how the canon carries a profile it
 * knows about and refuses to print — the LinkedIn row in the seed is `never`
 * with a `TODO` username, and both must survive a read untouched.
 */
export const PROFILE_INCLUDES = Object.freeze(["always", "never"] as const);

export const profileIncludeSchema = z.enum(PROFILE_INCLUDES);

export type ProfileInclude = z.infer<typeof profileIncludeSchema>;

/**
 * The one value `work[].include` may take. A role carrying it is rendered only
 * if the page budget allows; a role without the key is always rendered.
 *
 * A one-member tuple looks odd and is deliberate: it is the only value the
 * canon contract documents, and a plain string here would accept
 * `include: "when-spce"` as a role that is now silently always rendered.
 */
export const WORK_INCLUDES = Object.freeze(["when-space"] as const);

export const workIncludeSchema = z.enum(WORK_INCLUDES);

export type WorkInclude = z.infer<typeof workIncludeSchema>;

/**
 * Every object below is **strict**: an unknown key is a parse failure naming
 * it, never a key quietly dropped.
 *
 * This is the single most load-bearing decision in the file. Zod's default
 * `z.object` *strips* what it does not declare, so a hand-authored `staus:`
 * typo would parse clean and return a bullet with no `status` — disarming
 * Story 1.8's readiness gate, with no error anywhere, on the one file this
 * epic exists to protect. Strictness on a hand-authored document is only
 * affordable because the authoring comments below are declared as fields.
 *
 * Canon carries `$comment` at four sites today. It is declared on every object
 * rather than on those four, because the next comment will be written wherever
 * the next question comes up and a comment must never cost a boot. A
 * differently-suffixed key (`$comment_maxPages` is the one that exists) has to
 * be declared where it appears — that is the price of refusing `staus`.
 */
const AUTHORING_COMMENT = { $comment: z.string().optional() };

/**
 * A scalar `basics` string, and the whole of the normalisation rule.
 *
 * The sentinel maps to `undefined` *inside the schema*, not beside it. A
 * `normalizeBasics()` helper next to the parse is a function a caller can
 * forget; mapping it here means every parse normalises and there is no
 * unnormalised path to reach. It also keeps the asymmetry legible in one
 * place: scalar `basics` uses this, everything else uses a plain string.
 *
 * `.trim().min(1)` before the transform, so `"   "` and `""` are parse
 * failures rather than a third, undocumented way of spelling "absent". A field
 * that is genuinely unknown carries the sentinel or is omitted.
 *
 * The result is `string | undefined` even where the key is required (`name`),
 * which is the honest type: canon can carry `name: "TODO"`, and a consumer
 * that must render a name has to say what it does when there is none.
 */
const basicsScalarString = z
  .string()
  .trim()
  .min(1)
  .transform((value) => (value === CANON_SENTINEL ? undefined : value));

/**
 * A non-blank string, returned exactly as authored.
 *
 * `.refine()` rather than `.trim()`, and this is the whole normalisation rule
 * stated once: **outside the scalar `basics` fields, nothing is rewritten.**
 * The value that comes out of a parse is the value that was in the file, byte
 * for byte.
 *
 * An earlier draft used `z.string().trim().min(1)` here — the pattern
 * `core/boards/boards-file.ts` establishes, and correct there. It is wrong on
 * canon: it silently trimmed `profiles[].username`, `profiles[].url` and
 * `rendering.template`, three fields the story's own boundary names as having
 * to come back untouched. Nothing broke, because the shipped file happens to
 * carry no padded value and so no fixture did either — which is exactly how a
 * contract rots without a test noticing.
 *
 * Blank is still refused. An empty or whitespace-only value is damage, not
 * authorship, and it is refused rather than repaired: bootstrap has no write
 * path to canon and neither does this module.
 */
const preservedString = z
  .string()
  .refine((value) => value.trim().length > 0, "must not be blank");

/**
 * Authored prose — a bullet's claim, a summary, an exclusion rule.
 *
 * A placeholder token inside a bullet's `text` must come back byte-identical,
 * and Epic 4 substitutes into that very string.
 */
const authoredText = preservedString;

/**
 * Everything structural: ids, tags, org names, dates, categories.
 *
 * The same guarantee as `authoredText`, kept under its own name because the two
 * say different things to a reader — one is prose a human wrote to be read, the
 * other is a token something else resolves against. Neither is ever rewritten.
 */
const token = preservedString;

/**
 * Where the resume says its author is.
 *
 * All four are scalar `basics` fields, so all four normalise the sentinel, and
 * all four are optional: an absent contact field vanishes cleanly from the
 * rendered document, which is the behaviour the epic requires and the reason
 * `TODO` must never reach output.
 */
export const locationSchema = z.strictObject({
  ...AUTHORING_COMMENT,
  city: basicsScalarString.optional(),
  region: basicsScalarString.optional(),
  country: basicsScalarString.optional(),
  remoteNote: basicsScalarString.optional(),
});

export type CanonLocation = z.infer<typeof locationSchema>;

/**
 * One external profile.
 *
 * Deliberately *not* sentinel-aware: the seed's LinkedIn row carries
 * `username: "TODO"` and `url: "TODO"` with `include: "never"`, and the
 * gateway returns both verbatim. Normalisation is scalar `basics` only, and
 * this is one of the two places that asymmetry is visible.
 *
 * `url` is a plain string, not `z.url()`, for the same reason: `TODO` is not a
 * URL and refusing it here would make the shipped seed unreadable.
 */
export const profileSchema = z.strictObject({
  ...AUTHORING_COMMENT,
  network: token,
  username: token,
  url: token,
  include: profileIncludeSchema,
});

export type CanonProfile = z.infer<typeof profileSchema>;

/** One positioning angle, selectable the way a bullet is. */
export const summarySchema = z.strictObject({
  ...AUTHORING_COMMENT,
  id: token,
  tags: z.array(token),
  text: authoredText,
});

export type CanonSummary = z.infer<typeof summarySchema>;

/**
 * The contact block and the selectable summaries.
 *
 * Every scalar here is sentinel-aware and every key is required — required
 * *key*, not required value. `phone` is `TODO` in the shipped canon and comes
 * back absent; `name` is `TODO`-able in principle and would come back absent
 * too. An entirely missing `name` key is a different thing and fails the
 * parse naming `basics.name`, because a canon that never mentions a name is
 * damaged rather than incomplete.
 */
export const basicsSchema = z.strictObject({
  ...AUTHORING_COMMENT,
  name: basicsScalarString,
  label: basicsScalarString.optional(),
  email: basicsScalarString.optional(),
  phone: basicsScalarString.optional(),
  location: locationSchema,
  profiles: z.array(profileSchema),
  summaries: z.array(summarySchema),
});

export type CanonBasics = z.infer<typeof basicsSchema>;

/**
 * One true claim about one role.
 *
 * `id` is the only thing the model may cite, and every validation check
 * resolves back to `text`. `weight` is the 1-5 selection priority the canon
 * contract fixes; an out-of-range or fractional weight is a parse failure
 * rather than a silently mis-ordered queue.
 *
 * `note` is authoring guidance for the model and is never rendered. It is
 * declared so it cannot be mistaken for drift, not because anything here
 * reads it.
 */
export const bulletSchema = z.strictObject({
  ...AUTHORING_COMMENT,
  id: token,
  text: authoredText,
  tags: z.array(token),
  weight: z.number().int().min(1).max(5),
  status: bulletStatusSchema.optional(),
  note: z.string().optional(),
});

export type CanonBullet = z.infer<typeof bulletSchema>;

/**
 * One role.
 *
 * `endDate: null` means current — the convention the whole repo uses at every
 * boundary. `context` is background handed to the model, never rendered copy.
 */
export const workEntrySchema = z.strictObject({
  ...AUTHORING_COMMENT,
  id: token,
  company: token,
  position: token,
  location: token,
  startDate: token,
  endDate: token.nullable(),
  context: z.string().optional(),
  include: workIncludeSchema.optional(),
  bullets: z.array(bulletSchema),
});

export type CanonWorkEntry = z.infer<typeof workEntrySchema>;

/**
 * One degree.
 *
 * `endDate` is nullable for the same reason `work[].endDate` is: a degree in
 * progress has no end date, and the alternative — a hand-edit writing `null`
 * against a non-nullable field — would make the whole canon unreadable over a
 * change that means "still studying".
 */
export const educationEntrySchema = z.strictObject({
  ...AUTHORING_COMMENT,
  id: token,
  institution: token,
  studyType: token,
  area: token,
  startDate: token,
  endDate: token.nullable(),
  note: z.string().optional(),
});

export type CanonEducationEntry = z.infer<typeof educationEntrySchema>;

/** One weighted, categorised group of skills. */
export const skillGroupSchema = z.strictObject({
  ...AUTHORING_COMMENT,
  id: token,
  category: token,
  items: z.array(token),
  weight: z.number().int().min(1).max(5),
  note: z.string().optional(),
});

export type CanonSkillGroup = z.infer<typeof skillGroupSchema>;

/**
 * The explicit negatives.
 *
 * `rules` is injected into the model's system prompt **verbatim**, never
 * paraphrased or summarised, so these strings are authored prose rather than
 * tokens and are checked but not trimmed.
 */
export const excludedSchema = z.strictObject({
  ...AUTHORING_COMMENT,
  skills: z.array(token),
  rules: z.array(authoredText),
});

export type CanonExcluded = z.infer<typeof excludedSchema>;

/** The per-role bullet budget selection must respect. */
export const bulletsPerRoleSchema = z.strictObject({
  ...AUTHORING_COMMENT,
  current: z.number().int().min(0),
  recent: z.number().int().min(0),
  older: z.number().int().min(0),
});

export type CanonBulletsPerRole = z.infer<typeof bulletsPerRoleSchema>;

/**
 * `requireTextLayer` is non-negotiable and is still declared as a boolean
 * rather than pinned to `true`: this module describes what the file says, and
 * Story 1.9's export is what refuses to ship a PDF without an extractable
 * text layer. A schema that could not represent `false` would move that
 * refusal into a parse error naming nothing useful.
 */
export const pdfRenderingSchema = z.strictObject({
  ...AUTHORING_COMMENT,
  requireTextLayer: z.boolean(),
});

export type CanonPdfRendering = z.infer<typeof pdfRenderingSchema>;

/**
 * The rendering budget.
 *
 * `template` is a plain string, not an enum of the three template names: the
 * shipped canon carries the literal `"TODO — typst | latex | html"`, and the
 * matrix requires it back verbatim. Normalisation is scalar `basics` only, and
 * this is the other place that asymmetry is visible.
 *
 * `$comment_maxPages` is declared because it exists — the one suffixed
 * authoring comment in the file. Strictness is what makes declaring it
 * necessary, and declaring it is what makes strictness affordable.
 */
export const renderingSchema = z.strictObject({
  ...AUTHORING_COMMENT,
  $comment_maxPages: z.string().optional(),
  maxPages: z.number().int().min(1),
  bulletsPerRole: bulletsPerRoleSchema,
  template: token,
  pdf: pdfRenderingSchema,
});

export type CanonRendering = z.infer<typeof renderingSchema>;

/**
 * The whole document.
 *
 * `schemaVersion` is a non-empty string rather than a pinned `"1.0"`: nothing
 * in the app branches on it yet, and pinning it would turn the first version
 * bump into an unreadable canon before any migration path existed. The
 * strictness above is what actually catches a shape that has moved.
 */
export const canonDocumentSchema = z.strictObject({
  ...AUTHORING_COMMENT,
  schemaVersion: token,
  basics: basicsSchema,
  work: z.array(workEntrySchema),
  education: z.array(educationEntrySchema),
  skills: z.array(skillGroupSchema),
  excluded: excludedSchema,
  rendering: renderingSchema,
});

export type CanonDocument = z.infer<typeof canonDocumentSchema>;
