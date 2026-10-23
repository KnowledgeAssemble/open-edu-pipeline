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

## Proofreading (opt-in)

An optional pre-stage verifies raw LitParse Markdown against the source PDF and applies only
verified conversion-error patches. It is **off by default**; `pnpm extract:slice` is unchanged.
The raw Markdown is never overwritten, and the corrected copy is reproducible from the raw file
plus `patches.json`.

```bash
# Standalone: inspect an existing Markdown file against its PDF
node dist/proofread/cli.js \
  --pdf ./book.pdf --markdown ./book.md --output ./output --mode apply

# Or run it inside pack-extract for both downstream paths
node dist/cli/index.js --source ./book.md --proofread-pdf ./book.pdf --proofread
node dist/cli/index.js --source ./book.pdf --proofread --llm --dry-run
```

Without a PDF the run is a structural/text-only review and is always `PARTIAL`; downstream uses
the raw Markdown. With `--proofread-mode report`, packs stay byte-identical while the corrected
copy and report are still written for inspection. `PARTIAL` always falls back to raw Markdown;
`NEEDS_REVIEW` may use the verified proofread copy.

Page images and text are sent to the configured LLM provider. Use `--proofread-reference text`
to avoid sending images (visual pages then cannot pass). Credentials come from the existing
provider environment variables and are never written to artifacts.

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
    │                     provenance, objective→concept links, coverage of the chapter
    ▼
4. Escalate               LLM escalation tier, stage alias `concept_enrichment`, only for
    │                     chapters with a rejected item or a coverage gap; failure
    │                     reasons and uncovered sections are fed back
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

| Option                                       | Default                 | Description                                                     |
| -------------------------------------------- | ----------------------- | --------------------------------------------------------------- |
| `--source <file>`                            | _(required)_            | Markdown/plain text or PDF/DOCX/PPTX (non-markdown needs `lit`) |
| `--manifest <file>`                          | _(derived)_             | Source manifest JSON; derived from the source when omitted      |
| `--output <dir>`                             | `./output`              | Output root; artifacts land under `<dir>/<manifest.id>/`        |
| `--parser <liteparse\|auto>`                 | `liteparse`             | Parser for non-markdown sources                                 |
| `--lesson-heading <regex>`                   | —                       | H1 pattern used to split lessons (legacy path)                  |
| `--knowledge-pack-id <id>`                   | `nios-math-a-knowledge` | Knowledge pack id                                               |
| `--curriculum-pack-id <id>`                  | `nios-math-slice`       | Curriculum pack id                                              |
| `--llm` / `--no-llm`                         | `auto`                  | Force LLM for all chapters / forbid LLM                         |
| `--provider <name>`                          | `openai`                | Chapter-pipeline provider (`openai` \| `openrouter`)            |
| `--fast-model <model>`                       | `gpt-4o-mini`           | Fast tier model (also `LLM_FAST_MODEL`)                         |
| `--escalation-model <model>`                 | `gpt-4o`                | Escalation tier model (also `LLM_ESCALATION_MODEL`)             |
| `--max-budget-usd <n>`                       | `2.0`                   | Estimated spend cap for the run                                 |
| `--dry-run`                                  | `false`                 | Plan + per-chapter cost estimate; writes only `run-report.json` |
| `--force`                                    | `false`                 | Bust the response cache                                         |
| `--chapters <slugs\|ranges>`                 | all                     | Subset re-run, e.g. `unit-3` or `unit-3..unit-5`                |
| `--toc-pages <range>`                        | _(auto)_                | TOC page range hint, e.g. `12-14`                               |
| `--chapter-heading <regex>`                  | —                       | Explicit chapter-heading fallback                               |
| `--allow-partial`                            | `false`                 | Treat `pending-human` chapters as warnings                      |
| `--enrich`                                   | `false`                 | Run optional enrichment into `review/` only (never merged)      |
| `--llm-provider` / `--llm-model`             | from env                | Enrichment provider/model (used only with `--enrich`)           |
| `--legacy`                                   | `false`                 | Force the deterministic legacy path                             |
| `--validate`                                 | `false`                 | Run both pack validators; failures force exit 1                 |
| `--proofread`                                | `false`                 | Run the proofreading pre-stage (does not select chapters)       |
| `--proofread-mode <report\|apply>`           | `apply`                 | Report-only, or apply verified corrections downstream           |
| `--proofread-pdf <file>`                     | source PDF              | Original PDF for a Markdown source                              |
| `--proofread-reference <auto\|vision\|text>` | `auto`                  | Page reference routing                                          |
| `--proofread-model <model>`                  | `PROOFREAD_MODEL`       | Vision-capable review model                                     |
| `--proofread-provider <name>`                | `PROOFREAD_PROVIDER`    | Proofreading provider                                           |
| `--proofread-verifier-model <model>`         | independent             | Verifier for high-risk patches                                  |
| `--proofread-verifier-provider <name>`       | review provider         | Verifier provider                                               |
| `--proofread-budget-usd <n>`                 | `1.0`                   | Proofreading sub-cap, never additive to `--max-budget-usd`      |
| `--proofread-pages <range>`                  | all                     | Subset re-run (e.g. `12-20`); requires a complete prior run     |
| `--proofread-window <n>`                     | `2`                     | Text pages per review call                                      |
| `--proofread-page-markers`                   | off                     | Insert `<!-- pdf-page: N -->` at safe block boundaries          |
| `--proofread-verify <changed\|full>`         | `changed`               | Re-review changed pages, or every page                          |
| `--proofread-strict`                         | `false`                 | Exit 1 on `NEEDS_REVIEW` or `PARTIAL`                           |
| `--help`                                     | —                       | Show usage                                                      |

