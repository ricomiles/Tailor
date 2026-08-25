# Handoff: Resume tailoring & application review tool ("tailor")

## Overview

A local, single-user desktop web app for one engineer job-hunting. It watches company job
boards, uses an LLM to tailor his base resume to each posting, and presents each tailored
application for review before he submits it himself.

The organizing idea: **this is a code-review tool where the diff is his own resume.** The AI
proposes changes to how his experience is described; he approves, edits, or rejects them line
by line. Everything else exists to get him to that review screen and out of it quickly.

Runs at `localhost`. No auth, no onboarding, no accounts, no mobile, no theme toggle, no
auto-submit. Desktop only, wide viewport, dense.

## About the design files

The files in this bundle are **design references created in HTML** — a working prototype of
the intended look and behavior, not production code to copy. The task is to **recreate these
designs in the target codebase's own environment** (React, Vue, Tauri/Electron shell, etc.)
using its established patterns and libraries. If no environment exists yet, pick the most
appropriate stack (a local Electron/Tauri app or a Vite + React SPA talking to a local
service is the natural fit) and implement the designs there.

`Tailor.dc.html` is a streaming-component HTML prototype: markup + an inline logic class
rendered by `support.js`. Read it for structure, exact copy, and state logic; do not port
`support.js` itself.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, density, interaction states, copy, and
mock content. Recreate the UI faithfully, using the Modernist design tokens (below) as the
source of truth for every color, font, and rule weight.

---

## Design system

All visuals come from the bound **Modernist** design system. `_ds/.../styles.css` is included
in this bundle and is the source of truth. Port its `:root` variables into the target codebase
as tokens rather than hard-coding hexes.

Key characteristics: flat, architectural, set entirely in **Archivo** (400 / 600 / 800),
zero corner radius everywhere, strong 2px rules doing the organizing work, near-mono red on a
light ground, flush-left everything (including button labels).

### Tokens actually used

| Token | Value | Used for |
| --- | --- | --- |
| `--color-bg` | `#f3f2f2` | App ground |
| `--color-surface` | `#eae9e9` | Resume pane background, inputs |
| `--color-text` | `#201e1d` | Ink; also inverted fills (bulk bar, active tabs/filters) |
| `--color-accent` | `#ec3013` | Primary action, overclaim field, diff insertion rule, focus ring |
| `--color-divider` | `#201e1d` @ 40% | 1px row rules; 2px section rules |
| `--color-neutral-300/400` | `#d7d3d3` / `#bab6b6` | Score track, kept-bullet rule, dropped dashed rule |
| `--color-neutral-500/600/700/800/900` | `#9b9797` … `#2d2b2b` | Deletion text, meta text, secondary copy |
| `--color-accent-100/200/700/800/900` | `#fff2ef` / `#ffe0d9` / `#ae1800` / `#7c1405` / `#4d170e` | Flagged-row tint, JD match highlight, banner text |
| `--space-1..8` | 4 / 8 / 12 / 16 / 24 / 32 px | Padding, gaps |
| `--radius-*` | `0px` | Never round a corner |
| `--shadow-md` | `0 3px 10px rgba(45,43,43,.16)` | The rendered resume page only |
| `--font-heading` / `--font-body` | Archivo 800 / Archivo 400 | Headings & labels / body |

Fonts: Archivo via Google Fonts (`@import` at the top of `styles.css`), weights 400, 600, 800.

### Type used in this app (deliberately smaller than the DS demo scale — this is a dense tool)

- App title / screen title: Archivo 800, 30px, `letter-spacing:-0.03em`
- Panel title ("Proposed changes"): 800, 22px, `-0.03em`
- Diff proposed text: **15.5px / 1.42, weight 600** (kept bullets: weight 400)
- Diff original text: 14px / 1.45, `--color-neutral-600`, `line-through` 1px in `neutral-400`
- Body / table cells: 13.5–14px
- Rationale ("why") line: 12.5px / 1.45, `neutral-700`
- Micro-labels: 10–11.5px, `letter-spacing .06–.14em`, uppercase, Archivo 800
- Rendered resume: 10.5–11px body, 23px name — real document proportions
- Tabular numerals (`font-variant-numeric: tabular-nums`) on scores, dates, timers

