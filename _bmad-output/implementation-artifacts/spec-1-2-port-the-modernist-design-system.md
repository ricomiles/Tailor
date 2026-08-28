---
title: 'Story 1.2 — Port the Modernist design system'
type: 'feature'
created: '2026-08-26'
status: 'done'
baseline_commit: 'aa8af17ede6d7873995c3a3e1887ab0823a8aea1'
review_loop_iteration: 3
context: ['_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `app/globals.css` is a 10-line placeholder. Every screen from Story 1.3 onward needs a settled token vocabulary and component layer; without one, each screen invents its own colors, spacing, and focus styling, and the product's visual premise decays one component at a time.

**Approach:** Port the Modernist source stylesheet into `app/globals.css` as the single style foundation — tokens, element layer, and component classes — and load Archivo through `next/font` instead of a runtime request to Google.

## Boundaries & Constraints

**Always:**
- The port stays **diffable against the source**: same order, same section comments, same values. A future retune must read as a clean diff against `styles.css`.
- Where the source `styles.css` contradicts its own `readme.md`, the **readme governs** — it is the design system's stated intent. All seven corrections are enumerated in Design Notes; make no others silently. (Five at approval; corrections 6 and 7 were added by the 2026-08-27 code review with the human's explicit sign-off — see Spec Change Log, Iteration 3.)
- `--font-heading` / `--font-body` keep their `system-ui, sans-serif` fallback tail.
- Hex literals appear only inside the `:root` block, which is where the source puts them.

**Ask First:**
- Dropping, renaming, or reordering any token, class, or declaration the source defines.
- Adding any token, class, or rule the source does not define.

**Never:**
- Port `support.js` or `_ds_bundle.js`. (`_ds_bundle.js` was read during planning: an 11-line no-op stub that injects nothing and registers nothing.)
- Build the app-specific layer — button size ramp, dense table padding, uppercase kickers, the sticky 39px bar, the 14px app base size. Those are inline styles in the prototype, not design system; Story 1.3 owns them.
- Add motion (`tk-in`, `tk-blink`, the `prefers-reduced-motion` guard). Prototype-level, deferred to Story 1.3.
- Invent `--space-5` or `--space-7`. The source declares six spacing tokens; port six.
- Add Tailwind, PostCSS, Sass, CSS-in-JS, or any `.module.css`.
- Load fonts with a CSS `@import` to fonts.googleapis.com.
- Touch `eslint.config.mjs`, `scripts/`, or the `build` chain. Enforcing the hex ban as a lint rule is split out to `deferred-work.md`; `scripts/verify-boundaries.mjs:493` hard-asserts the exact `build` string, so any change there breaks the build.

</frozen-after-approval>

## Code Map

- `app/globals.css` -- **the deliverable.** A 10-line placeholder today (`box-sizing` reset + `html, body` margin reset); replaced wholesale by the port. Its two rules are both superseded by the source's own reset.
- `app/layout.tsx` -- 20 lines. `import "./globals.css"` at L3; `<html lang="en">` L16; `<body>` L17. Gains the `next/font` call and the font variable className on `<html>`. **Do not touch L10-13** — the comment there explains why props are typed `{ children: ReactNode }` instead of Next's generated `LayoutProps<"/">`: the generated types do not exist on a clean checkout and `pnpm typecheck` must pass.
- **Read-only source of truth:** `_bmad-output/inputs/design_handoff_resume_tailoring/_ds/modernist-f8562a2f-380c-4e83-bd66-6cba1fb04c4a/styles.css`, 252 lines. `@import` L2 (dropped); `:root` L4-64 — roles L5-10, neutral ramp L14-22, accent ramp L24-32, accent-2 ramp L34-42, fonts L44-46, space L48-53, radius L55-57, shadows L61-63; element layer L69-107; `.hr` L108-112; buttons L114-136; forms L138-179; cards L180-199; tags L201-209; nav L210-220; table L222-233; dialog L235-252.
- **Read-only, governs conflicts:** `.../readme.md`, the design system's own rules — zero radius, 2px dividers, flush-left labels, 45% disabled, the 3:1 accent pairing, ramp-step usage over ad-hoc `color-mix()`.
- **Verified during planning, do not re-derive:**
  - Archivo is in `next/font/google` with static weights `100`–`900` plus `variable`, styles `normal`/`italic`, subsets `latin`/`latin-ext`/`vietnamese`.
  - `next/dist/compiled/@next/font/dist/google/validate-google-font-function-call.js:55-60` rejects only a `variable` entry mixed into a weight array, or a weight absent from the font. `weight: ["400","600","800"]` is therefore valid for Archivo.
  - The repo has no Tailwind, PostCSS, Sass, or any CSS tooling — Next's built-in pipeline only. Nothing in the repo lints CSS. `app/globals.css` is the only stylesheet.
  - `components/`, `adapters/*`, and `app/api/` contain nothing but `.gitkeep`, so no component carries a color literal yet.

