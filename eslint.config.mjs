import { existsSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * AD-1 — the domain core has no outward imports.
 *
 * No file under `core/` may reference `app/`, `adapters/`, `components/`,
 * anything else outside `core/`, `next/*`, the ORM, Playwright, the UI/state
 * runtime, or any Node built-in. The core receives capability only through the
 * port interfaces it defines. (`zod` is deliberately allowed: the architecture
 * requires every cross-unit type declared once in the core as a named schema.)
 *
 * Four mechanisms, because no one of them covers every shape a module
 * reference can take:
 *
 *  - `tailor/no-outward-relative-reference` resolves every *relative*
 *    specifier against the repo-root `core/` directory and rejects any that
 *    lands outside it. It covers `import`, `export … from` and `export * from`
 *    alike, and judges by path even when the target does not exist yet.
 *  - `boundaries/element-types` classifies resolved paths into core/adapters/
 *    components/app. It is kept as a second, independent opinion on the same
 *    escapes, but it inspects import declarations only.
 *  - `no-restricted-imports` covers bare specifiers — packages and Node
 *    built-ins — which have no path to resolve, plus the `@/` alias form. It
 *    does see `export … from`.
 *  - `tailor/no-deferred-module-loading` closes the deferred forms, which the
 *    static rules cannot inspect: `import()`, `require()`, `require.resolve()`,
 *    member forms like `module.require`, a bare `require` reference passed
 *    around as a value, `import.meta.resolve`, and `process.getBuiltinModule`
 *    (a Node 22+ API, which is exactly the engine floor this project pins).
 *    The class is banned wholesale rather than pattern-matched, because a
 *    specifier pattern still leaves `await import(someVariable)` open.
 *
 * Violations are errors, never warnings, and `pnpm build` runs `pnpm lint`,
 * `pnpm typecheck` and `pnpm verify:boundaries` before `next build`, so a
 * violation fails the build. Next 16 removed `next lint`; `next build`
 * type-checks but never lints.
 */

const CORE_FILES = ["**/core/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];

/**
 * Exported so `scripts/verify-boundaries.mjs` consumes this list rather than
 * keeping a second copy. Two hand-maintained lists drifted in precedence once
 * already, which would let the script vouch for a resolution ESLint never
 * performed.
 */
export const RESOLVE_EXTENSIONS = [
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

/**
 * Every Node built-in, bare (`fs`) and prefixed (`node:fs`). The private
 * `_http_*`/`_stream_*` names are dropped *before* the `node:` mapping, so
 * both forms go together — filtering afterwards kept every `node:_http_*`.
 */
const nodeBuiltins = [
  ...new Set(
    builtinModules
      .filter((name) => !name.startsWith("_"))
      .flatMap((name) => [name, `node:${name}`]),
  ),
];

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
  // The UI and client-state runtime. Pure domain logic has no need of a hook
  // or a store, and reaching for one is how rendering concerns leak inward.
  "react",
  "react/*",
  "react-dom",
  "react-dom/*",
  "zustand",
  "zustand/*",
];

/**
 * The `@/*` alias resolves to the repo root, so everything it can reach is
 * outward except `@/core` itself. Stated as an allowlist: enumerating the
 * forbidden roots left `@/scripts`, `@/tools` and `@/next.config` open.
 */
const forbiddenAliases = ["@/*", "@/**", "!@/core", "!@/core/**"];

const AD1 =
  "AD-1: no file under core/ may import outward. Depend on a port interface in core/ports instead.";

const AD1_DEFERRED =
  "AD-1: core/ may not defer a module load — the static import rules cannot see through it, " +
  "and the core has no legitimate need for one.";

/** Node-style resolution over the same extensions ESLint is configured with. */
function resolveSpecifier(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const isFile = (candidate) =>
    existsSync(candidate) && statSync(candidate).isFile();
  if (isFile(base)) return base;
  for (const ext of RESOLVE_EXTENSIONS) if (isFile(base + ext)) return base + ext;
  for (const ext of RESOLVE_EXTENSIONS) {
    const indexFile = join(base, `index${ext}`);
    if (isFile(indexFile)) return indexFile;
  }
  // Unresolved: judge by path anyway. A specifier that *would* land outside
  // core/ is an escape whether or not its target exists yet — and an
  // unresolved specifier is silently skipped by boundaries/element-types.
  return base;
}

/**
 * The nearest enclosing directory named `core`, or null. Anchoring to the
 * repo-root `core/` alone would skip `tools/boundary-fixtures/core/`, so the
 * rule that guards the real tree would never be exercised by the fixtures.
 */
function coreRootOf(filePath) {
  const parts = filePath.split(sep);
  const index = parts.lastIndexOf("core");
  return index === -1 ? null : parts.slice(0, index + 1).join(sep);
}

const insideCore = (coreRoot, path) =>
  path === coreRoot || path.startsWith(coreRoot + sep);

/**
 * Rejects any relative specifier under `core/` that resolves outside `core/`,
 * on import *and* on re-export. `boundaries/element-types` never inspects
 * `export … from`, so `export * from "../../adapters/db/x"` linted clean while
 * the equivalent import was an error.
 */
const noOutwardRelativeReference = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow relative imports and re-exports under core/ that resolve outside core/.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const coreRoot = coreRootOf(filename);
    if (!coreRoot) return {};

    const check = (node) => {
      const source = node.source;
      if (
        !source ||
        source.type !== "Literal" ||
        typeof source.value !== "string"
      )
        return;
      const specifier = source.value;
      if (!specifier.startsWith(".")) return;
      if (insideCore(coreRoot, resolveSpecifier(filename, specifier))) return;
      context.report({
        node: source,
        message: `'${specifier}' reaches outside core/. ${AD1}`,
      });
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};

/**
 * Bans every deferred or indirect module reference, naming the specifier
 * whenever it is a string literal so the message points at the offending
 * module the way the static rules do.
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
        // Every message quotes its subject, literal or not, so the guardrail
        // can assert on the quoted form rather than a loose substring.
        message: literal
          ? `'${literal}' is loaded through ${form}. ${AD1_DEFERRED}`
          : `'<non-literal>' specifier passed to ${form} hides what is loaded. ${AD1_DEFERRED}`,
      });
    };

    /** `const r = require` — a value reference that escapes the call forms. */
    const isBindingPosition = (node, parent) =>
      (parent.type === "VariableDeclarator" && parent.id === node) ||
      (parent.type === "Property" && parent.key === node && !parent.computed) ||
      parent.type === "TSDeclareFunction" ||
      Array.isArray(parent.params);

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
        if (callee.type !== "MemberExpression" || callee.computed) return;
        const { object, property } = callee;
        if (property.type !== "Identifier") return;

        // `require.resolve(...)`
        if (
          object.type === "Identifier" &&
          object.name === "require" &&
          property.name === "resolve"
        ) {
          report(node, "require.resolve()", node.arguments[0]);
          return;
        }
        // `module.require(...)`, `globalThis.require(...)`, `global.require(...)`
        if (property.name === "require") {
          report(node, `${context.sourceCode.getText(object)}.require()`, node.arguments[0]);
          return;
        }
        // `import.meta.resolve(...)`
        if (object.type === "MetaProperty" && property.name === "resolve") {
          report(node, "import.meta.resolve()", node.arguments[0]);
          return;
        }
        // `process.getBuiltinModule(...)` — Node 22+, i.e. this project's floor.
        if (
          object.type === "Identifier" &&
          object.name === "process" &&
          property.name === "getBuiltinModule"
        ) {
          report(node, "process.getBuiltinModule()", node.arguments[0]);
        }
      },
      Identifier(node) {
        if (node.name !== "require") return;
        const parent = node.parent;
        if (!parent) return;
        if (parent.type === "CallExpression" && parent.callee === node) return;
        if (parent.type === "MemberExpression" && parent.object === node) return;
        if (isBindingPosition(node, parent)) return;
        context.report({
          node,
          message:
            `'<require-as-value>' — \`require\` is referenced as a value, ` +
            `which hides what is loaded. ${AD1_DEFERRED}`,
        });
      },
    };
  },
};

const tailor = {
  meta: { name: "eslint-plugin-tailor", version: "1.0.0" },
  rules: {
    "no-deferred-module-loading": noDeferredModuleLoading,
    "no-outward-relative-reference": noOutwardRelativeReference,
  },
};

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
      "tailor/no-outward-relative-reference": "error",
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
