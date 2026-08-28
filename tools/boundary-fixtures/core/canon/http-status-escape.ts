// EXPECT: violation "statusCode"
// `statusCode` carries no domain meaning, so it is rejected unconditionally.
// Both declaration shapes are here — the type member and the object property —
// because a status member on a core error type is the leak whether or not
// anything ever assigns to it. The assignment shapes have their own fixtures
// (`http-status-member-escape.ts`, `http-status-assignment-escape.ts`).
export type Failure = {
  statusCode: number;
};

export const failure: Failure = { statusCode: 500 };