## Tasks & Acceptance

**Execution:**
- [x] `app/globals.css` -- replace the placeholder with the full port of `styles.css` from L3 to the end, preserving source order and section comments, applying the five Design Notes corrections, and omitting the L2 `@import`. -- This file is the story.
- [x] `app/layout.tsx` -- add `next/font/google` Archivo (`weight: ["400","600","800"]`, `subsets: ["latin"]`, `display: "swap"`, `variable: "--font-archivo"`) and put `.variable` on `<html>`. -- Self-hosts the typeface; a localhost-only app must not need a Google round trip to render text.
- [x] `app/globals.css` -- point `--font-heading` and `--font-body` at `var(--font-archivo)` ahead of the fallback tail. -- Without this the tokens name a family nothing loads.

**Acceptance Criteria:**
- Given `app/globals.css`, when I diff its `:root` against `styles.css` L4-64, then every token name and value matches, `--radius-sm/md/lg` are `0px`, and no `--space-5` or `--space-7` was invented.
- Given `app/globals.css`, when I read its component layer, then `.btn` (+ `-primary`/`-secondary`/`-ghost`/`-icon`/`-block`), `.tag` (+ `-accent`/`-accent-2`/`-neutral`/`-outline`), `.field`/`.input`/`.radio`/`.seg`, `.card`, `.nav`/`.nav-brand`, `.table`, `.dialog-backdrop`/`.dialog`, and `.hr` are all present.
- Given the running app, when any text renders, then it is Archivo at weight 400, 600, or 800, served from the app's own origin, with no request to fonts.googleapis.com or fonts.gstatic.com.
- Given any `.ts` or `.tsx` file under `app/`, `components/`, or `adapters/`, when I search it for a hex color literal, then none is found — every color resolves through `var(--color-*)`. `app/globals.css` is the carve-out: it is the token source, and its literals live inside `:root`. (Enforcing this as a lint rule is deferred; see `deferred-work.md`.)
- Given any interactive element, when I focus it by keyboard, then a 2px solid accent outline sits at 2px offset and no default focus ring appears.
- Given a `.btn` or `.input` in its disabled state, when it renders, then it sits at 45% opacity.
- Given a button wider than its own label, when it renders, then the label sits flush left at the padding edge.
- Given any element in the app, when I inspect computed `border-radius`, then it is 0 — with the single documented exception of `.radio .dot`, which is a circle.
- Given the repository, when I search it for `support.js` or `_ds_bundle.js`, then neither has been ported.
- Given a clean tree, when I run `pnpm build`, then it exits 0.


### Review Findings

*Code review 2026-08-27 — four layers (blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor). The six-delta claim was independently verified against the in-repo source and holds: no unenumerated value change, no dropped/reordered/invented token.*

