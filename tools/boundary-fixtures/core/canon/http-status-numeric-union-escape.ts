// EXPECT: violation "status"
// A union of HTTP literals fixes a status as firmly as a single one, and the
// literal walker had no reason to descend into it.
export type Failure = {
  status: 404 | 500;
};
