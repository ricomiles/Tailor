# Tag matching

Companion to [SPEC.md](SPEC.md). One deterministic extractor serves two consumers: the queue's pre-tailoring score (CAP-1) and the fabrication modal's closest-real-experience panel (CAP-4). No model call in either path.

## Vocabulary

The tag vocabulary is **closed and derived from canon** ([canon-contract.md](canon-contract.md)) — never inferred from the JD. It is the union of:

- `work[].bullets[].tags[]`
- `basics.summaries[].tags[]`
- `skills[].items[]`

A term outside this set cannot contribute to overlap, because overlap is only ever measured against canon. Open-ended extraction (TF-IDF, RAKE) is deliberately not used: it produces candidates the score must then discard, and its output shifts with the corpus.

**Normalization** (applied to vocabulary terms and to input text alike): case-fold, trim, strip surrounding punctuation, collapse internal whitespace to a single space.

**Alias map** at `./data/tag-aliases.json`, shape `{ "<canon-tag>": ["<variant>", …] }`. Aliases resolve to their canon tag; an alias for a tag not in the vocabulary is ignored. Hand-maintained — a JD phrasing with no alias simply scores low until the alias is added. Acceptable: the score orders triage, it never gates tailoring.

## Extraction

`extractTags(text): Set<canonTag>` — normalize the text, then scan for vocabulary terms and aliases as **word-boundary** matches. Multi-word aliases match as phrases, **longest-match-first**, so `smart contracts` wins over `contracts`.

Pure and deterministic: same text plus same canon plus same alias map yields the same set, always.

## Queue score (CAP-1)

```
postingTags = extractTags(title) ∪ extractTags(description)
weightOf(tag) = max weight among canon entries carrying it   // bullets and skills groups; 1 where absent
raw           = Σ  weightOf(t) × (t ∈ extractTags(title) ? 1.5 : 1.0)
CAP           = Σ  the six highest weightOf values in the vocabulary
score         = round(100 × min(1, raw / CAP))
```

`CAP` is derived from canon rather than hard-coded: a posting matching the six heaviest canon tags scores 100. Persisted to `postings.score` ([data-model.md](data-model.md)) at fetch time. The matched tags are retained for display, so a row can state *matched: typescript, solidity, defi* rather than showing a bare number.

## Closest real experience (CAP-4)

Ranking against the **rejected** bullet's text:

```
T       = extractTags(rejectedText)
overlap = |T ∩ b.tags| / |T ∪ b.tags|            // Jaccard, per canon bullet b
order   = overlap desc, b.weight desc, role startDate desc, b.id asc
```

Take the top 3. Bullets with `status: "needs-content"` are excluded — they carry no real text to show.

**The panel is never empty.** If every overlap is 0, fall back to the top 3 bullets of the most recent role by `weight desc, id asc`. CAP-4's success condition depends on this: a fabrication rejection must always show the user what he *did* actually do.

The tie-break chain is total, so the panel is reproducible for any given rejection.
