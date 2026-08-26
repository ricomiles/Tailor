#!/usr/bin/env node
/**
 * Clears boundary probes left behind by a killed `verify:boundaries` run.
 *
 * The probe is a deliberately-violating file in the real `core/` tree, removed
 * on exit. A SIGKILL or a host crash leaves it there, and because `build` runs
 * `pnpm lint` *before* `pnpm verify:boundaries`, the build then fails at lint
 * forever — the step that would clean the probe never runs. So this runs
 * first, and only ever deletes probes whose owning process is gone.
 */

import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROBE_DIR = join(ROOT, "core", "canon");
const PROBE_PREFIX = "__boundary-probe.";

if (existsSync(PROBE_DIR)) {
  for (const entry of readdirSync(PROBE_DIR)) {
    if (!entry.startsWith(PROBE_PREFIX)) continue;
    const pid = Number.parseInt(entry.slice(PROBE_PREFIX.length), 10);
    if (!Number.isNaN(pid)) {
      try {
        process.kill(pid, 0); // Owner still running — not ours to remove.
        continue;
      } catch {
        // Owner is gone; fall through and delete.
      }
    }
    rmSync(join(PROBE_DIR, entry), { force: true });
    console.log(`Removed stale boundary probe: ${relative(ROOT, join(PROBE_DIR, entry))}`);
  }
}
