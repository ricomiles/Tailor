/**
 * `pnpm verify` — the full gate: build, then render.
 *
 * A script rather than `pnpm build && pnpm test:e2e` because the build step has
 * to run with the e2e freshness gate disabled. That gate (see e2e-gate.mjs)
 * lives inside `verify:boundaries`, which `build` runs; leaving it armed here
 * would mean the build that must precede the e2e run is blocked by the e2e run
 * not yet having happened.
 *
 * `pnpm build` on its own keeps the gate armed. That is the point: it is the
 * only chain anything runs automatically, so it is the only place a stale e2e
 * run can be caught.
 */
import { spawnSync } from "node:child_process";

const steps = [
  { label: "build", args: ["build"], env: { TAILOR_E2E_GATE: "off" } },
  { label: "test:e2e", args: ["test:e2e"], env: {} },
];

for (const step of steps) {
  const result = spawnSync("pnpm", step.args, {
    stdio: "inherit",
    env: { ...process.env, ...step.env },
  });
  if (result.error) {
    console.error(`Could not run pnpm ${step.label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`pnpm ${step.label} was terminated by ${result.signal}.`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
