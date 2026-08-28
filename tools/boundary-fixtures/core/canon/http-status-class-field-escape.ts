// EXPECT: violation "statusCode"
// The class-field shape. This is the one an error subclass actually reaches
// for, and it is a different AST node from both the object property and the
// type member — so it needs its own fixture or the handler can be deleted with
// every check still green.
export class CanonMissing extends Error {
  statusCode = 404;
}
