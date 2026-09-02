import { readFileSync } from "node:fs";
import { join } from "node:path";
// Relative with the extension, not the `@/` alias: this module is loaded
// directly by the Node test runner, which resolves neither tsconfig paths nor
// extensionless specifiers.
import {
  CANON_FILE,
  canonDocumentSchema,
  type CanonDocument,
} from "../../core/canon/canon-document.ts";
import { ERROR_CODES } from "../../core/errors/error-envelope.ts";
import { TailorError } from "../../core/errors/tailor-error.ts";

/**
 * The single canon gateway (AD-8): the only module in the app that opens
 * `data/resume.canon.json`.
 *
 * "Only" is a project invariant rather than a sentence in a doc —
 * `scripts/project-invariants.mjs` scans every app source under `core/`,
 * `adapters/`, `app/`, `components/`, `e2e/`, `tools/` and the repo root for a
 * second reader, and `pnpm build` fails naming it.
 *
 * Reads only. Canon is hand-authored, gitignored and irreplaceable; the single
 * write path — substituting a real figure into an existing `needs-number`
 * field — arrives in Epic 4, and nothing here prepares for it.
 *
 * Node built-ins live here rather than under `core/`: AD-1 bans them there and
 * `eslint.config.mjs` enforces it with `noInlineConfig`, so the module that
 * touches the disk cannot be the module that declares the shape. That split —
 * `core/canon/` for the contract, `adapters/canon/` for the I/O — is the shape
 * `adapters/db/bootstrap.ts` already has against `core/bootstrap/`. The spine
 * lists five port families and canon is not among them, so there is no
 * `CanonPort` and this is called directly.
 */

/**
 * How much of an underlying failure is quoted back to the caller.
 *
 * `app/api/to-error-response.ts` puts `error.message` straight into the
 * response body, so an unbounded Zod issue list or a driver stack would ship
 * to a client. The cause survives untruncated on `cause` for the log.
 */
const DETAIL_LIMIT = 200;

/** How many schema issues are worth naming before the message stops helping. */
const ISSUE_LIMIT = 3;

/**
 * Every failure leaves here as one `TailorError` carrying `internal` and the
 * original as `cause` — the same contract `adapters/db/bootstrap.ts` holds.
 * Nothing else escapes this module.
 *
 * The message names `resume.canon.json` because the epic's copy rule requires
 * every user-facing reference to the resume source to name it, and it names
 * the *repo-relative* path rather than the resolved absolute one: the resolved
 * path leaks the machine's directory layout into an HTTP response body and
 * tells the reader nothing they did not know.
 *
 * No `stage`: a read can happen outside a pipeline run, and the envelope
 * treats an absent stage as a real state rather than a missing one.
 */
function failed(what: string, cause: unknown): TailorError {
  return new TailorError(
    ERROR_CODES.internal,
    `Could not read ${CANON_FILE}: ${what}. Fix the file and retry — it is ` +
      "hand-authored, and nothing repairs it.",
    { cause },
  );
}

/**
 * One line of underlying detail, capped so it cannot become the message.
 *
 * A Node errno error is reduced to its `code`. Its `message` embeds the
 * resolved absolute path — `ENOENT: no such file or directory, open
 * '/Users/…/data/resume.canon.json'` — and `app/api/to-error-response.ts` puts
 * this message straight into a response body, so keeping it would ship the
 * server's directory layout to every client the moment a route reads canon.
 * `ENOENT` says everything the reader can act on; the untouched error survives
 * as `cause` for whoever is reading a log.
 */
function detail(value: unknown): string {
  const code = (value as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code.length > 0) return code;
  const text =
    value instanceof Error ? value.message : String(value ?? "no detail given");
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return "no detail given";
  return flat.length > DETAIL_LIMIT
    ? `${flat.slice(0, DETAIL_LIMIT)}…`
    : flat;
}

/**
 * The failing field paths, which is what the caller can act on.
 *
 * Capped at `ISSUE_LIMIT`: a canon from another schema version produces an
 * issue per field, and a response body listing eighty of them is unreadable.
 * The count is still reported, so "and 77 more" says the file is wrong in
 * kind rather than in detail.
 */
function issueSummary(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  if (issues.length === 0) return "no issue reported";
  const shown = issues.slice(0, ISSUE_LIMIT).map((issue) => {
    const path = issue.path.map((key) => String(key)).join(".");
    return `${path === "" ? "(document root)" : path}: ${issue.message}`;
  });
  const rest = issues.length - shown.length;
  // Capped by length as well as by count, and in that order. `ISSUE_LIMIT`
  // bounds how many issues are shown, but a single `unrecognized_keys` issue
  // enumerates every stray key a hand-edit introduced — one issue, an unbounded
  // string, landing in a response body through `app/api/to-error-response.ts`.
  //
  // The count is appended *after* the truncation rather than folded into it:
  // capping the whole sentence ate the `and N more` suffix, which is the part
  // that tells the reader the file is wrong in kind rather than in detail.
  const body = detail(shown.join("; "));
  return rest > 0 ? `${body}; and ${rest} more` : body;
}

/**
 * Read, parse and validate the canonical resume.
 *
 * Every call re-opens and re-parses the file. There is no cache, no memo and
 * no invalidation hook — not an optimisation deferred, but an absent
 * mechanism: canon is edited by hand while the server runs, and a cached read
 * would serve a document the file no longer contains with no way to tell.
 *
 * Normalisation is not this function's job and cannot be skipped by it: the
 * unfilled-field sentinel is mapped to absent inside `basicsSchema`, so
 * parsing *is* normalising. A placeholder token inside a bullet's `text`, a
 * `TODO` username and `rendering.template` all come back byte-identical.
 *
 * @param root Directory `data/resume.canon.json` is resolved against.
 * Defaults to the process's working directory, which is the repo root under
 * `next dev` and `next start`. It is a parameter for the reason `bootstrap()`'s
 * is: `pnpm test` runs *inside* `pnpm build`, and a suite that read — or a
 * future one that wrote — the real `./data` would put a test path beside the
 * file this epic exists to protect.
 *
 * @throws {TailorError} `internal`, carrying the original as `cause`, when the
 * file cannot be opened, is not JSON, or does not match the canon shape.
 */
export function readCanon(root: string = process.cwd()): CanonDocument {
  let text: string;
  try {
    text = readFileSync(join(root, CANON_FILE), "utf8");
  } catch (error) {
    throw failed(`it could not be opened (${detail(error)})`, error);
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    // Covers the empty file and the byte-order mark alike: both are things a
    // hand-edit really produces, and both reach here as a `SyntaxError` whose
    // own message names neither the file nor what to do about it.
    throw failed(`it is not valid JSON (${detail(error)})`, error);
  }

  // `safeParse`, not `parse`: a thrown `ZodError` escaping this module would
  // break the one contract it advertises, and the issue list has to be capped
  // before it reaches a response body anyway.
  const parsed = canonDocumentSchema.safeParse(value);
  if (!parsed.success) {
    throw failed(
      `it does not match the canon shape (${issueSummary(parsed.error.issues)})`,
      parsed.error,
    );
  }

  return parsed.data;
}
