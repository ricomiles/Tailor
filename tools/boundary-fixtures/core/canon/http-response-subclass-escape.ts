// EXPECT: violation "Response"
// Inheritance. A core error that *is* an HTTP response has already decided the
// transport, and the superclass position is a reference the construct-shaped
// draft of this rule did not look at.
export class CanonMissing extends Response {}
