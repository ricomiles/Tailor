// EXPECT: violation "Response"
// The identity test. Branching on whether a value is an HTTP response is the
// same leak read backwards, and it is its own AST position.
export const looksHttp = (value: unknown): boolean => value instanceof Response;
