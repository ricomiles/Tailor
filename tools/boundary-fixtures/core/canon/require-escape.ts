// EXPECT: violation "drizzle-kit"
// Deferred: CommonJS form, equally invisible to the static import rules.
export function loadKit() {
  return require("drizzle-kit");
}
