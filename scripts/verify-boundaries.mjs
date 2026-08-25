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
 */

import { ESLint } from "eslint";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

/** Mirrors `import/resolver` in eslint.config.mjs. */
const RESOLVE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
];

/** Rules that decide by resolving the specifier to a file on disk. */
const PATH_RESOLVING_RULES = new Set(["boundaries/element-types"]);

/**
 * Every rule that is allowed to satisfy an `EXPECT: violation`. Without this,
 * an unrelated rule whose message happens to contain the specifier would be
 * accepted as proof that a dead boundary rule is alive.
 */
const BOUNDARY_RULES = new Set([
  ...PATH_RESOLVING_RULES,
  "no-restricted-imports",
  "tailor/no-deferred-module-loading",
]);

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
const probePath = join(PROBE_DIR, `${PROBE_PREFIX}${process.pid}.ts`);

function removeStaleProbes() {
  if (!existsSync(PROBE_DIR)) return;
  for (const entry of readdirSync(PROBE_DIR)) {
    if (entry.startsWith(PROBE_PREFIX)) {
      rmSync(join(PROBE_DIR, entry), { force: true });
    }
  }
}

const cleanUpProbe = () => rmSync(probePath, { force: true });
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
  const warnings = result.messages.filter((m) => m.severity === 1);
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
      const naming = errors.filter(
        (m) =>
          BOUNDARY_RULES.has(m.ruleId) && m.message.includes(expectation.source),
      );
      if (errors.length === 0) {
        fail(
          `${rel}: expected a violation for '${expectation.source}', got none — the guardrail is not firing.`,
        );
      } else if (naming.length === 0) {
        fail(
          `${rel}: no boundary rule named '${expectation.source}'. Errors seen: ${errors
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
// 3. A violation in the real core/ tree blocks the build.
// ---------------------------------------------------------------------------

const probeSource = "@/adapters/db/repository";
try {
  writeFileSync(
    probePath,
    "// Temporary probe written by scripts/verify-boundaries.mjs. Deleted on exit.\n" +
      `import { repository } from "${probeSource}";\n\n` +
      "export const leaked = repository;\n",
    { flag: "wx" },
  );

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
      "`pnpm lint` exited 0 with a violating file in core/ — `pnpm build` would not be blocked.",
    );
  } else if (!output.includes(probeSource)) {
    fail(
      `\`pnpm lint\` failed but never named '${probeSource}'. Output:\n${output}`,
    );
  }
} catch (error) {
  fail(`Could not write the build-blocking probe at ${relative(ROOT, probePath)}: ${error.message}`);
} finally {
  cleanUpProbe();
}

// `pnpm lint` failing is only half the claim. The acceptance criterion is that
// `pnpm build` fails, which holds only while `build` still chains the lint step.
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const buildScript = pkg.scripts?.build ?? "";
if (!/\bpnpm\s+lint\b/.test(buildScript)) {
  fail(
    `package.json's build script does not run \`pnpm lint\` (it is "${buildScript}"). ` +
      "The lint above would fail, but the build would not.",
  );
}
if (!/\bpnpm\s+verify:boundaries\b/.test(buildScript)) {
  fail(
    `package.json's build script does not run \`pnpm verify:boundaries\` (it is "${buildScript}"). ` +
      "Nothing else runs these fixtures, so the guardrail could rot untested.",
  );
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
    "and a violation in core/ blocks the build.",
);
