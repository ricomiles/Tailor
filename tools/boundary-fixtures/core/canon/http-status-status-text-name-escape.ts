// EXPECT: violation "statusText"
// The third unconditional name, and the one carrying no number at all — which
// is the point: the name is what makes it an HTTP status, not the value.
export const failure = { statusText: "Not Found" };
