---
id: SPEC-tailor
companions:
  - canon-contract.md
  - model-contract.md
  - validation-and-diff.md
  - stack.md
  - data-model.md
  - adapters.md
  - tag-matching.md
  - ../../planning-artifacts/architecture/architecture-tailor-2026-08-12/ARCHITECTURE-SPINE.md
  - ../../inputs/design_handoff_resume_tailoring/README.md
  - ../../inputs/design_handoff_resume_tailoring/_ds/modernist-f8562a2f-380c-4e83-bd66-6cba1fb04c4a/readme.md
sources:
  - ../../inputs/build-spec.md
  - ../../inputs/resume.canon.json
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# tailor — resume tailoring and application review

## Why

A vision to realize, for exactly one user: Rico, a full-stack engineer job-hunting from Cebu City. Tailoring a resume per posting is slow enough that most applications go out generic, and handing the job to an LLM trades that cost for a worse one — a resume that quietly claims things he never did. The organizing idea is that **this is a code-review tool where the diff is his own resume**: the model proposes changes to how real experience is described, and every proposal is reviewed line by line before anything is submitted. What makes that trustworthy is not the review UI but the layer beneath it — a canonical source of truth the model may only select from, and server-side validation that can reject an entire run. Everything else exists to get him to the review screen and out of it quickly.

## Capabilities

- **CAP-1 — Board discovery**
  - **intent:** Add job board URLs and scan them on demand so postings arrive in the queue without manual entry.
  - **success:** Scanning a board of each of the four supported types populates the queue with plain-text descriptions; rescanning the same board adds no duplicates; every row carries a match score computed locally with no model call.
- **CAP-2 — Queue triage**
  - **intent:** Filter, sort, and move through ~20 postings fast enough to skip most and open the few worth tailoring.
  - **success:** A full queue can be triaged with the keyboard alone (`j`/`k` move, `o` open, `t` tailor, `s` skip, `x` select); filters narrow by state; bulk skip restores previous states from the toast's Undo.
- **CAP-3 — Tailoring run**
  - **intent:** Run a posting against the canonical resume so the model selects and rephrases the bullets that fit it.
  - **success:** The run reports real elapsed time and real per-step durations across all six steps, and yields a `ModelOutput` in which every `sourceId` cites canon — no free-written resume prose.
- **CAP-4 — Fabrication rejection**
  - **intent:** Discard any run in which the model invented an experience, before it can touch the resume.
  - **success:** A run containing a `sourceId` absent from canon writes nothing, leaves the posting `Discovered`, appends the offending text and id to `rejections.log`, and surfaces the fabrication modal with a non-empty "closest real experience" panel and a re-run that prohibits the rejected claim.
- **CAP-5 — Overclaim flagging**
  - **intent:** Catch rephrasings that assert more than their real source bullet supports, and make them resolvable in place.
  - **success:** A rephrasing introducing a quantity or an escalated ownership verb absent from its source flags with a sentence naming the specific tokens; editing or reverting clears it; an edit that reintroduces a novel quantity re-flags; Approve stays disabled while any flag is unresolved.
- **CAP-6 — Blocked render**
  - **intent:** Stop an incomplete metric from reaching a PDF while keeping the run recoverable.
  - **success:** Selecting a bullet whose canon entry is `status: "needs-number"` with an unfilled placeholder persists the run, shows the raw placeholder token in the diff, and blocks both PDF rendering and approval until the user fills the metric or drops the bullet.
- **CAP-7 — Diff review**
  - **intent:** Review each proposed change as a reworded, kept, or dropped bullet, and edit or revert it inline.
  - **success:** The diff is built from the model's own mapping rather than a text diff; the three kinds are distinguishable with color removed; typing in a proposed bullet updates the rendered resume pane immediately; revert swaps in the original and discards the edit; reverting again restores the rewrite.
- **CAP-8 — JD match marking**
  - **intent:** Show which requirements in the posting the tailoring actually matched, marked where they appear.
  - **success:** Each matched quote that is an exact substring of the JD text is marked in place; a quote that does not match exactly is dropped rather than fuzzy-matched; matches can be hidden and shown.
- **CAP-9 — Screening answers**
  - **intent:** Review and edit the model's drafted answers to the standard screening questions as part of approving the application.
  - **success:** Work authorization, notice period, and why-this-company are pre-filled and editable, each edit is carried into the handoff, and approval covers the answers as well as the diff.
- **CAP-10 — PDF render**
  - **intent:** Produce a submittable PDF that is exactly what the reviewer just approved and that an ATS can read.
  - **success:** The review preview and the PDF are rendered from one React component at different scales; the generated PDF has an extractable text layer, and the render fails loudly when it does not.
- **CAP-11 — Submission handoff**
  - **intent:** Hand a filled application form to the user in a real browser so he reads and submits it himself.
  - **success:** For a detected ATS the form opens filled with the PDF attached and no submit control is ever clicked; for an undetected one the tab opens with the PDF path and copyable answers; the posting becomes `Submitted` only after the user confirms he submitted it.

## Constraints

