#!/usr/bin/env node
/**
 * Proves the AD-1 core dependency rule still fires.
 *
 * A guardrail nobody exercises stops working silently: a renamed rule, a
 * resolver that quietly returns "unknown", an element pattern that stops
 * matching, a plugin major that drops a setting — every one of those turns
 * the rule into a no-op that still exits 0. So this script lints the
 * deliberately-violating fixtures with the *shipping* config
 * (`eslint.config.mjs`, with its ignores disabled) and asserts, per fixture,
 * that the expected violation fired, that it came from a boundary-enforcing
 * rule, and that the message names the offending import.
 *
 * Each fixture declares its own expectation on its first line:
 *
 *   // EXPECT: clean
 *   // EXPECT: violation "next/server"
 *
 * A fixture with no marker is a support file and must lint clean.
 *
 * Four things are checked beyond the per-fixture expectations:
 *
 *   1. Every violation class is covered. Adding a fixture is not enough — the
 *      classes themselves must all be present, or a whole escape route can be
 *      dropped without any check going red.
 *   2. Every relative escape is caught by a *path-resolving* rule, not by
 *      string matching on the specifier. String matching is what misses the
 *      relative form, and passing here by coincidence would hide that.
 *   3. A file expected to lint clean really does resolve its relative imports.
 *      An unresolved specifier is skipped by the boundaries rule, so a clean
 *      fixture whose target was renamed would keep passing while asserting
 *      nothing.
 *   4. The rule blocks the build. Two halves: a violating file dropped into
 *      the real `core/` tree makes `pnpm lint` exit non-zero naming the
 *      import, and `package.json`'s `build` script actually chains that lint
 *      step. (`pnpm build` itself is not spawned here — `build` runs this
 *      script, so that would recurse.)
 *
 * Beyond the guardrail, this script carries the project invariants that must
 * block the build and have nowhere else to live: the script bodies the `build`
 * chain names, the e2e freshness marker, the ban on `drizzle-kit push`, and the
 * existence of the migration journal. They are here because `build` runs this
 * file and runs nothing else that could hold them.
 */

import { ESLint } from "eslint";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RESOLVE_EXTENSIONS } from "../eslint.config.mjs";
import { MARKER, observedHash, recordedHash } from "./e2e-gate.mjs";
import {
  JOURNAL_FILE,
  MIGRATIONS_DIR,
  PUSH_SCAN_EXEMPT,
  projectInvariantProblems,
} from "./project-invariants.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "tools", "boundary-fixtures");

/**
 * One source of truth for which fixture files are collected and which are
 * linted. If the walk and the lint glob drift apart, a fixture authored with
 * an unlisted extension is silently skipped and its EXPECT marker asserts
 * nothing.
 */
const FIXTURE_EXTENSIONS = [
  "ts",
  "tsx",
  "mts",
  "cts",
  "js",
  "jsx",
  "mjs",
  "cjs",
];
const FIXTURE_GLOB = `tools/boundary-fixtures/**/*.{${FIXTURE_EXTENSIONS.join(",")}}`;

/**
 * Rules that decide by resolving the specifier to a file on disk.
 * `RESOLVE_EXTENSIONS` is imported from the shipping config rather than
 * restated: two hand-maintained copies drifted in precedence once already,
 * which let this script vouch for a resolution ESLint never performed.
 */
const PATH_RESOLVING_RULES = new Set([
  "boundaries/element-types",
  "tailor/no-outward-relative-reference",
]);

/**
 * Every rule that is allowed to satisfy an `EXPECT: violation`. Without this,
 * an unrelated rule whose message happens to contain the specifier would be
 * accepted as proof that a dead boundary rule is alive.
 */
const BOUNDARY_RULES = new Set([
  ...PATH_RESOLVING_RULES,
  "no-restricted-imports",
  "tailor/no-deferred-module-loading",
  "tailor/no-http-response-in-core",
  "tailor/no-http-status-in-core",
]);

/** Rules that must be loaded for a file under core/, or nothing is enforced. */
const REQUIRED_CORE_RULES = [
  "boundaries/element-types",
  "no-restricted-imports",
  "tailor/no-outward-relative-reference",
  "tailor/no-deferred-module-loading",
  "tailor/no-http-response-in-core",
  "tailor/no-http-status-in-core",
];

/**
 * Every violation class, as the specifier that must be rejected somewhere in
 * the fixture set. Keyed by the class name so a failure reads like the story.
 */
