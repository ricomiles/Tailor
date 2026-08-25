# Adapters — board discovery and ATS submission

Companion to [SPEC.md](SPEC.md). Covers CAP-1 and CAP-11.

## Board discovery

One adapter per board type, each exporting:

```ts
fetchJobs(boardUrl): Promise<Posting[]>
```

| Board | Endpoint |
| --- | --- |
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` |
| Lever | `api.lever.co/v0/postings/{token}?mode=json` |
| Ashby | `api.ashbyhq.com/posting-api/job-board/{token}` |
| Workable | `apply.workable.com/api/v1/widget/accounts/{token}?details=true` |

All public JSON — no auth, no browser.

Rules:

- Strip HTML from the description to plain text before storing.
- Dedupe on `(source, externalId)`.
- Run on demand via the `Scan boards` button. Add a 30-minute interval timer **only if it proves useful**. (The design's empty-state copy currently describes a 30-minute scan — see the open question in [SPEC.md](SPEC.md).)

### Queue score

The score shown in the queue before tailoring is **tag overlap only, computed locally — no model call**. Tailoring is expensive and explicit; the queue must populate instantly.

The score bar fills with `--color-accent` at score ≥ 80, otherwise `neutral-700`.

## ATS submission

One adapter per ATS, each exporting:

```ts
fill(page, job, pdfPath, answers): Promise<void>
```

Rules:

- Launch with `chromium.launch({ headless: false })`.
- **Never call `page.click()` on a submit control.** Fill, then leave the page open and return.
- Detect the ATS from the posting URL. On no match, open the tab and return `unsupported` — the design has a state for this that shows the PDF path and copyable answers.
- The app cannot observe whether he actually submitted, which is why it asks him afterward. Keep that. **Do not try to detect a confirmation page.**

## Handoff phases

`waiting → confirm → done`, plus `unsupported` as a separate entry path. Copy and layout for each are in the design README, §7. The behavioral contract:

- **waiting** — the browser window is open and filled; the app is idle, waiting on him.
- **confirm** — control is back; the app asks whether he submitted. `I submitted it` → `Submitted`; `I bailed` keeps it `Approved`; `Skip this job` → `Skipped`.
- **unsupported** — no adapter matched. The tab is open and the PDF is on disk; he fills it manually, then `I filled it in` moves to `confirm`.
