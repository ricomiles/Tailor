// EXPECT: violation "statusCode"
// The member access on its own. Deliberately free of any type member or
// annotation naming `statusCode`, so the only handler that can catch this file
// is the one for `MemberExpression` — an earlier draft used an `as` cast and
// was silently proven by the type-member handler instead.
export function tag(error: Record<string, unknown>): void {
  error.statusCode = 500;
}
