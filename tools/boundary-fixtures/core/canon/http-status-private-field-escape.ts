// EXPECT: violation "statusCode"
// The private marker changes who may read the field, not whether it carries an
// HTTP status.
export class CanonMissing extends Error {
  #statusCode = 404;

  reveal(): number {
    return this.#statusCode;
  }
}
