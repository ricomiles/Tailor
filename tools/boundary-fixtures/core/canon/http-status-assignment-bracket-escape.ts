// EXPECT: violation "status"
// The bracketed twin: a string-literal computed key on the assignment target.
export function refuse(holder: Record<string, unknown>): void {
  holder["status"] = 404;
}
