# Canon contract — `resume.canon.json`

Companion to [SPEC.md](SPEC.md). The canonical resume: everything true about Rico. Tailoring **selects** from this file and may lightly rephrase what it selects; it may never invent. Every emitted bullet cites a canon `id`.

The file is deliberately larger than any rendered resume. It lives at `./data/resume.canon.json` (gitignored, alongside `tailor.db`). The seed content is `../../inputs/resume.canon.json`.

## Access rules

- Load and parse once per tailoring run.
- The model never writes to it.
- The app has exactly **one** write path: substituting a value into an existing `status: "needs-number"` field (CAP-6, "Fill metric"). It never adds a bullet, alters bullet text, or changes any other field.

## Shape

`schemaVersion: "1.0"`. Top-level keys: `basics`, `work`, `education`, `skills`, `excluded`, `rendering`.

### `basics`

`name`, `label`, `email`, `phone`, `location` (`city`, `region`, `country`, `remoteNote`), `profiles[]`, `summaries[]`.

- `profiles[]`: `{ network, username, url, include: "always" | "never" }`. Respect `include`.
- `summaries[]`: `{ id, tags[], text }` — selectable like bullets, one per positioning angle (`sum-generalist`, `sum-web3`, `sum-leadership`).

### `work[]`

`{ id, company, position, location, startDate, endDate, context?, include?, bullets[] }`.

- `endDate: null` means current.
- `context` is background for the model, not rendered copy.
- `include: "when-space"` — render only if the page budget allows.

Each bullet:

| Field | Meaning |
| --- | --- |
| `id` | Stable, unique (`ard-1`, `saib-lead-3`, …). The only thing the model may cite. |
| `text` | The true claim. Source of record for every validation check. |
| `tags[]` | Drives matching and the queue score. Canon tags *are* the closed vocabulary — see [tag-matching.md](tag-matching.md). |
| `weight` | 1–5. Selection priority. |
| `status` | Optional: `"needs-number"` (unfilled placeholder in `text`) or `"needs-content"` (bullet not yet written). |
| `note` | Optional authoring guidance for the model — phrasing steers, caveats, when to lead with it. Not rendered. |

Roles present in the seed: `job-ardata` (5 bullets), `job-saib-head` (6), `job-saib-swe` (4) — 15 bullets total, **none carrying a `status`**.

The Kyocera internship (`job-kyocera` / `kyo-1`) was removed from canon on 2026-08-13 rather than written. `status` handling is still fully specified above and still load-bearing: both `needs-number` and `needs-content` must be implemented and tested, because canon is authored by hand and a future bullet may carry either. Canon simply contains no instance of either today.

### `education[]`

`{ id, institution, studyType, area, startDate, endDate, note? }`.

- `startDate` is additive to the seed shape, so the line can render as a span. `edu-cit` is `2022`–`2026`.

### `skills[]`

`{ id, category, items[], weight, note? }` — grouped by category, weighted for selection. `sk-ai` carries an explicit steer: signal agentic/AI capability as a skill, never surface `headless-bmad` as a named project.

### `excluded`

Explicit negatives so tailoring never claims them.

- `skills[]` — competencies to disclaim (`"testing frameworks as a distinct competency"`).
- `rules[]` — hard prohibitions. **Injected into the model's system prompt verbatim**, never paraphrased or summarized:
  1. Never name ARData features that have not been confirmed as publicly disclosable.
  2. Never state a metric marked `status: needs-number` until the real figure replaces the TODO.
  3. Do not invent employers, dates, titles, technologies, or numbers under any circumstance.

### `rendering`

| Field | Value | Note |
| --- | --- | --- |
| `maxPages` | `1` | Forces sharper selection. The file's comment offers 2 as acceptable; this spec takes 1. |
| `bulletsPerRole` | `{ current: 4, recent: 4, older: 2 }` | Selection budget per role. |
| `template` | `html` | Resolved from the file's `TODO — typst \| latex \| html` by the HTML → Playwright → PDF pipeline. |
| `pdf.requireTextLayer` | `true` | Non-negotiable. The old print-to-PDF was rasterized and invisible to every ATS. |

The `rendering` constraints are passed into the model's system prompt so selection respects the page budget.

## Unfilled fields in the seed

Listed so nothing silently renders as `TODO`. What remains open is tracked in [SPEC.md](SPEC.md).

| Path | State |
| --- | --- |
| `saib-lead-5` | **Resolved** — ~$1.27M in cumulative fees. Substituted into the placeholder via the single write path, so the bullet keeps its authored wording: *Levvy reached approximately $1.27M in protocol revenue.* The unverified ~$5M TVL reference stays unused. |
| `edu-cit` | **Resolved** — `startDate: "2022"`, `endDate: "2026"`. |
| `basics.email` | **Resolved** — `ricoquiblat@gmail.com`. |
| `basics.phone` | **Resolved as a decision, not a deferral** — stays `TODO` indefinitely. **Non-blocking**: the contact line renders only the fields carrying real values; a literal `TODO` is omitted, never printed. |
| `profiles[].LinkedIn` | `TODO`, `include: "never"` — not rendered regardless. |
| `basics.name` | **Resolved** — `Rico Miles Quiblat`. Confirmation comment removed from the seed. |
| `kyo-1` | **Removed** — the Kyocera internship was dropped from canon rather than written. No `needs-content` bullet remains. |
