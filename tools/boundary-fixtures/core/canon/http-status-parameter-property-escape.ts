// EXPECT: violation "statusCode"
// A parameter property declares a field without ever producing a
// PropertyDefinition, so it walked past both clauses of the rule.
export class CanonMissing extends Error {
  constructor(readonly statusCode: number) {
    super("no canon on disk");
  }
}
