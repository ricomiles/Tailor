// EXPECT: violation "node:url"
// Resolution without loading is still a reference the core may not make.
export const resolved = import.meta.resolve("node:url");
