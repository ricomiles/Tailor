// EXPECT: violation "Response"
// The one bypass that silences every AD-1 rule at once, and the only violation
// class the story shipped with no fixture: a disable comment inside core/.
//
// `noInlineConfig` on the core block is what makes the directive inert. Until
// this fixture existed the flag was asserted only as a resolved *config value*
// via calculateConfigForFile — so an ESLint semantics change, or the core block
// being re-scoped, would have left the assertion green and the guardrail open.
// Here the rule error still fires with the directive present, which is the
// behaviour rather than the setting.
//
// This fixture is also the one place a warning is expected: ESLint emits an
// unruled "has no effect because you have 'noInlineConfig'" notice, and
// verify-boundaries requires that notice to appear at least once.
// eslint-disable-next-line tailor/no-http-response-in-core
export const refused = new Response("no canon on disk");
