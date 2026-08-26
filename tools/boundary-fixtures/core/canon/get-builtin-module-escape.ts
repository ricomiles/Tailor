// EXPECT: violation "node:os"
// Node 22+ hands back a live built-in with no import expression and no
// `require` identifier anywhere. The pinned engine floor is exactly Node 22.
export const os = process.getBuiltinModule("node:os");
