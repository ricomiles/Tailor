// EXPECT: violation "Response"
// The dotted form. The bracketed twin is its own fixture: the two reach
// `staticKeyName` down different branches, so one can go dead while the other
// still fires.
export const dotted: unknown = globalThis.Response;