- [x] [Review][Patch] AC #5 is violated by two ported focus rules — **resolved 2026-08-27: correct both rules** as a sixth and seventh sanctioned correction, each with an inline readme citation, and amend the spec's delta count and Design Notes accordingly. Original finding: AC #5 and the readme both require a 2px accent outline at **2px offset** on every interactive element, with no exception clause. `.input:focus-visible` ships `outline-offset: 0` and `.seg-opt:has(input:focus-visible)` ships `outline-offset: -2px`; both outrank the base `:focus-visible` rule on specificity. These are source-vs-readme contradictions of exactly the kind the "readme governs" Always-clause covers, yet neither is among the five sanctioned corrections nor recorded as deferred. Unlike the border-radius AC, which was given an explicit `.radio .dot` carve-out, AC #5 has none — so it is failed as written. Either correct both rules (a sixth and seventh delta, breaking the closed five-correction list) or amend AC #5 with a named carve-out and defer. [`app/globals.css:166`, `app/globals.css:198`, `app/globals.css:114`]
- [x] [Review][Defer] `.btn-primary`'s own label misses AA — **resolved 2026-08-27: record as a deferred design decision**, alongside the existing divider and muted-step contrast entries; no fix stays inside the palette, so retuning the accent is a design call rather than a port correction. Original finding: `background: var(--color-accent)` with `color: var(--color-bg)` is `#f3f2f2` on `#ec3013` = **3.76:1** at 14px; 800 weight at 14px is not WCAG large text, so the threshold is 4.5:1. Checked `.seg-opt` uses the same pair at 13px. Switching to pure white only reaches 4.2:1 — there is no fix that stays inside the palette, so this is a design-value decision, not a port correction. The existing contrast entry in `deferred-work.md` covers only `--color-divider` and the muted `color-mix` steps, leaving the app's most-used action with no recorded defect. Options: record as a deferred design decision, or deviate from the source now. [`app/globals.css:139`, `app/globals.css:196`]
- [x] [Review][Patch] `subsets: ["latin"]` is flagged "do not reopen" on a rationale that only evaluated canon data — **resolved 2026-08-27: rescope the rejection to canon content and add `latin-ext` to the subsets array.** `←`/`✓` remain deferred, as latin-ext excludes them too. Original finding: the spec's Change Log justifies the subset by canon content ("only non-ASCII are U+2013/U+2014 dashes"). But the epic mandates a **UI** glyph set (`−`, `+`, `✓`, `›`, `·`, `!`, `←`), and Google's `latin` range excludes U+2190 (`←`) and U+2713 (`✓`); latin-ext accented characters in employer or candidate names are a second uncovered case. `deferred-work.md` records the glyph gap, but the spec's stronger "Rejected, do not reopen" flag would block the fix. Rescope the rejection to canon content, or lift it and add `latin-ext`. [`app/layout.tsx:14`]