const REQUIRED_ROWS = {
  "Alias escape": "@/adapters/db/repository",
  "Relative escape": "../../adapters/db/repository",
  "Relative escape from the core root": "../adapters/db/repository",
  "Escape to a file at the adapters root": "../../adapters/root-repository",
  "Escape into components/": "../../components/resume-document/document",
  "Escape into app/": "../../app/api/handler",
  "Escape to a .mts target": "../../adapters/db/modern-repository",
  "Framework escape": "next/server",
  "Node built-in (prefixed)": "node:fs",
  "Node built-in (bare)": "path",
  "Forbidden package (ORM)": "drizzle-orm",
  "Forbidden package (browser)": "playwright",
  "Deferred escape via import()": "node:child_process",
  "Deferred escape via require()": "drizzle-kit",
  "Deferred escape via require.resolve()": "better-sqlite3",
  "Deferred escape with a non-literal specifier": "<non-literal>",
  "Deferred escape via a `require` value reference": "<require-as-value>",
  "Deferred escape via process.getBuiltinModule()": "node:os",
  "Deferred escape via import.meta.resolve()": "node:url",
  "Re-export escape (export … from)": "../../adapters/db/reexport-target",
  "Re-export escape (export * from)": "../../adapters/root-repository",
  "Relative escape whose target does not resolve": "../../adapters/db/not-on-disk",
  "Relative escape into an unclassified directory":
    "../../../../scripts/verify-boundaries.mjs",
  "Alias escape into an unclassified directory": "@/scripts/verify-boundaries.mjs",
  "Forbidden package (UI runtime)": "react",
  "Forbidden package (client state)": "zustand",
  // Not an import at all: `Response` is a global, so these classes are the only
  // thing standing between core/ and an HTTP-shaped error. The sentinel is the
  // offending construct rather than a specifier, the way the non-literal and
  // require-as-value rows above are.
  //
  // One row per *clause*, not one per rule. Each rule recognises two subjects
  // under two different conditions, and a single row would let either half be
  // deleted with nothing going red — which is the precise failure these rows
  // exist to prevent.
  "HTTP response built in core": "Response",
  "HTTP response built in core (Next form)": "NextResponse",
  "HTTP status carried in core (unconditional name)": "statusCode",
  "HTTP status carried in core (numeric status literal)": "status",
  // The other two unconditional names. Both were reachable by the rule and
  // exercised by nothing: narrowing the set to ["statusCode"] left every
  // fixture, probe and row green, which is precisely the rot these rows exist
  // to catch.
  "HTTP status carried in core (name: httpStatus)": "httpStatus",
  "HTTP status carried in core (name: statusText)": "statusText",
};

const failures = [];
const fail = (message) => failures.push(message);

// ---------------------------------------------------------------------------
// Probe housekeeping. The probe is a real violating file written into the real
// core/ tree, so it must never survive this process: left behind it breaks
// lint and build for everyone and is committable.
// ---------------------------------------------------------------------------

const PROBE_DIR = join(ROOT, "core", "canon");
const PROBE_PREFIX = "__boundary-probe.";

/**
 * One probe per enforcement mechanism. A single alias-form probe only ever
 * proved `no-restricted-imports`; the path-resolving and deferred rules could
 * both have gone dead with this check still green.
 */
