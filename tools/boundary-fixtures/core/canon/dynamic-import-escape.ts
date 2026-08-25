// EXPECT: violation "node:child_process"
// Deferred: no static import declaration exists, so no-restricted-imports and
// boundaries/element-types both see nothing here.
export async function spawnSomething() {
  const { execFile } = await import("node:child_process");
  return execFile;
}