- [x] [Review][Patch] Spec Design Notes snippet still shows the fallback-less font token, contradicting both its own narrative and the shipped code — a re-derivation copying that block silently reintroduces the UA-serif bug Iteration 2 was written to fix [`_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md:123-125`]
- [x] [Review][Patch] The e2e brand test asserts the font *declaration*, never the loaded face — `computed.fontWeight` reads `--font-heading-weight`, so dropping `"800"` from the weight array ships headings in the wrong face with every gate green; `document.fonts` appears nowhere in the repo [`e2e/top-bar.spec.ts:60-76`]
- [x] [Review][Patch] No test observes any color token resolving — dropping `--color-bg` makes `background: var(--color-bg)` invalid at computed-value time and the sticky chrome renders transparent, while every existing assertion (height, border, position, y) still passes [`e2e/top-bar.spec.ts`, `components/top-bar/top-bar.module.css:29`]
- [x] [Review][Patch] The port's `body { margin: 0 }` reset is unverified — `boundingBox()` is read for `height` and `y` only, never `x` or `width`, so a returned 8px UA body margin would inset the full-bleed chrome and pass all four geometry tests [`e2e/top-bar.spec.ts:20`, `e2e/top-bar.spec.ts:103`]
- [x] [Review][Patch] The only suite that observes this change runs outside the build gate and nothing pins it there — `verify-boundaries.mjs` hard-asserts the exact `build` chain but has no equivalent for `verify` (`build && test:e2e`), and the README script table omits `test`, `test:e2e`, and `verify` entirely while its `build` row is already stale [`scripts/verify-boundaries.mjs:493`, `README.md:24-31`]
- [x] [Review][Patch] The `no-hex-color-literal` entry's "must land before Story 1.3" deadline has passed — 1.3 shipped in `a8e0f6a`, no `verify:tokens` script or rule exists, so the item is now the retrofit it warned against. AC #2 itself still holds: `top-bar.module.css` uses only `var()` [`_bmad-output/implementation-artifacts/deferred-work.md:58`]
- [x] [Review][Patch] Two Story 1.2 deferred entries are filed under the Story 1.1 section header, above the 1.2 header that should contain them [`_bmad-output/implementation-artifacts/deferred-work.md:59`, `_bmad-output/implementation-artifacts/deferred-work.md:63`]
- [x] [Review][Patch] The contrast and weight-700 deferred entries are incomplete — the contrast inventory omits `.table th` (60% mix at 11px ≈ 4.2:1) and the opacity-based muting (`.card-body` 0.8, `.dialog-body` 0.85); the weight-700 entry calls `<th>` "unstyled" when `.table th` is a design-system class that simply never resets `font-weight`, so its proposed `strong, b` fix misses the one case inside the system [`_bmad-output/implementation-artifacts/deferred-work.md`]
- [x] [Review][Patch] The spec's claim that "Story 1.3 is its first consumer" of weight 600 is now false — 1.3 has landed and nothing in `app/` or `components/` requests 600, so the third self-hosted face is preloaded dead payload [`_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md:129`, `app/layout.tsx:14`]
- [x] [Review][Patch] Ported comments that are now false in this repo, plus the one uncommented delta — the elevation note describes "a hairline edge + ambient darkness on a dark one" for a palette the port pins to `color-scheme: light`; "no JavaScript, no build step" sits inside a Next app whose fonts are wired through a build step; `foundations/` and `components/` are not in `_ds/`; and the font rebind is the only one of the six deltas with no inline comment despite the header claiming all are commented [`app/globals.css:1`, `app/globals.css:50`, `app/globals.css:65`, `app/globals.css:83`]

- [x] [Review][Defer] `.dialog-backdrop` has no `z-index` while the sticky top bar already claims `z-index: 40` — the backdrop will paint *under* the chrome; there is no `--z-*` scale to order them [`app/globals.css:257`] — deferred, pre-existing
- [x] [Review][Defer] Forced-colors / Windows High Contrast strips the background-only checked state, making checked radios and selected segments indistinguishable [`app/globals.css:171-198`] — deferred, pre-existing
- [x] [Review][Defer] `::selection`'s accent tint over `.btn-primary` and checked `.seg-opt` (both near-white on accent) is unreadable [`app/globals.css:115`] — deferred, pre-existing
- [x] [Review][Defer] `.input::placeholder` is unstyled, so placeholders fall to UA gray outside the system [`app/globals.css:159-168`] — deferred, pre-existing
- [x] [Review][Defer] `.input` breaks on `select`, checkbox, radio, range and file types; `.tag` has no default variant; bare `.btn` and `.btn-icon` have no hover or active feedback [`app/globals.css:127-168`, `app/globals.css:220`] — deferred, pre-existing
- [x] [Review][Defer] `.table tbody th` row headers render as 11px uppercase muted text, misreading as column headers [`app/globals.css:245-249`] — deferred, pre-existing
- [x] [Review][Defer] Programmatic focus on `tabindex="-1"` (route change, dialog open) shows no ring, so keyboard users lose position [`app/globals.css:113`] — deferred, pre-existing
- [x] [Review][Defer] No semantic status colors (success/warning/error/info) and no form error or `aria-invalid` state; `--color-accent-2-*` collapses onto the accent ramp — the design readme documents the mono palette, nothing in-repo does [`app/globals.css:40-48`, `app/globals.css:226`] — deferred, pre-existing
- [x] [Review][Defer] The readme's "prefer ramp steps over ad-hoc `color-mix()`" rule ships unimplemented across 18 rules — neither a sanctioned correction nor a recorded deferral [`app/globals.css`] — deferred, pre-existing
- [x] [Review][Defer] Diffability is asserted at `globals.css:1` but nothing enforces it — the source sits in-repo at a fixed path, so the parity diff is scriptable as a `verify:design-parity` link, but 1.2's Boundaries forbid touching the build chain [`app/globals.css:1`, `_bmad-output/implementation-artifacts/spec-1-2-port-the-modernist-design-system.md:143`] — deferred, pre-existing

