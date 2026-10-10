# @open-edu/pack-extraction

Source-grounded extraction of OpenEdu **packs** (`openedu-pack`) from educational source
documents. It emits a knowledge pack (`packs/knowledge/<id>/concepts.json`) and a curriculum
pack (`packs/curriculum/<id>/curriculum.json`), each with a manifest and `sources.json`.

Two extraction modes share one CLI:

- **Deterministic (default)** — offline, no keys. Fully deterministic, source-grounded
  extraction. Fidelity gaps are recorded honestly rather than faked.
- **LLM-assisted chapter pipeline (opt-in)** — one fast-tier structured call per chapter,
  deterministic excerpt-grounded verification, one escalation-tier retry for chapters that
  fail verification, then a cross-chapter merge over compact JSON. Chapters fall back to the
  deterministic result when it is already sufficient.

## Modes and selection

The chapter pipeline is used when `--legacy` is not set **and** any of:

- a chapter-pipeline flag is present: `--dry-run`, `--force`, `--chapters`, `--toc-pages`,
  `--chapter-heading`, `--llm`, or `--no-llm`; or
- auto gating applies: the source is **not** markdown **and** `--manifest` is provided **and**
  a provider key is set.

Otherwise the deterministic legacy path runs. `pnpm extract:slice` (a markdown source, no new
flags) therefore stays on the legacy path with byte-identical packs.

## Pipeline stages

```
Source document
    │
    ▼
1. Parse + segment      source-model.json + chapters.json (TOC / heading / explicit / single)
    │
    ▼
2. Extract (per chapter)  LLM fast tier, stage alias `concept_map` (skipped when the
    │                     deterministic result already has ≥1 concept and ≥1 objective)
    ▼
3. Verify                 deterministic: id assignment, verbatim excerpt grounding,
    │                     provenance, same-chapter objective links
    ▼
4. Escalate               LLM escalation tier, stage alias `concept_enrichment`, only for
    │                     chapters that failed Stage 3; failure reasons are fed back
    ▼
5. Merge                  LLM fast tier, stage alias `review`: duplicate clusters +
    │                     cross-chapter prerequisite links (evidence-grounded, cycle-checked)
    ▼
6. Emit                   knowledge + curriculum packs, review artifacts, run-report
```

Tiers map onto `@open-edu/pipeline-llm`'s `ModelTier` (`fast` | `escalation`); calls go through
its `LlmRouter` (the plan's logical stages alias onto pipeline-llm's closed stage enum).

## CLI usage

```bash
# Deterministic slice (legacy): no keys, byte-identical packs
pnpm extract:slice

# Plan the chapter pipeline + cost estimate without any calls
node dist/cli/index.js --source ./book.md --manifest ./manifest.json --llm --dry-run

# Run the chapter pipeline (auto escalation; honors LLM_FAST_MODEL / LLM_ESCALATION_MODEL)
node dist/cli/index.js --source ./book.md --manifest ./manifest.json --llm --max-budget-usd 2

# Re-run a subset; bust the cache; tolerate unhealthy chapters
node dist/cli/index.js --source ./book.md --manifest ./manifest.json \
  --chapters unit-3,unit-5..unit-7 --force --allow-partial

# Force the legacy deterministic path
node dist/cli/index.js --source ./book.md --legacy
```

## CLI options

| Option                           | Default                 | Description                                                     |
| -------------------------------- | ----------------------- | --------------------------------------------------------------- |
| `--source <file>`                | _(required)_            | Markdown/plain text or PDF/DOCX/PPTX (non-markdown needs `lit`) |
| `--manifest <file>`              | _(derived)_             | Source manifest JSON; derived from the source when omitted      |
| `--output <dir>`                 | `./output`              | Output root; artifacts land under `<dir>/<manifest.id>/`        |
| `--parser <liteparse\|auto>`     | `liteparse`             | Parser for non-markdown sources                                 |
| `--lesson-heading <regex>`       | —                       | H1 pattern used to split lessons (legacy path)                  |
| `--knowledge-pack-id <id>`       | `nios-math-a-knowledge` | Knowledge pack id                                               |
| `--curriculum-pack-id <id>`      | `nios-math-slice`       | Curriculum pack id                                              |
| `--llm` / `--no-llm`             | `auto`                  | Force LLM for all chapters / forbid LLM                         |
| `--provider <name>`              | `openai`                | Chapter-pipeline provider (`openai` \| `openrouter`)            |
| `--fast-model <model>`           | `gpt-4o-mini`           | Fast tier model (also `LLM_FAST_MODEL`)                         |
| `--escalation-model <model>`     | `gpt-4o`                | Escalation tier model (also `LLM_ESCALATION_MODEL`)             |
| `--max-budget-usd <n>`           | `2.0`                   | Estimated spend cap for the run                                 |
| `--dry-run`                      | `false`                 | Plan + per-chapter cost estimate; writes only `run-report.json` |
| `--force`                        | `false`                 | Bust the response cache                                         |
| `--chapters <slugs\|ranges>`     | all                     | Subset re-run, e.g. `unit-3` or `unit-3..unit-5`                |
| `--toc-pages <range>`            | _(auto)_                | TOC page range hint, e.g. `12-14`                               |
| `--chapter-heading <regex>`      | —                       | Explicit chapter-heading fallback                               |
| `--allow-partial`                | `false`                 | Treat `pending-human` chapters as warnings                      |
| `--enrich`                       | `false`                 | Run optional enrichment into `review/` only (never merged)      |
| `--llm-provider` / `--llm-model` | from env                | Enrichment provider/model (used only with `--enrich`)           |
| `--legacy`                       | `false`                 | Force the deterministic legacy path                             |
| `--validate`                     | `false`                 | Run both pack validators; failures force exit 1                 |
| `--help`                         | —                       | Show usage                                                      |