const PROBES = [
  {
    mechanism: "no-restricted-imports (alias form)",
    specifier: "@/adapters/db/repository",
    body: (specifier) =>
      `import { repository } from "${specifier}";\n\nexport const leaked = repository;\n`,
  },
  {
    mechanism: "tailor/no-outward-relative-reference (path form)",
    specifier: "../../adapters/db/repository",
    body: (specifier) => `export * from "${specifier}";\n`,
  },
  {
    mechanism: "tailor/no-deferred-module-loading (deferred form)",
    specifier: "node:os",
    body: (specifier) =>
      `export const os = process.getBuiltinModule("${specifier}");\n`,
  },
  {
    // No import to resolve — `Response` is a global. The probe is the only
    // thing proving this fires against the real core/ tree rather than only
    // against a fixture the shipping lint glob ignores.
    mechanism: "tailor/no-http-response-in-core (HTTP response form)",
    specifier: "Response",
    body: (specifier) => `export const refused = new ${specifier}("no");\n`,
  },
  {
    mechanism: "tailor/no-http-response-in-core (Next response form)",
    specifier: "NextResponse",
    body: (specifier) =>
      `declare const ${specifier}: { json(body: unknown): unknown };\n` +
      `export const refused = ${specifier}.json({ code: "internal" });\n`,
  },
  {
    mechanism: "tailor/no-http-status-in-core (unconditional name form)",
    specifier: "statusCode",
    body: (specifier) => `export const refused = { ${specifier}: 500 };\n`,
  },
  {
    // The numeric clause is the one with a condition on it, so it is the one
    // that can be narrowed into a no-op without any fixture noticing.
    mechanism: "tailor/no-http-status-in-core (numeric status literal form)",
    specifier: "status",
    body: (specifier) => `export const refused = { ${specifier}: 404 };\n`,
  },
  {
    // Both Response probes above fire through the `Identifier` visitor, so the
    // two clauses the rule's own comment argues hardest for — the binding
    // spelled around entirely — were proven against fixtures only, never
    // against the real core/ tree the Suggested Review Order claims for them.
    mechanism: "tailor/no-http-response-in-core (global lookup form)",
    specifier: "Response",
    body: (specifier) => `export const grabbed: unknown = globalThis.${specifier};\n`,
  },
  {
    mechanism: "tailor/no-http-response-in-core (destructured form)",
    specifier: "Response",
    body: (specifier) =>
      `const { ${specifier}: Grabbed } = globalThis;\n` +
      `export const grabbed: unknown = Grabbed;\n`,
  },
  {
    // The accessor position: the shape an Error subclass actually reaches for,
    // and the one the visitor set missed entirely until this review.
    mechanism: "tailor/no-http-status-in-core (accessor form)",
    specifier: "statusCode",
    body: (specifier) =>
      `export class Refused extends Error {\n` +
      `  get ${specifier}(): number {\n    return 404;\n  }\n}\n`,
  },
].map((probe, index) => ({
  ...probe,
  path: join(PROBE_DIR, `${PROBE_PREFIX}${process.pid}.${index}.ts`),
}));

/**
 * Only probes belonging to processes that are gone. Deleting every probe
 * regardless of owner meant two concurrent runs destroyed each other's, and
 * the survivor reported the guardrail broken.
 */
function removeStaleProbes() {
  if (!existsSync(PROBE_DIR)) return;
  for (const entry of readdirSync(PROBE_DIR)) {
    if (!entry.startsWith(PROBE_PREFIX)) continue;
    const pid = Number.parseInt(entry.slice(PROBE_PREFIX.length), 10);
    if (Number.isNaN(pid)) {
      rmSync(join(PROBE_DIR, entry), { force: true });
      continue;
    }
    if (pid === process.pid) continue;
    try {
      process.kill(pid, 0); // Owner still alive — leave its probe alone.
    } catch {
      rmSync(join(PROBE_DIR, entry), { force: true });
    }
  }
}

const cleanUpProbe = () => {
  for (const probe of PROBES) rmSync(probe.path, { force: true });
};
process.on("exit", cleanUpProbe);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanUpProbe();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

// ---------------------------------------------------------------------------
// Fixture helpers.
// ---------------------------------------------------------------------------

/** `// EXPECT: clean` | `// EXPECT: violation "spec"` | support file. */
function readExpectation(source) {
  const firstLine = source.split("\n", 1)[0];
  const marker = /^\/\/\s*EXPECT:\s*(.+)$/.exec(firstLine.trim());
  if (!marker) return { kind: "support" };
  const directive = marker[1].trim();
  if (directive === "clean") return { kind: "clean" };
  const violation = /^violation\s+"(.+)"$/.exec(directive);
  if (violation) return { kind: "violation", source: violation[1] };
  return { kind: "malformed", directive };
}

/** Static import/export specifiers, enough to spot a dangling clean fixture. */
function staticSpecifiers(source) {
  const found = [];
  const pattern = /(?:from|import)\s*["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(source)) !== null) found.push(match[1]);
  return found;
}

/** Node-style resolution over the same extensions ESLint is configured with. */
function resolvesOnDisk(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const isFile = (p) => existsSync(p) && statSync(p).isFile();
  if (isFile(base)) return true;
  if (RESOLVE_EXTENSIONS.some((ext) => isFile(base + ext))) return true;
  return RESOLVE_EXTENSIONS.some((ext) => isFile(join(base, `index${ext}`)));
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (FIXTURE_EXTENSIONS.some((ext) => entry.name.endsWith(`.${ext}`)))
      yield full;
  }
}

