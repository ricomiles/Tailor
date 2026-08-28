// EXPECT: violation "Response"
// `Response` called without `new`. A rule that matched only `NewExpression`
// left this open, and the two forms are one keyword apart.
export const refused: unknown = Response("no canon on disk");
