// EXPECT: violation "<non-literal>"
// Deferred with a computed specifier: no pattern rule can inspect it, which
// is why the whole class is banned rather than pattern-matched.
const specifier = "node:child_process";

export async function loadHidden() {
  return await import(specifier);
}
