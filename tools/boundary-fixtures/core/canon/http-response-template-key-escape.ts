// EXPECT: violation "Response"
// The Response half of the same backtick bypass.
export const grabbed: unknown = globalThis[`Response`];
