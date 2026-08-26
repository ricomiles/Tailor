// EXPECT: violation "../../adapters/db/not-on-disk"
// The target does not exist. A path-resolving rule that only judges resolved
// specifiers skips this silently, leaving TypeScript as the sole catch.
export * from "../../adapters/db/not-on-disk";
