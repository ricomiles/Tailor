import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BULLET_STATUSES,
  CANON_FILE,
  PROFILE_INCLUDES,
  WORK_INCLUDES,
  CANON_SENTINEL,
  basicsSchema,
  bulletSchema,
  canonDocumentSchema,
  educationEntrySchema,
  excludedSchema,
  profileSchema,
  renderingSchema,
  skillGroupSchema,
  summarySchema,
  workEntrySchema,
} from "../core/canon/canon-document.ts";

/**
 * The contract, tested against fixtures rather than against the seed.
 *
 * The shipped canon exercises almost none of what matters here: it carries no
 * bullet `status`, no placeholder token, and one `TODO` in a scalar `basics`
 * field. A suite that read only the seed would pass without ever running the
 * asymmetric-normalisation rule or the strictness that protects it — which is
 * the same constraint Story 1.8 inherits for its render-readiness gate.
 *
 * `core/` bans `node:test`, which is why these live here (AD-1).
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = join(REPO_ROOT, "adapters", "db", "seed", "resume.canon.seed.json");

/**
 * The shipped canon, re-read per call so no test can mutate another's input.
 *
 * Deliberately loose: every fixture below is a shape `CanonDocument` cannot
 * express — a deleted `name`, an added `staus` — which is the point.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above.
function seedDocument(): Record<string, any> {
  return JSON.parse(readFileSync(SEED, "utf8"));
}

const BULLET = {
  id: "b-1",
  text: "Cut p99 latency by 40%.",
  tags: ["perf"],
  weight: 3,
};

// ---------------------------------------------------------------------------
// The declarations this module exists to be the only home for.
// ---------------------------------------------------------------------------

test("the sentinel, the path and the statuses are declared here", () => {
  assert.equal(CANON_SENTINEL, "TODO");
  assert.equal(CANON_FILE, "data/resume.canon.json");
  assert.deepEqual([...BULLET_STATUSES], ["needs-number", "needs-content"]);
});

test("the module's export surface is pinned, so it cannot grow unnoticed", async () => {
  // The gateway has "exposes reads and nothing else"; this module had nothing.
  // A cross-unit contract that can gain exports silently is one nobody can
  // reason about from the outside.
  const contract = await import("../core/canon/canon-document.ts");
  assert.deepEqual(Object.keys(contract).sort(), [
    "BULLET_STATUSES",
    "CANON_FILE",
    "CANON_SENTINEL",
    "PROFILE_INCLUDES",
    "WORK_INCLUDES",
    "basicsSchema",
    "bulletSchema",
    "bulletStatusSchema",
    "bulletsPerRoleSchema",
    "canonDocumentSchema",
    "educationEntrySchema",
    "excludedSchema",
    "locationSchema",
    "pdfRenderingSchema",
    "profileIncludeSchema",
    "profileSchema",
    "renderingSchema",
    "skillGroupSchema",
    "summarySchema",
    "workEntrySchema",
    "workIncludeSchema",
  ]);
});

test("a summary and an exclusion rule are authored prose, never rewritten", () => {
  // Both use `authoredText` and neither was exercised, so the no-trim
  // guarantee was unverified in two of the three places it applies.
  const summary = summarySchema.parse({ id: "sum-1", tags: ["web3"], text: "  led a team  " });
  assert.equal(summary.text, "  led a team  ");

  const excluded = excludedSchema.parse({ skills: ["  x  "], rules: ["  never claim a number  "] });
  assert.deepEqual(excluded.rules, ["  never claim a number  "]);
  assert.deepEqual(excluded.skills, ["  x  "]);

  assert.throws(() => summarySchema.parse({ id: "s", tags: [], text: "   " }));
});

test("a skill group's weight obeys the same 1-5 contract a bullet's does", () => {
  const group = { id: "sk-1", category: "Languages", items: ["TypeScript"], weight: 3 };
  for (const weight of [0, 6, 2.5]) {
    assert.throws(() => skillGroupSchema.parse({ ...group, weight }), String(weight));
  }
  assert.equal(skillGroupSchema.parse(group).weight, 3);
});

test("the status tuple cannot be spliced out from under a consumer", () => {
  // Story 1.8's gate branches on both members. `Object.freeze` is shallow, so
  // the array itself has to be frozen, not just the object holding it.
  assert.throws(() => {
    (BULLET_STATUSES as unknown as string[]).push("needs-vibes");
  });
});

// ---------------------------------------------------------------------------
// Strictness. The round-1 finding: a typo used to vanish.
// ---------------------------------------------------------------------------

test("a misspelled status key is a parse failure, not a silently dropped field", () => {
  // The exact input that shipped green in round 1. Zod's default `z.object`
  // strips what it does not declare, so this parsed clean and returned a bullet
  // with no `status` — disarming Story 1.8's gate for that bullet, on a
  // hand-authored file, with no error anywhere in the system.
  const result = bulletSchema.safeParse({ ...BULLET, staus: "needs-number" });

  assert.equal(result.success, false);
  assert.match(JSON.stringify(result.error?.issues), /staus/);
});

test("an unknown key is refused at every level of the document", () => {
  for (const [label, run] of [
    ["bullet", () => bulletSchema.parse({ ...BULLET, weght: 2 })],
    ["basics", () => basicsSchema.parse({ ...seedDocument().basics, nmae: "x" })],
    ["rendering", () => renderingSchema.parse({ ...seedDocument().rendering, maxPage: 1 })],
    ["document", () => canonDocumentSchema.parse({ ...seedDocument(), reserved: true })],
  ] as const) {
    assert.throws(run, `${label} accepted an unknown key`);
  }
});

test("the authoring comments canon carries are declared, which is what makes strictness affordable", () => {
  const document = seedDocument();
  assert.ok("$comment" in document, "the seed carries a top-level $comment");
  assert.ok("$comment_maxPages" in (document.rendering as object));

  assert.doesNotThrow(() => canonDocumentSchema.parse(document));
  assert.doesNotThrow(() => bulletSchema.parse({ ...BULLET, $comment: "why this bullet" }));
});

// ---------------------------------------------------------------------------
// The asymmetry. Scalar basics normalise; nothing else does.
// ---------------------------------------------------------------------------

test("every one of the eight scalar basics fields maps the sentinel to absent", () => {
  const base = seedDocument().basics as Record<string, unknown>;
  const scalars = ["name", "label", "email", "phone"] as const;
  const nested = ["city", "region", "country", "remoteNote"] as const;

  for (const field of scalars) {
    const parsed = basicsSchema.parse({ ...base, [field]: CANON_SENTINEL });
    assert.equal(parsed[field], undefined, field);
  }
  for (const field of nested) {
    const parsed = basicsSchema.parse({
      ...base,
      location: { ...(base.location as object), [field]: CANON_SENTINEL },
    });
    assert.equal(parsed.location[field], undefined, `location.${field}`);
  }
});

test("normalisation is inside the parse, so no caller can skip it", () => {
  // There is no `normalizeBasics()` to forget. The only way to obtain a
  // `CanonBasics` is to parse, and parsing normalises.
  const parsed = basicsSchema.parse({ ...(seedDocument().basics as object), phone: CANON_SENTINEL });
  assert.equal(parsed.phone, undefined);
  // The transform leaves the key in place carrying `undefined`, which is what
  // "absent" has to mean for a renderer: falsy at the branch, and gone the
  // moment the value crosses a JSON boundary. Asserting the round trip is the
  // honest form of the claim — `Object.hasOwn` is still true.
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(parsed)), "phone"), false);
});

test("a sentinel outside scalar basics is returned verbatim", () => {
  // The two places the asymmetry is visible in the shipped canon: the LinkedIn
  // profile and the unresolved template. Both must survive untouched, because
  // Epic 4 has to show them unchanged.
  const profile = profileSchema.parse({
    network: "LinkedIn",
    username: CANON_SENTINEL,
    url: CANON_SENTINEL,
    include: "never",
  });
  assert.equal(profile.username, CANON_SENTINEL);
  assert.equal(profile.url, CANON_SENTINEL);

  const rendering = renderingSchema.parse(seedDocument().rendering);
  assert.equal(rendering.template, "TODO — typst | latex | html");
});

test("padding survives on every field outside scalar basics", () => {
  // The frozen rule: nothing outside the scalar `basics` fields is rewritten.
  // An earlier draft used `z.string().trim().min(1)` for all of these — the
  // pattern `core/boards/boards-file.ts` establishes, and correct there — which
  // silently trimmed two of the three fields the boundary names by hand. Every
  // fixture happened to be unpadded, so 191 tests agreed with a false contract.
  const profile = profileSchema.parse({
    network: " LinkedIn ",
    username: `  ${CANON_SENTINEL}  `,
    url: `  ${CANON_SENTINEL} `,
    include: "never",
  });
  assert.equal(profile.username, `  ${CANON_SENTINEL}  `);
  assert.equal(profile.url, `  ${CANON_SENTINEL} `);
  assert.equal(profile.network, " LinkedIn ");

  const rendering = seedDocument().rendering;
  assert.equal(
    renderingSchema.parse({ ...rendering, template: "  TODO — typst  " }).template,
    "  TODO — typst  ",
  );

  const bullet = bulletSchema.parse({ ...BULLET, id: " b-1 ", tags: [" perf "] });
  assert.equal(bullet.id, " b-1 ");
  assert.deepEqual(bullet.tags, [" perf "]);
});

test("a blank structural string is still refused, not repaired", () => {
  assert.throws(() => bulletSchema.parse({ ...BULLET, id: "   " }));
  assert.throws(() =>
    profileSchema.parse({ network: "x", username: "", url: "u", include: "never" }),
  );
});

test("a placeholder token inside a bullet's text is returned byte-identical", () => {
  const text = "Cut p99 latency by {{PERCENT}} across {{SERVICE_COUNT}} services.";
  assert.equal(bulletSchema.parse({ ...BULLET, text }).text, text);
});

test("a bullet's text is not trimmed — the sentinel rule does not reach it", () => {
  const text = "  a claim with deliberate padding  ";
  assert.equal(bulletSchema.parse({ ...BULLET, text }).text, text);
});

test("a bullet whose text is only whitespace is still refused", () => {
  assert.throws(() => bulletSchema.parse({ ...BULLET, text: "   " }));
});

// ---------------------------------------------------------------------------
// Bullet status — neither value appears in the shipped canon.
// ---------------------------------------------------------------------------

test("both bullet statuses parse", () => {
  for (const status of BULLET_STATUSES) {
    assert.equal(bulletSchema.parse({ ...BULLET, status }).status, status);
  }
});

test("a bullet with no status parses and carries none", () => {
  assert.equal(bulletSchema.parse(BULLET).status, undefined);
});

test("a status the gate has never heard of is refused", () => {
  assert.throws(() => bulletSchema.parse({ ...BULLET, status: "needs-vibes" }));
});

test("a weight outside the contract's 1-5 is refused", () => {
  for (const weight of [0, 6, 2.5, -1]) {
    assert.throws(() => bulletSchema.parse({ ...BULLET, weight }), String(weight));
  }
});

test("an include value the renderer has never heard of is refused", () => {
  // `WORK_INCLUDES` is a one-member tuple on purpose: the alternative is a
  // plain string, and `include: "when-spce"` would then parse and be treated as
  // "not when-space" — a role silently always-rendered instead of rendered when
  // there is space. Same argument for a profile's `always` / `never`.
  const role = seedDocument().work[0];
  assert.throws(() => workEntrySchema.parse({ ...role, include: "when-spce" }));
  assert.doesNotThrow(() => workEntrySchema.parse({ ...role, include: "when-space" }));

  const profile = seedDocument().basics.profiles[0];
  assert.throws(() => profileSchema.parse({ ...profile, include: "sometimes" }));
});

test("the include vocabularies cannot be spliced out from under a consumer", () => {
  for (const vocabulary of [PROFILE_INCLUDES, WORK_INCLUDES]) {
    assert.throws(() => {
      (vocabulary as unknown as string[]).push("whenever");
    });
  }
});

// ---------------------------------------------------------------------------
// Current roles and in-progress degrees both say so with null.
// ---------------------------------------------------------------------------

test("endDate null means current, for a role and for a degree alike", () => {
  const role = seedDocument().work as Record<string, unknown>[];
  assert.equal(workEntrySchema.parse({ ...role[0], endDate: null }).endDate, null);

  const degree = (seedDocument().education as Record<string, unknown>[])[0];
  assert.equal(educationEntrySchema.parse({ ...degree, endDate: null }).endDate, null);
});

test("an absent endDate key is refused — null is the statement, absence is drift", () => {
  const role = seedDocument().work[0];
  delete role.endDate;
  assert.throws(() => workEntrySchema.parse(role));
});

// ---------------------------------------------------------------------------
// Parse failures name what is wrong.
// ---------------------------------------------------------------------------

test("an absent basics.name is a parse failure naming the field", () => {
  const document = seedDocument();
  delete document.basics.name;
  const result = canonDocumentSchema.safeParse(document);

  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["basics", "name"]);
});

test("a bullet with no text names its own path, not just the document's", () => {
  const document = seedDocument();
  delete document.work[0].bullets[0].text;

  const result = canonDocumentSchema.safeParse(document);

  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["work", 0, "bullets", 0, "text"]);
});

// ---------------------------------------------------------------------------
// The file this repo actually ships.
// ---------------------------------------------------------------------------

test("the shipped seed parses through the schema", () => {
  // Read from disk, not rebuilt from constants: this is the one assertion that
  // the contract and the committed document still agree.
  assert.doesNotThrow(() => canonDocumentSchema.parse(seedDocument()));
});

test("the shipped seed carries no bullet status and no placeholder token", () => {
  // Which is exactly why every case above is a fixture. If this ever fails,
  // the seed has grown a case worth asserting against directly.
  const document = canonDocumentSchema.parse(seedDocument());
  const bullets = document.work.flatMap((role) => role.bullets);

  assert.ok(bullets.length > 0);
  assert.equal(bullets.filter((bullet) => bullet.status !== undefined).length, 0);
  assert.equal(bullets.filter((bullet) => bullet.text.includes("{{")).length, 0);
});

test("the seed's phone is the sentinel, and the parse makes it absent", () => {
  assert.equal((seedDocument().basics as Record<string, unknown>).phone, CANON_SENTINEL);
  assert.equal(canonDocumentSchema.parse(seedDocument()).basics.phone, undefined);
});
