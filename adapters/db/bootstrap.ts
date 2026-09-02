import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  linkSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Relative with the extension, not the `@/` alias: this module is loaded
// directly by the Node test runner, which resolves neither tsconfig paths nor
// extensionless specifiers.
import { EMPTY_BOARDS_FILE } from "../../core/boards/boards-file.ts";
import { CANON_FILE } from "../../core/canon/canon-document.ts";
import {
  ARTIFACT_OUTCOMES,
  bootstrapReportSchema,
  type ArtifactOutcome,
  type BootstrapReport,
} from "../../core/bootstrap/bootstrap-report.ts";
import { ERROR_CODES } from "../../core/errors/error-envelope.ts";
import { TailorError } from "../../core/errors/tailor-error.ts";

/**
 * The idempotent startup routine (AD-14, FR92).
 *
 * Creates `./data`, seeds `resume.canon.json` **only if absent**, writes
 * `./boards.json` **only if absent**, and applies the versioned Drizzle
 * migrations. Called at every server start from the repo-root
 * `instrumentation.ts`.
 *
 * Idempotence is by construction, not by convention: each file is placed by a
 * single exclusive syscall — `linkSync` for canon, the `wx` flag for
 * `boards.json` — so "does it exist?" and "write it" are one operation the
 * filesystem arbitrates. An existing file is never opened for write, never
 * re-serialised, never repaired. That is what keeps canon alive — it is
 * gitignored, hand-authored and irreplaceable (AD-8), and a check-then-write
 * with a gap between the halves is a truncation waiting for a second process.
 *
 * Bootstrap does not parse canon; it copies bytes. Story 1.6's gateway is the
 * only module that opens that file, and a validating bootstrap would be a
 * second reader with its own idea of the shape.
 *
 * Node built-ins, `better-sqlite3` and `drizzle-orm` all live here rather than
 * under `core/` — AD-1 bans every one of them there, and `pnpm lint` enforces
 * it.
 */

/**
 * Where each artifact lives, relative to the root handed in.
 *
 * `CANON_FILE` is imported from `core/canon/canon-document.ts` rather than
 * declared here: Story 1.6's gateway reads that same path, and two literals
 * naming one file is the drift this repo has already paid for once with the
 * migrations directory (see `MIGRATIONS_FOLDER` below). Bootstrap seeding one
 * path while the gateway read another would leave every check green.
 *
 * `DATA_DIRECTORY` is *derived* from it rather than declared beside it, so the
 * directory this routine creates is by construction the directory canon lands
 * in. Declared independently, moving `CANON_FILE` would have `mkdirSync`
 * create one directory and `linkSync` write into another that does not exist.
 */
const DATA_DIRECTORY = dirname(CANON_FILE);

// A `CANON_FILE` with no separator would make `dirname` return ".", putting the
// database at the repo root instead of inside the gitignored data directory —
// where `startup-gate.mjs` and `run-tests.mjs` would still be watching for it.
if (DATA_DIRECTORY === "." || DATA_DIRECTORY === "") {
  throw new TailorError(
    ERROR_CODES.internal,
    `CANON_FILE ("${CANON_FILE}") must name a path inside a directory; every ` +
      "artifact this routine creates is placed relative to that directory.",
  );
}
const DATABASE_FILE = join(DATA_DIRECTORY, "tailor.db");
const BOARDS_FILE = "boards.json";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Resolved against this module rather than against the root parameter: the
 * seed is app source shipping with the code, not per-machine state. The tests
 * point `root` at a temp directory and still copy this same file, which is what
 * makes their byte-for-byte assertion mean anything.
 */
const SEED_FILE = join(HERE, "seed", "resume.canon.seed.json");

/**
 * Shipped beside this module, journal and all.
 *
 * Exported so `scripts/verify-boundaries.mjs` can assert it is the same
 * directory `drizzle.config.ts` generates *into*. Three unlinked literals named
 * this path — the config's `out`, this constant, and the verifier's journal
 * path — and changing `out` alone would land every generated migration in a
 * directory the running app never reads, with every check still green.
 */
export const MIGRATIONS_FOLDER = join(HERE, "migrations");

/** The ledger `drizzle-orm` records applied migrations in. */
const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * How long SQLite waits for a locked database before giving up.
 *
 * Only ever spent when two servers start at the same moment and both reach
 * `migrate()`; the winner holds the write lock for as long as it takes to
 * create one table. Generous rather than tight because the cost of waiting is a
 * slower second boot and the cost of not waiting is a crashed one.
 */
const BUSY_TIMEOUT_MS = 5_000;

