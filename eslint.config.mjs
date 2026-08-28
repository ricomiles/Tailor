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
 * Six mechanisms. Four cover the shapes a module reference can take, because no
 * one of them covers every shape; two more cover the outward leak that needs no
 * import at all — `Response` is a global, so `throw new Response("x", { status:
 * 400 })` under core/ satisfied every import rule below.
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
 *  - `tailor/no-http-response-in-core` rejects every *reference* to `Response`
 *    or `NextResponse` — construction, a static call, a type annotation, an
 *    alias (`const Aliased = Response`), and `globalThis.Response` alike.
 *    Errors flow one direction: only `app/api/` formats HTTP.
 *  - `tailor/no-http-status-in-core` rejects `statusCode` / `httpStatus` /
 *    `statusText` unconditionally, and a `status` whose value is a number in
 *    100–599. The split is deliberate — `run_steps.status` is a domain status
 *    declared under core/, and a bare `status` key match would reject it.
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

const AD1_HTTP_RESPONSE =
  "AD-1: errors flow one direction — core/ may not build an HTTP response. Throw a TailorError " +
  "from core/errors and let app/api translate it.";

const AD1_HTTP_STATUS =
  "AD-1: errors flow one direction — core/ may not carry an HTTP status. Throw a TailorError " +
  "from core/errors and let app/api map its code to a status.";

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

/**
 * The names that only ever mean "an HTTP response". `Response` is a global, so
 * `throw new Response("x", { status: 400 })` inside core/ needs no import and
 * linted clean under every AD-1 rule above. `NextResponse` is listed alongside
 * it because the construct has to be named on its own: the fixture that proves
 * this rule declares it ambiently (`declare const NextResponse: …`), so what
 * fires is this rule rather than the framework escape its import would also be.
 */
const HTTP_RESPONSE_NAMES = new Set(["Response", "NextResponse"]);

/**
 * Identifier positions that introduce a *name* rather than reference one.
 * Shadowing `Response` with a local binding is not itself a leak; using it is.
 */
function isDeclarationName(node, parent) {
  switch (parent.type) {
    case "VariableDeclarator":
    case "ClassDeclaration":
    case "ClassExpression":
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "TSDeclareFunction":
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
    case "TSEnumDeclaration":
    case "TSModuleDeclaration":
      return parent.id === node;
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
    case "ExportSpecifier":
      return true;
    default:
      return Array.isArray(parent.params) && parent.params.includes(node);
  }
}

/**
 * Non-computed key positions. `{ Response: 1 }` is a data key, not a reference.
 * The member-property position is excluded here and handled by the rule's own
 * `MemberExpression` visitor, which is what catches `globalThis.Response`.
 */
function isKeyName(node, parent) {
  const keyed =
    parent.type === "Property" ||
    parent.type === "PropertyDefinition" ||
    parent.type === "MethodDefinition" ||
    parent.type === "TSPropertySignature" ||
    parent.type === "TSMethodSignature";
  if (keyed) return parent.key === node && !parent.computed;
  return (
    parent.type === "MemberExpression" &&
    parent.property === node &&
    !parent.computed
  );
}

/** How the reference reads, so the message points at the shape that leaked. */
function describeResponseReference(node, parent) {
  const name = node.name;
  if (parent.type === "NewExpression" && parent.callee === node)
    return `\`new ${name}()\``;
  if (parent.type === "CallExpression" && parent.callee === node)
    return `\`${name}()\``;
  if (parent.type === "MemberExpression" && parent.object === node)
    return `a member of \`${name}\``;
  if (parent.type === "TSTypeReference" || parent.type === "TSQualifiedName")
    return `a \`${name}\` type annotation`;
  if (parent.type === "TSImportType") return `an imported \`${name}\` type`;
  if (
    (parent.type === "ClassDeclaration" || parent.type === "ClassExpression") &&
    parent.superClass === node
  )
    return `a class extending \`${name}\``;
  if (parent.type === "BinaryExpression" && parent.operator === "instanceof")
    return `an \`instanceof ${name}\` test`;
  if (parent.type === "UnaryExpression" && parent.operator === "typeof")
    return `a \`typeof ${name}\` test`;
  return `a reference to \`${name}\``;
}

