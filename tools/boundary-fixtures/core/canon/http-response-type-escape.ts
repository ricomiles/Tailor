// EXPECT: violation "Response"
// The same leak one step earlier: a core function that promises an HTTP
// response has already decided the transport, whether or not it builds one.
export type CanonReader = {
  read(): Promise<Response>;
};
