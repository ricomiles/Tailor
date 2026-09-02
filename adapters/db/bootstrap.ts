import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { constants, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Relative with the extension, not the `@/` alias: this module is loaded
// directly by the Node test runner, which resolves neither tsconfig paths nor
// extensionless specifiers.
import { EMPTY_BOARDS_FILE } from "../../core/boards/boards-file.ts";
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
 * Idempotence is by construction, not by convention: each file is written
 * through an exclusive-create flag, so "does it exist?" and "write it" are one
 * operation the filesystem arbitrates. An existing file is never opened for
 * write, never re-serialised, never repaired. That is what keeps canon alive —
 * it is gitignored, hand-authored and irreplaceable (AD-8), and a
 * check-then-write with a gap between the halves is a truncation waiting for a
 * second process.
 *
 * Bootstrap does not parse canon; it copies bytes. Story 1.6's gateway is the
 * only module that opens that file, and a validating bootstrap would be a
 * second reader with its own idea of the shape.
 *
 * Node built-ins, `better-sqlite3` and `drizzle-orm` all live here rather than
 * under `core/` — AD-1 bans every one of them there, and `pnpm lint` enforces
 * it.
 */

/** Where each artifact lives, relative to the root handed in. */
const DATA_DIRECTORY = "data";
const CANON_FILE = join(DATA_DIRECTORY, "resume.canon.json");
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
 * Every failure leaves here as one `TailorError` carrying `internal` and the
 * original as `cause`. A bare `ENOENT` reaching Next's startup handler names a
 * path and no reason; this names the artifact, and the stack survives.
 *
 * No `stage`: no pipeline run is in flight at server start, and the envelope
 * treats an absent stage as a real state rather than a missing one.
 */
function failed(what: string, cause: unknown): TailorError {
  return new TailorError(
    ERROR_CODES.internal,
    `Bootstrap could not ${what}. The app cannot start without it.`,
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
 * @param root Directory the artifacts are created under. Defaults to the
 * process's working directory, which is the repo root under `next dev` and
 * `next start`. It is a parameter so the suite can point the routine at a temp
 * directory: `pnpm test` runs *inside* `pnpm build`, and a suite that seeded the
 * real `./data` would both dirty the working tree and write over the very canon
 * file this story exists to protect.
 */
export function bootstrap(root: string = process.cwd()): BootstrapReport {
  try {
    mkdirSync(join(root, DATA_DIRECTORY), { recursive: true });
  } catch (error) {
    throw failed(`create ${DATA_DIRECTORY}/`, error);
  }

  // `COPYFILE_EXCL` is the exclusive-create flag for a copy: the destination is
  // opened with `O_EXCL`, so an existing canon file fails the syscall instead of
  // being overwritten. There is no window between the check and the write
  // because there is no check.
  const canon = createOnce(`seed ${CANON_FILE}`, () => {
    copyFileSync(SEED_FILE, join(root, CANON_FILE), constants.COPYFILE_EXCL);
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
    migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });

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
  return bootstrapReportSchema.parse({
    canon,
    boardsFile,
    database: databaseOutcome,
  });
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
