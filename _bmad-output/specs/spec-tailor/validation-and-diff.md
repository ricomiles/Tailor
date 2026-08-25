# Validation and diff construction

Companion to [SPEC.md](SPEC.md). Covers CAP-4, CAP-5, CAP-6, CAP-7. This is the load-bearing part of the system: the design has UI for all three outcomes, and this file is what decides between them.

Validation runs **server-side, after the model call, before anything is persisted or rendered**. It is deterministic throughout — no second LLM call. Deterministic checks are faster, free, explain themselves precisely, and cannot themselves hallucinate.

## Outcome A — hard rejection (whole run discarded)

**Trigger:** any `sourceId` in `selected` or `dropped` does not exist in canon.

Deterministic, and it catches the case the fabrication modal is built for: the model invented an experience wholesale. There is no partial recovery.

On rejection:

- Write nothing. The posting stays `Discovered`.
- Append to `./data/rejections.log`: timestamp, job id, the offending bullet text, the invalid `sourceId`.
- Return the rejection to the client, which shows the fabrication modal.
- **"Closest real experience" panel:** pick the canon bullet with the highest tag overlap against the rejected text's extracted tags. If overlap is zero, show the highest-weight bullet from the most recent role — never leave the panel empty.
- **"Re-run without this claim"** re-invokes `tailor()` with the rejected text appended to the prohibitions.

## Outcome B — soft flag (per bullet, resolvable inline)

**Trigger:** the `sourceId` is valid, but the rephrasing asserts something the source does not support.

Two checks, each run against the **source bullet text** first, then against the **whole canon** as a fallback.

### 1. Novel quantities

Extract every numeral, percentage, currency amount, and multiplier from `text`. Flag any that appears nowhere in the source bullet or elsewhere in canon.

*Catches the design's `$40M TVL` example.*

### 2. Escalated ownership verbs

Maintain this list:

```
led, owned, architected, founded, managed, drove, spearheaded, scaled, established, directed
```

Flag any that appears in `text` but not in the source bullet — **unless** the same verb appears in another canon bullet **for the same role**.

*Catches `Led remediation` while allowing `Led a team of 8–10` on the role where it is true.*

### Flag message

Generate the sentence from the check that fired and **name the specific token**. Never a generic warning. It appears in both the accent bar and the `OVERCLAIM` band:

> "Led" and "$40M TVL" are not in your source data for this bullet.

### Resolution

A flag resolves when the user edits the text or reverts to the original. **Re-run both checks on every edit** — if the edit reintroduces a novel quantity, the flag comes back. Approve stays disabled while any flag is unresolved.

## Outcome C — blocked render (resolvable, not a rejection)

**Trigger:** a selected bullet's canon entry has `status: "needs-number"` and its placeholder is unfilled.

The source is real; it is just incomplete. So:

- Persist the run.
- Show the diff normally, with the raw placeholder token (e.g. `{{payments.throughput_usd}}`) visible in the text.
- Block **PDF rendering and approval** until the user either fills the metric or drops the bullet.
- **"Fill metric"** writes the value back to `resume.canon.json`. This is the one write path into canon: it may only substitute into a `needs-number` field, never add or alter a bullet.

## Diff construction

**Do not text-diff.** The model already supplies the mapping. Build the UI diff set directly:

| Model output | Diff kind | Fields |
| --- | --- | --- |
| `selected`, `rephrased: true` | `reworded` | `old` = canon text, `neu` = model text |
| `selected`, `rephrased: false` | `kept` | `neu` = canon text, no `old` |
| `dropped` | `dropped` | `old` = canon text |
| any `selected` failing an Outcome B check | `reworded` | plus `flagged: true`, `flagWhy` |

Canon bullets appearing in neither `selected` nor `dropped` are simply **absent** from the diff — they were not considered. Do not synthesize `dropped` entries for them; the pane would be unreadable.

The right-hand resume pane renders live from the **current** diff text, including user edits. Wire it to the same store slice, not to a snapshot.

## Visual treatment

Owned by the design README (`../../inputs/design_handoff_resume_tailoring/README.md`, §4 "Center — the diff"). The rule this spec holds: the three kinds must be separable **without relying on color** — gutter glyph, weight, strikethrough, and left-rule style carry the distinction, with color as reinforcement only.
