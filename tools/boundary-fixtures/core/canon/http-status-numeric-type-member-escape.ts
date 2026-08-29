// EXPECT: violation "status"
// The numeric clause in type-member position, fixed to a single literal.
export type Failure = {
  status: 500;
};
