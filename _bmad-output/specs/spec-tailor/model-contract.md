# Model contract

Companion to [SPEC.md](SPEC.md). Covers CAP-3 and CAP-8.

## The single entry point

`lib/model.ts` exports one function:

```ts
tailor(input): Promise<ModelOutput>
```

Everything in the codebase goes through it. It shells out to Claude Code in non-interactive mode:

```
claude -p --output-format json
```

If the auth story changes, an API-key implementation swaps in behind the same signature with no other file touched.

## Prompt construction

- **System prompt** carries the canon bullets (`id`, `text`, `tags`, `weight`), `excluded.rules` **verbatim**, and the `rendering` constraints. See [canon-contract.md](canon-contract.md).
- **User message** carries the scraped JD text.
- Instruct the model to return only JSON — no markdown fences, no preamble. Strip fences defensively anyway.

The model never emits resume prose freely. It selects from canon and may rephrase what it selects.

## Output shape

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

Every `sourceId` in `selected` and `dropped` is checked against canon before anything is persisted — see [validation-and-diff.md](validation-and-diff.md), Outcome A.

## Matched requirement spans

`matchedRequirements[].quote` must be an exact substring of the JD so the UI can mark it in place. The prototype authors these as `[[double-bracket]]` spans in its JD source; the real build **computes the spans by locating each quote in the JD text at render time**.

A quote that does not match exactly is **dropped**. Never fuzzy-match.

## The six run steps

Progress is real — each step reports its own duration, and the elapsed timer runs live. Never a spinner.

| # | Step | Detail line |
| --- | --- | --- |
| 1 | Fetch posting | source + request count |
| 2 | Extract requirements | count found |
| 3 | Match against source resume | bullets scored |
| 4 | Rewrite selected bullets | *n* of *m* selected |
| 5 | Validate every claim against source | — |
| 6 | Render PDF | page count |

Step 5 is where the validation outcomes in [validation-and-diff.md](validation-and-diff.md) are decided. A hard rejection marks step 5 with `!` and `rejected`, and step 6 never runs.

`score` from the model is the post-tailoring match score shown in the review action bar. It is **not** the queue score, which is local tag overlap computed without a model call ([adapters.md](adapters.md)).
