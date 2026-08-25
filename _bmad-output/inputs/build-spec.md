# Build spec — `tailor`

Read this alongside `design_handoff_resume_tailoring/README.md`. That README is authoritative for
**visuals, copy, layout, and interaction**. This document is authoritative for **architecture, data
contracts, and validation**. Where they disagree on a filename or a data shape, this document wins.

---

## 0. Stack

- **Next.js (App Router), TypeScript.** One process. Route handlers run on the Node runtime.
- **SQLite via Drizzle**, file at `./data/tailor.db`, gitignored.
- **Playwright** (`chromium`), launched **headed** from a route handler.
- **Zustand** for client state — the prototype's state shape is listed in the design README under
  "State management" and ports over almost directly.
- No auth, no deployment config, no Docker, no CI. This runs on one machine via `pnpm dev`.

Port `_ds/modernist-*/styles.css` `:root` variables into `app/globals.css` as CSS custom properties.
Do **not** hard-code hex values in components. Do **not** port `support.js`.

---

## 1. Source of truth

The canonical resume lives at `./data/resume.canon.json`. Its shape is defined in the accompanying
`resume.canon.json` file.

**Rename every UI reference to `resume.base.yaml` → `resume.canon.json`.** The design copy mentions
it in the empty state, the fabrication modal, and the blocked-metric banner.

Key properties the rest of this spec depends on:

- Every bullet has a stable `id` (`ard-1`, `saib-lead-3`, …).
- Bullets carry `tags` and a `weight` (1–5).
- Some bullets carry `status: "needs-number"` and contain an unfilled placeholder.
- `excluded.rules` is a list of hard prohibitions that must be injected into the model prompt verbatim.

Load and parse it once per tailoring run. Never let the model write to it.

---

## 2. The model call

Shell out to Claude Code in non-interactive mode:

```
claude -p --output-format json
```

Wrap it in a single module — `lib/model.ts`, exporting one function `tailor(input): Promise<ModelOutput>`.
Everything else in the codebase goes through that function. If the auth story changes later, an API-key
implementation swaps in behind the same signature with no other file touched.

**The model never emits resume prose freely.** It selects from canon and may rephrase what it selects.
Required output shape:

```ts
type ModelOutput = {
  selected: Array<{
    sourceId: string;      // MUST exist in canon
    text: string;          // verbatim source text, or a rephrasing of it
    rephrased: boolean;
    why: string;           // one sentence, shown in the diff's WHY line
  }>;
  dropped: Array<{
    sourceId: string;      // MUST exist in canon
    why: string;
  }>;
  matchedRequirements: Array<{
    quote: string;         // exact substring of the JD text
    sourceIds: string[];
  }>;
  answers: {
    workAuthorization: string;
    noticePeriod: string;
    whyThisCompany: string;
  };
  score: number;           // 0-100
};
```

Prompt construction:
- System prompt contains the canon bullets (id, text, tags, weight), `excluded.rules` verbatim, and the
  rendering constraints from `rendering`.
- User message contains the scraped JD text.
- Instruct: return only JSON, no markdown fences, no preamble. Strip fences defensively anyway.

`matchedRequirements[].quote` must be an exact substring of the JD so the UI can mark it in place. The
prototype authors these as `[[double-bracket]]` spans; in the real build, compute the spans by locating
each quote in the JD text at render time. Drop any quote that doesn't match exactly rather than
fuzzy-matching.

---

## 3. Validation — the important part

Validation runs **server-side, after the model call, before anything is persisted or rendered**. It
produces one of three outcomes. The design has UI for all three; nothing decides between them yet.
This does.

### Outcome A — hard rejection (whole run discarded)

Trigger: **any `sourceId` in `selected` or `dropped` does not exist in canon.**

This is deterministic and catches the case the design's fabrication modal is built for: the model
invented an experience wholesale. There is no partial recovery.

On rejection:
- Write nothing. The job stays `Discovered`.
- Append to `./data/rejections.log`: timestamp, job id, the offending bullet text, the invalid `sourceId`.
- Return the rejection to the client, which shows the fabrication modal.
- The modal's "Closest real experience" panel: pick the canon bullet with the highest tag overlap
  against the rejected text's extracted tags. If overlap is zero, show the highest-weight bullet from
  the most recent role instead of leaving the panel empty.
- "Re-run without this claim" re-invokes `tailor()` with the rejected text appended to the prohibitions.

### Outcome B — soft flag (per bullet, resolvable inline)

Trigger: the `sourceId` is valid, but the rephrasing asserts something the source doesn't support.
Two deterministic checks, both run against the **source bullet text** first and then against the
**whole canon** as a fallback:

