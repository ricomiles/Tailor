// EXPECT: violation "status"
// The numeric clause in class-field position. The unconditional-name fixtures
// do not reach it, so without this the branch can be deleted unnoticed.
export class CanonMissing extends Error {
  status = 404;
}