## Spec Change Log

**Iteration 1 (2026-08-26) — two corrections were incomplete, and the palette never declared its theme.**

*Triggering findings.* (a) Correction 2 rebased `.btn` to `justify-content: flex-start`, but `.btn-icon` is a 36×36 square with `padding: 0` and no `justify-content` of its own, so its glyph rendered pinned to the left edge instead of centered. (b) The port ships a fixed light palette with no `prefers-color-scheme` branch and never declared `color-scheme`, so an OS-dark viewer gets dark scrollbars, native pickers, and autofill against a light ground.

*Amended.* Design Note 2 now requires `.btn-icon { justify-content: center; }` and says why the readme's flush-left rule governs labels rather than icon-only buttons. A fifth correction adds `:root { color-scheme: light; }` and names it the one declaration with no source counterpart. Design Note 1 now states why the accent correction stops at `a`. The hex acceptance criterion gained the `app/globals.css` carve-out its own Boundaries clause already granted. Verification gained the source-diff command and the served-CSS font-wiring assertion.

*Known-bad state avoided.* Patching the CSS alone would have left the spec prescribing the `.btn-icon` defect and silent on `color-scheme`, so the next re-derivation would reintroduce both. The verification additions close a gap where the `--font-archivo` string coupling could break across two files with every gate still green.

*Rejected, do not reopen.* `subsets: ["latin"]` stays: the canon's only non-ASCII characters are U+2013/U+2014 dashes, which the `latin` subset covers, and it carries no accented characters. `color-mix()`, `:has()`, and `:focus-visible` need no fallbacks on this desktop-only Chromium target. Responsive rules, table overflow wrappers, and `h1` clamping are out — wide desktop only, by design. Duplicate `body`/`h1-h4`/`h6` blocks and the `4.0px` spacing artifacts are verbatim source and must stay for diffability.

**Iteration 2 (2026-08-26) — patches, no loopback.**

*Triggering findings.* (a) `var(--font-archivo)` with no inner fallback: if the variable is undefined the declaration is invalid at computed-value time and `font-family` drops to the UA default serif — the `system-ui, sans-serif` tail never applies. Iteration 1's Verification note asserted the opposite and was wrong. (b) The sanctioned-correction count read "four" in Boundaries, "Four corrections" over a list of five in Design Notes, and "five" in Tasks and Verification — the count that the "make no others silently" rule depends on. (c) `app/globals.css`'s header claimed a verbatim port the file is not. (d) The diff command left `$SRC` undefined and its literal-string CSS grep was brittle against formatting changes. (e) `pnpm typecheck` was absent from Verification though the Code Map's typing decision depends on it.

*Amended.* Both font tokens take `var(--font-archivo, system-ui)`; the header names the six deltas; the count reads five everywhere with the six-delta figure explained as rebind-plus-five; the diff command inlines `$SRC`, explains the two-line trim, and says to read hunks rather than gate on the exit code; the served-CSS check matches by regex; `pnpm typecheck` is listed; Design Notes record why weight 600 ships unused and what the `var()` fallback guards.

