// EXPECT: violation "Response"
// The binding spelled around entirely. Both forms are statically readable, so
// both are rejected: dropping either reopens the whole rule with one keystroke.
export const dotted: unknown = globalThis.Response;
export const bracketed: unknown = globalThis["Response"];
