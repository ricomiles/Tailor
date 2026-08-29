// EXPECT: violation "statusCode"
// The computed-key bypass spelled with a backtick instead of a quote. The
// quoted form was already closed; this was the same one-line escape.
export const failure = { [`statusCode`]: 500 };
