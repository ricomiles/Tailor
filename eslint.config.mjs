import { builtinModules } from "node:module";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * AD-1 — the domain core has no outward imports.
 *
 * No file under `core/` may import from `app/`, `adapters/`, `components/`,
 * `next/*`, `drizzle-orm`, `playwright`, or any Node built-in. The core
 * receives capability only through the port interfaces it defines.
 *
 * Three mechanisms, because no one of them covers every shape a module
 * reference can take:
 *
 *  - `boundaries/element-types` resolves the specifier to a real file path,
 *    so it catches the relative escape (`../../adapters/db/x`) that no amount
 *    of string matching on the specifier would see.
 *  - `no-restricted-imports` covers bare specifiers — packages and Node
 *    built-ins — which have no path to resolve, plus the `@/` alias form.
 *  - `tailor/no-deferred-module-loading` closes the deferred forms. Both of
 *    the rules above inspect *static* import and export declarations only:
 *    `await import("node:fs")` and `require("drizzle-orm")` are invisible to
 *    them. Rather than pattern-match specifiers a second time — which would
 *    still leave `await import(someVariable)` open — the whole class is
 *    banned under `core/`, which is pure domain logic and has no legitimate
 *    need to defer a module load.
 *
 * Violations are errors, never warnings, and `pnpm build` runs `pnpm lint`
 * and `pnpm verify:boundaries` before `next build`, so a violation fails the
 * build. Next 16 removed `next lint`; `next build` type-checks but never
 * lints.
 */

const CORE_FILES = ["**/core/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];

const RESOLVE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".json",
];

/** Every Node built-in, bare (`fs`) and prefixed (`node:fs`). */
const nodeBuiltins = [
  ...new Set([
    ...builtinModules,
    ...builtinModules.map((name) => `node:${name}`),
  ]),
].filter((name) => !name.startsWith("_"));

/** Infrastructure the core reaches only through a port, never directly. */
const forbiddenPackages = [
  "next",
  "next/*",
  "drizzle-orm",
  "drizzle-orm/*",
  "drizzle-kit",
  "drizzle-kit/*",
  "better-sqlite3",
  "playwright",
  "playwright-core",
  "@playwright/*",
];

/** The `@/*` alias resolves to the repo root, so these are outward too. */
const forbiddenAliases = [
  "@/app",
  "@/app/**",
  "@/adapters",
  "@/adapters/**",
  "@/components",
  "@/components/**",
];

const AD1 =
  "AD-1: no file under core/ may import outward. Depend on a port interface in core/ports instead.";

const AD1_DEFERRED =
  "AD-1: core/ may not defer a module load — the static import rules cannot see through it, " +
  "and the core has no legitimate need for one.";

/**
 * Bans `import()`, `require()` and `require.resolve()` outright, naming the
 * specifier whenever it is a string literal so the message points at the
 * offending module the way the static rules do.
 */
const noDeferredModuleLoading = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow deferred module loading, which the static import rules cannot inspect.",
    },
    schema: [],
  },
  create(context) {
    const report = (node, form, specifier) => {
      const literal =
        specifier &&
        specifier.type === "Literal" &&
        typeof specifier.value === "string"
          ? specifier.value
          : null;
      context.report({
        node,
        message: literal
          ? `'${literal}' is loaded through ${form}. ${AD1_DEFERRED}`
          : `${form} with a non-literal specifier hides what is loaded. ${AD1_DEFERRED}`,
      });
    };

    return {
      ImportExpression(node) {
        report(node, "import()", node.source);
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === "Identifier" && callee.name === "require") {
          report(node, "require()", node.arguments[0]);
          return;
        }
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.object.type === "Identifier" &&
          callee.object.name === "require" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "resolve"
        ) {
          report(node, "require.resolve()", node.arguments[0]);
        }
      },
    };
  },
};

const tailor = { rules: { "no-deferred-module-loading": noDeferredModuleLoading } };

const coreBoundary = [
  {
    name: "tailor/core-boundary",
    files: CORE_FILES,
    plugins: { boundaries, tailor },
    settings: {
      // `mode: "full"` matches the pattern against the whole path including
      // the filename, so a file sitting directly at `core/x.ts` classifies as
      // `core` just like `core/canon/x.ts` does. The earlier folder-mode
      // patterns (`**/core/*`) only ever matched a *subfolder* of core, which
      // left both the core root and the adapters/components/app roots
      // unclassified — and `boundaries/element-types` silently allows a
      // dependency it cannot classify.
      "boundaries/elements": [
        { type: "core", pattern: "**/core/**", mode: "full" },
        { type: "adapters", pattern: "**/adapters/**", mode: "full" },
        { type: "components", pattern: "**/components/**", mode: "full" },
        { type: "app", pattern: "**/app/**", mode: "full" },
      ],
      // The default node resolver does not know about TypeScript extensions,
      // and an unresolved specifier is silently skipped — which would let the
      // relative escape through. Scoped to core files so eslint-config-next's
      // own resolver settings are left alone everywhere else.
      "import/resolver": { node: { extensions: RESOLVE_EXTENSIONS } },
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: ["core"],
              disallow: ["app", "adapters", "components"],
              message: "'${dependency.source}' reaches outside core/. " + AD1,
            },
          ],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: forbiddenPackages, message: AD1 },
            { group: nodeBuiltins, message: `Node built-in. ${AD1}` },
            { group: forbiddenAliases, message: `Alias escape. ${AD1}` },
          ],
        },
      ],
      "tailor/no-deferred-module-loading": "error",
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...coreBoundary,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // BMad planning material and design-handoff sources: read-only inputs
    // carried in the repo, not application code.
    "_bmad/**",
    "_bmad-output/**",
    ".claude/**",
    // Deliberately-violating files. `pnpm verify:boundaries` lints them with
    // this same config and ignores disabled, and asserts that they fail.
    "tools/boundary-fixtures/**",
  ]),
]);

export default eslintConfig;
