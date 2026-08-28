// EXPECT: violation "Response"
// `Response` is a global. This file imports nothing, so every AD-1 import rule
// passes it — which is exactly why the prohibition needed its own mechanism.
export function refuse(): never {
  throw new Response("no canon on disk", { status: 404 });
}
