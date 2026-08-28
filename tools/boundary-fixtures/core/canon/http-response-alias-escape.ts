// EXPECT: violation "Response"
// The alias bypass. A construct-shaped rule sees `new Aliased(...)` and nothing
// else; the reference on line 5 is the only place the leak is still visible
// without type information — the same argument `no-deferred-module-loading`
// makes for rejecting `require` as a value.
const Aliased = Response;

export function refuse(): never {
  throw new Aliased("no canon on disk");
}
