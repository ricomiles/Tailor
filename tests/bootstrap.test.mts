import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { bootstrap } from "../adapters/db/bootstrap.ts";
import { boardsFileSchema } from "../core/boards/boards-file.ts";
import {
  ARTIFACT_OUTCOMES,
  BOOTSTRAP_ARTIFACTS,
  bootstrapReportSchema,
} from "../core/bootstrap/bootstrap-report.ts";
import { TailorError, isTailorError } from "../core/errors/tailor-error.ts";

/**
 * Every case runs against a fresh `mkdtempSync` root under the OS temp
 * directory, never the repo. `pnpm test` runs *inside* `pnpm build`, so a suite
 * that bootstrapped the working directory would seed the developer's real
 * `./data`, dirty the tree on every build, and — the one thing this story
 * exists to prevent — put a test write path beside a hand-edited canon file.
 * The `root` parameter on `bootstrap()` is what makes that avoidable.
 *
 * Test files also run concurrently under `node --test`, so nothing here may
 * share a directory with anything else.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = join(
  REPO_ROOT,
  "adapters",
  "db",
  "seed",
  "resume.canon.seed.json",
);
const CANON = join("data", "resume.canon.json");
const DATABASE = join("data", "tailor.db");
const BOARDS = "boards.json";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tailor-bootstrap-"));
  roots.push(root);
  return root;
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const { created, leftUntouched } = ARTIFACT_OUTCOMES;

// ---------------------------------------------------------------------------
// Clean machine.
// ---------------------------------------------------------------------------

test("a clean machine gets data/, canon, boards.json and a database", () => {
  const root = makeRoot();

  const report = bootstrap(root);

  assert.deepEqual(report, {
    canon: created,
    boardsFile: created,
    database: created,
  });
  assert.equal(statSync(join(root, "data")).isDirectory(), true);
  assert.equal(existsSync(join(root, CANON)), true);
  assert.equal(existsSync(join(root, DATABASE)), true);
  assert.equal(existsSync(join(root, BOARDS)), true);
});

test("the seeded canon is a byte-for-byte copy — bootstrap never reparses it", () => {
  const root = makeRoot();

  bootstrap(root);

  // Compared as bytes, not as parsed JSON. The seed carries `$comment` keys and
  // an unresolved `rendering.template`; a parse-and-reserialise would silently
  // reformat the file while a `deepEqual` on the parsed value still passed.
  // Byte equality is the actual contract (AD-8).
  assert.deepEqual(readFileSync(join(root, CANON)), readFileSync(SEED));
});

test("boards.json is written as the empty documented shape", () => {
  const root = makeRoot();

  bootstrap(root);

  const written = readFileSync(join(root, BOARDS), "utf8");
  assert.deepEqual(boardsFileSchema.parse(JSON.parse(written)), { boards: [] });
  assert.equal(written.endsWith("\n"), true);
});

test("the migration ledger exists and no migration was applied to it", () => {
  const root = makeRoot();

  bootstrap(root);

  // Opened through a second connection, which also proves the routine closed
  // its own — a held write lock would surface here.
  const database = drizzle(join(root, DATABASE));
  try {
    const tables = database.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`,
    );
    assert.deepEqual(
      tables.map((row) => row.name),
      ["__drizzle_migrations"],
    );

    // The journal ships with no entries, so zero migrations ran. A row here
    // would mean a content table had crept into a story that ships none.
    const applied = database.get<{ n: number }>(
      sql`SELECT count(*) AS n FROM __drizzle_migrations`,
    );
    assert.equal(applied.n, 0);
  } finally {
    database.$client.close();
  }
});

test("an empty database file still reports created — the ledger is what counts", () => {
  const root = makeRoot();
  mkdirSync(join(root, "data"));
  // An interrupted first start, or a stray `touch`: the file is there and holds
  // nothing. Reading the outcome off `existsSync` reported `left-untouched` for
  // the very run that created the ledger inside it.
  writeFileSync(join(root, DATABASE), "");

  const report = bootstrap(root);

  assert.equal(report.database, created);
});

test("the database outcome tracks the ledger, so a future migration reports created", () => {
  const root = makeRoot();
  bootstrap(root);
  assert.equal(bootstrap(root).database, leftUntouched);

  // Stands in for Epic 2's first migration: a row appears in the ledger during
  // the run. The file existed the whole time, so an `existsSync` outcome would
  // report `left-untouched` for the run that changed the schema.
  const database = drizzle(join(root, DATABASE));
  try {
    database.run(
      sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('pretend', 1)`,
    );
  } finally {
    database.$client.close();
  }

  // The next run applies nothing new, so it is quiet again — which is the other
  // half of the claim: `created` must not become permanent once a row exists.
  assert.equal(bootstrap(root).database, leftUntouched);
});

// ---------------------------------------------------------------------------
// Re-run. The row that protects canon.
// ---------------------------------------------------------------------------

test("a re-run writes nothing and preserves a hand-edited canon byte-for-byte", () => {
  const root = makeRoot();
  bootstrap(root);

  // Stands in for the developer editing his own resume: the file is now unlike
  // the seed, and losing it is unrecoverable — it is gitignored.
  const handEdited = '{"schemaVersion":"1.0","basics":{"name":"Edited"}}\n';
  writeFileSync(join(root, CANON), handEdited, "utf8");
  const canonBefore = statSync(join(root, CANON));
  const boardsBefore = readFileSync(join(root, BOARDS), "utf8");

  const report = bootstrap(root);

  assert.deepEqual(report, {
    canon: leftUntouched,
    boardsFile: leftUntouched,
    database: leftUntouched,
  });
  assert.equal(readFileSync(join(root, CANON), "utf8"), handEdited);
  // mtime as well as content: rewriting identical bytes is still a write, and
  // it is the write *path* to canon this story forbids, not merely a change in
  // the result.
  assert.equal(
    statSync(join(root, CANON)).mtimeMs,
    canonBefore.mtimeMs,
    "canon was reopened for write on the second run",
  );
  assert.equal(readFileSync(join(root, BOARDS), "utf8"), boardsBefore);
});

test("a third run is as quiet as the second", () => {
  const root = makeRoot();
  bootstrap(root);
  bootstrap(root);

  const report = bootstrap(root);

  for (const artifact of BOOTSTRAP_ARTIFACTS) {
    assert.equal(report[artifact], leftUntouched, artifact);
  }
});

// ---------------------------------------------------------------------------
// Partial state.
// ---------------------------------------------------------------------------

test("a deleted boards.json is recreated and canon is left alone", () => {
  const root = makeRoot();
  bootstrap(root);
  const canonBefore = statSync(join(root, CANON));
  unlinkSync(join(root, BOARDS));

  const report = bootstrap(root);

  assert.deepEqual(report, {
    canon: leftUntouched,
    boardsFile: created,
    database: leftUntouched,
  });
  assert.equal(statSync(join(root, CANON)).mtimeMs, canonBefore.mtimeMs);
  assert.equal(existsSync(join(root, BOARDS)), true);
});

test("a deleted canon is reseeded and an edited boards.json is left alone", () => {
  const root = makeRoot();
  bootstrap(root);
  writeFileSync(
    join(root, BOARDS),
    '{"boards":[{"type":"lever","token":"acme"}]}\n',
    "utf8",
  );
  const boardsBefore = readFileSync(join(root, BOARDS), "utf8");
  unlinkSync(join(root, CANON));

  const report = bootstrap(root);

  assert.deepEqual(report, {
    canon: created,
    boardsFile: leftUntouched,
    database: leftUntouched,
  });
  assert.deepEqual(readFileSync(join(root, CANON)), readFileSync(SEED));
  assert.equal(readFileSync(join(root, BOARDS), "utf8"), boardsBefore);
});

// ---------------------------------------------------------------------------
// Malformed existing file. Idempotence outranks repair.
// ---------------------------------------------------------------------------

test("a boards.json holding invalid JSON is left untouched and the start succeeds", () => {
  const root = makeRoot();
  bootstrap(root);
  const broken = "{ this is not json";
  writeFileSync(join(root, BOARDS), broken, "utf8");

  const report = bootstrap(root);

  // Bootstrap has no write path to an existing file, so it cannot repair this
  // one, and refusing to start would strand the app on a file the user can fix
  // in an editor. Epic 2's reader parses through `boardsFileSchema` and reports
  // the damage where it can be acted on.
  assert.equal(report.boardsFile, leftUntouched);
  assert.equal(readFileSync(join(root, BOARDS), "utf8"), broken);
  assert.throws(() => JSON.parse(broken));
});

test("a canon holding invalid JSON is left untouched — bootstrap never parses it", () => {
  const root = makeRoot();
  bootstrap(root);
  const broken = "not json at all";
  writeFileSync(join(root, CANON), broken, "utf8");

  const report = bootstrap(root);

  assert.equal(report.canon, leftUntouched);
  assert.equal(readFileSync(join(root, CANON), "utf8"), broken);
});

// ---------------------------------------------------------------------------
// Failure. One error shape, never a bare Error.
// ---------------------------------------------------------------------------

/** Every failure path must produce the same recognisable shape. */
function assertTailorInternal(run: () => unknown): void {
  assert.throws(run, (error: unknown) => {
    assert.equal(isTailorError(error), true);
    assert.ok(error instanceof TailorError);
    assert.equal(error.code, "internal");
    // No pipeline run is in flight at server start, so the stage is absent
    // rather than guessed.
    assert.equal(error.stage, undefined);
    // The original errno error survives, which is the only thing making an
    // `internal` code debuggable.
    assert.notEqual(error.cause, undefined);
    return true;
  });
}

test("a data path occupied by a file fails as a TailorError carrying the cause", () => {
  const root = makeRoot();
  writeFileSync(join(root, "data"), "not a directory", "utf8");

  assertTailorInternal(() => bootstrap(root));
});

test("an unopenable database fails as a TailorError, not a raw driver error", () => {
  const root = makeRoot();
  mkdirSync(join(root, "data"));
  // A directory where the database file belongs. The canon copy and the boards
  // write both succeed; opening the database does not, which is the migration
  // half of the routine failing loudly rather than starting a server with no
  // ledger. The `Journal deleted` row of the I/O matrix fails through this same
  // wrapper — the journal itself cannot be removed here without breaking every
  // other case in the file, since it ships with the source.
  mkdirSync(join(root, DATABASE));

  assertTailorInternal(() => bootstrap(root));
});

// ---------------------------------------------------------------------------
// The report itself.
// ---------------------------------------------------------------------------

test("the report parses through its schema and names every artifact", () => {
  const root = makeRoot();

  const report = bootstrapReportSchema.parse(bootstrap(root));

  assert.deepEqual(Object.keys(report).sort(), [...BOOTSTRAP_ARTIFACTS].sort());
});