*Routed as patch, not bad_spec, deliberately.* The only code change is one token per font token. Re-deriving a mechanical 252-line port to apply it would risk transcription drift without reducing any. The spec text was corrected in the same pass, so spec and code stay coherent — the outcome the loopback exists to produce. Verified afterwards by re-running the full Verification section.

**Iteration 3 (2026-08-27) — code review; two focus corrections adopted, one contrast defect deferred.**

*Triggering findings.* (a) AC #5 requires a 2px accent outline at 2px offset on every interactive element with no exception clause, but `.input:focus-visible` shipped `outline-offset: 0` and `.seg-opt:has(input:focus-visible)` shipped `-2px`, both outranking the base rule on specificity — source-vs-readme contradictions the "readme governs" clause covers, yet neither was a sanctioned correction nor a recorded deferral. (b) `.btn-primary`'s own label is `#f3f2f2` on `#ec3013` = 3.76:1 at 14px, below the 4.5:1 normal-text threshold, and no deferred entry recorded it. (c) The Design Notes CSS snippet still showed the fallback-less `var(--font-archivo)` that Iteration 2's own narrative had corrected. (d) `subsets: ["latin"]` was flagged "do not reopen" on a rationale that evaluated canon content only, not the epic's mandated UI glyph set or accented names.

*Amended.* Corrections 6 and 7 adopted, with the count updated to seven everywhere the "make no others silently" rule depends on it. The snippet now carries the inner fallback. `latin-ext` added to the subsets array and the rejection rescoped to canon content. The `.btn-primary` contrast defect is recorded in `deferred-work.md` as a design-value decision — no fix stays inside the palette, since pure white reaches only 4.2:1.

*Verification added.* Three Playwright tests now pin what nothing observed: the loaded Archivo faces at 400/600/800 (the old assertion read the CSS declaration, not the face), the chrome's colour tokens resolving, and the port's `body { margin: 0 }` reset. Each was mutation-tested — drop the weight, rename the token, or remove the margin and exactly that test fails. `verify:boundaries` now pins the `verify` chain the way it already pinned `build`, so `test:e2e` cannot be silently unhooked.

*Rejected, do not reopen — unchanged from Iteration 1, except:* the `subsets` rejection is now scoped to **canon content only**. `←` (U+2190) and `✓` (U+2713) fall outside every Google subset and remain deferred.

**KEEP — must survive re-derivation.**
- The eight-delta discipline (the font rebind plus the seven corrections): the port diffed against the source with *only* the font rebind, the corrections, and whitespace showing. Verify with the diff command, do not eyeball it.
- Each correction carries a short inline comment citing the readme rule it implements.
- `.btn-block` keeps its own `justify-content`/`text-align` rather than dropping declarations the source defines, even though correction 2 makes them redundant.
- The `@import` is dropped, never translated into a `<link>` or a runtime fetch.
- `layout.tsx` keeps its comment explaining static weights and the deliberate absence of italic, and leaves the existing `{ children: ReactNode }` typing comment untouched.

## Design Notes

**Seven corrections.** The first four are places where `styles.css` contradicts its own `readme.md` or the story's acceptance criteria; the fifth is the one addition with no source counterpart; the sixth and seventh were added by the 2026-08-27 code review. Each is deliberate and reviewable — not a transcription slip:

