/**
 * The freshness marker for the Playwright suite.
 *
 * `build` deliberately excludes `test:e2e` — it needs a served production
 * build — so the e2e suite was reachable only by a human typing `pnpm verify`.
 * There is no CI (spec-1-1 forbids it) and no git hook, and `verify:boundaries`
 * asserted only that the `verify` *script* was well-formed, never that it ran.
 * So the 39px contract Epic 2 pins its action bar against, the colour tokens,
 * and the loaded font faces could all rot with `pnpm build` green.
 *
 * This closes that: `test:e2e` records a hash of the sources the suite
 * observes, and `verify:boundaries` — which `build` does run — fails when those
 * sources have changed since the last recorded run. Change the bar's height and
 * the next `pnpm build` refuses until `pnpm verify` has actually rendered it.
 *
 * `pnpm verify` sets TAILOR_E2E_GATE=off for its own build step, because
 * otherwise the gate could never be satisfied: the build that must precede the
 * e2e run would be blocked by the e2e run not yet having happened.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export const MARKER = ".e2e-verified";

/**
 * Everything `pnpm verify` observes that `pnpm build` cannot. Deliberately
 * narrow: a gate that fires on every unrelated edit gets switched off.
 *
 * Two groups. The first is what the rendered assertions can be broken by. The
 * second is the server-start path: `scripts/startup-gate.mjs` boots the real
 * app and asserts it sets up a machine that began empty, and only `pnpm verify`
 * runs it — so without these entries, deleting the `bootstrap()` call from
 * `instrumentation.ts` would leave a recorded marker valid and `pnpm build`
 * green while the app booted into a directory that was never created.
 */
const OBSERVED = [
  "app/globals.css",
  "app/layout.tsx",
  "components/top-bar/top-bar.tsx",
  "components/top-bar/top-bar.module.css",
  "components/top-bar/labels.ts",
  "e2e/top-bar.spec.ts",
  "playwright.config.ts",
  "instrumentation.ts",
  "adapters/db/bootstrap.ts",
  "scripts/startup-gate.mjs",
  // What a boot actually writes. The gate now compares canon byte-for-byte
  // against the seed and parses `boards.json`, so replacing the seed, editing
  // the journal, or changing what `EMPTY_BOARDS_FILE` serialises all change the
  // gate's verdict — and without these, each of them could land with a recorded
  // marker still valid and the app never re-booted.
  "adapters/db/seed/resume.canon.seed.json",
  "adapters/db/migrations/meta/_journal.json",
  "core/boards/boards-file.ts",
  "core/bootstrap/bootstrap-report.ts",
];

export function observedHash() {
  const digest = createHash("sha256");
  for (const relative of OBSERVED) {
    digest.update(relative);
    digest.update("\0");
    // A missing observed file is itself a change worth failing on, so it is
    // hashed as absent rather than thrown on.
    try {
      digest.update(readFileSync(join(ROOT, relative)));
    } catch {
      digest.update("<absent>");
    }
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function recordedHash() {
  try {
    return readFileSync(join(ROOT, MARKER), "utf8").trim();
  } catch {
    return null;
  }
}

if (process.argv[2] === "--record") {
  const hash = observedHash();
  writeFileSync(join(ROOT, MARKER), `${hash}\n`);
  console.log(`Recorded e2e run against ${hash.slice(0, 12)}.`);
}
