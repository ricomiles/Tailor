// EXPECT: violation "status"
// The numeric clause on an assignment rather than a declaration. `status` is a
// legal domain field name, so the number is what makes this a violation — and
// the bracketed form is as statically readable as the dotted one. No type
// member here either, for the same reason as the sibling fixture.
export function refuse(holder: Record<string, unknown>): void {
  holder.status = 500;
  holder["status"] = 404;
}