1. **Novel quantities.** Extract every numeral, percentage, currency amount, and multiplier from
   `text`. Flag any that appears nowhere in the source bullet or elsewhere in canon.
   *(Catches the design's `$40M TVL` example.)*

2. **Escalated ownership verbs.** Maintain a list: `led`, `owned`, `architected`, `founded`, `managed`,
   `drove`, `spearheaded`, `scaled`, `established`, `directed`. Flag any that appears in `text` but not
   in the source bullet — unless the same verb appears in another canon bullet **for the same role**.
   *(Catches `Led remediation` while allowing `Led a team of 8–10` on the role where it's true.)*

Each flag produces the sentence shown in the accent bar and the `OVERCLAIM` band. Generate it from the
check that fired — name the specific token, don't write a generic warning:

> "Led" and "$40M TVL" are not in your source data for this bullet.

A flag resolves when the user edits the text or reverts to the original. Re-run both checks on edit;
if the edit reintroduces a novel quantity, the flag comes back. Approve stays disabled while any flag
is unresolved.

Do not use a second LLM call for this. Deterministic checks are faster, free, explain themselves
precisely, and cannot themselves hallucinate.

### Outcome C — blocked render (resolvable, not a rejection)

Trigger: a selected bullet's canon entry has `status: "needs-number"` and its placeholder is unfilled.

The source is real; it's just incomplete. Persist the run, show the diff normally with the raw
placeholder token visible in the text, and block **PDF rendering and approval** until the user either
fills the metric or drops the bullet. "Fill metric" writes the value back to `resume.canon.json` —
this is the one write path into canon, and it should only ever substitute into a `needs-number` field,
never add or alter a bullet.

---

## 4. Diff construction

**Do not text-diff.** The model already tells you the mapping. Build the UI diff set directly:

| Model output | Diff kind |
| --- | --- |
| `selected` with `rephrased: true` | `reworded` — `old` = canon text, `neu` = model text |
| `selected` with `rephrased: false` | `kept` — `neu` = canon text, no `old` |
| `dropped` | `dropped` — `old` = canon text |
| any `selected` failing a §3B check | `reworded` + `flagged: true` + `flagWhy` |

Canon bullets that appear in neither `selected` nor `dropped` are simply absent from the diff — they
weren't considered. Don't synthesize `dropped` entries for them; the pane would be unreadable.

The right-hand resume pane renders live from the **current** diff text, including user edits. Wire it
to the same store slice, not to a snapshot.

---

## 5. Discovery

One adapter per board type, each exporting `fetchJobs(boardUrl): Promise<Posting[]>`:

- **Greenhouse** — `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`
- **Lever** — `api.lever.co/v0/postings/{token}?mode=json`
- **Ashby** — `api.ashbyhq.com/posting-api/job-board/{token}`
- **Workable** — `apply.workable.com/api/v1/widget/accounts/{token}?details=true`

All public JSON, no auth, no browser. Strip HTML from the description to plain text before storing.
Dedupe on `(source, externalId)`. Run on demand via the `Scan boards` button; add a 30-minute interval
timer only if it proves useful.

The `score` shown in the queue before tailoring is **tag overlap only**, computed locally — no model
call. Tailoring is expensive and explicit; the queue must populate instantly.

---

## 6. Submission

One adapter per ATS exporting `fill(page, job, pdfPath, answers): Promise<void>`. Launch with
`chromium.launch({ headless: false })` and **never call `page.click()` on a submit control.** Fill,
then leave the page open and return.

Detect the ATS from the posting URL. On no match, open the tab and return `unsupported` — the design
has a state for this that shows the PDF path and copyable answers.

The app cannot observe whether he actually submitted, which is why the design asks him afterward. Keep
that. Do not try to detect a confirmation page.

---

## 7. Data model

```
postings   id, source, external_id, company, role, location, url,
           description, found_at, score, state
runs       id, posting_id, created_at, model_output_json, outcome,
           rejection_reason, pdf_path
diff_items id, run_id, source_id, kind, original, proposed,
           user_edit, why, flagged, flag_why, resolved
answers    run_id, field, value
```

`state` is one of `Discovered | Tailored | Approved | Submitted | Skipped`. Transitions are exactly as
the design README specifies. A failed validation leaves the posting `Discovered` and writes no run.

Keep every run, including rejected ones. The fabrication log is useful signal about the prompt.

---

## 8. Rendering

HTML → Playwright → PDF, reusing the already-installed Chromium. The resume template is a React
component rendered to static markup, styled with print CSS. `requireTextLayer` is non-negotiable —
after generating, assert the PDF has an extractable text layer and fail loudly if not.

The right-hand preview pane in the review screen and the PDF template must be the **same component**
at different scales. If they diverge, the preview stops being trustworthy and the whole design premise
collapses.

---

## 9. Explicit non-goals

Do not build: auth, multi-user support, deployment config, analytics, charts, mobile layouts, a theme
toggle, an onboarding flow, or any auto-submit path. Do not ship the prototype's top-right `jump`
select. Do not add a settings page — configuration lives in `resume.canon.json` and a `boards.json`.

## 10. Mock data

The prototype's mock employers (`Sanctum Labs`, `Northbound`) and its Foundry-test-suite bullet are
**invented for the demo and are not true**. Use them only for local UI development, behind a
`USE_MOCK_DATA` flag, and never seed them into `resume.canon.json`.
