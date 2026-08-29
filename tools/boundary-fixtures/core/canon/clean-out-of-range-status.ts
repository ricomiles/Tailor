// EXPECT: clean
// The boundary of the numeric clause. 99 and 600 are not HTTP statuses, and a
// domain `status` that happens to be a small number must stay legal under
// core/ — an off-by-one in the range test would otherwise be invisible.
export const belowRange = { status: 99 };
export const aboveRange = { status: 600 };
export const attempts = { status: 3 };