---

## Screens / views

Global chrome: a sticky 39px-tall top bar — brand `tailor` (Archivo 800, 16px), a 1px vertical
divider, then live state counts (`N discovered / tailored / approved / submitted`, 11px
uppercase), and on the right `watching 14 boards` plus a **prototype-only** "jump" select that
teleports to each designed state. **The jump select is a review affordance — do not ship it.**

### 1. Queue (landing)

Purpose: triage. Scan ~20 rows, skip most, open the interesting ones.

Layout: 16px page padding. Title row (`Queue` + subtitle `10 of 10 postings · last scan 12
minutes ago` + right-aligned sort select and `Scan boards` button). Below it a filter strip,
optional bulk bar, then the table.

- **Filter strip**: 6 chips in one 1px-bordered box, each `border-right:1px solid divider`,
  padding 6px 12px, Archivo 800 11.5px uppercase `.06em`, `white-space:nowrap`, label + count
  at 55% opacity. Active chip: `background:--color-text; color:--color-bg`. Filters: All,
  Discovered, Tailored, Approved, Submitted, Skipped.
- **Sort select**: Match score (default) / Date discovered / Company. `.input`, 30px min-height.
- **Bulk bar** (only when ≥1 row selected): full-width ink bar (`bg:--color-text`,
  `color:--color-bg`), `N selected`, `Skip selected` (outlined in bg color), `Clear`.
  Animates in with `tk-in` (opacity + 4px rise, 120ms ease-out).
- **Table** (`.table`, 13.5px): columns — checkbox (28px), Company / role, Location (150px),
  Source (100px, uppercase 12px), Found (88px), Match (120px), State (104px), actions (150px).
  - Company in Archivo 800, then a `neutral-500` slash, then the role in regular weight.
  - Match cell: score in Archivo 800 tabular (26px wide) + a 6px-tall bar on a
    `neutral-300` track; fill is `--color-accent` at score ≥ 80, else `neutral-700`; width = score %.
  - State cell: `.tag` variants — Tailored `tag-accent`, Approved `tag-outline`, everything
    else `tag-neutral` — overridden to Archivo 800 10.5px uppercase `.08em`.
  - Row states: cursor row gets `box-shadow: inset 3px 0 0 --color-accent` plus a 5% ink tint;
    `Skipped` and `Submitted` rows drop to 50% opacity; hover tint comes from `.table`.
  - Actions: primary button label is state-dependent — Discovered → `Tailor`, Tailored →
    `Review`, Approved → `Hand off`, else `Open` — plus a quiet `Skip`.
  - Whole row is clickable (same as primary); the checkbox and buttons stop propagation.
- **Keyboard legend** under the table: `j / k` move, `o` open, `x` select, `s` skip, `t` tailor.

### 2. Queue — empty (first run)

Mutually exclusive with the table (filters, table, and legend are all hidden; subtitle becomes
`No postings yet · 0 boards watched`, top bar says `no boards yet`).

A single 2px-bordered block, 28px 24px padding, two columns (`420px | 1fr`, 40px gap):
- Left: `Nothing discovered yet` (24px), one paragraph explaining the 30-minute scan and the
  four supported board types, then an inline `.input` (`boards.greenhouse.io/ondofinance`) +
  `Add board` primary button, then a line about importing a list from a file.
- Right: `Suggested from your resume tags` label + wrapped `+ Company` secondary buttons; a
  rule, then `Source resume: resume.base.yaml · 31 bullets · 2 marked incomplete`.

This is an invitation to add boards, not a decorative empty state.

### 3. Tailoring in progress (10–30s LLM call)

