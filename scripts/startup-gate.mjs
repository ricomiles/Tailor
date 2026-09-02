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
 * It boots **twice** against the same temp root. The first boot proves the
 * artifacts appear; the second proves the story's first acceptance criterion —
 * "stop it and re-run it, and the second start writes nothing" — at the level
 * the criterion is actually written about. `tests/bootstrap.test.mts` proves
 * idempotence by calling `bootstrap()` in-process, which is exactly the class of
 * proof round 1 rejected for the wiring.
 *
 * It asserts *content*, not just existence. Three `writeFileSync(path, "")`
 * calls would satisfy a gate that only asked whether the paths were there, and
 * a neutered bootstrap is the thing this file exists to catch. Canon is compared
 * byte-for-byte against the seed, `boards.json` must parse to a boards array,
 * and `tailor.db` must actually carry the migration ledger.
 *
 * Wired into `test:e2e`, ahead of Playwright, because `next start` needs a
 * build and `pnpm verify` is the only chain that has one. `scripts/e2e-gate.mjs`
 * is what stops that from rotting: `instrumentation.ts` and
 * `adapters/db/bootstrap.ts` are in its `OBSERVED` list, so changing either
 * makes `pnpm build` refuse until `pnpm verify` has booted the app again.
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
const REQUEST_TIMEOUT_MS = 10_000;
const BOOT_ATTEMPTS = 3;

/** The seed the boot must place verbatim, and the ledger it must create. */
const SEED_FILE = join(ROOT, "adapters", "db", "seed", "resume.canon.seed.json");
const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * What a stale build would hide. `.next` is the thing the gate actually boots,
 * so a build older than any of these is a gate reporting on code that is not
 * the code in the tree.
 */
const BUILD_INPUTS = [
  "instrumentation.ts",
  "adapters/db/bootstrap.ts",
  "adapters/db/seed/resume.canon.seed.json",
  "adapters/db/migrations/meta/_journal.json",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Everything wrong with what a boot left behind, as sentences.
 *
 * Pure, and exported, for the reason `scripts/project-invariants.mjs` is: the
 * booting half of this file cannot run inside `pnpm test` (it needs a build),
 * so without a seam the gate's own judgement would be the one thing in the repo
 * proven by nothing. `tests/startup-gate.test.mts` fires violating inputs at it.
 *
 * @param {{ status: number, canon: Buffer | null, seed: Buffer, boards: string | null, database: Buffer | null }} observed
 * @returns {string[]}
 */
export function artifactProblems(observed) {
  const problems = [];
  const { status, canon, seed, boards, database } = observed;

  // A failed `register()` does not stop the server: Next answers 500 for the
  // life of the process. That is reported here even when the artifacts are all
  // present, because bootstrap creates canon and `boards.json` *before* it
  // touches the database — so a throw inside `migrate()` leaves all three paths
  // on disk and a permanently broken app behind them.
  if (status >= 500) {
    problems.push(
      `the server answered HTTP ${status}, which is what a thrown \`register()\` ` +
        "looks like — Next keeps listening and 500s forever rather than exiting",
    );
  }

  if (canon === null) {
    problems.push("data/resume.canon.json was not created");
  } else if (!canon.equals(seed)) {
    problems.push(
      "data/resume.canon.json is not a byte-for-byte copy of the seed — " +
        "something wrote that path without copying it",
    );
  }

  if (boards === null) {
    problems.push("boards.json was not created");
  } else {
    let parsed;
    try {
      parsed = JSON.parse(boards);
    } catch (error) {
      problems.push(`boards.json is not valid JSON (${error.message})`);
    }
    if (parsed !== undefined && !Array.isArray(parsed?.boards)) {
      problems.push("boards.json has no `boards` array");
    }
  }

  if (database === null) {
    problems.push("data/tailor.db was not created");
  } else if (!database.includes(MIGRATIONS_TABLE)) {
    // Read as bytes rather than opened with a driver, on purpose: SQLite stores
    // its schema as text in the file, and asking the app for a connection would
    // let the gate share a bug with the code it is judging. An empty file — a
    // `drizzle()` that opened the path and a `migrate()` that then threw —
    // fails here, where `existsSync` passed it.
    problems.push(
      `data/tailor.db carries no ${MIGRATIONS_TABLE} ledger, so migrations never ran`,
    );
  }

  return problems;
}

/** Reads back what a boot left under `cwd`, tolerating anything absent. */
function observe(cwd, status) {
  const read = (relative) => {
    try {
      return readFileSync(join(cwd, relative));
    } catch {
      return null;
    }
  };
  const boards = read("boards.json");
  return {
    status,
    canon: read("data/resume.canon.json"),
    seed: readFileSync(SEED_FILE),
    boards: boards === null ? null : boards.toString("utf8"),
    database: read("data/tailor.db"),
  };
}

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

/** Distinguishes a port lost between probe and spawn from a real boot failure. */
class PortTaken extends Error {}

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

  // Without this listener an `error` event — a missing `next` binary, an
  // unexecutable node — is an unhandled `error` on an EventEmitter, which
  // throws out of the event loop and takes the gate down with a stack trace
  // instead of the diagnosis it exists to print.
  let spawnError = null;
  child.once("error", (error) => (spawnError = error));

  let exited = null;
  child.once("exit", (code, signal) => (exited = { code, signal }));

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      if (spawnError !== null) {
        throw new Error(`The server could not be spawned: ${spawnError.message}`);
      }
      if (exited !== null) {
        // `freePort` asks the OS for a port, closes the probe, and only then
        // spawns — so anything else on the machine can take it in between,
        // including a second copy of this gate. That is a retry, not a verdict.
        if (/EADDRINUSE|address already in use/i.test(output)) {
          throw new PortTaken(`port ${port} was taken between probe and spawn`);
        }
        throw new Error(
          `The server exited (code ${exited.code}, signal ${exited.signal}) ` +
            `before answering a request.\n\n${output}`,
        );
      }
      try {
        // Any status counts here; `artifactProblems` is what judges a 500. The
        // per-request timeout is what keeps a server that accepts the socket and
        // never answers — a plausible shape for a hung `register()` — from
        // parking the whole gate past its deadline with nothing printed.
        const response = await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
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

/** `bootOnce`, retrying only the one failure that is about the machine. */
async function boot(cwd) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await bootOnce(cwd);
    } catch (error) {
      if (!(error instanceof PortTaken) || attempt === BOOT_ATTEMPTS) throw error;
    }
  }
}