/**
 * Every failure leaves here as one `TailorError` carrying `internal` and the
 * original as `cause`. A bare `ENOENT` reaching Next's startup handler names a
 * path and no reason; this names the artifact, and the stack survives.
 *
 * The sentence says what was measured rather than what would be tidy. An
 * earlier draft read "The app cannot start without it", which is false against
 * Next 16.3.0: the process does not exit. It keeps listening and answers every
 * request 500 for its whole life, because `ensureInstrumentationRegistered`
 * memoises the rejected promise. Telling an operator the app stopped sends them
 * looking for a process that is still there.
 *
 * No `stage`: no pipeline run is in flight at server start, and the envelope
 * treats an absent stage as a real state rather than a missing one.
 */
function failed(what: string, cause: unknown): TailorError {
  return new TailorError(
    ERROR_CODES.internal,
    `Bootstrap could not ${what}. The server will keep listening and answer ` +
      "every request 500 until this is fixed and it is restarted.",
    { cause },
  );
}

/**
 * `EEXIST` is the success case for every artifact here: the file is present and
 * this run did not write it — whether it was there all along or another process
 * won the race a microsecond ago. Anything else (a permission error, a
 * read-only volume, a full disk) is a real failure and must not be swallowed
 * into a cheerful `left-untouched`.
 */
function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

/**
 * Create the file, or report that it was already there.
 *
 * `write` must use an exclusive-create flag and throw `EEXIST` when the target
 * exists — the `EEXIST` handling below is only correct because of it. A
 * preceding `existsSync` check would be a lie: two servers started together
 * would both see "absent", both write, and the second would truncate what the
 * first had just placed.
 */
function createOnce(what: string, write: () => void): ArtifactOutcome {
  try {
    write();
    return ARTIFACT_OUTCOMES.created;
  } catch (error) {
    if (isAlreadyExists(error)) return ARTIFACT_OUTCOMES.leftUntouched;
    throw failed(what, error);
  }
}

/**
 * @param migrationsFolder Directory the journal and its `.sql` files are read
 * from. Defaults to the one shipped beside this module, and is a parameter for
 * the same reason `root` is: the I/O matrix's "journal deleted" row is a real
 * failure mode with a real expected behaviour, and it could not be tested at
 * all while this path was a module constant — the journal ships with the source,
 * so removing it to exercise the row would have broken every other case in the
 * suite. Production never passes it.
 *
 * @param root Directory the artifacts are created under. Defaults to the
 * process's working directory, which is the repo root under `next dev` and
 * `next start`. It is a parameter so the suite can point the routine at a temp
 * directory: `pnpm test` runs *inside* `pnpm build`, and a suite that seeded the
 * real `./data` would both dirty the working tree and write over the very canon
 * file this story exists to protect.
 */
