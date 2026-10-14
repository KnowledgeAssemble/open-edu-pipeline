# open-edu-pipeline

Standalone AI-driven content-to-course-spec generation pipeline, extracted from the
[open-edu](https://github.com/KnowledgeAssembly/open-edu) monorepo.

## Packages

- `packages/pipeline` — `@open-edu/pipeline`: 8-stage PDF → course-spec pipeline + CLI
- `packages/pipeline-llm` — `@open-edu/pipeline-llm`: LLM provider abstraction (vendored and
  renamed from `@open-edu/llm-config`; this copy is free to diverge for pipeline-specific needs)
- `packages/pack-extraction` — `@open-edu/pack-extraction`: source-grounded knowledge/curriculum
  **pack** extraction (pack format "openedu-pack"). Deterministic and offline by default; an
  optional LLM-assisted chapter pipeline can refine it (see [below](#pack-extraction)).

## Quick start

```bash
pnpm install
pnpm build
pnpm curriculum:generate --pdf ./textbook.pdf --level B --subject math   # course-spec pipeline
pnpm extract:slice                                                       # knowledge/curriculum packs
```

Full CLI reference, profiles, scope options, and configuration live in
[`packages/pipeline/README.md`](packages/pipeline/README.md).

## Pack extraction

`@open-edu/pack-extraction` ingests source documents and emits two packs — a knowledge pack
(`concepts.json`) and a curriculum pack (`curriculum.json`) — each with a manifest and
`sources.json`. It runs in two modes:

- **Deterministic (default, offline, no keys).** Fully deterministic extraction. Fidelity gaps
  are recorded honestly (`review/fidelity-report.json` = `{"status": "pending-llm"}`) instead
  of faked.
- **LLM-assisted chapter pipeline (opt-in, needs a provider key).** One fast-tier structured
  call per chapter → deterministic excerpt-grounded verification → one escalation-tier retry
  for chapters that fail verification → cross-chapter merge. Chapters fall back to the
  deterministic result when it is already sufficient. See
  [`docs/CHAPTER-LLM-PIPELINE-PLAN.md`](docs/CHAPTER-LLM-PIPELINE-PLAN.md).

The slice fixture lives in [`fixtures/nios-math-a/`](fixtures/nios-math-a/) — one markdown lesson
and its source manifest:

```bash
pnpm extract:slice   # deterministic path; packs are byte-identical to before

# LLM-assisted chapter pipeline (plan + cost estimate first)
node packages/pack-extraction/dist/cli/index.js \
  --source pdf/Math_Level_A_english_medium.md --manifest pdf/manifest.json \
  --output ./output --llm --dry-run

# ...then run it for real (honors LLM_FAST_MODEL / LLM_ESCALATION_MODEL)
node packages/pack-extraction/dist/cli/index.js \
  --source pdf/Math_Level_A_english_medium.md --manifest pdf/manifest.json \
  --output ./output --llm --max-budget-usd 2
```

Output lands under `output/<manifest.id>/`: `source/`, `source-model/` (incl.
`chapters.json`), `cache/llm/`, `review/` (incl. `run-report.json` and
`review/chapters/<slug>/`), `packs/knowledge/<id>/`, `packs/curriculum/<id>/`.

Full flags, tiers, budget, caching, and artifacts are documented in
[`packages/pack-extraction/README.md`](packages/pack-extraction/README.md). The specification and
implementation plan live in
[`docs/OPENEDU-KNOWLEDGE-EXTRACTION.md`](docs/OPENEDU-KNOWLEDGE-EXTRACTION.md) and
[`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md).

## Commands

```bash
pnpm build            # build all packages
pnpm test             # run all tests
pnpm lint             # lint all packages
pnpm typecheck        # type-check all packages
pnpm format:check     # check formatting
pnpm curriculum:generate --pdf <file> [options]   # run the course-spec pipeline
pnpm extract:slice                                # run pack extraction on the slice fixture
```

## Environment

Copy `.env.example` to `.env` and set at least one provider API key
(`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `ANTHROPIC_API_KEY`). Non-markdown
extraction (PDF, DOCX, PPTX, images, …) requires the `lit` CLI from
`@llamaindex/liteparse` to be available on `PATH` — markdown extraction is in-process.
`extract:slice` needs no environment configuration at all. The pack-extraction LLM-assisted
chapter pipeline needs a provider key (`LLM_API_KEY`, `OPENAI_API_KEY`, or
`OPENROUTER_API_KEY`); it is only engaged when requested via flags or auto-gated on a
non-markdown source that has a `--manifest` and credentials.