A 2px ink-bordered white card, max-width 1180px. Header: `Tailoring — {company} / {role}` with
`{n}s elapsed · est. 22s` right-aligned, tabular.

Body is a `1fr | 320px` grid:
- Left: the real step list, one row per step (`22px | 1fr | auto` grid, 1px rule between):
  1. Fetch posting — `lever.co · 1 request` (0.9s)
  2. Extract requirements — `14 found` (1.4s)
  3. Match against source resume — `31 bullets scored` (1.8s)
  4. Rewrite selected bullets — `5 of 9 selected` (3.2s)
  5. Validate every claim against source (1.6s)
  6. Render PDF — `1 page` (0.9s)
  Marks: `✓` done (ink), `›` active (accent, `tk-blink` 1s infinite), `·` pending
  (`neutral-400`). Right column shows each completed step's real duration, `running` for the
  active one. Below: an 8px progress bar on `neutral-300`, accent fill, `width` transition
  400ms ease.
- Right: `Matched so far` — matches append as steps complete, each animating in with `tk-in`.

Footer (2px rule above): `Cancel` + "Runs locally against your source resume. Nothing is
submitted."

Progress must be real (steps + elapsed + per-step timings), never a spinner.

### 4. Review — the primary screen

Purpose: 90% of time. Three regions side by side, each scrolling in its own pane, no page-level
horizontal scroll.

**Action bar** (sticky at `top:39px`, 1px rule): `← Queue`, company (Archivo 800 17px), role,
`SOURCE · LOCATION` (12px uppercase `neutral-600`), `MATCH 91` (tabular 15px), then right-aligned:
a pending-status line (`1 flagged claim to resolve` or `N rewrites reviewed`), `Skip job` with
a dimmed `s` hint, and `Approve and hand off` (primary, with dimmed `a` hint). Approve is
`disabled` (45% opacity via `.btn:disabled`) whenever a blocked metric is unresolved.

**Column grid**: `23fr | 42fr | 35fr`, `min-height: calc(100vh - 78px)`, 2px dividers between
columns. The diff column is the widest on purpose.

**Left — Job description / Answers.** Two flush-left tabs filling the width (Archivo 800 11px
uppercase; active tab is ink-filled, inverted text).
- JD tab: header line `Aug 11 · 412 words` + a `hide matches` / `show matches` ghost toggle
  (accent-700). Body: headings (Archivo 800 11px uppercase `.1em`) and 13px/1.5 paragraphs.
  Requirements the tailoring step matched are marked **in place**: `background:accent-200` +
  `box-shadow: inset 0 -2px 0 accent` + weight 600, with `title="Matched to your experience"`.
  In the prototype these are authored as `[[double-bracket]]` spans in the JD source.
