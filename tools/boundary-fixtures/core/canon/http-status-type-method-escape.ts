// EXPECT: violation "statusCode"
// The type-level twin of the accessor: a method signature, not a property one.
export interface Failure {
  statusCode(): number;
}
