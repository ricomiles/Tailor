// EXPECT: violation "statusCode"
// A computed key holding a string literal is statically readable, so quoting it
// must not be an escape. It was.
export const failure = { ["statusCode"]: 500 };