- The model selects from canon and may rephrase what it selects; it may never invent. Every emitted bullet cites a canon `id`, and `excluded.rules` is injected into the system prompt verbatim.
- Validation runs server-side, after the model call, before anything is persisted or rendered. Unvalidated model output never reaches the client.
- Validation is deterministic. No second LLM call — deterministic checks are faster, free, explain themselves precisely, and cannot themselves hallucinate.
- `resume.canon.json` is read-only to the app except one write path: substituting a value into an existing `status: "needs-number"` field. Never add or alter a bullet. The model never writes to it.
- Never call `page.click()` on a submit control.
- All model access goes through `lib/model.ts` → `tailor(input): Promise<ModelOutput>`, so an API-key implementation can swap in behind the same signature with no other file touched.
- One process on localhost via `pnpm dev`; route handlers on the Node runtime.
- Every UI reference to `resume.base.yaml` is renamed to `resume.canon.json` — the empty state, the fabrication modal, and the blocked-metric banner all mention it.
- Design tokens are ported from `_ds/modernist-*/styles.css` `:root` into `app/globals.css` as CSS custom properties; components hard-code no hexes. Zero corner radius, Archivo throughout, 2px rules doing the organizing. `support.js` is not ported.
- The review preview pane and the PDF template are the same component. If they diverge the preview stops being trustworthy and the design premise collapses.
- `requireTextLayer` is non-negotiable: a rasterized PDF is invisible to every ATS.
- The queue's pre-tailoring score is local tag overlap only, never a model call — the queue must populate instantly.
- Tags are drawn from a closed vocabulary derived from canon plus a hand-maintained alias map, never inferred from the posting. One deterministic extractor serves both the queue score and the fabrication modal's closest-match panel — see `tag-matching.md`.
- A selected bullet with `status: "needs-content"` blocks render and approval, the same way an unfilled `needs-number` placeholder does. Both surface through one readiness check with a list of reasons, not two code paths.
- Missing contact fields never block a render. `basics.email`, `basics.phone`, and the LinkedIn profile render only when they carry real values; a literal `TODO` is omitted, never printed. `requireTextLayer` and an unfilled `needs-number` placeholder remain the only render blockers.
- The empty state says nothing about a 30-minute scan. Scanning is on demand, and this is the one point where the build spec overrides design-owned copy — the copy promised behavior that was deliberately deferred.
- The three diff kinds are separable without relying on color, via gutter glyph, weight, strikethrough, and left-rule style.
- Desktop, wide viewport only. Motion is limited to `tk-in`, `tk-blink`, and the 400ms progress-bar transition, all disabled under `prefers-reduced-motion`.
- Tailoring progress is real — steps, elapsed, per-step durations — never a spinner.
- Every run is kept, including rejected ones; the fabrication log is signal about the prompt.
- The prototype's mock employers (`Sanctum Labs`, `Northbound`) and its Foundry-test-suite bullet are invented and untrue. They are for local UI development only, behind a `USE_MOCK_DATA` flag, and are never seeded into canon.
- Where `../../inputs/build-spec.md` and the design README disagree, the build spec governs architecture, data contracts, validation, filenames, and data shapes; the design README governs visuals, copy, layout, and interaction.

## Non-goals

- Auth, multi-user support, deployment config, Docker, CI.
- Analytics, charts, a settings page. Configuration lives in `resume.canon.json` and `boards.json`.
- Mobile or responsive layouts, a theme toggle, an onboarding flow.
- Any auto-submit path, and any attempt to detect a confirmation page — the app cannot observe whether he submitted, which is why it asks.
- The prototype's top-right `jump` select. It is a review affordance, not a feature.
- Text-diffing the resume: the model already supplies the mapping.
- Fuzzy-matching JD quotes that fail exact substring match.
- Synthesized `dropped` entries for canon bullets the model never considered.
- A second LLM call for validation.

## Success signal

Rico runs `pnpm dev`, scans his boards, and takes a real posting from a cold queue to an approved PDF with a text layer and a filled ATS form open in his browser — with no claim in that PDF lacking a canon source. The proof the system works is the negative case: a run where the model invents an experience is rejected outright, nothing is written, and he sees exactly which claim had no source.

## Assumptions

- The Claude Code CLI is installed and authenticated on the machine, since `lib/model.ts` shells out to `claude -p --output-format json` and no API-key path exists yet.
- ATS submission adapters cover the same four vendors as discovery (Greenhouse, Lever, Ashby, Workable); no other list is named.
- `boards.json` holds the watched board list as type plus token or URL; the build spec names the file as the config location but not its shape.

## Open Questions

None open. All three resolved by the SPEC owner on 2026-08-13, during epic breakdown:

- **`kyo-1` / the Kyocera internship — resolved by removal.** The role was dropped from canon rather than written. Canon now holds three roles (`job-ardata`, `job-saib-head`, `job-saib-swe`) and 15 bullets, with **no `needs-content` and no `needs-number` bullets remaining**. The constraint that a selected `needs-content` bullet blocks render and approval **stands unchanged** — it is an invariant of the readiness gate, not a fact about this one bullet, and it must still be built and tested even though canon currently contains no instance to trigger it.
- **`basics.name` — resolved as `Rico Miles Quiblat`**, which is what canon already carried; the confirmation comment has been removed.
- **`basics.phone` — resolved as: stays `TODO`, indefinitely.** This is a decision, not a deferral. The contact line ships with email and GitHub only. The existing constraint already covers the behavior: a literal `TODO` is omitted, never printed, and never blocks a render.
