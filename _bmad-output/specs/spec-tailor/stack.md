# Stack and module boundaries

Companion to [SPEC.md](SPEC.md).

## Stack

| Concern | Choice | Note |
| --- | --- | --- |
| App | **Next.js (App Router), TypeScript** | One process. Route handlers on the **Node runtime**. |
| Persistence | **SQLite via Drizzle** | File at `./data/tailor.db`, gitignored. Schema in [data-model.md](data-model.md). |
| Browser automation | **Playwright** (`chromium`) | Launched **headed** from a route handler. |
| Client state | **Zustand** | The prototype's state shape (design README, "State management") ports over almost directly. |
| Model | Claude Code CLI, shelled out | Behind `lib/model.ts` — see [model-contract.md](model-contract.md). |

No auth, no deployment config, no Docker, no CI. This runs on one machine via `pnpm dev`.

## Files on disk

```
./data/resume.canon.json    canon, gitignored — see canon-contract.md
./data/tailor.db            SQLite
./data/rejections.log       fabrication log, append-only
./boards.json               watched board list
./out/{id}.pdf              rendered resumes
```

Configuration lives in `resume.canon.json` and `boards.json`. There is no settings page.

## Module boundaries

- `lib/model.ts` — the only place the model is invoked. One exported function, `tailor()`.
- One adapter module per board type, each exporting `fetchJobs(boardUrl): Promise<Posting[]>`.
- One adapter module per ATS, each exporting `fill(page, job, pdfPath, answers): Promise<void>`.

Both adapter families are catalogued in [adapters.md](adapters.md).

## Rendering

HTML → Playwright → PDF, reusing the already-installed Chromium. The resume template is a React component rendered to static markup and styled with print CSS.

Two rules:

- **The review preview pane and the PDF template are the same component**, at different scales. If they diverge the preview stops being trustworthy and the whole design premise collapses.
- **`requireTextLayer` is non-negotiable.** After generating, assert the PDF has an extractable text layer and fail loudly if not.

## Design tokens

Port `_ds/modernist-*/styles.css` `:root` variables into `app/globals.css` as CSS custom properties. **Do not hard-code hex values in components. Do not port `support.js`.**

The Modernist system's own rules — flat, architectural, all Archivo (400/600/800), zero corner radius everywhere, strong 2px rules doing the organizing work, near-mono red on a light ground, flush-left everything including button labels — are the source of truth for every color, font, and rule weight. Accent-to-ground is tuned to 3:1, enough for chrome and large text but not body copy: paragraph-size text in the accent uses `--color-accent-700`. Icons, if any are wanted, are Lucide; the prototype uses text glyphs only (`−`, `+`, `✓`, `›`, `·`, `!`, `←`).

Full token table, type scale, screen-by-screen layout, copy, and interaction spec: `../../inputs/design_handoff_resume_tailoring/README.md`, with `Tailor.dc.html` as the working visual reference.

## Mock data

The prototype's mock employers (`Sanctum Labs`, `Northbound`) and its Foundry-test-suite bullet are **invented for the demo and are not true**. Use them only for local UI development, behind a `USE_MOCK_DATA` flag, and never seed them into `resume.canon.json`.