## Environment

| Variable                                                | Default       | Description                                 |
| ------------------------------------------------------- | ------------- | ------------------------------------------- |
| `LLM_PROVIDER`                                          | `openai`      | Chapter-pipeline provider                   |
| `LLM_FAST_MODEL`                                        | `gpt-4o-mini` | Fast tier model                             |
| `LLM_ESCALATION_MODEL`                                  | `gpt-4o`      | Escalation tier model                       |
| `LLM_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | —             | Provider key (any one enables the LLM path) |
| `LLM_BASE_URL`                                          | —             | OpenAI-compatible endpoint override         |

Costs are **estimates** (chars/4 × a per-model price table) because `@open-edu/pipeline-llm`
surfaces no token usage. `run-report.json` records `estimate: true` and both estimated tokens
and cost.

## Output artifacts

Under `output/<manifest.id>/`:

| Path                                     | Description                                                       |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `source/`                                | Copy of the ingested source                                       |
| `source-model/source-model.json`         | Parsed source document model                                      |
| `source-model/chapters.json`             | Deterministic chapter segmentation (id, title, pages, markdown)   |
| `cache/llm/<stage>/<chapterId>.json`     | Per-stage response cache (+ `.meta.json`); free resume/replay     |
| `review/run-report.json`                 | Per-chapter + totals: tokens, cost, cache hits, escalations, exit |
| `review/chapters/<slug>/health.json`     | Per-chapter health, `usedLlm`, `escalated`, `cacheHit`            |
| `review/chapters/<slug>/rejections.json` | Rejected items and reasons                                        |
| `review/knowledge-model.json`            | Verified concepts + objectives                                    |
| `review/curriculum-model.json`           | Assembled curriculum model (or `null`)                            |
| `review/merge-map.json`                  | Duplicate clusters + finalized ids                                |
| `review/unresolved-prereqs.json`         | Dropped prerequisite links and reasons                            |
| `review/glossary-candidates.json`        | Glossary candidates derived from concepts                         |
| `review/human-review-flags.json`         | Rejections + pending-human chapters                               |
| `review/fidelity-report.json`            | `llm-assisted` or `pending-llm`                                   |
| `review/gaps.json`                       | Written when no curriculum units could be assembled               |
| `packs/knowledge/<id>/`                  | `manifest.json`, `concepts.json`, `sources.json`                  |
| `packs/curriculum/<id>/`                 | `manifest.json`, `curriculum.json`, `sources.json`                |

## Behavior notes

- **Budget guard.** Each call is charged an estimate before/after; exceeding `--max-budget-usd`
  aborts cleanly with partial outputs retained and exit 1.
- **Caching.** Cache key is `sha256(prompt + promptVersion + model + schemaVersion)`; unchanged
  chapters replay for free. `--force` bypasses the cache.
- **Retries.** Bounded exponential backoff around provider calls (pipeline-llm exposes none);
  the underlying SDK's own transient retries still apply.
- **Unresolved duplicates.** A chapter-scoped temporary concept id that the merge does not
  cluster is finalized to a stable id and kept in the knowledge pack, but excluded from
  curriculum-unit concept refs — no concept is silently dropped.
- **Provenance.** Every concept/objective carries a verbatim source excerpt validated against
  the chapter text; packs stay `derivedFrom: "document"`.
- **Exit code.** 0 on success; 1 if the run is aborted (e.g. budget), packs fail validation
  (with `--validate`), no curriculum units are emitted, or any `pending-human` chapter is
  present without `--allow-partial`.

## Testing

```bash
pnpm --filter @open-edu/pack-extraction test
pnpm --filter @open-edu/pack-extraction typecheck
pnpm --filter @open-edu/pack-extraction lint
```

## Documentation

- [`docs/CHAPTER-LLM-PIPELINE-PLAN.md`](../../docs/CHAPTER-LLM-PIPELINE-PLAN.md) — chapter LLM pipeline design
- [`docs/OPENEDU-KNOWLEDGE-EXTRACTION.md`](../../docs/OPENEDU-KNOWLEDGE-EXTRACTION.md) — pack extraction specification
- [`docs/IMPLEMENTATION-PLAN.md`](../../docs/IMPLEMENTATION-PLAN.md) — deterministic extraction plan
