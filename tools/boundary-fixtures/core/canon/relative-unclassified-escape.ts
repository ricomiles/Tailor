// EXPECT: violation "../../../../scripts/verify-boundaries.mjs"
// `scripts/` is not one of the classified element types, and
// `boundaries/element-types` allows a dependency it cannot classify.
export * from "../../../../scripts/verify-boundaries.mjs";