1. **`a` color** (source L95: `color: var(--color-accent)`) → `var(--color-accent-700)`. The readme is explicit that the accent-to-ground pair is tuned to 3:1, "enough for icons, large text and interface chrome, not for body copy — so for paragraph-size text in the accent use a deep ramp step (`--color-accent-700` on this ground)". A link is paragraph-size text. The correction stops at `a` on purpose: the same readme sentence rates the 3:1 pair as "enough for icons, large text and interface chrome", and `.btn-ghost`, `.card-kicker`, `.tag-outline`, and `.nav a:hover` are all chrome. Leave them on the raw accent.
2. **`.btn` alignment** (source L116: `justify-content: center`) → `flex-start`, plus `text-align: left`. The readme mandates flush-left labels: "a button wider than its label starts the text at the left padding edge … never centered." The source honors this only on `.btn-block`. **`.btn-icon` must re-center**: add `justify-content: center` to it. It is a 36×36 square with `padding: 0` and no label — the readme's rule governs *labels*, so inheriting `flex-start` pins its glyph to the left edge, which is a defect, not flush-left alignment.
3. **`.input:disabled`** — the source dims only `.btn:disabled` (L125). Add `.input:disabled { opacity: 0.45; cursor: not-allowed; }` so "a disabled control drops to 45%" holds for the other control class. Do not extend it further.
4. **`.radio .dot { border-radius: 50% }`** (source L157) — **kept as-is.** The readme's rule is "do not round a corner"; a radio indicator is a circle, not a rounded corner, and squaring it makes radio and checkbox indistinguishable. This is the one exception to the zero-radius criterion and is named there.
5. **`:root { color-scheme: light; }`** — **added**, the one declaration with no counterpart in the source. The ported palette is fixed light with no `prefers-color-scheme` branch, so without this an OS-dark viewer gets dark UA chrome — scrollbars, native pickers, autofill — against a light ground. The source is a theme-agnostic library; this app has settled on one theme and must say so.

6. **`.input:focus-visible` offset** (source: `outline-offset: 0`) → `2px`. AC #5 and the readme both state the focus ring as `outline: 2px solid var(--color-accent); outline-offset: 2px` on **every** interactive element, and AC #5 — unlike the zero-radius criterion — carries no exception clause. The source pinned the ring to the input's border; the readme governs.
7. **`.seg-opt:has(input:focus-visible)` offset** (source: `outline-offset: -2px`) → `2px`. Same rule. The source drew the ring *inside* the element, so on a checked segment — already filled with `var(--color-accent)` — it was accent on accent and therefore invisible. Moving it outside the fill satisfies AC #5 and closes the deferred "no visible focus indicator" defect in one edit.

**Font binding.** The source's L2 `@import` is dropped rather than translated — it is a render-blocking request to a third party from an app whose premise is one process on one machine. `next/font` self-hosts the files at build time. Static weights are requested instead of the variable face on purpose: Next recommends variable fonts for flexibility, but the design constrains type to exactly three weights, and loading only those three makes the constraint physical rather than advisory.

```tsx
// app/layout.tsx
const archivo = Archivo({
  weight: ["400", "600", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});
// <html lang="en" className={archivo.variable}>
```

```css
/* app/globals.css — inside :root */
--font-heading: var(--font-archivo, system-ui), system-ui, sans-serif;
--font-body: var(--font-archivo, system-ui), system-ui, sans-serif;
```

Weight 600 ships unused by this story: the design system references only 400 (`body`) and 800 (`--font-heading-weight`). It is loaded because the app layer needs it — the handoff sets diff proposed text at 15.5px weight 600. **Corrected 2026-08-27:** Story 1.3 has landed and requests 600 nowhere, so the prediction that it would be the first consumer was wrong; the third face is preloaded dead payload until the diff view arrives. Kept deliberately — the three-weight constraint is the point — but it is a cost, not a no-op.

A `var()` fallback guards the token: `var(--font-archivo, system-ui)`. Without the inner fallback an undefined `--font-archivo` makes the whole declaration invalid at computed-value time, and `font-family` drops to the UA default serif — the `system-ui, sans-serif` tail on the outside never gets a chance to apply.

Italic is **not** loaded. The design system loads none, and the only italic in the design — the resume role line — belongs to Story 1.7, which owns that call.

**Base size stays 15px.** `body { font-size: 15px }` ports verbatim. The prototype runs the app at 14px, but that is an app-layer override, not a token change.

