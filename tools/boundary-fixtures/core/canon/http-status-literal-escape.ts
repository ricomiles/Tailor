// EXPECT: violation "status"
// The numeric clause: `status` is a legal domain field name, so it is rejected
// only when its value is a number in 100-599.
export function refuse(): never {
  throw { status: 404, message: "no canon on disk" };
}