export function bootstrap(
  root: string = process.cwd(),
  migrationsFolder: string = MIGRATIONS_FOLDER,
): BootstrapReport {
  try {
    mkdirSync(join(root, DATA_DIRECTORY), { recursive: true });
  } catch (error) {
    throw failed(`create ${DATA_DIRECTORY}/`, error);
  }

  // Staged, then hard-linked into place — not copied straight to the target.
  //
  // `COPYFILE_EXCL` alone was exclusive but not *atomic*: it opens the real
  // canon path and streams the seed into it, so a process killed mid-copy (or a
  // disk that fills) leaves a truncated `resume.canon.json` at the destination.
  // Every later start then finds a file, reports `left-untouched`, and never
  // reseeds — a permanently broken canon that the idempotence guarantee itself
  // protects from repair.
  //
  // `linkSync` keeps both properties at once: the seed is copied to a staging
  // name first, so a partial write is never at the canon path, and the link is
  // a single atomic syscall that fails with `EEXIST` when canon is already
  // there. `createOnce` reads that `EEXIST` exactly as it read the copy's. The
  // staging name carries a UUID so two processes never contend for it, and the
  // `finally` removes it on both paths.
  const canon = createOnce(`seed ${CANON_FILE}`, () => {
    const target = join(root, CANON_FILE);
    const staging = `${target}.staging-${randomUUID()}`;
    try {
      copyFileSync(SEED_FILE, staging);
      linkSync(staging, target);
    } finally {
      try {
        unlinkSync(staging);
      } catch {
        // A staging file that will not unlink is litter, not a reason to fail a
        // boot whose canon is already in place.
      }
    }
  });

  // Serialised from the frozen `core/` value rather than from a literal here:
  // the shape is declared once, and this writes whatever that declaration says
  // an empty boards file is. `wx` is the exclusive-create flag. Trailing
  // newline so the file is POSIX-clean when a human opens it to add a board.
  const boardsFile = createOnce(`create ${BOARDS_FILE}`, () => {
    writeFileSync(
      join(root, BOARDS_FILE),
      `${JSON.stringify(EMPTY_BOARDS_FILE, null, 2)}\n`,
      { flag: "wx", encoding: "utf8" },
    );
  });

  // Declared outside the `try` and assigned inside it, so that a driver which
  // cannot even open the file — a directory in the way, a read-only volume —
  // fails through the same wrapper as a bad migration instead of escaping as a
  // raw `SqliteError`, while `finally` can still close a connection that was
  // opened.
  let database: ReturnType<typeof drizzle> | undefined;
  let databaseOutcome: ArtifactOutcome;
  try {
    // `drizzle(path)` constructs the `better-sqlite3` client itself, which is
    // why this module never imports that package by name: it ships no type
    // declarations, and a hand-written `declare module` would be a second,
    // unverified description of an API drizzle already types.
    database = drizzle(join(root, DATABASE_FILE));

    // The database half of the I/O matrix's "concurrent start" row. The files
    // are arbitrated by the filesystem, but SQLite's default behaviour on a
    // locked database is to fail the statement immediately with `SQLITE_BUSY` —
    // so two servers started together could bring the second down inside
    // `migrate()` while the first was still writing the ledger. `busy_timeout`
    // makes the loser wait for the lock instead of throwing, which is the
    // "loses harmlessly" the row promises. Read with `get` because an
    // assignment pragma returns the value it set.
    database.get(sql`PRAGMA busy_timeout = ${sql.raw(String(BUSY_TIMEOUT_MS))}`);

    // The outcome is read off the *ledger*, not off `existsSync` on the file.
    // Two reasons, and the second is the one that bites later:
    //
    //  - A file that exists is not a database that has been migrated. An empty
    //    `tailor.db` — an interrupted first start, a `touch` — made the old
    //    check report `left-untouched` for the very run that created the
    //    ledger inside it.
    //  - Once Epic 2 ships a real migration, the file exists on every run
    //    *including* the one that applies the new migration. Counting the
    //    ledger before and after is what keeps `created` meaning "this run
    //    wrote to the database" rather than "the file was absent".
    //
    // It also removes the last check-then-write in this module, which sat
    // awkwardly beside the docstring above insisting there is no check.
    const rowsBefore = ledgerRowCount(database);

    // Applies every journal entry not already recorded in the ledger, creating
    // that table first. The journal ships empty, so today this creates the
    // ledger and applies nothing — the mechanism, ready for Epic 2's first
    // table. A *missing* journal throws here rather than silently migrating
    // nothing, which is the one failure this story must not swallow.
    migrate(database, { migrationsFolder });

    databaseOutcome =
      rowsBefore !== null && ledgerRowCount(database) === rowsBefore
        ? ARTIFACT_OUTCOMES.leftUntouched
        : ARTIFACT_OUTCOMES.created;
  } catch (error) {
    throw failed(`apply migrations to ${DATABASE_FILE}`, error);
  } finally {
    // Bootstrap owns this connection and nothing else uses it. Leaving it open
    // would hold a file handle for the life of the server on behalf of a
    // routine that has already finished.
    //
    // Swallowed deliberately: a throw from `close()` inside `finally` replaces
    // whatever exception was already propagating, so a failed migration would
    // surface as a raw driver error and the `TailorError` naming the artifact
    // would be lost. A connection that will not close is not itself a reason to
    // refuse to start.
    try {
      database?.$client.close();
    } catch {
      // Nothing to do, and nothing worth hiding a real error behind.
    }
  }

  // Parsed rather than assembled and asserted: the report is this story's only
  // proof of idempotence, so it is worth knowing the value really satisfies the
  // schema before a caller branches on it.
  //
  // Inside a `try` like every other failure in this module. A `ZodError` here is
  // unreachable today — all three values come from `ARTIFACT_OUTCOMES` — but the
  // module's contract is that nothing leaves it except a `TailorError`, and an
  // unreachable hole in that contract is still the one path that would reach
  // `register()` as a bare error if a later story widened the report.
  try {
    return bootstrapReportSchema.parse({
      canon,
      boardsFile,
      database: databaseOutcome,
    });
  } catch (error) {
    throw failed("describe what it did to each artifact", error);
  }
}

/**
 * How many migrations the ledger records, or `null` when the ledger does not
 * exist yet — which is a different state from "exists and is empty", and
 * conflating the two is what made an empty database report `left-untouched`.
 *
 * Queried through drizzle rather than the driver so this module keeps its
 * single dependency on an API drizzle types for it.
 */
function ledgerRowCount(database: ReturnType<typeof drizzle>): number | null {
  const present = database.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ${MIGRATIONS_TABLE}`,
  );
  if (present.n === 0) return null;
  return database.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM ${sql.identifier(MIGRATIONS_TABLE)}`,
  ).n;
}