- Answers tab: 11.5px note ("Pre-filled from your source data. Edits here are part of what you
  approve."), then three `.field`s — Work authorization (input), Notice period (input, `2 weeks`),
  Why this company (textarea, min-height 150px, 13px/1.5), each with a note line
  (e.g. `Model draft. 78 words — the form caps at 150.`). Subordinate to the diff, but part of
  what gets approved.

**Center — the diff (the signature element).** White paper field (`#fff`) against the
`#f3f2f2` app ground, 2px ink rule under a sticky header.
- Header: `Proposed changes` + right-aligned counts `3 reworded / 2 kept / 2 dropped`.
- When any change is flagged: a full-width **accent bar** (`bg:accent`, `color:bg`) —
  `1 FLAGGED · Reads beyond your source data. Resolve before approving.` + `Go to it` (scrolls
  to the item, offset 140px, smooth).
- Each diff item is a block with a 1px bottom rule and a meta row: section
  (`Sanctum Labs · 2023–2025`, Archivo 800 10px uppercase), kind label (10px uppercase
  `neutral-500`), and right-aligned inline actions.
- **Three kinds must be separable without relying on color** — the treatment is
  gutter glyph + weight + strikethrough + left-rule style:
  | Kind | Gutter | Text | Left rule on new text | Kind label |
  | --- | --- | --- | --- | --- |
  | Reworded | `−` then `+` (Archivo 800 15px) | old struck `neutral-600`; new 15.5px **600** ink | `3px solid --color-text` | `reworded by model` / `reworded, edited by you` / `reverted to original` |
  | Selected, unchanged | `+` only | 15.5px **400** ink | `3px solid neutral-400` | `selected, unchanged` |
  | Dropped | `−` only, `neutral-500` | struck, block at 72% opacity | `3px dashed neutral-400` | `dropped from base resume` |
  | Flagged (overclaim) | `+` in accent | as reworded | `3px solid --color-accent` | plus row tint `accent-100`, full-bleed |
- **Overclaim treatment** (the one place boldness is spent): the flagged item's row is tinted
  `accent-100` and bled to the pane edges (`margin: 0 -18px; padding: 0 18px`), and an
  accent-filled band sits above the text: `OVERCLAIM` (Archivo 800 11.5px uppercase `.14em`)
  + one sentence naming exactly what has no source. Resolving (editing or reverting) clears it.
- New text is an **auto-sizing borderless textarea** — inline editing with no edit mode.
  Height is measured from layout (`height:auto` then `scrollHeight`) on mount, on update, on
  input, on font load, and on window resize. Never estimate from character count: the reviewer
  must see the whole bullet. Under it a 10.5px uppercase meta line: `model text · 34 words` /
  `your text · 34 words` / `unchanged from source · 14 words` / `original text · model rewrite discarded`.
- Rationale: a 12.5px line indented past the gutter with a 1px `neutral-300` left rule and a
  `WHY` label in Archivo 800 9.5px accent-700. Shown always by default; the `rationale` prop
  can switch it to an on-demand `why this changed` / `hide why` toggle per item.
- Item actions: `revert to original` / `restore rewrite` on reworded items (also clears any
  user edit); `keep this bullet` / `drop again` on dropped items.

**Right — tailored resume, as it will submit.** `--color-surface` pane. Header:
`Tailored resume — as it will submit` + `out/{id}.pdf · 1 page`. The document renders on white
with `--shadow-md`, 38px/34px padding, real document type: name Archivo 800 23px `-0.03em`,
contact line 10.5px, a 2px ink rule, then sections (`Experience`, `Open source`, `Stack`) with
9.5px uppercase `.14em` section headers over a 1px `neutral-400` rule, org in Archivo 800
11.5px with right-aligned tabular dates, italic role line, and `—` bullets at 10.5px/1.45.
Bullets are driven live from the current diff text (approved edits appear here immediately).
A dashed page boundary sits at the bottom edge, with `page 1 of 1 · letter` and `92% of page
used` beneath.

### 5. Review — blocked metric

A banner spanning the content, `background:accent-200`, `border-bottom:2px solid accent-700`:
`RENDER BLOCKED` (Archivo 800 12px uppercase accent-800) + "A tailored bullet uses
**payments.throughput_usd**, marked incomplete in your source resume. Fill it in or drop the
bullet — the PDF will not render until one of those happens." Actions: `Fill metric` (primary),
`Drop bullet` (secondary, accent-700 border/text).

The resume pane replaces the document with a 2px `accent-700` box on `accent-100`: `NO RENDER`,
which bullet and which field is empty, and `Last good render: Aug 12, 09:41`. Approve is
disabled until one action is taken. The offending bullet still shows in the diff with the
unresolved `{{payments.throughput_usd}}` token visible in the text; filling the metric
substitutes `$18M` in place, dropping removes the item.

### 6. Validation failure — fabrication caught (most important error state)

A modal over a 55% `neutral-900` scrim, 760px max, `--shadow-lg`, 2px accent border, `tk-in`.
Accent-filled header: `TAILORING REJECTED — FABRICATED CLAIM` (11.5px uppercase `.14em`) over
`Blockdaemon / Senior Protocol Engineer — nothing was written to your resume` (Archivo 800 23px).

Body: `Rejected bullet` label, then the bullet at 14.5px weight 600 behind a 4px accent left
rule ("Maintained a Cardano validator client running across 4,000+ staking nodes, cutting block
propagation latency by 35%."). Then a two-cell bordered grid: **Why it failed** ("No entry in
`resume.base.yaml` mentions a validator client, staking, or 4,000 nodes. The claim has no
source.") and **Closest real experience** (the real Cardano bullet, quoted).

Actions: `Re-run without this claim` (primary, restarts the tailoring run),
`Open resume.base.yaml`, and right-aligned `Leave it untailored`. Footer:
`Logged to rejections.log · 3rd rejection from this model this week`.

Hard-stop, not a soft warning: nothing is written, the job stays `Discovered`, and the step
list behind it shows step 5 with a `!` mark and `rejected`.

### 7. Submission handoff

880px card, 2px ink border, white. Header title changes with phase — `Handing off to your
browser` → `Did you submit it?` → `Submitted`, or `Manual submission` for the unsupported case —
with `{company} / {role} · {source}` right-aligned.

- **Waiting**: "A browser window is opening with {source}'s form already filled in. Read it
  there and click submit yourself — this app never submits for you." Then a 4-step list
  (rendered PDF → opened form → filled 9 of 9 fields, attached PDF → **you review and click
  submit**, marked `›` in accent with `tk-blink`). Actions: `Reopen window`, `Back to queue`,
  and a right-aligned "Waiting for you to finish in the browser." After ~3.6s it advances to
  confirm.
- **Confirm**: "Control is back here. Did you submit the application to {company}?" —
  `I submitted it` (primary), `I bailed — keep it approved`, `Skip this job`. Footnote: "Only
  you know what happened in that window, so the app asks instead of guessing."
- **Done**: `Marked submitted · Aug 12, 09:44`, a line counting tailored applications still
  waiting, then `Next in queue` (opens the next `Tailored` job) / `Back to queue`.
- **Unsupported form**: a 4px accent left rule with `NO ADAPTER FOR THIS FORM` and "Emurgo uses
  a custom form the app can't fill. The tab is open and your tailored PDF is on disk — fill it
  in manually this once." Below, a two-cell bordered grid: **On disk**
  (`out/emurgo-fullstack-defi.pdf`, `1 page · rendered Aug 12, 09:41`, `Reveal file` /
  `Copy answers`) and **Answers to paste** (each answer's short form on its own ruled line).
  Then `I filled it in` (primary) → confirm phase.

### Toast

Bottom-left ink chip (`bg:--color-text`, `color:--color-bg`, 8px 12px, `tk-in`), message +
`Undo`, auto-dismiss at 4.2s. Used for skip, bulk skip, board added, metric filled, bullet
dropped, file revealed, answers copied, rescan.

---

## Interactions & behavior

- **Row click** opens by state: `Discovered` → start tailoring; `Tailored` → review;
  `Approved` → handoff; else review.
- **Keyboard** (ignored while focus is in an input/textarea/select):
  - Queue: `j`/`↓`, `k`/`↑` move cursor; `o`/`Enter` open; `t` tailor; `s` skip; `x` toggle select.
  - Review: `a` approve, `s` skip.
  - Anywhere: `Esc` back to queue (also dismisses the fabrication modal).
- **Selection & bulk skip**: checkbox or `x`; bulk bar appears; skipping is undoable (previous
  states restored from the toast).
- **Diff editing**: type directly in the proposed text (textarea auto-grows); editing marks the
  item `reworded, edited by you`, clears a flag, and updates the resume pane live. Revert swaps
  in the original text and discards any edit; reverting again restores the rewrite.
- **Approve** sets the job `Approved` and enters handoff; it is blocked while a metric is
  unresolved.
- **Tailoring** advances through the six steps on their real timings; `blockdaemon` always ends
  in the fabrication modal (this is the demo path for that state).
- **Motion**: only `tk-in` (opacity + 4px rise, 120–150ms ease-out), `tk-blink` on the active
  step glyph, and the 400ms progress-bar width transition. Everything is disabled under
  `prefers-reduced-motion: reduce`.
- **Quality floor**: visible keyboard focus everywhere (`:focus-visible` 2px accent ring,
  2px offset, from the DS), real hover and active states on every control, `::selection` tint.
- **Responsive**: none. Desktop, wide viewport only, by design.

## State management

Prototype state (port as a store, e.g. Zustand/Pinia/signals):

```
screen: 'queue' | 'tailoring' | 'review' | 'handoff'
jobId, cursor, filter, sort
status: Record<jobId, 'Discovered'|'Tailored'|'Approved'|'Submitted'|'Skipped'>
selected: Record<jobId, boolean>
emptyQueue: boolean            // first-run flag (prototype: also a jump target)
tab: 'jd' | 'q'                // left pane
marks: boolean                 // JD match highlighting
edits: Record<diffId|'ans-*', string>
reverted / restored / resolved / whyOpen: Record<diffId, boolean>
metricFilled, blockedDropped: boolean
tailorJobId, tailorStep, tailorElapsed, fabrication
handoffPhase: 'waiting'|'confirm'|'done'|'unsupported'
submittedAt, toast, undo, boardDraft
```

Transitions: `Discovered → Tailored` on a successful tailoring run (a failed validation leaves
it `Discovered` and writes nothing); `Tailored → Approved` on approve; `Approved → Submitted`
only when the user confirms he submitted; `→ Skipped` from any state, undoable.

Data the real app needs per job: posting text with matched requirement spans, the diff set
(kind, original, proposed, rationale, flags, source-field references), pre-filled answers, and
a rendered PDF path. Validation runs server-side against `resume.base.yaml` and must be able to
reject a whole run.

## Copy voice

Plain, terse, technical. Sentence case. Active verbs. Actions keep their name through the whole
flow (`Approve and hand off` → `Handing off to your browser`). Errors state what happened and
what to do; no apologies, no vagueness.

## Mock content

Realistic and load-bearing — keep it when demoing, replace it with real data in production.
Subject: full-stack engineer, ~3 years, Cebu City PH (UTC+8), TypeScript / Go / Solidity,
EVM + Cardano, former Head of Engineering at a web3 startup (8–10 engineers). Ten postings
across Greenhouse / Lever / Ashby / Workable (Ondo Finance, Maestro, Blockdaemon, Vessel
Finance, Emurgo, Alchemy, dYdX, Chainstack, Anchorage, Fireblocks), scores 44–91. Diff sets for
Ondo (7 items, one deliberate overclaim), Maestro (3), Vessel (blocked metric). All strings live
at the top of the logic class in `Tailor.dc.html`.

## Assets

None. No images, no icon fonts — every glyph is a text character (`−`, `+`, `✓`, `›`, `·`, `!`,
`←`). If icons are wanted in the real build, the design system specifies **Lucide**.

## Files

- `Tailor.dc.html` — the full prototype: markup, inline styles, and the logic class (all state,
  data, and derived values). Read `renderVals()` / `buildDiff()` for behavior.
- `support.js` — prototype runtime only. Do not port.
- `_ds/modernist-.../styles.css` — the design system: tokens + component classes. **Port this.**
- `_ds/modernist-.../readme.md` — the design system's own rules (grid, rules, accent use, don'ts).
- `_ds/modernist-.../_ds_bundle.js` — design system bundle loaded by the prototype.

To view the prototype: serve the folder and open `Tailor.dc.html`. Use the top-right **jump**
select to reach every designed state, including the ones that are hard to trigger naturally
(empty queue, fabrication rejection, blocked metric, unsupported form).