// ---------------------------------------------------------------------------
// 1. Lint the fixtures with the shipping config.
// ---------------------------------------------------------------------------

removeStaleProbes();

if (!existsSync(FIXTURES)) {
  console.error(
    `Core boundary guardrail is NOT intact:\n\n  - ${relative(ROOT, FIXTURES)} does not exist. ` +
      "The fixtures are the only thing proving the rule still fires; without them nothing is verified.\n",
  );
  process.exit(1);
}

const fixtureFiles = [...walk(FIXTURES)].sort();
if (fixtureFiles.length === 0) {
  console.error(
    `Core boundary guardrail is NOT intact:\n\n  - No fixtures found under ${relative(ROOT, FIXTURES)}.\n`,
  );
  process.exit(1);
}

/**
 * ESLint's own unruled notice that a disable directive did nothing, emitted
 * because the core block sets `noInlineConfig`. It is a *warning*, and every
 * other warning fails its fixture — which is why the inline-config bypass was
 * the one violation class the story shipped with no fixture at all.
 *
 * Tolerated here, and required below: the notice cannot be produced by a
 * boundary rule, so its presence is itself the proof that `noInlineConfig` is
 * behaviourally live rather than merely present in the resolved config.
 */
const isInlineConfigNotice = (m) =>
  m.severity === 1 && m.ruleId === null && m.message.includes("noInlineConfig");

let inlineConfigNoticeSeen = false;

const eslint = new ESLint({ cwd: ROOT, ignore: false });
const results = await eslint.lintFiles([FIXTURE_GLOB]);
const byPath = new Map(results.map((r) => [r.filePath, r]));

/** Specifiers that were actually rejected, mapped to the rules that rejected them. */
const rejected = new Map();

for (const file of fixtureFiles) {
  const rel = relative(ROOT, file);
  const source = readFileSync(file, "utf8");
  const expectation = readExpectation(source);
  const result = byPath.get(file);

  if (!result) {
    fail(
      `${rel}: never linted — it falls outside the lint glob, so it asserts nothing.`,
    );
    continue;
  }

  const errors = result.messages.filter((m) => m.severity === 2);
  const warnings = result.messages.filter(
    (m) => m.severity === 1 && !isInlineConfigNotice(m),
  );
  if (result.messages.some(isInlineConfigNotice)) inlineConfigNoticeSeen = true;
  const describe = (m) => `[${m.ruleId}] ${m.message}`;

  if (warnings.length > 0) {
    fail(
      `${rel}: boundary findings must be errors, never warnings — got ${warnings
        .map(describe)
        .join("; ")}`,
    );
  }

  switch (expectation.kind) {
    case "malformed":
      fail(`${rel}: unreadable EXPECT marker "${expectation.directive}".`);
      break;

    case "support":
    case "clean": {
      // A clean fixture only proves something if its imports actually resolve.
      // An unresolved specifier is skipped by boundaries/element-types, so a
      // renamed or deleted target turns this fixture into a silent pass.
      for (const specifier of staticSpecifiers(source)) {
        if (specifier.startsWith(".") && !resolvesOnDisk(file, specifier)) {
          fail(
            `${rel}: expected to lint clean, but '${specifier}' does not resolve on disk. ` +
              "An unresolved specifier is skipped by the path-resolving rule, so this fixture " +
              "would pass without exercising anything.",
          );
        }
      }
      if (errors.length > 0) {
        fail(
          `${rel}: expected to lint clean, got ${errors.map(describe).join("; ")}`,
        );
      }
      break;
    }

    case "violation": {
      // The quoted form, not a bare substring: the bare-built-in row asserts
      // on "path", which any message mentioning a path would satisfy — letting
      // an unrelated rule vouch for a dead boundary rule.
      const quoted = `'${expectation.source}'`;
      const naming = errors.filter(
        (m) => BOUNDARY_RULES.has(m.ruleId) && m.message.includes(quoted),
      );
      if (errors.length === 0) {
        fail(
          `${rel}: expected a violation for '${expectation.source}', got none — the guardrail is not firing.`,
        );
      } else if (naming.length === 0) {
        fail(
          `${rel}: no boundary rule named ${quoted}. Errors seen: ${errors
            .map(describe)
            .join("; ")}`,
        );
      } else {
        const rules = rejected.get(expectation.source) ?? new Set();
        for (const m of naming) rules.add(m.ruleId);
        rejected.set(expectation.source, rules);
      }
      break;
    }
  }
}

