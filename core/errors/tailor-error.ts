// Relative with the extension, not the `@/` alias: this module is loaded
// directly by the Node test runner, which resolves neither tsconfig paths nor
// extensionless specifiers.
import type { PipelineStage } from "../pipeline/pipeline-stages.ts";
import { errorCodeSchema, type ErrorCode } from "./error-envelope.ts";

/**
 * The one error adapters and core services throw.
 *
 * Errors flow one direction: this carries a stable `ErrorCode` and, where a
 * pipeline run is in flight, the stage it failed in. It carries no HTTP status
 * and no `Response` — mapping a code to a status is `app/api/`'s job and
 * nothing under `core/` may do it (enforced by `tailor/no-http-status-in-core`
 * and `tailor/no-http-response-in-core`).
 */
export class TailorError extends Error {
  readonly code: ErrorCode;

  /**
   * Assigned unconditionally, so the property always exists carrying an
   * explicit `undefined` rather than existing only sometimes. Key *absence* is
   * a contract of the envelope — the translator omits the key — not of this
   * class, and conflating the two is how `"stage" in error` would come to mean
   * something different from `"stage" in body`.
   */
  readonly stage: PipelineStage | undefined;

  /**
   * Branded so recognition does not rest on `instanceof` alone. A value that
   * crossed a realm (a worker, a `vm` context) or a bundler boundary has a
   * different prototype chain, and every `instanceof` against it is false —
   * which would silently turn a typed error into an unhandled rethrow, a
   * failure that looks like a 500 and points nowhere.
   */
  readonly isTailorError = true;

  /**
   * `options` forwards to `Error`, so `cause` survives: an adapter wrapping an
   * underlying driver failure keeps the original error and its stack, which is
   * the only thing that makes a `internal` code debuggable.
   */
  constructor(
    code: ErrorCode,
    message: string,
    options?: ErrorOptions & { readonly stage?: PipelineStage },
  ) {
    super(message, options);
    this.name = "TailorError";
    this.code = code;
    this.stage = options?.stage;
  }
}

/**
 * The composition root's only recognition test. Everything it rejects is
 * rethrown untouched, which is what keeps Next's `notFound()` and `redirect()`
 * signals working without reaching for an `unstable_`-prefixed API.
 *
 * The brand path deliberately does not require `instanceof Error`: the case it
 * exists for is a value whose prototype chain came from another realm, where
 * `instanceof Error` is false for the same reason `instanceof TailorError` is.
 * It checks `code` and `message` instead, so everything this accepts can be
 * turned into a well-formed envelope — recognising a value the translator then
 * fails to format would reintroduce the unhandled throw it exists to prevent.
 */
export function isTailorError(value: unknown): value is TailorError {
  if (value instanceof TailorError) return true;
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    isTailorError?: unknown;
    code?: unknown;
    message?: unknown;
  };
  return (
    candidate.isTailorError === true &&
    typeof candidate.message === "string" &&
    errorCodeSchema.safeParse(candidate.code).success
  );
}