/**
 * Bans constructing or referencing an HTTP response under core/.
 *
 * Purely syntactic, like every rule here: the parser is configured without type
 * information, so this matches the name rather than the type of a value. Every
 * *reference* is rejected, not just construction — `const Aliased = Response`
 * followed by `new Aliased(…)` is otherwise invisible to a construct-shaped
 * rule, which is the same escape `no-deferred-module-loading` closes by
 * rejecting `require` as a value. A `Promise<Response>` return type is the same
 * leak one step earlier, and `globalThis.Response` (dotted or bracketed) is the
 * same leak spelled around the binding entirely.
 *
 * What it cannot see: a value that reaches core/ as a parameter typed by
 * another file, or an alias built through a computed expression
 * (`globalThis[name]`). Both need type information this parser does not have.
 *
 * Where it deliberately over-reaches: any `.Response` member read, on any
 * object, is reported — that is what catches `globalThis.Response`, and the
 * cost is that a core module may not read a property called `Response` off
 * something unrelated. Under core/ there is no such property worth having, so
 * the trade is taken rather than narrowed to a receiver allowlist that
 * `(0, globalThis).Response` would walk straight through.
 */
const noHttpResponseInCore = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow constructing or referencing an HTTP Response under core/.",
    },
    schema: [],
  },
  create(context) {
    // Every message quotes its subject so the guardrail can assert on the
    // quoted form rather than a loose substring — the same convention the
    // deferred-loading rule uses.
    const report = (node, name, form) =>
      context.report({
        node,
        message: `'${name}' — ${form} builds an HTTP response. ${AD1_HTTP_RESPONSE}`,
      });

    return {
      Identifier(node) {
        if (!HTTP_RESPONSE_NAMES.has(node.name)) return;
        const parent = node.parent;
        if (!parent) return;
        if (isDeclarationName(node, parent)) return;
        if (isKeyName(node, parent)) return;
        report(node, node.name, describeResponseReference(node, parent));
      },
      MemberExpression(node) {
        // `globalThis.Response`, `globalThis["Response"]`.
        const name = staticKeyName(node);
        if (name === null || !HTTP_RESPONSE_NAMES.has(name)) return;
        report(
          node,
          name,
          node.computed ? `a \`["${name}"]\` lookup` : `a \`.${name}\` lookup`,
        );
      },
      Property(node) {
        // `const { Response } = globalThis` — destructuring reads the property,
        // so the key names what is read. In an object *literal* the same
        // position is a data key and means nothing, which is why only patterns
        // are checked here.
        if (node.parent?.type !== "ObjectPattern") return;
        const name = staticKeyName(node);
        if (name === null || !HTTP_RESPONSE_NAMES.has(name)) return;
        report(node, name, `a destructured \`${name}\``);
      },
    };
  },
};

/**
 * Names that carry no domain meaning, so they are rejected unconditionally.
 * `status` is deliberately absent: `run_steps.status` is specified as
 * `pending | running | done | failed` and must be declared as a zod schema
 * under core/, so a bare `status` key match is a live false positive rather
 * than a theoretical one.
 */
const HTTP_STATUS_NAMES = new Set(["statusCode", "httpStatus", "statusText"]);

/** The only HTTP status codes that exist. A domain number is not one of these. */
const isHttpStatusNumber = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;

/**
 * The name a property, member or type member is written under, when it can be
 * read from the source alone. That includes a string literal in computed
 * position — `{ ["statusCode"]: 500 }` and `holder["status"] = 404` are as
 * statically readable as their dotted forms, and skipping them was a one-line
 * bypass. It does not include a computed key whose value is an expression
 * (`{ [name]: 500 }`), which needs scope analysis this parser is not given.
 */
function staticKeyName(node) {
  if (!node) return null;
  const key = node.key ?? node.property;
  if (!key) return null;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  if (!node.computed && key.type === "Identifier") return key.name;
  return null;
}

/**
 * The numeric value of a literal, seen through a type annotation, a literal
 * type, and the assertion wrappers (`404 as const`, `404!`).
 *
 * No constant folding, and none intended: `{ status: 200 + 4 }` and
 * `{ status: NOT_FOUND }` are not caught, because folding needs the scope and
 * type analysis this parser is deliberately not configured for. The escape that
 * leaves is an obfuscation rather than an accident, and the unconditional
 * `statusCode`/`httpStatus`/`statusText` clause is what carries the real
 * weight — a core error type cannot name its status field anything else and
 * still be read as one.
 */
