// EXPECT: violation "httpStatus"
// The second of the three unconditional names. Without this fixture the name
// could be dropped from the rule with every check still green.
export const failure = { httpStatus: 503 };