## Environment

| Variable                                                   | Default                 | Description                                  |
| ---------------------------------------------------------- | ----------------------- | -------------------------------------------- |
| `LLM_PROVIDER`                                             | `openai`                | Chapter-pipeline provider                    |
| `LLM_FAST_MODEL`                                           | `gpt-4o-mini`           | Fast tier model                              |
| `LLM_ESCALATION_MODEL`                                     | `gpt-4o`                | Escalation tier model                        |
| `LLM_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY`    | —                       | Provider key (any one enables the LLM path)  |
| `LLM_BASE_URL`                                             | —                       | OpenAI-compatible endpoint override          |
| `PROOFREAD_PROVIDER` / `PROOFREAD_MODEL`                   | LLM / `deepseek4-flash` | Proofreading provider/model                  |
| `PROOFREAD_VERIFIER_PROVIDER` / `PROOFREAD_VERIFIER_MODEL` | review values           | Independent verifier                         |
| `PROOFREAD_REFERENCE`                                      | `auto`                  | Page reference routing                       |
| `PROOFREAD_DPI`                                            | `150`                   | Screenshot DPI (reduced for oversized pages) |
| `PROOFREAD_BUDGET_USD`                                     | `1.0`                   | Proofreading sub-cap                         |
| `PROOFREAD_MAX_OUTPUT_TOKENS`                              | stage default           | Review/verification output ceiling           |

Costs are **estimates** (chars/4 × a per-model price table) because `@open-edu/pipeline-llm`
surfaces no token usage. `run-report.json` records `estimate: true` and both estimated tokens
and cost.

## Output artifacts

Under `output/<manifest.id>/`:

| Path                                     | Description                                                         |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `source/`                                | Copy of the ingested source                                         |
| `source-model/source-model.json`         | Parsed source document model                                        |
| `source-model/chapters.json`             | Deterministic chapter segmentation (id, title, pages, markdown)     |
| `cache/llm/<stage>/<chapterId>.json`     | Per-stage response cache (+ `.meta.json`); free resume/replay       |
| `review/run-report.json`                 | Per-chapter + totals: tokens, cost, cache hits, escalations, exit   |
| `review/chapters/<slug>/health.json`     | Per-chapter health, `usedLlm`, `escalated`, `cacheHit`, coverage    |
| `review/chapters/<slug>/rejections.json` | Rejected items and reasons                                          |
| `review/chapters/<slug>/coverage.json`   | Stated vs extracted objectives, covered teaching sections, losses   |
| `review/knowledge-model.json`            | Verified concepts + objectives                                      |
| `review/curriculum-model.json`           | Assembled curriculum model (or `null`)                              |
| `review/merge-map.json`                  | Duplicate clusters + finalized ids                                  |
| `review/unresolved-prereqs.json`         | Dropped prerequisite links and reasons                              |
| `review/coverage-report.json`            | Per-chapter coverage: stated objectives, section coverage, gaps     |
| `review/glossary-candidates.json`        | Glossary candidates derived from concepts                           |
| `review/human-review-flags.json`         | Rejections + pending-human chapters                                 |
| `review/fidelity-report.json`            | `llm-assisted` or `pending-llm`                                     |
| `source/<base>.proofread.md`             | Proofread copy (inspection; used downstream in apply + non-PARTIAL) |
| `review/proofread/proofread-report.md`   | Proofread report and status reasons                                 |
| `review/proofread/issues.json`           | Machine-readable issue log with run metadata                        |
| `review/proofread/patches.json`          | Applied, deterministic, and rejected patches                        |
| `review/proofread/page-map.json`         | Raw Markdown ↔ PDF page alignment (or `available: false`)           |
| `review/proofread/status.json`           | Status, reasons, counts, downstream selection, cost estimate        |
| `review/proofread/pages/<page>.json`     | Per-page inspection and issue artifacts                             |
| `review/proofread/dry-run.json`          | Routing, alignment, and cost plan (`--dry-run` only)                |
| `cache/proofread/`                       | Reference bundle, screenshots, review, and verification caches      |
| `review/gaps.json`                       | Written when no curriculum units could be assembled                 |
| `packs/knowledge/<id>/`                  | `manifest.json`, `concepts.json`, `sources.json`                    |
| `packs/curriculum/<id>/`                 | `manifest.json`, `curriculum.json`, `sources.json`                  |

