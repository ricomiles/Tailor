// EXPECT: violation "NextResponse"
// Declared rather than imported, so this fixture proves the *construct* is
// rejected on its own. The import form is already an AD-1 framework escape,
// which would otherwise mask whether this rule fired at all.
declare const NextResponse: { json(body: unknown): unknown };

export const rejected = NextResponse.json({ code: "not-found" });
