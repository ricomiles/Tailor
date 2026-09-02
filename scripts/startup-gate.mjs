/**
 * Proves the startup wiring actually runs.
 *
 * Every other check in this repo calls `bootstrap()` directly. That leaves the
 * one thing the story is *about* — that starting the app sets the machine up —
 * carried by nothing: delete the `bootstrap()` call from `instrumentation.ts`,
 * or invert its `NEXT_RUNTIME` guard, and `pnpm lint`, `typecheck`, `test`,
 * `verify:boundaries` and all ten Playwright tests stay green. The app would
 * ship booting into a directory that was never created, first discovered by
 * whichever later story went looking for the canon file.
 *
 * So this boots the real production server with its **working directory on a
 * fresh temp root** and asserts the artifacts appear there. Nothing is mocked
 * and nothing is imported from the app: the only thing under test is what a
 * server start does to an empty machine.
 *
 * Two details make it sound rather than merely plausible:
 *
 *  - It asserts only after a request has been answered. Next guarantees
 *    `register()` completes before the server handles a request, so a served
 *    response is the moment the artifacts must exist — a sleep would be a guess.
 *  - A *failing* bootstrap does not stop the server. Verified against 16.3.0:
 *    the process keeps listening and answers every request `500`, because
 *    `ensureInstrumentationRegistered` memoises the rejected promise
 *    (`next/dist/server/lib/router-utils/instrumentation-globals.external.js`).
 *    So a 500 with no artifacts and a 200 with no artifacts both fail here, and
 *    neither could be distinguished by waiting for the process to exit.
 *
 * Wired into `test:e2e`, ahead of Playwright, because `next start` needs a
 * build and `pnpm verify` is the only chain that has one. `scripts/e2e-gate.mjs`
 * is what stops that from rotting: `instrumentation.ts` and
 * `adapters/db/bootstrap.ts` are in its `OBSERVED` list, so changing either
 * makes `pnpm build` refuse until `pnpm verify` has booted the app again.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");

/**
 * What a boot must leave behind, relative to the server's working directory.
 * Named here rather than imported from `core/` on purpose: this gate is meant
 * to fail when the app stops producing these paths, and reading the list from
 * the app would let a rename satisfy the gate by changing both sides at once.
 */
export const STARTUP_ARTIFACTS = Object.freeze([
  "data/resume.canon.json",
  "data/tailor.db",
  "boards.json",
]);

const BOOT_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** An unused port from the OS, so a developer's own `pnpm dev` is never hit. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** SIGTERM, then SIGKILL if it is still up. Never leave a server listening. */
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const killed = await Promise.race([ended, sleep(5_000).then(() => "timeout")]);
  if (killed === "timeout") {
    child.kill("SIGKILL");
    await ended;
  }
}

/**
 * Boots the built app once against `cwd` and resolves when it has answered a
 * request. Rejects with the server's own output if it never does — an empty
 * failure message here would send the reader to the wrong file.
 */
async function bootOnce(cwd) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [NEXT_BIN, "start", ROOT, "--port", String(port), "--hostname", "127.0.0.1"],
    // `cwd` is the whole mechanism: `bootstrap()` defaults its root to
    // `process.cwd()`, and Next resolves the app from the directory argument
    // instead, so the server is the real one and its writes land in the temp
    // root. `.next` stays where the build put it.
    { cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env },
  );

  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));

  let exited = null;
  child.once("exit", (code, signal) => (exited = { code, signal }));

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      if (exited !== null) {
        throw new Error(
          `The server exited (code ${exited.code}, signal ${exited.signal}) ` +
            `before answering a request.\n\n${output}`,
        );
      }
      try {
        // Any status counts. A 500 means `register()` threw, which is a real
        // outcome this gate must report as "no artifacts", not as "no boot".
        const response = await fetch(`http://127.0.0.1:${port}/`);
        return { status: response.status, output };
      } catch {
        await sleep(POLL_INTERVAL_MS);
      }
    }
    throw new Error(
      `The server never answered a request within ${BOOT_TIMEOUT_MS}ms.\n\n${output}`,
    );
  } finally {
    await stop(child);
  }
}

/**
 * @returns {Promise<string[]>} the problems found; empty means the gate passed.
 */
export async function runStartupGate() {
  if (!existsSync(join(ROOT, ".next", "BUILD_ID"))) {
    return [
      "No production build to start (.next/BUILD_ID is absent). Run `pnpm build` " +
        "first — `pnpm verify` does, which is why this gate runs inside `test:e2e`.",
    ];
  }

  // Never the repo. The gate's whole claim is about a machine with no `./data`,
  // and running it here would both be untrue and write over a hand-edited canon.
  const cwd = mkdtempSync(join(tmpdir(), "tailor-startup-"));
  try {
    const { status, output } = await bootOnce(cwd);
    const missing = STARTUP_ARTIFACTS.filter(
      (relative) => !existsSync(join(cwd, relative)),
    );
    if (missing.length === 0) return [];
    return [
      `The server started (HTTP ${status}) but created none of: ` +
        `${missing.join(", ")} — under a working directory that began empty. ` +
        "Either `instrumentation.ts` no longer calls `bootstrap()`, its " +
        "`NEXT_RUNTIME` guard no longer matches, or the routine threw. Server " +
        `output:\n\n${output}`,
    ];
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// Run as a script: `node scripts/startup-gate.mjs`, and from `test:e2e`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = await runStartupGate();
  if (problems.length > 0) {
    console.error("Startup wiring is NOT intact:\n");
    for (const problem of problems) console.error(`  - ${problem}\n`);
    process.exit(1);
  }
  console.log(
    `Startup wiring intact: a real server boot created ${STARTUP_ARTIFACTS.join(", ")} ` +
      "under a working directory that began empty.",
  );
}
