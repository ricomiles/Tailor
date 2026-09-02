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
import { statSync } from "node:fs";

const steps = [
  { label: "build", args: ["build"], env: { TAILOR_E2E_GATE: "off" } },
  { label: "test:e2e", args: ["test:e2e"], env: {} },
];

/**
 * "Given `pnpm build`, when it completes, then no `./data` directory was
 * created by the build itself" — the one acceptance criterion nothing checked.
 *
 * It was also unobservable by hand: on any machine that has ever run the app,
 * `./data` is already there, so a human running the criterion literally cannot
 * tell a pass from a fail. Comparing mtimes instead of existence answers it on a
 * dirty checkout too. Asserted after `build` and *before* `test:e2e`, because
 * the e2e step starts a real server at this working directory and is supposed
 * to create these.
 */
const BUILD_MUST_NOT_TOUCH = ["data", "data/resume.canon.json", "data/tailor.db", "boards.json"];
const stamp = () =>
  BUILD_MUST_NOT_TOUCH.map((relative) => {
    try {
      return `${relative}@${statSync(relative).mtimeMs}`;
    } catch {
      return `${relative}@absent`;
    }
  });

const beforeBuild = stamp();

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

  if (step.label === "build") {
    const touched = stamp()
      .map((after, index) => (after === beforeBuild[index] ? null : BUILD_MUST_NOT_TOUCH[index]))
      .filter((relative) => relative !== null);
    if (touched.length > 0) {
      console.error(
        `pnpm build created or modified ${touched.join(", ")}. The build is a ` +
          "check chain: `register()` is skipped during `next build`, and nothing " +
          "in the chain may call `bootstrap()` against the real working directory.",
      );
      process.exit(1);
    }
  }
}
