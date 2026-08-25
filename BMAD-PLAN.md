# BMad Workflow Plan — Tailor

Starting state (2026-08-12): fresh project. `_bmad-output/` empty, no `docs/`, no code yet.

## Inputs already in hand

| Source | Contents | Covers |
|---|---|---|
| `files.zip` | `build-spec.md`, `resume.canon.json` | Requirements + data model |
| `Claude code handoff.zip` | `design_handoff_resume_tailoring/` — `README.md`, `Tailor.dc.html`, `_ds/modernist-*` (styles.css + bundle) | UI design + design system |

Because these exist, the following BMad phases are **skippable** — they produce exactly what you already have:
brainstorming, product brief, PRFAQ, PRD, UX.

## Sequence

### Step 0 — Unpack sources

```sh
unzip files.zip -d _bmad-output/inputs/
unzip "Claude code handoff.zip" -d _bmad-output/inputs/
```

### Step 1 — `[SPC]` Spec — `bmad-spec`

```
bmad-spec _bmad-output/inputs/
```

Distills any intent input (build spec, design folder, mixed multi-source) into a canonical
`SPEC.md` contract + companions at `_bmad-output/specs/spec-{slug}/`. Reconciles the build spec,
the canon JSON, and the design handoff into one machine contract before architecture starts.
Locks the WHAT before the HOW.

*Alternative:* run `bmad-prd` here instead if you want a formal, stakeholder-facing PRD. The
catalog marks PRD as required in the planning phase, but `bmad-spec` is its modern replacement
when written intent already exists — going PRD-first would mostly re-derive `build-spec.md`.

### Step 2 — `[CA]` Architecture — `bmad-architecture` **(required)**

The invariants spine that keeps epics, stories, and features consistent. Feeds off the SPEC plus
your design system. Scales from a quick spine to a full architecture.

### Step 3 — `[CE]` Epics and Stories — `bmad-create-epics-and-stories` **(required)**

Breaks the architecture into epics and user stories.

### Step 4 — `[SP]` Sprint Planning — `bmad-sprint-planning` **(required)**

Readiness gate (PASS / CONCERNS / FAIL), then produces the sprint status file the implementation
agents follow for every story.

### Step 5 — `[BD]` Build — `bmad-build` **(required)**

The Phase 4 implementation loop: clarify intent → plan → implement → review → present.

## Optional, anytime

| Code | Skill | When |
|---|---|---|
| `[RV]` | `bmad-review` | Pressure-test the SPEC / architecture / a diff before building on it |
| `[FI]` | `bmad-forge-idea` | If part of the concept still feels soft |
| `[AE]` | `bmad-advanced-elicitation` | Push a just-produced draft past its first version |
| `[PC]` | `bmad-project-context` | Once code exists — sets up `AGENTS.md` so agents work well in the repo |
| `[CR]` | `bmad-code-review` | Extra review layer after Build's built-in one |
| `[CK]` | `bmad-checkpoint-preview` | Human walkthrough of a commit / branch / PR |
| `[QA]` | `bmad-qa-generate-e2e-tests` | E2E + API tests for implemented code |
| `[CC]` | `bmad-correct-course` | Significant mid-flight change |
| `[SS]` | `bmad-sprint-planning` (status) | Sprint status summary + next recommended action |
| `[ER]` | `bmad-retrospective` | At epic end |

## Rules of engagement

- Run each workflow skill in a **fresh context window** — they're long and stateful.
- Config resolves output to `_bmad-output/`; planning artifacts to
  `_bmad-output/planning-artifacts/`, implementation to `_bmad-output/implementation-artifacts/`.
