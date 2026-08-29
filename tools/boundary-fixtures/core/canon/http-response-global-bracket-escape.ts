// EXPECT: violation "Response"
// The bracketed twin of the dotted global lookup — a string-literal computed
// key rather than an identifier.
export const bracketed: unknown = globalThis["Response"];