// The inline-config bypass, asserted as behaviour rather than as a setting.
// `calculateConfigForFile` below still pins `noInlineConfig: true`, but that
// only proves the flag is *present*: an ESLint semantics change, or the core
// block being re-scoped so these files no longer carry its `linterOptions`,
// would leave that assertion green with the guardrail wide open. The notice is
// emitted only when a real disable directive was really ignored.
if (!inlineConfigNoticeSeen) {
  fail(
    "No fixture exercised the inline-config bypass. `inline-config-bypass.ts` should carry a " +
      "`// eslint-disable-next-line` above a violating construct and still be rejected; ESLint's " +
      "\"has no effect because you have 'noInlineConfig'\" notice is what proves the flag is live.",
  );
}

// ---------------------------------------------------------------------------
// 2. Every class is covered, and every relative escape is path-resolved.
// ---------------------------------------------------------------------------

for (const [row, source] of Object.entries(REQUIRED_ROWS)) {
  if (!rejected.has(source)) {
    fail(`Violation class "${row}" is unproven: no fixture rejected '${source}'.`);
    continue;
  }
  if (!source.startsWith(".")) continue;
  const rules = rejected.get(source);
  if (![...rules].some((rule) => PATH_RESOLVING_RULES.has(rule))) {
    fail(
      `"${row}" ('${source}') was caught only by ${[...rules].join(", ")}. ` +
        "A relative escape must be caught by a path-resolving rule — string matching on " +
        "specifiers misses the relative form in general, and passing here by coincidence hides that.",
    );
  }
}

// ---------------------------------------------------------------------------
// 2b. The rules are actually loaded for core files — and deliberately not for
// the rest. A fixture that lints clean because no rule ran proves nothing, and
// `adapters/db/legal-inward.ts` was exactly that: the boundary config is
// scoped to core files, so its "clean" result never demonstrated that an
// inward import is permitted.
// ---------------------------------------------------------------------------

const coreCleanFixture = join(FIXTURES, "core", "canon", "clean.ts");
const inwardFixture = join(FIXTURES, "adapters", "db", "legal-inward.ts");

if (existsSync(coreCleanFixture)) {
  const config = await eslint.calculateConfigForFile(coreCleanFixture);
  for (const rule of REQUIRED_CORE_RULES) {
    const entry = config.rules?.[rule];
    const severity = Array.isArray(entry) ? entry[0] : entry;
    if (severity !== 2 && severity !== "error") {
      fail(
        `${relative(ROOT, coreCleanFixture)}: '${rule}' is not loaded as an error for core files ` +
          `(got ${JSON.stringify(entry ?? null)}). Every clean-fixture pass under core/ would be vacuous.`,
      );
    }
  }
  // Every rule above is opt-out by comment without this. One
  // `// eslint-disable-next-line` silences the whole AD-1 family, and deleting
  // the flag leaves every other check in this script green.
  if (config.linterOptions?.noInlineConfig !== true) {
    fail(
      `${relative(ROOT, coreCleanFixture)}: 'linterOptions.noInlineConfig' is not enabled for core ` +
        `files (got ${JSON.stringify(config.linterOptions?.noInlineConfig ?? null)}). A single ` +
        "`// eslint-disable-next-line` would then silence the guardrail with nothing going red.",
    );
  }
} else {
  fail(
    `${relative(ROOT, coreCleanFixture)} is missing — nothing proves the core rules load at all.`,
  );
}

if (existsSync(inwardFixture)) {
  const config = await eslint.calculateConfigForFile(inwardFixture);
  const loaded = REQUIRED_CORE_RULES.filter((rule) => config.rules?.[rule]);
  if (loaded.length > 0) {
    fail(
      `${relative(ROOT, inwardFixture)}: the core boundary rules (${loaded.join(", ")}) are loaded ` +
        "for a non-core file. The config is scoped to core/ on purpose; if that scope widens, this " +
        "fixture's expectation needs rewriting rather than silently passing.",
    );
  }
}

// ---------------------------------------------------------------------------
// 3. A violation in the real core/ tree blocks the build.
// ---------------------------------------------------------------------------