## Behavior notes

- **Budget guard.** Each call is charged an estimate before/after; exceeding `--max-budget-usd`
  aborts cleanly with partial outputs retained and exit 1.
- **Caching.** Cache key is `sha256(prompt + promptVersion + model + schemaVersion)`; unchanged
  chapters replay for free. `--force` bypasses the cache.
- **Retries.** Bounded exponential backoff around provider calls (pipeline-llm exposes none);
  the underlying SDK's own transient retries still apply.
- **Output ceiling.** Extraction and merge calls ask for a larger output budget than the
  stage default (16 384 and 8 192 tokens): a long chapter yields many concepts and the
  escalation retry yields more, which overflows the default 4 096-token stage budget. Set
  `LLM_MAX_OUTPUT_TOKENS` when the provider or model caps output below the default.
- **Unresolved duplicates.** A chapter-scoped temporary concept id that the merge does not
  cluster is finalized to a stable id and kept in the knowledge pack, but excluded from
  curriculum-unit concept refs — no concept is silently dropped.
- **Provenance.** Every concept/objective carries a verbatim source excerpt validated against
  the chapter text; packs stay `derivedFrom: "document"`.
- **Chapter ids.** A chapter id is the slugified title of the heading the table of contents
  matched (`1-reading-understanding-forming-and-writing-numbers`). Markdown-table contents are
  read cell-wise, so serial-number and page-number columns never leak into a title.
- **Objectives.** The chapter's stated learning objectives are extracted one per objective
  (one per bullet when the chapter lists them, nested bullets included) and never merged into
  a single objective. A chapter that states N objectives and yields fewer is not healthy.
  The rule is structural, not only a prompt request: when a model's excerpt covers a parent
  bullet _and_ its nested sub-bullets, the verifier splits that excerpt back into one
  objective per stated bullet, so the count holds whatever the model returns. When the text
  occurs more than once in the chapter, the occurrence spanning the most bullets wins.
- **Coverage.** Precision (every excerpt is grounded) is not enough on its own: the verifier
  also measures how much of the chapter was captured — stated objectives vs extracted
  objectives, and numbered teaching sections vs sections carrying a concept. Stated objectives
  are the bullets under each objective heading, and an objective block ends at the next heading
  of any level, so a chapter-level "## Learning Objectives" heading does not count every bullet
  in the chapter. A chapter escalates when it drops a stated objective, loses a section to a
  rejection, or covers less than half the numbered teaching sections; individual uncovered
  sections are named in the retry prompt but do not by themselves trigger it. Gaps the retry
  does not close leave the chapter `pending-human`.
- **Coverage applies to LLM attempts.** The recall gates measure what a model missed, so the
  deterministic extractor keeps only the precision gates (`objectives ≥ 1`, `< 30%` rejected).
  Its coverage is still recorded in the review artifacts, so a `--no-llm` run reports the gap
  without failing on it.
- **Objective links.** An objective links the concepts it practises — the terms the model
  named, else the concepts of the same teaching section, else a distinctive-word match. It is
  never linked to every concept of the chapter.
- **Prerequisite evidence.** The merge stage receives each concept's verbatim excerpt and must
  copy the link evidence from it, so a prerequisite link can pass the grounding check instead
  of being dropped as ungrounded.
- **Exit code.** 0 on success; 1 if the run is aborted (e.g. budget), packs fail validation
  (with `--validate`), no curriculum units are emitted, or any `pending-human` chapter is
  present without `--allow-partial`.

## Proofreading behavior notes

- **Patches, not rewrites.** The model proposes exact-anchor patches; deterministic code resolves
  the anchor, checks context, orders same-line inserts, rejects overlaps, and enforces 2 000
  character / 40 line limits.
- **Verify before apply.** Every candidate patch is grounded against PDF text or an image and
  independently verified. Math, tables, numbers, reading order, and missing content require a
  different verifier model/provider; otherwise they are report-only.
- **Pages come from the map.** Model-supplied page numbers are ignored. An issue that cannot be
  tied to exactly one aligned page is not auto-applied.
- **Status precedence.** `PARTIAL > NEEDS_REVIEW > PASS_WITH_WARNINGS > PASS`. Missing PDF,
  unaligned content, missing vision references, budget aborts, and review failures are `PARTIAL`.
  Reference provenance mismatches, forced text-only visual pages, and unresolved material issues
  are `NEEDS_REVIEW`.
- **Budget and cache.** Proofreading shares the run ledger and cannot exceed the global cap. The
  reference cache is keyed by PDF bytes, LitParse version, every mirrored parse option, and DPI;
  review and verification caches include prompt/schema/model/provider versions. `--force` busts
  all three.

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
