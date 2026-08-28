// EXPECT: violation "Response"
// The third spelling of the same lookup. Destructuring reads the property, so
// the key is the reference — and the alias it binds to is what gets used, which
// is invisible to every other position this rule checks.
const { Response: Grabbed } = globalThis;

export function refuse(): never {
  throw new Grabbed("no canon on disk");
}