/** The newest mtime among the sources a boot actually exercises. */
function newestInputMtime() {
  let newest = 0;
  for (const relative of BUILD_INPUTS) {
    try {
      newest = Math.max(newest, statSync(join(ROOT, relative)).mtimeMs);
    } catch {
      // A missing input is a different failure, and the checks that own it
      // report it far more legibly than a freshness comparison could.
    }
  }
  return newest;
}

/**
 * @returns {Promise<string[]>} the problems found; empty means the gate passed.
 */
export async function runStartupGate() {
  const buildId = join(ROOT, ".next", "BUILD_ID");
  if (!existsSync(buildId)) {
    return [
      "No production build to start (.next/BUILD_ID is absent). Run `pnpm build` " +
        "first — `pnpm verify` does, which is why this gate runs inside `test:e2e`.",
    ];
  }

  // A gate that boots a build older than the startup path is a gate reporting
  // on code that is not in the tree. `pnpm test:e2e` run on its own — after an
  // edit, without a rebuild — would otherwise boot the previous server, pass,
  // and then let `e2e-gate.mjs --record` re-arm the marker for the new sources.
  if (statSync(buildId).mtimeMs < newestInputMtime()) {
    return [
      "The build in .next is older than the startup path it would be booted " +
        `from (${BUILD_INPUTS.join(", ")}). This gate would report on code that ` +
        "is not in the tree. Run `pnpm verify`, which rebuilds first.",
    ];
  }

  // Never the repo. The gate's whole claim is about a machine with no `./data`,
  // and running it here would both be untrue and write over a hand-edited canon.
  const cwd = mkdtempSync(join(tmpdir(), "tailor-startup-"));
  try {
    const first = await boot(cwd);
    const problems = artifactProblems(observe(cwd, first.status));
    if (problems.length > 0) {
      return problems.map(
        (problem) =>
          `${problem} — under a working directory that began empty. Either ` +
          "`instrumentation.ts` no longer calls `bootstrap()`, its " +
          "`NEXT_RUNTIME` guard no longer matches, or the routine threw. " +
          `Server output:\n\n${first.output}`,
      );
    }

    // The story's first acceptance criterion, at the level it is written about:
    // start, stop, start again, and the second start writes nothing. Canon is
    // hand-edited in between, because "wrote nothing" and "rewrote the same
    // bytes" are the same file and different guarantees — it is the write
    // *path* to canon this story forbids.
    const canonPath = join(cwd, "data", "resume.canon.json");
    const edited = `${readFileSync(canonPath, "utf8")}\n`;
    writeFileSync(canonPath, edited);
    const before = statSync(canonPath).mtimeMs;

    const second = await boot(cwd);
    const rerun = [];
    if (second.status >= 500) {
      rerun.push(`the second start answered HTTP ${second.status}`);
    }
    if (readFileSync(canonPath, "utf8") !== edited) {
      rerun.push("the second start overwrote a hand-edited canon");
    }
    if (statSync(canonPath).mtimeMs !== before) {
      rerun.push("the second start reopened canon for write");
    }
    return rerun.map(
      (problem) =>
        `${problem} — a re-run against an already-set-up directory must write ` +
        `nothing at all. Server output:\n\n${second.output}`,
    );
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
      "under a working directory that began empty, with canon byte-identical to " +
      "the seed and the migration ledger in place; a second boot wrote nothing.",
  );
}
