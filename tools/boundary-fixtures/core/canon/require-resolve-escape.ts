// EXPECT: violation "better-sqlite3"
// Deferred: resolves a forbidden package without importing it.
declare const require: { resolve(specifier: string): string };

export function locateDriver() {
  return require.resolve("better-sqlite3");
}
