// EXPECT: violation "statusCode"
// A getter is how an Error subclass most naturally exposes a status, and it
// was the one shape the rule's visitor set never reached.
export class CanonMissing extends Error {
  get statusCode(): number {
    return 404;
  }
}
