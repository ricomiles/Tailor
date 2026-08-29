// EXPECT: violation "Response"
// The static-call shape the README claimed but no fixture held. Caught as a
// member read of `Response`, one step before the call itself.
export const refused: unknown = Response.json({ code: "not-found" });