try {
  // `core/canon/` is seeded with a .gitkeep, but a rename or a dropped seed
  // would otherwise surface as an ENOENT from writeFileSync rather than as a
  // guardrail failure.
  mkdirSync(PROBE_DIR, { recursive: true });
  for (const probe of PROBES) {
    writeFileSync(
      probe.path,
      "// Temporary probe written by scripts/verify-boundaries.mjs. Deleted on exit.\n" +
        `// Proves: ${probe.mechanism}\n` +
        probe.body(probe.specifier),
      { flag: "wx" },
    );
  }

  const lint = spawnSync("pnpm", ["lint"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const output = `${lint.stdout ?? ""}${lint.stderr ?? ""}`;

  if (lint.error) {
    fail(
      `Could not run \`pnpm lint\` to prove the build is blocked: ${lint.error.message}`,
    );
  } else if (lint.signal) {
    fail(
      `\`pnpm lint\` was killed by ${lint.signal} — the build-blocking check did not complete.`,
    );
  } else if (lint.status === null) {
    fail(
      "`pnpm lint` returned no exit status, so the build-blocking check proved nothing.",
    );
  } else if (lint.status === 0) {
    fail(
      "`pnpm lint` exited 0 with violating files in core/ — `pnpm build` would not be blocked.",
    );
  } else {
    // Non-zero is not enough: each mechanism must be the reason for itself, and
    // the *quoted* form is what proves it. `Response` is a substring of
    // `NextResponse`, so a bare `includes` would let one probe vouch for the
    // other's mechanism — the same weakness the per-fixture check above quotes
    // its sentinel to avoid.
    for (const probe of PROBES) {
      if (!output.includes(`'${probe.specifier}'`)) {
        fail(
          `\`pnpm lint\` failed but never named '${probe.specifier}' in quotes, so ${probe.mechanism} ` +
            `is unproven against the real core/ tree. Output:\n${output}`,
        );
      }
    }
  }
} catch (error) {
  fail(`Could not write the build-blocking probes into ${relative(ROOT, PROBE_DIR)}: ${error.message}`);
} finally {
  cleanUpProbe();
}

// `pnpm lint` failing is only half the claim. The acceptance criterion is that
// `pnpm build` fails, which holds only while `build` still chains the lint step.
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const buildScript = pkg.scripts?.build ?? "";
// Matched as one `&&`-chained sequence, not as independent substrings:
// `pnpm lint || true` contains "pnpm lint" and blocks nothing, and a missing
// `pnpm typecheck` would drop the only check that catches what lint cannot.
const EXPECTED_BUILD_CHAIN =
  /^\s*pnpm\s+clean:probes\s*&&\s*pnpm\s+lint\s*&&\s*pnpm\s+typecheck\s*&&\s*pnpm\s+test\s*&&\s*pnpm\s+verify:boundaries\s*&&\s*next\s+build\s*$/;
if (!EXPECTED_BUILD_CHAIN.test(buildScript)) {
  fail(
    `package.json's build script is "${buildScript}", which is not the required chain ` +
      "`pnpm clean:probes && pnpm lint && pnpm typecheck && pnpm test && pnpm verify:boundaries && next build`. " +
      "Each link is load-bearing: clean:probes clears a probe left by a killed run (lint runs " +
      "before the step that would otherwise clean it), lint enforces AD-1, typecheck is the only " +
      "check that sees a type-level escape, test is the only thing that runs the unit suite at " +
      "all, and verify:boundaries is the only thing exercising these fixtures.",
  );
}

// The chain regexes above pin the script *names* the build runs. They do not
// pin what those names resolve to, so `"test": "true"` satisfied
// EXPECTED_BUILD_CHAIN while the entire unit suite disappeared — the exact
// substitution this guard exists to prevent, one level down.
const EXPECTED_SCRIPT_BODIES = {
  test: "node scripts/run-tests.mjs",
  "test:e2e":
    "node scripts/startup-gate.mjs && playwright test && node scripts/e2e-gate.mjs --record",
  verify: "node scripts/verify.mjs",
};
for (const [name, expected] of Object.entries(EXPECTED_SCRIPT_BODIES)) {
  const actual = pkg.scripts?.[name] ?? "";
  if (actual !== expected) {
    fail(
      `package.json's ${name} script is "${actual}", not "${expected}". ` +
        "The build chain asserts the script name only, so a substituted body " +
        "would leave every check it names silently absent.",
    );
  }
}

// ---------------------------------------------------------------------------
// The schema is migrated, never synchronised.
//
// The predicates live in `./project-invariants.mjs` so `tests/` can exercise
// them against violating inputs. Everything below is the part that needs a
// filesystem: which files to feed them, and what to say when they fire.

// "Any config" is taken literally: every config and build-chain source at the
// repo root, plus every script of any extension. An earlier version scanned
// `drizzle.config.ts` and `scripts/*.mjs` only, which left `next.config.ts`,
// `playwright.config.ts`, root `eslint.config.mjs` and any future `scripts/*.ts`
// as places the ban did not reach.
//
// The exempt files are the verifier and the module declaring the pattern:
// naming the forbidden sequence is their job, and scanning them would make the
// guardrail fire on itself. `PUSH_SCAN_EXEMPT` is exported and asserted short in
// `tests/project-invariants.test.mts`, because an exemption list is the obvious
// place to hide a real invocation.
const PUSH_SCANNABLE = /\.(?:m|c)?[jt]s$/;
const PUSH_SCANNED_SOURCES = [
  ...readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && PUSH_SCANNABLE.test(entry.name))
    .map((entry) => entry.name),
  ...readdirSync(join(ROOT, "scripts"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && PUSH_SCANNABLE.test(entry.name))
    .map((entry) => `scripts/${entry.name}`),
].filter((relative) => !PUSH_SCAN_EXEMPT.includes(relative));

const pushSources = [];
for (const relative of PUSH_SCANNED_SOURCES) {
  try {
    pushSources.push({ name: relative, body: readFileSync(join(ROOT, relative), "utf8") });
  } catch (error) {
    // A file listed by the directory read and unreadable a moment later is a
    // real problem, but a raw ENOENT stack from inside a guardrail sends the
    // reader to this file rather than to theirs.
    fail(`${relative} could not be scanned for a push invocation (${error.message}).`);
  }
}

// The journal is read as text, not parsed here: `projectInvariantProblems` owns
// every verdict, including "unreadable", so the composition that produces each
// sentence is the composition `tests/project-invariants.test.mts` exercises.
let journalText = null;
try {
  journalText = readFileSync(join(ROOT, JOURNAL_FILE), "utf8");
} catch {
  // Reported by the composed check, which says why it matters.
}

// This call is the wiring. Everything it decides is covered by unit tests
// firing violating inputs at the same function; what a test cannot see is
// whether the *real* inputs are handed over, so `tests/project-invariants.test.mts`
// pins this call's arguments as a tripwire.
for (const problem of projectInvariantProblems({
  scripts: pkg.scripts,
  sources: pushSources,
  journalText,
  exists: (relative) => existsSync(join(ROOT, relative)),
  listSqlTags: () =>
    readdirSync(join(ROOT, MIGRATIONS_DIR), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name.slice(0, -".sql".length)),
})) {
  fail(problem);
}

// ---------------------------------------------------------------------------
// One migrations directory, named in three places.
//
// `drizzle.config.ts`'s `out` decides where `pnpm db:generate` writes;
// `adapters/db/bootstrap.ts`'s `MIGRATIONS_FOLDER` decides where the running
// app reads; `MIGRATIONS_DIR` above decides where the journal check looks.
// Nothing linked them, so changing `out` alone would land every generated
// migration in a directory the app never opens — and every check in this file,
// the journal one included, would still pass while no migration ever ran.
//
// Asserted by importing the modules rather than by matching their source text:
// a regex over a string literal proves what the file says, not what it does.
//
// One `try` each, because they fail for unrelated reasons: a single wrapper
// reported both files by name whichever one threw, and silently dropped the two
// `drizzle.config.ts` assertions whenever the *bootstrap* import was the one
// that failed.
const expectedMigrationsDir = resolve(ROOT, MIGRATIONS_DIR);
try {
  const { MIGRATIONS_FOLDER } = await import("../adapters/db/bootstrap.ts");
  if (resolve(MIGRATIONS_FOLDER) !== expectedMigrationsDir) {
    fail(
      `adapters/db/bootstrap.ts reads migrations from ${relative(ROOT, MIGRATIONS_FOLDER)}, ` +
        `but the journal check and drizzle-kit use ${MIGRATIONS_DIR}. A migration ` +
        "generated into one and read from the other never runs.",
    );
  }
} catch (error) {
  fail(
    `Could not read MIGRATIONS_FOLDER back from adapters/db/bootstrap.ts ` +
      `(${error.message}). It must be importable for the three declarations of ` +
      "that path to be checkable against each other.",
  );
}

try {
  const drizzleConfig = (await import("../drizzle.config.ts")).default;
  if (resolve(ROOT, drizzleConfig.out ?? "") !== expectedMigrationsDir) {
    fail(
      `drizzle.config.ts generates into "${drizzleConfig.out}", which is not ` +
        `${MIGRATIONS_DIR}. \`pnpm db:generate\` would write where the app never looks.`,
    );
  }
  if (resolve(ROOT, drizzleConfig.schema ?? "") !== resolve(ROOT, "adapters/db/schema.ts")) {
    fail(
      `drizzle.config.ts diffs against "${drizzleConfig.schema}", not ` +
        "adapters/db/schema.ts, so a table added to the schema module would " +
        "generate no migration.",
    );
  }
} catch (error) {
  fail(
    `Could not read drizzle.config.ts (${error.message}). It must be importable ` +
      "for `out` and `schema` to be checked against the directory the app reads.",
  );
}

// Pinning `verify`'s name is not enough now that it is a script file rather
// than an inline chain: the body has to still run both halves.
const verifySource = readFileSync(join(ROOT, "scripts/verify.mjs"), "utf8");
for (const step of ['"build"', '"test:e2e"']) {
  if (!verifySource.includes(step)) {
    fail(
      `scripts/verify.mjs no longer runs ${step}. verify is the only script ` +
        "that builds and then renders the app.",
    );
  }
}

// The same argument one level up. `build` deliberately excludes the Playwright
// suite — it needs a served production build — so `verify` is the only script
// that runs it, and the e2e suite is the only thing in the repo that observes
// the design system's rendered output: the loaded font faces, the colour tokens
// resolving, the divider's dimensions, and the port's body reset.
//
// Asserting that `verify` is well-formed proves it exists, never that it ran.
// With no CI and no hook, the whole suite could rot with `pnpm build` green, so
// the freshness marker below is what actually gates it: if any source the e2e
// assertions observe has changed since the last recorded run, the build stops.
// `pnpm verify` turns the gate off for its own build step, because otherwise
// the build that must precede the e2e run would be blocked by the e2e run not
// yet having happened.
if (process.env.TAILOR_E2E_GATE === "off") {
  console.log("e2e freshness gate: off for this run (pnpm verify).");
} else {
  const observed = observedHash();
  const recorded = recordedHash();
  if (recorded === null) {
    fail(
      `\`pnpm verify\` has never recorded a run (no ${MARKER}). Run it — ` +
        "`pnpm build` alone never renders the app and never starts it, so " +
        "nothing has checked the 39px contract, the colour tokens, the loaded " +
        "font faces, or that a server start sets up a clean machine.",
    );
  } else if (recorded !== observed) {
    fail(
      `\`pnpm verify\` last ran against ${recorded.slice(0, 12)}, but the ` +
        `sources it observes now hash to ${observed.slice(0, 12)}. Run it: the ` +
        "rendered assertions — the 39px border-box Epic 2 pins its action bar " +
        "against, the divider, the colour tokens, the loaded font faces, the " +
        "body reset — and the startup gate, which boots the app on an empty " +
        "directory and checks it sets itself up, have not seen this code.",
    );
  }
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error("Core boundary guardrail is NOT intact:\n");
  for (const message of failures) console.error(`  - ${message}`);
  console.error("");
  process.exit(1);
}

console.log(
  `Core boundary guardrail intact: ${fixtureFiles.length} fixtures, ` +
    `${Object.keys(REQUIRED_ROWS).length} violation classes, ` +
    `${PROBES.length} mechanisms proven against the real core/ tree, ` +
    "and a violation in core/ blocks the build.",
);

// The project invariants report separately and by count. A check that produces
// no output when it passes gives no signal when it silently stops running,
// which is the failure mode this whole file is written against.
console.log(
  `Project invariants intact: no drizzle-kit push in package.json or any of ` +
    `${PUSH_SCANNED_SOURCES.length} scanned sources, and ${JOURNAL_FILE} agrees ` +
    "with the directory the app reads and drizzle-kit writes.",
);
