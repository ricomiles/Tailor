// EXPECT: violation "status"
// The dotted assignment. The bracketed twin is its own fixture.
export function refuse(holder: Record<string, unknown>): void {
  holder.status = 500;
}
