// EXPECT: violation "<require-as-value>"
// Deferred by aliasing: `require` never appears as a call callee.
declare const require: (specifier: string) => unknown;

export function loadHidden() {
  const load = require;
  return load("node:fs");
}