## Verification

**Commands:**
- `pnpm lint` -- expected exit 0.
- `pnpm build` -- expected exit 0; the `build` chain is unchanged by this story.
- `pnpm typecheck` -- expected exit 0. Listed separately from `build` because the Code Map's `layout.tsx` typing decision depends on it.
- `SRC=_bmad-output/inputs/design_handoff_resume_tailoring/_ds/modernist-f8562a2f-380c-4e83-bd66-6cba1fb04c4a/styles.css; diff <(tail -n +3 "$SRC") <(tail -n +3 app/globals.css)` -- expected: **only** the font-variable rebind, the seven Design Notes corrections with their inline comments, and whitespace. `diff` exits 1 whenever it prints anything, so read the hunks; do not gate on the exit code. Both files are trimmed by two lines because the port replaces the source's header and `@import` with its own two-line header. This is the only mechanical check of the "diffable against the source" rule; nothing else enforces it.
- With `pnpm dev` running: `curl -sS localhost:3000` names a `/_next/static/**.css` chunk; that chunk must match `--font-archivo:` and `--font-heading:\s*var\(--font-archivo`, and the `<html>` tag must carry the generated variable class -- expected: all three present. Match with a regex, not a literal space, so dev/prod formatting differences do not read as a wiring failure. `variable:` in `layout.tsx` and `var(--font-archivo)` in the CSS are a bare-string coupling across two files that lint, typecheck, and `next build` all ignore.
- `grep -rn "fonts.googleapis.com\|support\.js\|_ds_bundle" app/ components/ adapters/ core/` -- expected: no matches.
- `grep -rnE "#[0-9a-fA-F]{3,8}\b" app/ components/ adapters/ --include=*.ts --include=*.tsx` -- expected: no matches.
- `pnpm dev`, then `curl -sSf localhost:3000` -- expected HTTP 200. Smoke check only: a 200 is returned whether or not the stylesheet applied or the font bound. Kill the server afterward.

**Manual checks (browser devtools, wide desktop viewport):**
- Network tab: Archivo served from `/_next/`, zero requests to `fonts.googleapis.com` / `fonts.gstatic.com`.
- Tab to a control: 2px accent outline at 2px offset, no default ring.
- Computed `border-radius` is `0px` on `.btn`, `.input`, `.card`, `.tag`, and `.dialog`.
- Select text: `::selection` shows the accent at 30%.

## Suggested Review Order

**The five corrections — start here**

- The whole port is verbatim except six deltas; this header names them.
  [`globals.css:1`](../../app/globals.css#L1)

- Correction 5, the one addition with no source counterpart: the palette declares its theme.
  [`globals.css:9`](../../app/globals.css#L9)

- Correction 2, and the regression it caused: `.btn` rebased to flush-left.
  [`globals.css:128`](../../app/globals.css#L128)

- `.btn-icon` re-centers — the readme's flush-left rule governs labels, not glyphs.
  [`globals.css:151`](../../app/globals.css#L151)

- Correction 1: a link is paragraph-size text, so it takes the 700 step.
  [`globals.css:105`](../../app/globals.css#L105)

- Correction 3: the 45% disabled rule extended from `.btn` to `.input`.
  [`globals.css:168`](../../app/globals.css#L168)

- Correction 4: kept at 50%, the one documented exception to zero radius.
  [`globals.css:178`](../../app/globals.css#L178)

**Font binding — a bare-string coupling across two files**

- Static weights, not the variable face, so the three-weight rule is physical.
  [`layout.tsx:12`](../../app/layout.tsx#L12)

- The name declared here must match the `var()` in the tokens.
  [`layout.tsx:15`](../../app/layout.tsx#L15)

- The consuming end; the inner fallback stops an undefined var dropping to UA serif.
  [`globals.css:50`](../../app/globals.css#L50)

- Where the variable actually reaches the document.
  [`layout.tsx:29`](../../app/layout.tsx#L29)