function numericLiteralValue(node) {
  if (!node) return null;
  if (node.type === "Literal") return typeof node.value === "number" ? node.value : null;
  if (node.type === "TSLiteralType") return numericLiteralValue(node.literal);
  if (node.type === "TSTypeAnnotation") return numericLiteralValue(node.typeAnnotation);
  if (
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSTypeAssertion"
  )
    return numericLiteralValue(node.expression);
  return null;
}

/**
 * Bans carrying an HTTP status under core/.
 *
 * Two clauses, because one would be wrong in one direction or the other:
 * `statusCode` / `httpStatus` / `statusText` fire unconditionally, while
 * `status` fires only when its value is a number in 100–599. That keeps the
 * domain status Epic 3 declares (`pending | running | done | failed`) legal
 * while still catching `throw { status: 404 }`.
 *
 * Declaration sites are checked as well as assignments: `throw new AppError(…)`
 * where `AppError`'s shape lives in another core/ file needs type information
 * this parser does not have, so a `statusCode` *member* is itself the violation.
 */
const noHttpStatusInCore = {
  meta: {
    type: "problem",
    docs: { description: "Disallow carrying an HTTP status code under core/." },
    schema: [],
  },
  create(context) {
    const report = (node, name, form) =>
      context.report({
        node,
        message: `'${name}' — ${form} carries an HTTP status. ${AD1_HTTP_STATUS}`,
      });

    /** The unconditional clause, shared by every shape that has a name. */
    const checkName = (node, name, kind) => {
      if (name === null || !HTTP_STATUS_NAMES.has(name)) return false;
      report(node, name, `a ${kind} named \`${name}\``);
      return true;
    };

    return {
      Property(node) {
        const name = staticKeyName(node);
        if (checkName(node, name, "property")) return;
        if (name === "status" && isHttpStatusNumber(numericLiteralValue(node.value)))
          report(node, name, "a `status` property whose value is an HTTP status number");
      },
      PropertyDefinition(node) {
        const name = staticKeyName(node);
        if (checkName(node, name, "class field")) return;
        if (name !== "status") return;
        const value =
          numericLiteralValue(node.value) ?? numericLiteralValue(node.typeAnnotation);
        if (isHttpStatusNumber(value))
          report(node, name, "a `status` field whose value is an HTTP status number");
      },
      TSPropertySignature(node) {
        const name = staticKeyName(node);
        if (checkName(node, name, "type member")) return;
        if (
          name === "status" &&
          isHttpStatusNumber(numericLiteralValue(node.typeAnnotation))
        )
          report(node, name, "a `status` type member fixed to an HTTP status number");
      },
      MemberExpression(node) {
        checkName(node, staticKeyName(node), "member access");
      },
      AssignmentExpression(node) {
        const { left, right } = node;
        if (left.type !== "MemberExpression") return;
        if (staticKeyName(left) !== "status") return;
        if (isHttpStatusNumber(numericLiteralValue(right)))
          report(node, "status", "an assignment of an HTTP status number to `.status`");
      },
    };
  },
};

const tailor = {
  meta: { name: "eslint-plugin-tailor", version: "1.0.0" },
  rules: {
    "no-deferred-module-loading": noDeferredModuleLoading,
    "no-http-response-in-core": noHttpResponseInCore,
    "no-http-status-in-core": noHttpStatusInCore,
    "no-outward-relative-reference": noOutwardRelativeReference,
  },
};

const coreBoundary = [
  {
    name: "tailor/core-boundary",
    files: CORE_FILES,
    plugins: { boundaries, tailor },
    // A single `// eslint-disable-next-line` in a real core/ file silenced the
    // whole AD-1 family and nothing anywhere went red — the guardrail was
    // opt-out by comment. `noInlineConfig` makes ESLint ignore the directive,
    // so the underlying rule still errors and *that* is what fails the build.
    //
    // Precisely: ESLint also emits "has no effect because you have
    // 'noInlineConfig'" for the comment itself, but that notice is hard-coded
    // to severity `warning` and `pnpm lint` is a bare `eslint .`, so it exits 0
    // on its own. The blocking half is the rule error underneath, and
    // `scripts/verify-boundaries.mjs` asserts this flag is still set — deleting
    // it would otherwise reopen the bypass with every check still green.
    //
    // `reportUnusedDisableDirectives` is inert while `noInlineConfig` is on
    // (directives never reach the unused-directive pass). It is kept as the
    // fallback: if the flag above is ever relaxed, a directive that suppresses
    // nothing becomes an error here rather than ESLint's default warning.
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
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
      "tailor/no-http-response-in-core": "error",
      "tailor/no-http-status-in-core": "error",
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
